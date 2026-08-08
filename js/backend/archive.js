/* 浏览器端档案管理：登记索引 + 组卷 + 目录导出。
   浏览器没有本地文件系统，因此：
   - 不再「扫描资料归档文件夹」，改为用户手动选择文件登记（文件字节存 IndexedDB，可回看下载）；
   - register 接收 {name, content(base64), size, ...} 写入 archive_file 并把字节存到 'archive_blob'；
   - list/assign/unassign/volume_export/catalog_export 与 Python 版一致（只碰 DB 元数据）。 */
(function () {
  'use strict';
  var isBrowser = (typeof window !== 'undefined');
  var DB = isBrowser ? window.DB : require('./db.js');

  function XLSX() { return isBrowser ? window.XLSX : require('../../vendor/xlsx.full.min.js'); }
  function curProject() { return parseInt(DB.getConfig('cur_project', '1') || 1, 10); }
  function nowStr() { var d = new Date(); function p(n){return (n<10?'0'+n:''+n);} return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }

  // ---- 文件字节存 IndexedDB（仅浏览器） ----
  function idbOpen() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('pmdb', 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('archive_blob')) db.createObjectStore('archive_blob');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  async function storeBlob(path, content) {
    if (!isBrowser) return;
    try {
      var idb = await idbOpen();
      await new Promise(function (resolve, reject) {
        var tx = idb.transaction('archive_blob', 'readwrite');
        tx.objectStore('archive_blob').put(content, path);
        tx.oncomplete = resolve; tx.onerror = function () { reject(tx.error); };
      });
    } catch (e) { console.warn('storeBlob failed', e); }
  }
  async function getBlob(path) {
    if (!isBrowser) return null;
    var idb = await idbOpen();
    return new Promise(function (resolve) {
      var tx = idb.transaction('archive_blob', 'readonly');
      var req = tx.objectStore('archive_blob').get(path);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { resolve(null); };
    });
  }

  // ---- 路由 ----
  function archiveRoot() {
    return { root: '（浏览器本地，文件登记后存于本机浏览器）', exists: true, browser: true };
  }
  function archiveSetRoot(p) {
    var root = (p.root || '').trim();
    if (!root) throw new Error('路径为空');
    // 浏览器版不校验真实目录，仅记录用户备注偏好
    DB.setConfig('archive_root', root);
    return { ok: true, root: root, browser: true };
  }
  // 浏览器版不扫描文件夹，open 改为下载已登记文件字节
  async function archiveOpen(p) {
    var sub = (p.sub || '').trim();
    var b64 = await getBlob(sub);
    if (!b64) throw new Error('该文件未在本浏览器登记，无法打开/下载');
    var name = sub.split('/').pop();
    return { b64: (b64.indexOf(',') >= 0 ? b64.slice(b64.indexOf(',') + 1) : b64), filename: name };
  }

  function archiveList(p) {
    var where = [], args = [], t = 'archive_file';
    ['category', 'unit_proj', 'volume_id'].forEach(function (k) {
      if (p[k] !== null && p[k] !== undefined && p[k] !== '') { where.push(k + '=?'); args.push(p[k]); }
    });
    if (p.unassigned) where.push('volume_id=0');
    var kw = p.keyword;
    if (kw) {
      var cols = ['name', 'wbs_name', 'owner', 'remark', 'unit_proj', 'category', 'ext'];
      where.push('(' + cols.map(function (c) { return c + ' LIKE ?'; }).join(' OR ') + ')');
      cols.forEach(function () { args.push('%' + kw + '%'); });
    }
    var wsql = where.length ? ' WHERE ' + where.join(' AND ') : '';
    var rows = DB.query('SELECT * FROM ' + t + wsql + ' ORDER BY file_date DESC, id DESC', args);
    return { rows: rows, root: '（浏览器本地）' };
  }

  async function archiveRegister(p) {
    var items = p.items || [];
    var pid = curProject();
    var cnt = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var name = (it.name || '').trim();
      if (!name) continue;
      var vpath = 'archives/' + name;
      var rec = {
        project_id: pid,
        src_path: vpath,
        name: name,
        ext: (name.indexOf('.') >= 0 ? name.split('.').pop().toLowerCase() : ''),
        size: it.size || 0,
        mtime: it.mtime || nowStr(),
        category: (it.category || '').trim(),
        unit_proj: (it.unit_proj || '').trim(),
        wbs_name: (it.wbs_name || '').trim(),
        file_date: (it.file_date || '').trim(),
        owner: (it.owner || '').trim(),
        volume_id: parseInt(it.volume_id || 0, 10),
        remark: (it.remark || '').trim()
      };
      var ex = DB.queryOne('SELECT id FROM archive_file WHERE project_id=? AND src_path=?', [pid, vpath]);
      var newId;
      if (ex) { DB.updateRow('archive_file', ex.id, rec); newId = ex.id; }
      else newId = DB.insertRow('archive_file', rec);
      if (it.content) await storeBlob(vpath, it.content);
      cnt++;
    }
    return { ok: true, registered: cnt };
  }

  function archiveAssign(p) {
    var vid = parseInt(p.volume_id || 0, 10);
    var ids = (p.ids || []).map(function (i) { return parseInt(i, 10); }).filter(function (i) { return i; });
    if (!vid) return { ok: false, msg: '请先选择卷' };
    if (!ids.length) return { ok: false, msg: '请选择要归入的文件' };
    var ph = ids.map(function () { return '?'; }).join(',');
    DB.exec('UPDATE archive_file SET volume_id=? WHERE id IN (' + ph + ')', [vid].concat(ids));
    return { ok: true, affected: ids.length };
  }
  function archiveUnassign(p) {
    var ids = (p.ids || []).map(function (i) { return parseInt(i, 10); }).filter(function (i) { return i; });
    if (!ids.length) return { ok: false, msg: '请选择文件' };
    var ph = ids.map(function () { return '?'; }).join(',');
    DB.exec('UPDATE archive_file SET volume_id=0 WHERE id IN (' + ph + ')', ids);
    return { ok: true, affected: ids.length };
  }

  function xlsxFromRows(rows, filename) {
    var X = XLSX();
    var wb = X.utils.book_new();
    var ws = X.utils.aoa_to_sheet(rows);
    ws['!cols'] = rows[0].map(function (_, ci) {
      var w = 10;
      for (var ri = 1; ri < rows.length; ri++) {
        if (ci < rows[ri].length && rows[ri][ci] !== null && rows[ri][ci] !== undefined) {
          var s = String(rows[ri][ci]);
          var ww = 0; for (var k = 0; k < s.length; k++) ww += (s.charCodeAt(k) > 127 ? 2 : 1);
          w = Math.max(w, Math.min(ww + 3, 40));
        }
      }
      return { wch: w };
    });
    for (var c = 0; c < (rows[0] || []).length; c++) {
      var addr = X.utils.encode_cell({ r: 0, c: c });
      if (!ws[addr]) ws[addr] = { t: 's', v: rows[0][c] };
      ws[addr].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '7A6A4F' } }, alignment: { horizontal: 'center', vertical: 'center' } };
    }
    X.utils.book_append_sheet(wb, ws, '目录');
    var b64 = X.write(wb, { type: 'base64', bookType: 'xlsx' });
    return { filename: filename, b64: b64 };
  }

  function volumeExport(p) {
    var vid = parseInt(p.volume_id || 0, 10);
    var vol = DB.queryOne('SELECT * FROM archive_volume WHERE id=?', [vid]);
    if (!vol) throw new Error('卷不存在');
    var files = DB.query('SELECT * FROM archive_file WHERE volume_id=? ORDER BY file_date, id', [vid]);
    var rows = [
      ['案卷号', vol.code || ''],
      ['案卷题名', vol.name || ''],
      ['工程类别', vol.category || ''],
      ['单位工程', vol.unit_proj || ''],
      [],
      ['序号', '文件题名', '工程类别', '单位工程', '部位', '形成日期', '责任人', '备注']
    ];
    files.forEach(function (f, i) {
      rows.push([i + 1, f.name, f.category || '', f.unit_proj || '', f.wbs_name || '', f.file_date || '', f.owner || '', f.remark || '']);
    });
    return xlsxFromRows(rows, '卷内目录_' + (vol.code || vol.name || vid) + '.xlsx');
  }
  function catalogExport() {
    var pid = curProject();
    var vols = DB.query('SELECT * FROM archive_volume WHERE project_id=? ORDER BY code, id', [pid]);
    var rows = [['序号', '卷号', '案卷题名', '工程类别', '单位工程', '文件数', '备注']];
    vols.forEach(function (v, i) {
      var n = (DB.queryOne('SELECT COUNT(*) c FROM archive_file WHERE volume_id=?', [v.id]) || {}).c || 0;
      rows.push([i + 1, v.code || '', v.name || '', v.category || '', v.unit_proj || '', n, v.remark || '']);
    });
    return xlsxFromRows(rows, '案卷目录.xlsx');
  }

  var routes = {};
  routes['/archive/root'] = archiveRoot;
  routes['/archive/set_root'] = archiveSetRoot;
  routes['/archive/open'] = archiveOpen;
  routes['/archive/list'] = archiveList;
  routes['/archive/register'] = archiveRegister;
  routes['/archive/assign'] = archiveAssign;
  routes['/archive/unassign'] = archiveUnassign;
  routes['/archive/volume_export'] = volumeExport;
  routes['/archive/catalog_export'] = catalogExport;

  var api = { routes: routes, getBlob: getBlob };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (isBrowser) window.BackendArchive = api;
})();
