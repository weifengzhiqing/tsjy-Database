/* 浏览器端基础 CRUD + 元数据接口，对齐 app/api_base.py。 */
(function () {
  'use strict';
  var isBrowser = (typeof window !== 'undefined');
  var DB = isBrowser ? window.DB : require('./db.js');
  var Reports = isBrowser ? window.Reports : require('./reports.js');

  var ALLOW_TABLES = {
    'project': { label: '项目', order: 'id' },
    'wbs': { label: '部位', order: 'level, sort_no, id' },
    'material': { label: '材料字典', order: 'category, name' },
    'team': { label: '班组', order: 'trade, name' },
    'measure': { label: '措施', order: 'biz_date DESC, id DESC' },
    'measure_effect': { label: '措施效果', order: 'eval_date DESC, id DESC' },
    'output_rec': { label: '产值记录', order: 'biz_date DESC, id DESC' },
    'material_rec': { label: '材料消耗记录', order: 'biz_date DESC, id DESC' },
    'labor_rec': { label: '人员投入记录', order: 'biz_date DESC, id DESC' },
    'cost_rec': { label: '成本记录', order: 'biz_date DESC, id DESC' },
    'progress_rec': { label: '形象进度记录', order: 'biz_date DESC, id DESC' },
    'import_template': { label: '导入模板', order: 'id DESC' },
    'import_batch': { label: '导入批次', order: 'created_at DESC' },
    'project_profile': { label: '项目概况', order: 'seq, id' },
    'event_log': { label: '大事记', order: 'date DESC, id DESC' },
    'archive_file': { label: '归档文件', order: 'file_date DESC, id DESC' },
    'archive_volume': { label: '档案卷', order: 'code, id' }
  };

  function check(t) {
    if (!ALLOW_TABLES[t]) throw new Error('不允许操作的表: ' + t);
    return t;
  }

  function crudList(p) {
    var t = check(p.table);
    var where = [], args = [];
    var filters = p.filters || {};
    Object.keys(filters).forEach(function (k) {
      var v = filters[k];
      if (v === null || v === undefined || v === '') return;
      if (DB.tableColumns(t).indexOf(k) >= 0) { where.push(k + ' = ?'); args.push(v); }
    });
    var kw = p.keyword;
    if (kw) {
      var cols = DB.tableColumns(t).filter(function (c) {
        return ['name', 'code', 'item_name', 'material_name', 'team_name',
          'issue', 'content', 'remark', 'spec', 'wbs_name', 'subject'].indexOf(c) >= 0;
      });
      if (cols.length) {
        where.push('(' + cols.map(function (c) { return c + ' LIKE ?'; }).join(' OR ') + ')');
        cols.forEach(function () { args.push('%' + kw + '%'); });
      }
    }
    if (p.date_from && DB.tableColumns(t).indexOf('biz_date') >= 0) { where.push('biz_date >= ?'); args.push(p.date_from); }
    if (p.date_to && DB.tableColumns(t).indexOf('biz_date') >= 0) { where.push('biz_date <= ?'); args.push(p.date_to); }

    var wsql = where.length ? ' WHERE ' + where.join(' AND ') : '';
    var limit = parseInt(p.limit || 500, 10);
    var order = ALLOW_TABLES[t].order;
    var rows = DB.query('SELECT * FROM ' + t + wsql + ' ORDER BY ' + order + ' LIMIT ' + limit, args);
    var total = (DB.queryOne('SELECT COUNT(*) c FROM ' + t + wsql, args) || {}).c || 0;
    return { rows: rows, total: total, columns: DB.tableColumns(t) };
  }

  function crudSave(p) {
    var t = check(p.table);
    var data = p.data || {};
    if (DB.tableColumns(t).indexOf('project_id') >= 0 && !data.project_id) {
      data.project_id = parseInt(DB.getConfig('cur_project', '1') || 1, 10);
    }
    var rid = data.id;
    var newId;
    if (rid) { DB.updateRow(t, rid, data); newId = rid; }
    else { newId = DB.insertRow(t, data); }
    if (t === 'wbs') DB.refreshWbsPath();
    return { id: newId, ok: true };
  }

  function crudDelete(p) {
    var t = check(p.table);
    var ids = p.ids || (p.id ? [p.id] : []);
    ids = ids.filter(function (i) { return i; });
    if (!ids.length) return { ok: false, msg: '没有选中记录' };
    var ph = ids.map(function () { return '?'; }).join(',');
    if (t === 'archive_volume') {
      DB.exec('UPDATE archive_file SET volume_id=0 WHERE volume_id IN (' + ph + ')', ids);
    }
    DB.exec('DELETE FROM ' + t + ' WHERE id IN (' + ph + ')', ids);
    return { ok: true, deleted: ids.length };
  }

  // 刷新 wbs 全路径
  function wbsRefresh() { DB.refreshWbsPath(); return { ok: true }; }

  // ---------------- 元数据 ----------------
  function metaAll() {
    var wbsFlat = DB.query('SELECT * FROM wbs ORDER BY level,sort_no,id');
    return {
      projects: DB.query('SELECT id,name,code FROM project ORDER BY id'),
      wbs_tree: wbsTree(wbsFlat),
      wbs_flat: wbsFlat,
      material_cats: DB.query(
        "SELECT DISTINCT category FROM material WHERE IFNULL(category,'')<>'' " +
        "UNION SELECT DISTINCT category FROM material_rec WHERE IFNULL(category,'')<>'' " +
        "ORDER BY category").map(function (r) { return r.category; }).filter(Boolean),
      materials: DB.query('SELECT id,name,category,spec,unit,std_price FROM material ORDER BY category,name'),
      trades: DB.query(
        "SELECT DISTINCT trade FROM team WHERE IFNULL(trade,'')<>'' " +
        "UNION SELECT DISTINCT trade FROM labor_rec WHERE IFNULL(trade,'')<>'' " +
        "ORDER BY trade").map(function (r) { return r.trade; }).filter(Boolean),
      teams: DB.query('SELECT id,name,trade,type,day_wage FROM team ORDER BY name'),
      measure_cats: ['进度', '质量', '安全', '成本', '协调', '技术', '其他'],
      cost_types: ['人工费', '材料费', '机械费', '其他直接费', '间接费', '分包费'],
      reports: Reports.list(),
      tables: ALLOW_TABLES,
      cur_project: DB.getConfig('cur_project', '1')
    };
  }

  function wbsTree(rows) {
    var nodes = {};
    rows.forEach(function (r) { nodes[r.id] = { id: r.id, parent_id: r.parent_id, code: r.code, name: r.name, full_path: r.full_path, level: r.level, children: [] }; });
    var roots = [];
    rows.forEach(function (r) {
      var n = nodes[r.id];
      var pid = r.parent_id || 0;
      if (pid && nodes[pid]) nodes[pid].children.push(n);
      else roots.push(n);
    });
    return roots;
  }

  function metaStats() {
    function c(t) { return (DB.queryOne('SELECT COUNT(*) c FROM ' + t) || {}).c || 0; }
    function s(t, col) {
      col = col || 'amount';
      return (DB.queryOne('SELECT SUM(' + col + ') v FROM ' + t) || {}).v || 0;
    }
    var rng = DB.queryOne(
      "SELECT MIN(d) a, MAX(d) b FROM (" +
      "SELECT MIN(biz_date) d FROM output_rec UNION ALL SELECT MAX(biz_date) FROM output_rec " +
      "UNION ALL SELECT MIN(biz_date) FROM material_rec UNION ALL SELECT MAX(biz_date) FROM material_rec " +
      "UNION ALL SELECT MIN(biz_date) FROM labor_rec UNION ALL SELECT MAX(biz_date) FROM labor_rec) " +
      "WHERE d IS NOT NULL") || {};
    var recent = DB.query("SELECT biz_date, SUM(amount) a FROM output_rec GROUP BY biz_date ORDER BY biz_date DESC LIMIT 30");
    recent.reverse();
    return {
      counts: {
        output: c('output_rec'), material: c('material_rec'),
        labor: c('labor_rec'), cost: c('cost_rec'),
        progress: c('progress_rec'), measure: c('measure'),
        wbs: c('wbs'), summary: c('stage_summary')
      },
      totals: { output: s('output_rec'), material: s('material_rec'), labor: s('labor_rec'), cost: s('cost_rec') },
      date_range: { from: rng.a, to: rng.b },
      recent_output: recent.map(function (r) { return { d: r.biz_date, a: Math.round((r.a || 0) / 10000 * 100) / 100 }; }),
      pending_measures: DB.query(
        "SELECT id,biz_date,issue,content,status FROM measure WHERE status IN ('计划中','执行中') ORDER BY biz_date DESC LIMIT 10"),
      no_eval_cnt: (DB.queryOne(
        "SELECT COUNT(*) c FROM measure m WHERE NOT EXISTS (SELECT 1 FROM measure_effect e WHERE e.measure_id=m.id)") || {}).c || 0
    };
  }

  var routes = {};
  routes['/crud/list'] = crudList;
  routes['/crud/save'] = crudSave;
  routes['/crud/delete'] = crudDelete;
  routes['/meta/all'] = metaAll;
  routes['/meta/stats'] = metaStats;
  routes['/wbs/refresh_path'] = wbsRefresh;

  var api = { routes: routes, ALLOW_TABLES: ALLOW_TABLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (isBrowser) window.BackendCrud = api;
})();
