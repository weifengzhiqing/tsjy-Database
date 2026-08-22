/* 浏览器端数据库层：SQL.js（SQLite WASM）+ IndexedDB 持久化。
   接口尽量对齐原 app/db.py，便于把报表/导入逻辑原样搬过来。
   同时兼容 node（__dirname + require），用于自测。 */
(function () {
  'use strict';
  var DB = {};
  var SQL = null;
  var _db = null;
  var _colCache = {};

  function isBrowser() { return typeof window !== 'undefined'; }

  async function loadSQL() {
    if (SQL) return SQL;
    var mod = (isBrowser() && window.initSqlJs)
      ? window.initSqlJs
      : require('../../vendor/sql-wasm.js');
    var initFn = (mod.default && typeof mod.default === 'function') ? mod.default : mod;
    if (isBrowser()) {
      SQL = await initFn({ locateFile: function (f) { return 'vendor/' + f; } });
    } else {
      SQL = await initFn();
    }
    return SQL;
  }

  async function loadInitialBytes() {
    if (isBrowser()) {
      var res = await fetch('data/project.db');
      if (!res.ok) throw new Error('无法加载初始数据库 data/project.db');
      return new Uint8Array(await res.arrayBuffer());
    }
    var fs = require('fs');
    return fs.readFileSync(__dirname + '/../../../data/project.db');
  }

  // ---------------- IndexedDB 持久化（仅浏览器） ----------------
  var IDB_NAME = 'pmdb', IDB_KEY = 'pmdb', _saveTimer = null;
  // DB 缓存版本：data/project.db 更新后需 +1，强制浏览器丢弃旧 IndexedDB 缓存重新拉取
  var IDB_VER = 4;
  function idbOpen() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(IDB_NAME); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  async function idbGet() {
    var idb = await idbOpen();
    return new Promise(function (resolve) {
      var tx = idb.transaction(IDB_NAME, 'readonly');
      var req = tx.objectStore(IDB_NAME).get(IDB_KEY);
      req.onsuccess = function () {
        var val = req.result;
        // 旧版直接存裸字节（非对象），或版本不符 → 视为无缓存，重新从仓库拉取
        if (val && typeof val === 'object' && val.__v === IDB_VER && val.bytes) resolve(val.bytes);
        else resolve(null);
      };
      req.onerror = function () { resolve(null); };
    });
  }
  function scheduleSave() {
    if (!isBrowser()) return;
    if (_saveTimer) return;
    _saveTimer = setTimeout(async function () {
      _saveTimer = null;
      try {
        var bytes = _db.export();
        var idb = await idbOpen();
        await new Promise(function (resolve, reject) {
          var tx = idb.transaction(IDB_NAME, 'readwrite');
          tx.objectStore(IDB_NAME).put({ __v: IDB_VER, bytes: bytes }, IDB_KEY);
          tx.oncomplete = resolve; tx.onerror = function () { reject(tx.error); };
        });
      } catch (e) { console.warn('persist failed', e); }
    }, 600);
  }
  DB.flush = function () { scheduleSave(); };

  DB.init = async function () {
    await loadSQL();
    var bytes = null;
    if (isBrowser()) { try { bytes = await idbGet(); } catch (e) {} }
    if (!bytes) bytes = await loadInitialBytes();
    _db = new SQL.Database(bytes);
    _db.run('PRAGMA foreign_keys = ON;');
    _colCache = {};
    return DB;
  };

  function toObj(row, cols) {
    var o = {};
    for (var i = 0; i < cols.length; i++) o[cols[i]] = row[i];
    return o;
  }

  DB.query = function (sql, args) {
    var stmt = _db.prepare(sql);
    try {
      if (args && args.length) stmt.bind(args);
      var cols = stmt.getColumnNames();
      var out = [];
      while (stmt.step()) out.push(toObj(stmt.get(), cols));
      return out;
    } finally { stmt.free(); }
  };
  DB.queryOne = function (sql, args) {
    var r = DB.query(sql, args);
    return r[0] || null;
  };

  DB.exec = function (sql, args) {
    if (args && args.length) { _db.run(sql, args); }
    else { _db.run(sql); }
    scheduleSave();
  };

  DB.insertId = function (sql, args) {
    _db.run(sql, args || []);
    var r = _db.exec('SELECT last_insert_rowid() AS id');
    scheduleSave();
    return (r[0] && r[0].values[0]) ? r[0].values[0][0] : 0;
  };

  DB.execMany = function (sql, argList) {
    _db.run('BEGIN');
    var stmt = _db.prepare(sql);
    try { for (var i = 0; i < argList.length; i++) stmt.run(argList[i]); }
    finally { stmt.free(); }
    _db.run('COMMIT');
    scheduleSave();
    return argList.length;
  };

  DB.tableColumns = function (t) {
    if (_colCache[t]) return _colCache[t];
    var r = DB.query('PRAGMA table_info(' + t + ')');
    var cols = r.map(function (x) { return x.name; });
    _colCache[t] = cols;
    return cols;
  };

  DB.insertRow = function (table, data) {
    var cols = DB.tableColumns(table);
    var d = {};
    Object.keys(data).forEach(function (k) {
      if (cols.indexOf(k) >= 0 && k !== 'id') d[k] = data[k];
    });
    var keys = Object.keys(d);
    if (!keys.length) return null;
    var ph = keys.map(function () { return '?'; }).join(',');
    return DB.insertId('INSERT INTO ' + table + '(' + keys.join(',') + ') VALUES(' + ph + ')',
      keys.map(function (k) { return d[k]; }));
  };

  DB.updateRow = function (table, rowId, data) {
    var cols = DB.tableColumns(table);
    var d = {};
    Object.keys(data).forEach(function (k) {
      if (cols.indexOf(k) >= 0 && k !== 'id') d[k] = data[k];
    });
    if (!Object.keys(d).length) return 0;
    var sets = Object.keys(d).map(function (k) { return k + '=?'; }).join(',');
    return DB.exec('UPDATE ' + table + ' SET ' + sets + ' WHERE id=?',
      Object.keys(d).map(function (k) { return d[k]; }).concat([rowId]));
  };

  DB.getConfig = function (k, def) {
    var r = DB.queryOne('SELECT v FROM sys_config WHERE k=?', [k]);
    return r ? r.v : def;
  };
  DB.setConfig = function (k, v) {
    DB.exec('INSERT OR REPLACE INTO sys_config(k,v) VALUES(?,?)', [k, String(v)]);
  };

  DB.wbsDescendants = function (wbsId) {
    if (!wbsId) return [];
    var ids = [parseInt(wbsId, 10)];
    var frontier = [parseInt(wbsId, 10)];
    while (frontier.length) {
      var ph = frontier.map(function () { return '?'; }).join(',');
      var rows = DB.query('SELECT id FROM wbs WHERE parent_id IN (' + ph + ')', frontier);
      frontier = [];
      rows.forEach(function (r) {
        if (ids.indexOf(r.id) < 0) { ids.push(r.id); frontier.push(r.id); }
      });
    }
    return ids;
  };

  DB.refreshWbsPath = function () {
    var rows = DB.query('SELECT id,parent_id,name FROM wbs');
    var m = {};
    rows.forEach(function (r) { m[r.id] = r; });
    function path(i, depth) {
      if (depth > 20) return '';
      var r = m[i];
      if (!r) return '';
      if (r.parent_id && m[r.parent_id]) {
        var up = path(r.parent_id, depth + 1);
        return (up ? up + '/' + r.name : r.name);
      }
      return r.name;
    }
    rows.forEach(function (r) {
      var fp = path(r.id, 0);
      var lvl = fp.split('/').length;
      DB.exec('UPDATE wbs SET full_path=?, level=? WHERE id=?', [fp, lvl, r.id]);
    });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DB;
  if (isBrowser()) window.DB = DB;
})();
