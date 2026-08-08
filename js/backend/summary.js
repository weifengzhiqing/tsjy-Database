/* 浏览器端分阶段总结：把一段时间的数据揉成阶段报告 + 保存/列表/获取/删除。对齐 app/reports/summary.py。 */
(function () {
  'use strict';
  var isBrowser = (typeof window !== 'undefined');
  var DB = isBrowser ? window.DB : require('./db.js');
  var C = isBrowser ? window.Common : require('./common.js');
  var Reports = isBrowser ? window.Reports : require('./reports.js');

  function collect(p) {
    var ow = C.buildFilter(p, { alias: 'o' }), oa = ow.args;
    var mw = C.buildFilter(p, { alias: 'm' }), ma = mw.args;
    var lw = C.buildFilter(p, { alias: 'l' }), la = lw.args;
    var cw = C.buildFilter(p, { alias: 'c' }), ca = cw.args;
    var gw = C.buildFilter(p, { alias: 'g' }), ga = gw.args;

    function one(sql, args) { return DB.queryOne(sql, args) || {}; }

    var o = one("SELECT SUM(o.amount) amt, SUM(o.plan_amount) plan, COUNT(DISTINCT o.biz_date) days, COUNT(*) cnt FROM output_rec o " + ow.sql, oa);
    var m = one("SELECT SUM(m.amount) amt, SUM(m.qty) qty, SUM(m.theory_qty) th, COUNT(DISTINCT m.material_name) kinds FROM material_rec m " + mw.sql, ma);
    var matByCat = DB.query("SELECT COALESCE(m.category,'未分类') c, SUM(m.amount) a, SUM(m.qty) q, MAX(m.unit) u, SUM(m.theory_qty) th FROM material_rec m " + mw.sql + " GROUP BY c ORDER BY a DESC", ma);
    var over = DB.query(
      "SELECT m.material_name n, SUM(m.qty) q, SUM(m.theory_qty) th, MAX(m.unit) u FROM material_rec m " + mw.sql +
      " GROUP BY m.material_name HAVING SUM(m.theory_qty) > 0 AND SUM(m.qty) > SUM(m.theory_qty)*1.05 ORDER BY (SUM(m.qty)-SUM(m.theory_qty))/SUM(m.theory_qty) DESC", ma);
    var l = one("SELECT SUM(l.person_count) md, SUM(l.amount) amt, COUNT(DISTINCT l.team_name) teams, COUNT(DISTINCT l.biz_date) days FROM labor_rec l " + lw.sql, la);
    var teams = DB.query("SELECT COALESCE(l.team_name,'未填写') n, COALESCE(l.trade,'-') t, SUM(l.person_count) md, SUM(l.amount) a FROM labor_rec l " + lw.sql + " GROUP BY n,t ORDER BY md DESC LIMIT 20", la);
    var costByType = DB.query("SELECT COALESCE(c.cost_type,'未分类') t, SUM(c.amount) a FROM cost_rec c " + cw.sql + " GROUP BY t", ca);
    var g = one("SELECT SUM(g.plan_qty) pq, SUM(g.actual_qty) aq FROM progress_rec g " + gw.sql, ga);
    var ms = DB.query(
      "SELECT m.id, m.biz_date, m.category, m.issue, m.content, m.status, m.invest_amt, " +
      "(SELECT SUM(e.benefit_amt) FROM measure_effect e WHERE e.measure_id=m.id) b, " +
      "(SELECT GROUP_CONCAT(e.direction) FROM measure_effect e WHERE e.measure_id=m.id) d, " +
      "(SELECT GROUP_CONCAT(e.conclusion,' / ') FROM measure_effect e WHERE e.measure_id=m.id) c " +
      "FROM measure m " + mw.sql + " ORDER BY m.biz_date", ma);

    var today = new Date().toISOString().slice(0, 10);
    var wid = p.wbs_id;
    var wargs = [], wsql = '';
    if (wid && String(wid) !== '0') {
      var ids = DB.wbsDescendants(wid);
      if (ids.length) { wsql = ' WHERE id IN (' + ids.map(function () { return '?'; }).join(',') + ')'; wargs = ids; }
    }
    var nodes = DB.query("SELECT name, full_path, plan_start, plan_end, actual_start, actual_end, plan_amount FROM wbs " + wsql, wargs);
    var delays = [];
    nodes.forEach(function (n) {
      var d = null;
      if (n.actual_end) d = C.daysBetween(n.plan_end, n.actual_end);
      else if (n.plan_end && n.plan_end < today) d = C.daysBetween(n.plan_end, today);
      if (d && d > 0) delays.push({ name: n.full_path || n.name, days: d, done: !!n.actual_end });
    });
    delays.sort(function (x, y) { return y.days - x.days; });

    var income = C.r2(o.amt);
    var matAmt = C.r2(m.amt);
    var labAmt = C.r2(l.amt);
    var costMap = {}; costByType.forEach(function (r) { costMap[r.t] = C.r2(r.a); });
    var otherCost = 0; Object.keys(costMap).forEach(function (k) { if (k !== '材料费' && k !== '人工费') otherCost += costMap[k]; });
    var effMat = Math.max(matAmt, costMap['材料费'] || 0);
    var effLab = Math.max(labAmt, costMap['人工费'] || 0);
    var totalCost = effMat + effLab + otherCost;
    var profit = income - totalCost;

    return {
      range: { from: p.date_from, to: p.date_to, days: C.daysBetween(p.date_from, p.date_to) },
      output: { amount: income, plan: C.r2(o.plan), rate: C.pct(income, o.plan), work_days: o.days || 0, rec_cnt: o.cnt || 0, daily: o.days ? C.r2(income / o.days) : 0 },
      material: { amount: matAmt, kinds: m.kinds || 0, by_cat: matByCat.map(function (r) { return { cat: r.c, amount: C.r2(r.a), qty: C.r2(r.q, 2), unit: r.u }; }),
        over: over.map(function (r) { return { name: r.n, qty: C.r2(r.q, 2), theory: C.r2(r.th, 2), unit: r.u, pct: C.pct(C.r2(r.q) - C.r2(r.th), r.th) }; }) },
      labor: { man_days: C.r2(l.md), amount: labAmt, teams: l.teams || 0, per_day_output: C.r2(l.md) ? C.r2(income / C.r2(l.md)) : 0,
        list: teams.map(function (r) { return { name: r.n, trade: r.t, man_days: C.r2(r.md), amount: C.r2(r.a) }; }) },
      progress: { plan_qty: C.r2(g.pq, 2), actual_qty: C.r2(g.aq, 2), rate: C.pct(g.aq, g.pq), delays: delays },
      measures: ms.map(function (r) {
        return { id: r.id, date: r.biz_date, category: r.category, issue: r.issue, content: r.content, status: r.status,
          invest: C.r2(r.invest_amt), benefit: C.r2(r.b),
          direction: (r.d && r.d.indexOf('负向') >= 0) ? '负向' : (r.d && r.d.indexOf('正向') >= 0) ? '正向' : (r.d ? '无明显影响' : '未评估'),
          conclusion: r.c };
      }),
      finance: { income: income, mat_cost: effMat, lab_cost: effLab, other_cost: otherCost, total_cost: totalCost, profit: profit, margin: C.pct(profit, income), judge: profit > 0 ? '正向' : (profit < 0 ? '负向' : '持平') }
    };
  }

  function suggest(d) {
    var s = [];
    var o = d.output, m = d.material, l = d.labor, g = d.progress, f = d.finance;
    if (o.plan && o.rate !== null && o.rate < 100) {
      var gap = o.plan - o.amount;
      var need = C.r2(gap / Math.max(o.work_days, 1));
      s.push('【产值】缺口 ' + C.r2(gap / 10000) + ' 万元（完成率 ' + o.rate + '%）。若剩余工期与本期相当，日均产值需从 ' + C.r2(o.daily / 10000) + ' 万提到 ' + C.r2((o.daily + need) / 10000) + ' 万，缺口主要靠增加作业面或延长有效工时解决。');
    }
    if (m.over.length) {
      var top = m.over[0];
      s.push('【材料】' + m.over.length + ' 种材料超耗，最严重的是 ' + top.name + '，超 ' + top.pct + '%（实耗 ' + top.qty + (top.unit || '') + ' / 理论 ' + top.theory + '）。先查三件事：过磅记录是否齐全、配合比是否被现场擅自调整、退场余料是否回收计量。');
    }
    var mr = C.pct(m.amount, f.income);
    if (mr && mr > 60) s.push('【成本结构】材料费占产值 ' + mr + '%，高于常规。建议按品种拉一遍单价对比，确认是量的问题还是价的问题——量的问题上现场管控，价的问题上物资部询价。');
    if (l.man_days && f.income) {
      var lr = C.pct(l.amount, f.income);
      if (lr && lr > 35) s.push('【人工】人工费占产值 ' + lr + '%，偏高。人均日产值仅 ' + l.per_day_output + ' 元/工日，重点排查窝工：是否存在等图纸、等材料、等验收造成的无效出勤。');
    }
    if (g.delays.length) {
      var sev = g.delays.filter(function (x) { return x.days > 7; });
      var gt = g.delays[0];
      s.push('【进度】' + g.delays.length + ' 个部位滞后，其中 ' + sev.length + ' 个超 7 天。最严重：' + gt.name + ' 滞后 ' + gt.days + ' 天。建议对超 7 天的部位单独做赶工方案，并在措施台账里立项跟踪，不要只在例会上口头协调。');
    }
    if (g.rate !== null && g.rate < 90) s.push('【形象进度】完成率 ' + g.rate + '%，欠量明显。核对是产能不足还是计划编制偏乐观——如果连续两期都在 90% 以下，问题多半在计划本身。');
    var noEval = d.measures.filter(function (x) { return x.direction === '未评估'; });
    if (noEval.length) s.push('【措施闭环】' + noEval.length + ' 条措施未做效果评估。措施不评估，下次遇到同类问题还得从头试。建议固定在月底把当月措施评一遍，量化到具体指标。');
    var neg = d.measures.filter(function (x) { return x.direction === '负向'; });
    if (neg.length) s.push('【措施复盘】' + neg.length + ' 条措施评估为负向，说明这类做法在本项目行不通，记入教训清单，避免重复投入。');
    if (f.income) {
      if (f.profit < 0) s.push('【盈亏】本期亏损 ' + C.r2(Math.abs(f.profit) / 10000) + ' 万元。按部位下钻找出亏损集中的部位，优先处理占比最大的那一个——平均用力通常什么都改不动。');
      else if (f.margin !== null && f.margin < 5) s.push('【盈亏】毛利率仅 ' + f.margin + '%，安全垫薄。任何一项超支都可能吃掉利润，建议把材料超耗和窝工作为本期重点管控项。');
    }
    if (!o.rec_cnt) s.push('【数据】本区间没有产值记录，报告结论不可靠。先把台账导进来。');
    if (!d.measures.length && (g.delays.length || m.over.length)) s.push('【数据】存在滞后或超耗，但措施台账是空的。现场肯定做了动作，只是没记录——把它们补上，下次总结才能体现管理动作的价值。');
    if (!s.length) s.push('各项指标未触发预警规则。保持当前节奏，重点是持续积累数据，让下一期对比有基准。');
    return s;
  }

  function buildNarrative(d) {
    var o = d.output, m = d.material, l = d.labor, g = d.progress, f = d.finance;
    var rg = d.range;
    var p = [];
    var line1 = '一、总体情况\n统计区间 ' + rg.from + ' 至 ' + rg.to + '（' + ((rg.days || 0) + 1) + ' 天）。完成产值 ' + C.r2(o.amount / 10000) + ' 万元';
    if (o.plan) line1 += '，计划 ' + C.r2(o.plan / 10000) + ' 万元，完成率 ' + o.rate + '%';
    line1 += '。发生成本 ' + C.r2(f.total_cost / 10000) + ' 万元，其中材料费 ' + C.r2(f.mat_cost / 10000) + ' 万元、人工费 ' + C.r2(f.lab_cost / 10000) + ' 万元、其他 ' + C.r2(f.other_cost / 10000) + ' 万元。本期毛利 ' + C.r2(f.profit / 10000) + ' 万元，毛利率 ' + f.margin + '%，对项目整体为' + f.judge + '影响。';
    p.push(line1);

    var seg = '二、资源投入\n共投入 ' + l.man_days + ' 工日，' + l.teams + ' 个班组参与';
    if (l.list.length) seg += '，主要为 ' + l.list.slice(0, 4).map(function (x) { return x.name + '（' + x.trade + '，' + x.man_days + '工日）'; }).join('、');
    seg += '。人均日产值 ' + l.per_day_output + ' 元/工日。';
    if (m.by_cat.length) seg += '材料消耗方面，' + m.by_cat.slice(0, 4).map(function (x) { return x.cat + ' ' + C.r2(x.amount / 10000) + ' 万元'; }).join('、') + '。';
    if (m.over.length) seg += '其中 ' + m.over.slice(0, 3).map(function (x) { return x.name + '超耗 ' + x.pct + '%'; }).join('、') + '，需重点关注。';
    p.push(seg);

    var seg3 = '三、进度情况\n';
    if (g.rate !== null) seg3 += '形象进度完成率 ' + g.rate + '%（计划 ' + g.plan_qty + ' / 完成 ' + g.actual_qty + '）。';
    if (g.delays.length) seg3 += '存在 ' + g.delays.length + ' 个滞后部位：' + g.delays.slice(0, 5).map(function (x) { return x.name + ' 滞后 ' + x.days + ' 天'; }).join('、') + '。';
    else seg3 += '各节点均未出现滞后。';
    p.push(seg3);

    var seg4 = '四、采取措施及效果\n';
    if (d.measures.length) {
      d.measures.slice(0, 8).forEach(function (x, i) {
        seg4 += (i + 1) + '. [' + x.date + ']' + (x.category || '') + '｜问题：' + (x.issue || '-') + '；措施：' + (x.content || '-') + '；状态：' + x.status + '；效果：' + x.direction + (x.conclusion ? '（' + x.conclusion + '）' : '') + (x.benefit ? '，折算效益 ' + C.r2(x.benefit / 10000) + ' 万元' : '') + '。\n';
      });
      var tb = 0, ti = 0; d.measures.forEach(function (x) { tb += x.benefit; ti += x.invest; });
      if (tb || ti) seg4 += '措施累计投入 ' + C.r2(ti / 10000) + ' 万元，产生效益 ' + C.r2(tb / 10000) + ' 万元，净' + (tb >= ti ? '创效' : '损失') + ' ' + C.r2(Math.abs(tb - ti) / 10000) + ' 万元。';
    } else seg4 += '本区间未记录措施。';
    p.push(seg4);

    p.push('五、优化建议\n' + d.suggestions.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n'));
    return p.join('\n\n');
  }

  function stageSummary(p) {
    var d = collect(p);
    d.suggestions = suggest(d);
    var f = d.finance;
    var rows = [];
    function add(dim, item, val, unit, note, tone) { rows.push({ dim: dim, item: item, val: val, unit: unit || '', note: note || '', _tone: tone || '' }); }
    var o = d.output;
    add('产值', '完成产值', C.r2(o.amount / 10000), '万元', '共 ' + o.rec_cnt + ' 条记录 / ' + o.work_days + ' 个作业日', 'good');
    add('产值', '计划产值', C.r2(o.plan / 10000), '万元', '');
    add('产值', '完成率', o.rate, '%', '', (o.rate || 0) >= 100 ? 'good' : (o.rate !== null ? 'bad' : ''));
    add('产值', '日均产值', C.r2(o.daily / 10000), '万元', '');
    var m = d.material;
    add('材料', '材料费合计', C.r2(m.amount / 10000), '万元', '涉及 ' + m.kinds + ' 个品种');
    m.by_cat.slice(0, 6).forEach(function (c) { add('材料', '— ' + c.cat, C.r2(c.amount / 10000), '万元', c.qty + ' ' + (c.unit || '')); });
    add('材料', '超耗品种', m.over.length, '项', m.over.slice(0, 3).map(function (x) { return x.name + '超' + x.pct + '%'; }).join('、'), m.over.length ? 'bad' : 'good');
    var l = d.labor;
    add('人员', '累计用工', l.man_days, '工日', l.teams + ' 个班组参与', 'good');
    add('人员', '人工费', C.r2(l.amount / 10000), '万元', '');
    add('人员', '人均日产值', l.per_day_output, '元/工日', '');
    l.list.slice(0, 5).forEach(function (t) { add('人员', '— ' + t.name, t.man_days, '工日', t.trade); });
    var g = d.progress;
    add('进度', '形象进度完成率', g.rate, '%', '', (g.rate || 0) >= 100 ? 'good' : (g.rate !== null ? 'bad' : ''));
    add('进度', '滞后部位', g.delays.length, '个', g.delays.slice(0, 3).map(function (x) { return x.name + '(' + x.days + '天)'; }).join('、'), g.delays.length ? 'bad' : 'good');
    if (g.delays.length) add('进度', '最大滞后', g.delays[0].days, '天', g.delays[0].name, 'bad');
    var ms = d.measures;
    add('措施', '措施条数', ms.length, '条', '');
    add('措施', '正向效果', ms.filter(function (x) { return x.direction === '正向'; }).length, '条', '', 'good');
    add('措施', '负向效果', ms.filter(function (x) { return x.direction === '负向'; }).length, '条', '', ms.some(function (x) { return x.direction === '负向'; }) ? 'bad' : '');
    add('措施', '未评估', ms.filter(function (x) { return x.direction === '未评估'; }).length, '条', '', 'warn');
    var net = 0; ms.forEach(function (x) { net += x.benefit - x.invest; });
    add('措施', '措施净效益', C.r2(net / 10000), '万元', '');
    add('盈亏', '成本合计', C.r2(f.total_cost / 10000), '万元', '材料 ' + C.r2(f.mat_cost / 10000) + ' / 人工 ' + C.r2(f.lab_cost / 10000) + ' / 其他 ' + C.r2(f.other_cost / 10000));
    add('盈亏', '毛利', C.r2(f.profit / 10000), '万元', '', f.profit > 0 ? 'good' : 'bad');
    add('盈亏', '毛利率', f.margin, '%', '', (f.margin || 0) > 5 ? 'good' : 'bad');
    add('盈亏', '综合判断', f.judge, '', '对项目整体影响', f.judge === '正向' ? 'good' : 'bad');

    var res = C.result(
      [
        { key: 'dim', label: '维度', type: 'text', width: 80 },
        { key: 'item', label: '指标', type: 'text', width: 180 },
        { key: 'val', label: '数值', type: 'num', width: 120 },
        { key: 'unit', label: '单位', type: 'text', width: 80 },
        { key: 'note', label: '说明', type: 'text', width: 320 }
      ],
      rows,
      [
        { label: '完成产值', value: C.r2(o.amount / 10000), unit: '万元', tone: 'good' },
        { label: '成本合计', value: C.r2(f.total_cost / 10000), unit: '万元' },
        { label: '毛利', value: C.r2(f.profit / 10000), unit: '万元', tone: f.profit > 0 ? 'good' : 'bad' },
        { label: '毛利率', value: f.margin, unit: '%', tone: (f.margin || 0) > 5 ? 'good' : 'bad' },
        { label: '滞后部位', value: g.delays.length, unit: '个', tone: g.delays.length ? 'bad' : 'good' },
        { label: '超耗品种', value: m.over.length, unit: '项', tone: m.over.length ? 'bad' : 'good' },
        { label: '综合判断', value: f.judge, unit: '', tone: f.judge === '正向' ? 'good' : 'bad' }
      ],
      [
        { type: 'pie', title: '成本构成', labels: ['材料费', '人工费', '其他成本'], series: [{ name: '万元', data: [C.r2(f.mat_cost / 10000), C.r2(f.lab_cost / 10000), C.r2(f.other_cost / 10000)] }] }
      ],
      d.suggestions);
    res.stage_data = d;
    res.narrative = buildNarrative(d);
    return res;
  }

  // 注册进报表系统
  if (Reports && Reports.FN) {
    Reports.FN['stage_summary'] = stageSummary;
    var exists = false;
    (Reports.REPORTS || []).forEach(function (r) { if (r.key === 'stage_summary') exists = true; });
    if (!exists) Reports.REPORTS.push({ key: 'stage_summary', name: '分阶段总结', group: '总结', desc: '把一个时间段的产值、材料、人员、进度、措施、盈亏揉成一份完整阶段报告', params: [
      { key: 'date_from', label: '开始日期', type: 'date', required: true },
      { key: 'date_to', label: '截止日期', type: 'date', required: true },
      { key: 'wbs_id', label: '部位（含下级）', type: 'wbs' }
    ] });
  }

  // ---------------- 保存 / 列表 / 获取 / 删除 ----------------
  function summarySave(p) {
    var d = collect(p);
    d.suggestions = suggest(d);
    var sid = DB.insertRow('stage_summary', {
      title: p.title || ('阶段总结 ' + (p.date_from || '') + '~' + (p.date_to || '')),
      project_id: parseInt(p.project_id || 0, 10),
      wbs_id: parseInt(p.wbs_id || 0, 10),
      date_from: p.date_from, date_to: p.date_to,
      metrics: JSON.stringify(d),
      content: p.content || buildNarrative(d),
      judgement: d.finance.judge,
      suggestion: d.suggestions.join('\n')
    });
    return { id: sid, ok: true };
  }
  function summaryList() {
    return DB.query("SELECT id,title,date_from,date_to,judgement,created_at FROM stage_summary ORDER BY id DESC LIMIT 200");
  }
  function summaryGet(p) { return DB.queryOne('SELECT * FROM stage_summary WHERE id=?', [p.id]); }
  function summaryDelete(p) { DB.exec('DELETE FROM stage_summary WHERE id=?', [p.id]); return { ok: true }; }

  var routes = {};
  routes['/summary/save'] = summarySave;
  routes['/summary/list'] = summaryList;
  routes['/summary/get'] = summaryGet;
  routes['/summary/delete'] = summaryDelete;

  var api = { routes: routes, collect: collect, suggest: suggest, buildNarrative: buildNarrative, stageSummary: stageSummary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (isBrowser) window.BackendSummary = api;
})();
