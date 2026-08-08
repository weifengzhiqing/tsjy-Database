/* 浏览器端扩展接口：项目概况导入 + 大事记导入 + 文字变量。对齐 app/api_extra.py。 */
(function () {
  'use strict';
  var isBrowser = (typeof window !== 'undefined');
  var DB = isBrowser ? window.DB : require('./db.js');
  var FU = isBrowser ? window.FileUtil : require('./fileutil.js');

  function curProject() { return parseInt(DB.getConfig('cur_project', '1') || 1, 10); }
  function XLSX() { return isBrowser ? window.XLSX : require('../../vendor/xlsx.full.min.js'); }

  // 通用：把工作表转成二维数组（含表头）
  function sheetToRows(ws) {
    return XLSX().utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: null, raw: true });
  }

  // ---------------- 项目概况 ----------------
  function profileImport(p) {
    var filename = p.file;
    if (!filename) throw new Error('请先上传文件');
    var wb = FU.readWorkbook(filename);
    var sheet = null;
    wb.SheetNames.forEach(function (nm) { if (!sheet && (nm.indexOf('项目常用数据') >= 0 || nm.indexOf('项目概况') >= 0)) sheet = wb.Sheets[nm]; });
    if (!sheet) sheet = wb.Sheets[wb.SheetNames[0]];
    var rows = sheetToRows(sheet);
    if (!rows.length) throw new Error('工作表为空');
    var header = rows.shift().map(function (c, i) { return c == null ? '' : String(c); });

    function idx(name) { for (var i = 0; i < header.length; i++) if (header[i] && header[i].indexOf(name) >= 0) return i; return -1; }
    var iSeq = idx('序号'), iName = idx('数据名称'), iContent = idx('内容');
    var supIdx = [];
    for (var k = 1; k < 10; k++) supIdx.push(idx('补充' + k));
    if (iName < 0) throw new Error('未找到「数据名称」列，请确认是「项目常用数据」表');

    var pid = curProject();
    DB.exec('DELETE FROM project_profile WHERE project_id=?', [pid]);
    var inserted = 0;
    rows.forEach(function (r) {
      if (iName >= r.length) return;
      var nm = r[iName];
      if (nm === null || nm === undefined || String(nm).trim() === '') return;
      nm = String(nm).trim();
      var content = '';
      if (iContent >= 0 && iContent < r.length && r[iContent] !== null && r[iContent] !== '') content = String(r[iContent]).trim();
      var sups = {};
      supIdx.forEach(function (si, ki) { if (si >= 0 && si < r.length && r[si] !== null && r[si] !== '') sups['sup' + (ki + 1)] = String(r[si]); });
      var seq = 0;
      if (iSeq >= 0 && iSeq < r.length && String(r[iSeq]).trim().match(/^\d+$/)) seq = parseInt(String(r[iSeq]).trim(), 10);
      DB.insertRow('project_profile', { project_id: pid, seq: seq, name: nm, content: content, sup1: sups.sup1, sup2: sups.sup2, sup3: sups.sup3, sup4: sups.sup4, sup5: sups.sup5, sup6: sups.sup6, sup7: sups.sup7, sup8: sups.sup8, sup9: sups.sup9 });
      inserted++;
    });
    return { ok: true, inserted: inserted };
  }

  // ---------------- 大事记 ----------------
  var CAT_MAP = { '临建工程': '临建工程', '桥涵工程': '桥涵工程', '隧道工程': '隧道工程', '路基工程': '路基工程', '重大、检查事项': '重大检查', '重大检查': '重大检查', '日常检查': '日常检查' };

  function normDate(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) { var y = v.getFullYear(), m = v.getMonth() + 1, d = v.getDate(); return y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d); }
    if (typeof v === 'number' && isFinite(v)) {
      if (v > 20000 && v < 60000) {
        var base = new Date(1899, 11, 30);
        var dt = new Date(base.getTime() + v * 86400000);
        return dt.getFullYear() + '-' + (dt.getMonth() + 1 < 10 ? '0' + (dt.getMonth() + 1) : dt.getMonth() + 1) + '-' + (dt.getDate() < 10 ? '0' + dt.getDate() : dt.getDate());
      }
      return null;
    }
    var s = String(v).trim();
    var m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
    if (m) { var mm = parseInt(m[2], 10), dd = parseInt(m[3], 10); return m[1] + '-' + (mm < 10 ? '0' + mm : mm) + '-' + (dd < 10 ? '0' + dd : dd); }
    return null;
  }

  function findHeader(rows) {
    var keys = ['序号', '日期', '时间', '内容', '检查内容', '工点'];
    for (var i = 0; i < rows.length; i++) {
      var cells = (rows[i] || []).filter(function (c) { return c !== null && c !== undefined; }).map(function (c) { return String(c); });
      if (cells.some(function (c) { return keys.some(function (k) { return c.indexOf(k) >= 0; }); })) return i;
    }
    return 0;
  }

  function eventImport(p) {
    var filename = p.file;
    if (!filename) throw new Error('请先上传文件');
    var wb = FU.readWorkbook(filename);
    var pid = curProject();
    DB.exec('DELETE FROM event_log WHERE project_id=?', [pid]);
    var inserted = 0, sheetStat = [];
    wb.SheetNames.forEach(function (nm) {
      var rows = sheetToRows(wb.Sheets[nm]);
      if (!rows.length) return;
      var hi = findHeader(rows);
      var header = (rows[hi] || []).map(function (c) { return c == null ? '' : String(c); });
      var data = rows.slice(hi + 1);
      function idx(name) { for (var i = 0; i < header.length; i++) if (header[i].indexOf(name) >= 0) return i; return -1; }
      var iSeq = idx('序号');
      var iDate = idx('日期'); if (iDate < 0) iDate = idx('时间');
      var iContent = idx('检查内容'); if (iContent < 0) iContent = idx('内容');
      var iTitle = idx('工点'), iNote = idx('备注'), iPeople = idx('人员');
      if (iContent < 0) return;
      var cat = CAT_MAP[nm.trim()] || nm.trim();
      var cnt = 0;
      data.forEach(function (r) {
        var dtv = (iDate >= 0 && iDate < r.length) ? normDate(r[iDate]) : null;
        var content = '';
        if (iContent < r.length && r[iContent] !== null && r[iContent] !== '') content = String(r[iContent]).trim();
        if (String(content).indexOf('=DISPIMG') === 0) content = '';
        if (!content && !dtv) return;
        var title = (iTitle >= 0 && iTitle < r.length && r[iTitle] !== null && r[iTitle] !== '') ? String(r[iTitle]).trim() : '';
        var note = (iNote >= 0 && iNote < r.length && r[iNote] !== null && r[iNote] !== '') ? String(r[iNote]).trim() : '';
        var people = (iPeople >= 0 && iPeople < r.length && r[iPeople] !== null && r[iPeople] !== '') ? String(r[iPeople]).trim() : '';
        DB.insertRow('event_log', { project_id: pid, date: dtv, category: cat, title: title, content: content, people: people, note: note });
        cnt++;
      });
      inserted += cnt; sheetStat.push(nm + '(' + cnt + ')');
    });
    return { ok: true, inserted: inserted, sheets: sheetStat };
  }

  // ---------------- 文字变量 ----------------
  function docgenVars(p) {
    var pid = curProject();
    var df = p.date_from || '2000-01-01';
    var dt = p.date_to || new Date().toISOString().slice(0, 10);
    var today = new Date().toISOString().slice(0, 10);

    var vars = {};
    DB.query('SELECT name, content FROM project_profile WHERE project_id=?', [pid]).forEach(function (r) {
      var nm = (r.name || '').trim(), ct = (r.content || '').trim();
      if (nm) vars[nm] = ct;
    });

    function s(sql, a) { var v = (DB.queryOne(sql, a) || {}).v || 0; return parseFloat(v); }
    var rng = [pid, df, dt];
    var outAmt = s('SELECT SUM(amount) v FROM output_rec WHERE project_id=? AND biz_date BETWEEN ? AND ?', rng);
    var outPlan = s('SELECT SUM(plan_amount) v FROM output_rec WHERE project_id=? AND biz_date BETWEEN ? AND ?', rng);
    var matAmt = s('SELECT SUM(amount) v FROM material_rec WHERE project_id=? AND biz_date BETWEEN ? AND ?', rng);
    var labAmt = s('SELECT SUM(amount) v FROM labor_rec WHERE project_id=? AND biz_date BETWEEN ? AND ?', rng);
    var costRec = s('SELECT SUM(amount) v FROM cost_rec WHERE project_id=? AND biz_date BETWEEN ? AND ?', rng);
    var ledger = labAmt + matAmt;
    var totalCost = Math.max(ledger, costRec);
    var profit = outAmt - totalCost;
    var rate = outAmt ? Math.round(profit / outAmt * 100 * 10) / 10 : 0;

    vars['区间开始日期'] = df;
    vars['区间结束日期'] = dt;
    vars['累计产值(万元)'] = Math.round(outAmt / 10000 * 100) / 100;
    vars['累计计划产值(万元)'] = Math.round(outPlan / 10000 * 100) / 100;
    vars['产值完成率(%)'] = outPlan ? Math.round(outAmt / outPlan * 100 * 10) / 10 : 0;
    vars['材料消耗总额(万元)'] = Math.round(matAmt / 10000 * 100) / 100;
    vars['人工费(万元)'] = Math.round(labAmt / 10000 * 100) / 100;
    vars['总成本(万元)'] = Math.round(totalCost / 10000 * 100) / 100;
    vars['盈亏(万元)'] = Math.round(profit / 10000 * 100) / 100;
    vars['毛利率(%)'] = rate;

    var lag = DB.queryOne(
      "SELECT COUNT(*) c, MAX(julianday(COALESCE(actual_end,?)) - julianday(plan_end)) mx " +
      "FROM wbs WHERE project_id=? AND plan_end IS NOT NULL " +
      "AND ((actual_end IS NULL AND plan_end < ?) OR (actual_end > plan_end))",
      [today, pid, today]) || {};
    vars['滞后节点数'] = lag.c || 0;
    vars['最大滞后天数'] = Math.round(lag.mx || 0);

    vars['措施条数'] = (DB.queryOne('SELECT COUNT(*) c FROM measure WHERE project_id=? AND biz_date BETWEEN ? AND ?', rng) || {}).c || 0;
    vars['效果正向条数'] = (DB.queryOne(
      "SELECT COUNT(*) c FROM measure_effect e JOIN measure m ON e.measure_id=m.id " +
      "WHERE m.project_id=? AND m.biz_date BETWEEN ? AND ? AND e.direction='正向'", rng) || {}).c || 0;
    vars['大事记条数'] = (DB.queryOne('SELECT COUNT(*) c FROM event_log WHERE project_id=? AND date BETWEEN ? AND ?', rng) || {}).c || 0;

    vars['峰值出勤人数'] = parseInt((DB.queryOne('SELECT MAX(person_count) v FROM labor_rec WHERE project_id=? AND biz_date BETWEEN ? AND ?', rng) || {}).v || 0, 10);
    vars['在场班组数'] = (DB.queryOne('SELECT COUNT(DISTINCT team_id) c FROM labor_rec WHERE project_id=? AND biz_date BETWEEN ? AND ?', rng) || {}).c || 0;

    var top = DB.queryOne(
      "SELECT material_name, SUM(amount) v FROM material_rec WHERE project_id=? AND biz_date BETWEEN ? AND ? GROUP BY material_name ORDER BY v DESC LIMIT 1", rng);
    if (top && top.material_name) { vars['主要材料'] = top.material_name; vars['主要材料金额(万元)'] = Math.round((top.v || 0) / 10000 * 100) / 100; }

    return { vars: vars };
  }

  var routes = {};
  routes['/profile/import'] = profileImport;
  routes['/event/import'] = eventImport;
  routes['/docgen/vars'] = docgenVars;

  var api = { routes: routes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (isBrowser) window.BackendExtra = api;
})();
