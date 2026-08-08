/* 浏览器端报表/导入共用工具，对齐 app/reports/_common.py。 */
(function () {
  'use strict';
  var DB = (typeof window !== 'undefined') ? window.DB : require('./db.js');
  var C = {};

  // 复用 Python build_filter 的语义：返回 {sql, args}
  C.buildFilter = function (p, opts) {
    opts = opts || {};
    var dateField = opts.dateField || 'biz_date';
    var wbsField = opts.wbsField || 'wbs_id';
    var alias = opts.alias || '';
    var pre = alias ? alias + '.' : '';
    var where = [], args = [];
    if (p.date_from) { where.push(pre + dateField + ' >= ?'); args.push(p.date_from); }
    if (p.date_to) { where.push(pre + dateField + ' <= ?'); args.push(p.date_to); }
    var wid = p.wbs_id;
    if (wid && String(wid) !== '0') {
      var ids = DB.wbsDescendants(wid);
      if (ids.length) {
        where.push(pre + wbsField + ' IN (' + ids.map(function () { return '?'; }).join(',') + ')');
        ids.forEach(function (id) { args.push(id); });
      }
    }
    if (p.project_id && String(p.project_id) !== '0') {
      where.push(pre + 'project_id = ?'); args.push(parseInt(p.project_id, 10));
    }
    return { sql: where.length ? ' WHERE ' + where.join(' AND ') : '', args: args };
  };

  C.asList = function (v) {
    if (v === null || v === undefined || v === '') return [];
    if (Array.isArray(v)) return v.filter(function (x) { return x !== null && x !== ''; });
    return String(v).split(',').map(function (s) { return s.trim(); }).filter(function (x) { return x; });
  };

  C.r2 = function (x, n) {
    n = (n === undefined) ? 2 : n;
    try { return Math.round(parseFloat(x || 0) * Math.pow(10, n)) / Math.pow(10, n); }
    catch (e) { return 0.0; }
  };

  C.pct = function (a, b, n) {
    n = (n === undefined) ? 1 : n;
    try {
      b = parseFloat(b || 0);
      if (b === 0) return null;
      return Math.round(parseFloat(a || 0) / b * 100 * Math.pow(10, n)) / Math.pow(10, n);
    } catch (e) { return null; }
  };

  C.daysBetween = function (d1, d2) {
    if (!d1 || !d2) return null;
    function p(s) { return String(s).slice(0, 10); }
    var a = new Date(p(d1)), b = new Date(p(d2));
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((b - a) / 86400000);
  };

  C.result = function (columns, rows, summary, charts, notes) {
    return {
      columns: columns || [],
      rows: rows || [],
      summary: summary || [],
      charts: charts || [],
      notes: notes || []
    };
  };

  // 把 build_filter 生成的别名前缀替换（profit/summary 联合子查询用）
  C.reAlias = function (whereSql, oldAlias, newAlias) {
    return whereSql.split(oldAlias + '.').join(newAlias + '.');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  if (typeof window !== 'undefined') window.Common = C;
})();
