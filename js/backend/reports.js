/* 浏览器端报表：对齐 app/reports/*.py。每个报表返回 {columns,rows,summary,charts,notes}。 */
(function () {
  'use strict';
  var DB = (typeof window !== 'undefined') ? window.DB : require('./db.js');
  var C = (typeof window !== 'undefined') ? window.Common : require('./common.js');

  var REPORTS = [];
  var FN = {};
  function reg(key, name, group, desc, params, fn) {
    REPORTS.push({ key: key, name: name, group: group, desc: desc, params: params || [] });
    FN[key] = fn;
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }

  // ============ 产值 ============
  var OUT_GROUP = {
    wbs: ["COALESCE(w.full_path, o.wbs_name, '未分配部位')", '部位'],
    date: ["o.biz_date", '日期'],
    month: ["substr(o.biz_date,1,7)", '月份'],
    week: ["strftime('%Y-W%W', o.biz_date)", '周次'],
    item: ["COALESCE(o.item_name,'未填写')", '清单/工序']
  };
  reg('output_summary', '产值完成查询', '产值',
    '指定日期区间与部位的产值完成情况，可按部位、日期、月份、清单项汇总，并对比计划产值',
    [
      { key: 'date_from', label: '开始日期', type: 'date', required: true },
      { key: 'date_to', label: '截止日期', type: 'date', required: true },
      { key: 'wbs_id', label: '部位（含下级）', type: 'wbs' },
      { key: 'group_by', label: '汇总方式', type: 'select', default: 'wbs',
        options: [{ v: 'wbs', t: '按部位' }, { v: 'date', t: '按日期' }, { v: 'month', t: '按月份' }, { v: 'week', t: '按周次' }, { v: 'item', t: '按清单/工序' }] }
    ],
    function (p) {
      var gkey = p.group_by || 'wbs';
      var g = OUT_GROUP[gkey] || OUT_GROUP.wbs;
      var gexpr = g[0], glabel = g[1];
      var bf = C.buildFilter(p, { alias: 'o' });
      var orderBy = (['date', 'month', 'week'].indexOf(gkey) >= 0) ? 'grp' : 'amount DESC';
      var rows = DB.query(
        "SELECT " + gexpr + " AS grp, COUNT(*) AS rec_cnt, SUM(o.qty) AS qty, SUM(o.amount) AS amount, " +
        "SUM(o.plan_amount) AS plan_amount, MIN(o.biz_date) AS d1, MAX(o.biz_date) AS d2 " +
        "FROM output_rec o LEFT JOIN wbs w ON w.id=o.wbs_id " + bf.sql +
        " GROUP BY grp ORDER BY " + orderBy, bf.args);
      var totalAmt = rows.reduce(function (s, r) { return s + C.r2(r.amount); }, 0);
      var totalPlan = rows.reduce(function (s, r) { return s + C.r2(r.plan_amount); }, 0);
      var out = rows.map(function (r) {
        var amt = C.r2(r.amount), plan = C.r2(r.plan_amount);
        return {
          grp: r.grp, rec_cnt: r.rec_cnt, qty: C.r2(r.qty, 3), amount: amt,
          wan: C.r2(amt / 10000), plan_amount: plan,
          diff: plan ? C.r2(amt - plan) : null, rate: C.pct(amt, plan), share: C.pct(amt, totalAmt)
        };
      });
      var dc = DB.queryOne("SELECT COUNT(DISTINCT o.biz_date) c FROM output_rec o " + bf.sql, bf.args);
      var days = (dc && dc.c) || 0;
      var daily = days ? C.r2(totalAmt / days) : 0;
      var rate = C.pct(totalAmt, totalPlan);
      var summary = [
        { label: '完成产值', value: C.r2(totalAmt / 10000), unit: '万元', tone: 'good' },
        { label: '计划产值', value: C.r2(totalPlan / 10000), unit: '万元' },
        { label: '完成率', value: rate, unit: '%', tone: _toneRate(rate) },
        { label: '有数据天数', value: days, unit: '天' },
        { label: '日均产值', value: C.r2(daily / 10000), unit: '万元' }
      ];
      var charts = [{
        type: (['date', 'month', 'week'].indexOf(gkey) >= 0) ? 'line' : 'bar',
        title: '产值分布（' + glabel + '）',
        labels: out.slice(0, 20).map(function (r) { return String(r.grp); }),
        series: [{ name: '完成产值(万元)', data: out.slice(0, 20).map(function (r) { return r.wan; }) }]
      }];
      if (totalPlan > 0) charts[0].series.push({ name: '计划产值(万元)', data: out.slice(0, 20).map(function (r) { return C.r2(r.plan_amount / 10000); }) });
      var notes = [];
      if (totalPlan > 0) {
        var gap = totalAmt - totalPlan;
        notes.push(gap < 0 ? ('区间内产值缺口 ' + C.r2(Math.abs(gap) / 10000) + ' 万元，完成率 ' + C.pct(totalAmt, totalPlan) + '%。')
          : ('区间内超计划 ' + C.r2(gap / 10000) + ' 万元。'));
      } else {
        notes.push('本区间没有录入计划产值，无法计算完成率。可在「基础数据 - 部位」里补充计划产值。');
      }
      return C.result(
        [
          { key: 'grp', label: glabel, type: 'text', width: 220 },
          { key: 'qty', label: '工程量', type: 'num' },
          { key: 'amount', label: '完成产值(元)', type: 'money' },
          { key: 'wan', label: '完成(万元)', type: 'num' },
          { key: 'plan_amount', label: '计划产值(元)', type: 'money' },
          { key: 'diff', label: '差额(元)', type: 'money' },
          { key: 'rate', label: '完成率', type: 'pct' },
          { key: 'share', label: '占比', type: 'pct' },
          { key: 'rec_cnt', label: '记录数', type: 'num' }
        ], out, summary, charts, notes);
    });

  reg('output_detail', '产值明细台账', '产值',
    '列出区间内每一条产值记录，可直接导出成 Excel 交报表',
    [
      { key: 'date_from', label: '开始日期', type: 'date', required: true },
      { key: 'date_to', label: '截止日期', type: 'date', required: true },
      { key: 'wbs_id', label: '部位（含下级）', type: 'wbs' },
      { key: 'keyword', label: '清单关键字', type: 'text' }
    ],
    function (p) {
      var bf = C.buildFilter(p, { alias: 'o' });
      var sql = "SELECT o.biz_date, COALESCE(w.full_path,o.wbs_name,'-') AS wbs, o.item_name, o.unit, o.qty, o.price, o.amount, o.plan_amount, o.remark FROM output_rec o LEFT JOIN wbs w ON w.id=o.wbs_id " + bf.sql;
      if (p.keyword) { sql += (bf.sql ? ' AND ' : ' WHERE ') + "o.item_name LIKE ?"; bf.args.push('%' + p.keyword + '%'); }
      sql += " ORDER BY o.biz_date, o.id LIMIT 5000";
      var rows = DB.query(sql, bf.args);
      var total = rows.reduce(function (s, r) { return s + C.r2(r.amount); }, 0);
      return C.result(
        [
          { key: 'biz_date', label: '日期', type: 'date', width: 110 },
          { key: 'wbs', label: '部位', type: 'text', width: 180 },
          { key: 'item_name', label: '清单/工序', type: 'text', width: 200 },
          { key: 'unit', label: '单位', type: 'text', width: 70 },
          { key: 'qty', label: '工程量', type: 'num' },
          { key: 'price', label: '单价', type: 'money' },
          { key: 'amount', label: '金额', type: 'money' },
          { key: 'remark', label: '备注', type: 'text', width: 160 }
        ], rows.map(function (r) { return Object.assign({}, r); }),
        [
          { label: '记录条数', value: rows.length, unit: '条' },
          { label: '产值合计', value: C.r2(total / 10000), unit: '万元', tone: 'good' }
        ]);
    });

  // ============ 材料 ============
  reg('material_summary', '材料消耗分析', '材料',
    '区间内材料消耗汇总，可勾选材料类型；有理论用量的自动算超耗率并预警',
    [
      { key: 'date_from', label: '开始日期', type: 'date', required: true },
      { key: 'date_to', label: '截止日期', type: 'date', required: true },
      { key: 'wbs_id', label: '部位（含下级）', type: 'wbs' },
      { key: 'categories', label: '材料类型', type: 'material_cat' },
      { key: 'group_by', label: '汇总方式', type: 'select', default: 'material',
        options: [{ v: 'material', t: '按材料' }, { v: 'category', t: '按类型' }, { v: 'wbs', t: '按部位' }, { v: 'month', t: '按月份' }, { v: 'date', t: '按日期' }] },
      { key: 'warn_rate', label: '超耗预警阈值(%)', type: 'number', default: 5 }
    ],
    function (p) {
      var gmap = {
        material: ["COALESCE(m.material_name,'未知材料') || CASE WHEN IFNULL(m.spec,'')<>'' THEN ' ('||m.spec||')' ELSE '' END", '材料'],
        category: ["COALESCE(m.category,'未分类')", '材料类型'],
        wbs: ["COALESCE(w.full_path, m.wbs_name, '未分配部位')", '部位'],
        month: ["substr(m.biz_date,1,7)", '月份'],
        date: ["m.biz_date", '日期']
      };
      var gkey = p.group_by || 'material';
      var g = gmap[gkey] || gmap.material;
      var gexpr = g[0], glabel = g[1];
      var bf = C.buildFilter(p, { alias: 'm' });
      var cats = C.asList(p.categories);
      if (cats.length) {
        bf.sql += (bf.sql ? ' AND ' : ' WHERE ') + "m.category IN (" + cats.map(function () { return '?'; }).join(',') + ")";
        cats.forEach(function (c) { bf.args.push(c); });
      }
      var rows = DB.query(
        "SELECT " + gexpr + " AS grp, MAX(m.unit) AS unit, MAX(m.category) AS category, SUM(m.qty) AS qty, " +
        "SUM(m.theory_qty) AS theory_qty, SUM(m.amount) AS amount, COUNT(*) AS rec_cnt " +
        "FROM material_rec m LEFT JOIN wbs w ON w.id=m.wbs_id " + bf.sql +
        " GROUP BY grp ORDER BY " + (['date', 'month'].indexOf(gkey) >= 0 ? 'grp' : 'amount DESC'), bf.args);
      var warn = parseFloat(p.warn_rate || 5) || 5;
      var totalAmt = rows.reduce(function (s, r) { return s + C.r2(r.amount); }, 0);
      var overList = [];
      var out = rows.map(function (r) {
        var qty = C.r2(r.qty, 3), th = C.r2(r.theory_qty, 3);
        var over = (th) ? C.r2(qty - th, 3) : null;
        var overPct = (th) ? C.pct(qty - th, th) : null;
        var flag = '';
        if (overPct !== null) {
          if (overPct > warn) { flag = 'bad'; overList.push([r.grp, overPct, over, r.unit]); }
          else if (overPct > 0) flag = 'warn';
          else flag = 'good';
        }
        return {
          grp: r.grp, category: r.category, unit: r.unit, qty: qty, theory_qty: th || null,
          over_qty: over, over_pct: overPct, amount: C.r2(r.amount),
          wan: C.r2(C.r2(r.amount) / 10000), share: C.pct(r.amount, totalAmt), rec_cnt: r.rec_cnt, _tone: flag
        };
      });
      var catRows = DB.query(
        "SELECT COALESCE(m.category,'未分类') AS c, SUM(m.amount) AS a FROM material_rec m LEFT JOIN wbs w ON w.id=m.wbs_id " + bf.sql + " GROUP BY c ORDER BY a DESC", bf.args);
      var summary = [
        { label: '材料费合计', value: C.r2(totalAmt / 10000), unit: '万元', tone: 'good' },
        { label: '涉及品类', value: catRows.length, unit: '类' },
        { label: '明细条数', value: out.reduce(function (s, r) { return s + r.rec_cnt; }, 0), unit: '条' },
        { label: '超耗品种', value: overList.length, unit: '项', tone: overList.length ? 'bad' : 'good' }
      ];
      var charts = [
        { type: 'pie', title: '材料费类型构成', labels: catRows.map(function (r) { return r.c; }), series: [{ name: '金额(万元)', data: catRows.map(function (r) { return C.r2(C.r2(r.a) / 10000); }) }] },
        { type: 'bar', title: '消耗金额排名（' + glabel + '）', labels: out.slice(0, 15).map(function (r) { return String(r.grp); }), series: [{ name: '金额(万元)', data: out.slice(0, 15).map(function (r) { return r.wan; }) }] }
      ];
      var notes = [];
      if (overList.length) {
        overList.sort(function (a, b) { return b[1] - a[1]; });
        notes.push('超过 ' + warn + '% 预警线的有 ' + overList.length + ' 项：' +
          overList.slice(0, 5).map(function (x) { return x[0] + ' 超耗 ' + x[1] + '%（' + x[2] + (x[3] || '') + '）'; }).join('、') + '。建议核查计量口径与现场损耗。');
      } else {
        var hasTheory = out.some(function (r) { return r.theory_qty; });
        notes.push(hasTheory ? '本区间未发现超过预警线的材料，消耗在控。' : '未录入理论/定额用量，无法做超耗分析。可在导入时映射「理论用量」列，或在材料字典里维护损耗率。');
      }
      return C.result(
        [
          { key: 'grp', label: glabel, type: 'text', width: 220 },
          { key: 'category', label: '类型', type: 'text', width: 100 },
          { key: 'unit', label: '单位', type: 'text', width: 70 },
          { key: 'qty', label: '实际消耗', type: 'num' },
          { key: 'theory_qty', label: '理论用量', type: 'num' },
          { key: 'over_qty', label: '超耗量', type: 'num' },
          { key: 'over_pct', label: '超耗率', type: 'pct' },
          { key: 'amount', label: '金额(元)', type: 'money' },
          { key: 'share', label: '占比', type: 'pct' }
        ], out, summary, charts, notes);
    });

  reg('material_trend', '单种材料消耗趋势', '材料',
    '盯住某一种材料在时间轴上的消耗曲线，用来发现异常波动',
    [
      { key: 'date_from', label: '开始日期', type: 'date', required: true },
      { key: 'date_to', label: '截止日期', type: 'date', required: true },
      { key: 'material_name', label: '材料名称关键字', type: 'text', required: true },
      { key: 'wbs_id', label: '部位（含下级）', type: 'wbs' },
      { key: 'gran', label: '时间粒度', type: 'select', default: 'date', options: [{ v: 'date', t: '按日' }, { v: 'month', t: '按月' }] }
    ],
    function (p) {
      var bf = C.buildFilter(p, { alias: 'm' });
      var kw = p.material_name || '';
      bf.sql += (bf.sql ? ' AND ' : ' WHERE ') + "m.material_name LIKE ?"; bf.args.push('%' + kw + '%');
      var gexpr = (p.gran === 'month') ? "substr(m.biz_date,1,7)" : "m.biz_date";
      var rows = DB.query(
        "SELECT " + gexpr + " AS grp, SUM(m.qty) qty, SUM(m.amount) amount, MAX(m.unit) unit, AVG(NULLIF(m.price,0)) avg_price " +
        "FROM material_rec m LEFT JOIN wbs w ON w.id=m.wbs_id " + bf.sql + " GROUP BY grp ORDER BY grp", bf.args);
      var out = rows.map(function (r) { return { grp: r.grp, qty: C.r2(r.qty, 3), unit: r.unit, amount: C.r2(r.amount), avg_price: C.r2(r.avg_price) }; });
      var tq = out.reduce(function (s, r) { return s + r.qty; }, 0);
      var ta = out.reduce(function (s, r) { return s + r.amount; }, 0);
      return C.result(
        [
          { key: 'grp', label: '时间', type: 'text', width: 120 },
          { key: 'qty', label: '消耗量', type: 'num' },
          { key: 'unit', label: '单位', type: 'text', width: 70 },
          { key: 'avg_price', label: '均价', type: 'money' },
          { key: 'amount', label: '金额', type: 'money' }
        ], out,
        [
          { label: '累计消耗', value: C.r2(tq, 3), unit: out[0] ? out[0].unit : '' },
          { label: '累计金额', value: C.r2(ta / 10000), unit: '万元' },
          { label: '综合均价', value: tq ? C.r2(ta / tq) : 0, unit: '元' }
        ],
        [{ type: 'line', title: '「' + kw + '」消耗趋势', labels: out.map(function (r) { return String(r.grp); }), series: [{ name: '消耗量', data: out.map(function (r) { return r.qty; }) }] }]);
    });

  // ============ 人员 ============
  var LAB_GMAP = {
    team: ["COALESCE(l.team_name,'未填写班组')", '班组'],
    trade: ["COALESCE(l.trade,'未填写工种')", '工种'],
    wbs: ["COALESCE(w.full_path,l.wbs_name,'未分配部位')", '部位'],
    date: ["l.biz_date", '日期'],
    month: ["substr(l.biz_date,1,7)", '月份']
  };
  reg('labor_summary', '人员投入统计', '人员',
    '区间内参与的班组、工种、出勤人数与人工费，可按班组/工种/部位/日期汇总',
    [
      { key: 'date_from', label: '开始日期', type: 'date', required: true },
      { key: 'date_to', label: '截止日期', type: 'date', required: true },
      { key: 'wbs_id', label: '部位（含下级）', type: 'wbs' },
      { key: 'trades', label: '工种筛选', type: 'multi', source: 'trade' },
      { key: 'group_by', label: '汇总方式', type: 'select', default: 'team', options: [{ v: 'team', t: '按班组' }, { v: 'trade', t: '按工种' }, { v: 'wbs', t: '按部位' }, { v: 'date', t: '按日期' }, { v: 'month', t: '按月份' }] }
    ],
    function (p) {
      var gkey = p.group_by || 'team';
      var g = LAB_GMAP[gkey] || LAB_GMAP.team;
      var gexpr = g[0], glabel = g[1];
      var bf = C.buildFilter(p, { alias: 'l' });
      var trades = C.asList(p.trades);
      if (trades.length) {
        bf.sql += (bf.sql ? ' AND ' : ' WHERE ') + "l.trade IN (" + trades.map(function () { return '?'; }).join(',') + ")";
        trades.forEach(function (t) { bf.args.push(t); });
      }
      var rows = DB.query(
        "SELECT " + gexpr + " AS grp, SUM(l.person_count) AS man_days, SUM(l.work_hours) AS hours, SUM(l.amount) AS amount, " +
        "COUNT(DISTINCT l.biz_date) AS days, COUNT(DISTINCT l.team_name) AS team_cnt, MAX(l.trade) AS trade " +
        "FROM labor_rec l LEFT JOIN wbs w ON w.id=l.wbs_id " + bf.sql +
        " GROUP BY grp ORDER BY " + (['date', 'month'].indexOf(gkey) >= 0 ? 'grp' : 'man_days DESC'), bf.args);
      var totalMd = rows.reduce(function (s, r) { return s + C.r2(r.man_days); }, 0);
      var totalAmt = rows.reduce(function (s, r) { return s + C.r2(r.amount); }, 0);
      var out = rows.map(function (r) {
        var md = C.r2(r.man_days);
        return {
          grp: r.grp, trade: r.trade, man_days: md, days: r.days,
          avg_person: r.days ? C.r2(md / r.days) : 0, hours: C.r2(r.hours),
          amount: C.r2(r.amount), unit_cost: md ? C.r2(C.r2(r.amount) / md) : 0, share: C.pct(md, totalMd)
        };
      });
      var ow = C.buildFilter(p, { alias: 'o' });
      var orow = DB.queryOne("SELECT SUM(o.amount) a FROM output_rec o " + ow.sql, ow.args);
      var outAmt = C.r2((orow && orow.a) || 0);
      var teamCnt;
      if (gkey === 'team') teamCnt = out.length;
      else teamCnt = (DB.queryOne("SELECT COUNT(DISTINCT l.team_name) c FROM labor_rec l LEFT JOIN wbs w ON w.id=l.wbs_id " + bf.sql, bf.args) || {}).c || 0;
      var summary = [
        { label: '总用工', value: C.r2(totalMd), unit: '工日', tone: 'good' },
        { label: '人工费', value: C.r2(totalAmt / 10000), unit: '万元' },
        { label: '参与班组', value: teamCnt, unit: '个' },
        { label: '平均工日单价', value: totalMd ? C.r2(totalAmt / totalMd) : 0, unit: '元' }
      ];
      if (outAmt) {
        summary.push({ label: '人均日产值', value: totalMd ? C.r2(outAmt / totalMd) : 0, unit: '元/工日', tone: 'good' });
        summary.push({ label: '人工费占产值', value: C.pct(totalAmt, outAmt), unit: '%', tone: (C.pct(totalAmt, outAmt) || 0) > 35 ? 'bad' : 'good' });
      }
      var notes = [];
      if (outAmt && totalMd) {
        notes.push('区间产值 ' + C.r2(outAmt / 10000) + ' 万元，投入 ' + C.r2(totalMd) + ' 工日，人均日产值 ' + C.r2(outAmt / totalMd) + ' 元/工日。');
        var rate = C.pct(totalAmt, outAmt);
        if (rate && rate > 35) notes.push('人工费占产值 ' + rate + '%，高于常规区间（一般 20%-35%），建议核查用工效率或计价口径。');
      }
      if (!rows.length) notes.push('该区间没有人员投入记录。可通过「数据导入」把考勤/劳务台账导进来。');
      return C.result(
        [
          { key: 'grp', label: glabel, type: 'text', width: 180 },
          { key: 'trade', label: '工种', type: 'text', width: 100 },
          { key: 'man_days', label: '用工(工日)', type: 'num' },
          { key: 'days', label: '出勤天数', type: 'num' },
          { key: 'avg_person', label: '日均人数', type: 'num' },
          { key: 'hours', label: '工时', type: 'num' },
          { key: 'unit_cost', label: '工日单价', type: 'money' },
          { key: 'amount', label: '人工费', type: 'money' },
          { key: 'share', label: '用工占比', type: 'pct' }
        ], out, summary,
        [{ type: (['date', 'month'].indexOf(gkey) >= 0) ? 'line' : 'bar', title: '用工分布（' + glabel + '）', labels: out.slice(0, 20).map(function (r) { return String(r.grp); }), series: [{ name: '工日', data: out.slice(0, 20).map(function (r) { return r.man_days; }) }] }],
        notes);
    });

  reg('labor_participants', '参与人员/班组清单', '人员',
    '直接回答「这个时间段这个部位，哪些班组参与了、各干了多少天」',
    [
      { key: 'date_from', label: '开始日期', type: 'date', required: true },
      { key: 'date_to', label: '截止日期', type: 'date', required: true },
      { key: 'wbs_id', label: '部位（含下级）', type: 'wbs' }
    ],
    function (p) {
      var bf = C.buildFilter(p, { alias: 'l' });
      var rows = DB.query(
        "SELECT COALESCE(l.team_name,'未填写') AS team, COALESCE(l.trade,'-') AS trade, MIN(l.biz_date) AS first_day, " +
        "MAX(l.biz_date) AS last_day, COUNT(DISTINCT l.biz_date) AS days, SUM(l.person_count) AS man_days, SUM(l.amount) AS amount, " +
        "GROUP_CONCAT(DISTINCT COALESCE(w.full_path,l.wbs_name)) AS wbs_list " +
        "FROM labor_rec l LEFT JOIN wbs w ON w.id=l.wbs_id " + bf.sql + " GROUP BY team, trade ORDER BY man_days DESC", bf.args);
      var out = rows.map(function (r) {
        return { team: r.team, trade: r.trade, first_day: r.first_day, last_day: r.last_day, days: r.days, man_days: C.r2(r.man_days), amount: C.r2(r.amount), wbs_list: (r.wbs_list || '').slice(0, 120) };
      });
      return C.result(
        [
          { key: 'team', label: '班组', type: 'text', width: 160 },
          { key: 'trade', label: '工种', type: 'text', width: 100 },
          { key: 'first_day', label: '首次进场', type: 'date', width: 110 },
          { key: 'last_day', label: '最后作业', type: 'date', width: 110 },
          { key: 'days', label: '作业天数', type: 'num' },
          { key: 'man_days', label: '累计工日', type: 'num' },
          { key: 'amount', label: '人工费', type: 'money' },
          { key: 'wbs_list', label: '涉及部位', type: 'text', width: 240 }
        ], out,
        [
          { label: '参与班组', value: out.length, unit: '个', tone: 'good' },
          { label: '累计工日', value: C.r2(out.reduce(function (s, r) { return s + r.man_days; }, 0)), unit: '工日' }
        ]);
    });

  // ============ 进度 ============
  reg('schedule_node', '进度节点对比', '进度',
    '部位计划开工/完工日期 vs 实际，自动算滞后天数并标红。未完工的按今天推算当前滞后',
    [
      { key: 'wbs_id', label: '部位（含下级）', type: 'wbs' },
      { key: 'status', label: '状态筛选', type: 'select', default: 'all', options: [{ v: 'all', t: '全部' }, { v: 'delay', t: '仅滞后' }, { v: 'doing', t: '施工中' }, { v: 'done', t: '已完工' }, { v: 'notstart', t: '未开工' }] },
      { key: 'only_milestone', label: '仅关键节点', type: 'select', default: '0', options: [{ v: '0', t: '否' }, { v: '1', t: '是' }] }
    ],
    function (p) {
      var today = todayISO();
      var where = [], args = [];
      var wid = p.wbs_id;
      if (wid && String(wid) !== '0') {
        var ids = DB.wbsDescendants(wid);
        if (ids.length) { where.push('id IN (' + ids.map(function () { return '?'; }).join(',') + ')'); ids.forEach(function (i) { args.push(i); }); }
      }
      if (String(p.only_milestone || '0') === '1') where.push('is_milestone = 1');
      var wsql = where.length ? ' WHERE ' + where.join(' AND ') : '';
      var rows = DB.query(
        "SELECT id, code, name, full_path, level, plan_start, plan_end, actual_start, actual_end, plan_qty, qty_unit, plan_amount, is_milestone FROM wbs " + wsql + " ORDER BY level, sort_no, id", args);
      var out = [], delayCnt = 0, doneCnt = 0, doingCnt = 0, nsCnt = 0, maxDelay = 0;
      rows.forEach(function (r) {
        var ps = r.plan_start, pe = r.plan_end, as_ = r.actual_start, ae = r.actual_end;
        var status, delay = null;
        if (ae) { status = '已完工'; doneCnt++; delay = C.daysBetween(pe, ae); }
        else if (as_) { status = '施工中'; doingCnt++; delay = (pe && pe < today) ? C.daysBetween(pe, today) : null; }
        else { status = '未开工'; nsCnt++; delay = (ps && ps < today) ? C.daysBetween(ps, today) : null; }
        var startDelay = (ps && as_) ? C.daysBetween(ps, as_) : ((ps && !as_ && ps < today) ? C.daysBetween(ps, today) : null);
        if (delay && delay > 0) { delayCnt++; if (delay > maxDelay) maxDelay = delay; }
        var amt = DB.queryOne("SELECT SUM(amount) a FROM output_rec WHERE wbs_id=?", [r.id]) || {};
        var doneAmt = C.r2(amt.a);
        out.push({
          name: r.full_path || r.name, code: r.code, is_milestone: r.is_milestone ? '★' : '',
          plan_start: ps, actual_start: as_, start_delay: startDelay, plan_end: pe, actual_end: ae, delay: delay,
          status: status, plan_amount: C.r2(r.plan_amount), done_amount: doneAmt, amt_rate: C.pct(doneAmt, r.plan_amount),
          _tone: (delay || 0) > 7 ? 'bad' : ((delay || 0) > 0 ? 'warn' : (status === '已完工' ? 'good' : ''))
        });
      });
      var st = p.status || 'all';
      if (st === 'delay') out = out.filter(function (r) { return (r.delay || 0) > 0; });
      else if (st === 'doing') out = out.filter(function (r) { return r.status === '施工中'; });
      else if (st === 'done') out = out.filter(function (r) { return r.status === '已完工'; });
      else if (st === 'notstart') out = out.filter(function (r) { return r.status === '未开工'; });
      var notes = [];
      var dl = out.filter(function (r) { return (r.delay || 0) > 0; }).sort(function (a, b) { return (b.delay || 0) - (a.delay || 0); });
      if (dl.length) {
        notes.push('共 ' + dl.length + ' 个部位滞后，最严重的：' + dl.slice(0, 5).map(function (r) { return r.name + ' 滞后 ' + r.delay + ' 天'; }).join('、') + '。');
        notes.push('建议：对滞后超过 7 天的部位，在「措施管理」里建立措施记录并跟踪效果，这样后面做阶段总结时能自动带出「做了哪些措施、效果如何」。');
      } else notes.push('当前筛选范围内没有滞后节点。');
      if (!rows.length) notes.push('还没有维护部位的计划日期。到「基础数据 - 部位管理」里填写计划开工/完工日期后，这张表才有意义。');
      return C.result(
        [
          { key: 'is_milestone', label: '', type: 'text', width: 40 },
          { key: 'name', label: '部位', type: 'text', width: 220 },
          { key: 'status', label: '状态', type: 'text', width: 90 },
          { key: 'plan_start', label: '计划开工', type: 'date', width: 110 },
          { key: 'actual_start', label: '实际开工', type: 'date', width: 110 },
          { key: 'start_delay', label: '开工滞后(天)', type: 'num' },
          { key: 'plan_end', label: '计划完工', type: 'date', width: 110 },
          { key: 'actual_end', label: '实际完工', type: 'date', width: 110 },
          { key: 'delay', label: '滞后(天)', type: 'num' },
          { key: 'plan_amount', label: '计划产值', type: 'money' },
          { key: 'done_amount', label: '完成产值', type: 'money' },
          { key: 'amt_rate', label: '产值完成率', type: 'pct' }
        ], out,
        [
          { label: '节点总数', value: rows.length, unit: '个' },
          { label: '已完工', value: doneCnt, unit: '个', tone: 'good' },
          { label: '施工中', value: doingCnt, unit: '个' },
          { label: '未开工', value: nsCnt, unit: '个' },
          { label: '滞后节点', value: delayCnt, unit: '个', tone: delayCnt ? 'bad' : 'good' },
          { label: '最大滞后', value: maxDelay, unit: '天', tone: maxDelay > 7 ? 'bad' : (maxDelay ? 'warn' : 'good') }
        ],
        dl.length ? [{ type: 'bar', title: '滞后天数排名（前15）', labels: dl.slice(0, 15).map(function (r) { return r.name; }), series: [{ name: '滞后天数', data: dl.slice(0, 15).map(function (r) { return r.delay; }) }] }] : [],
        notes);
    });

  reg('schedule_qty', '形象进度偏差', '进度',
    '量化形象进度：计划量 vs 实际量、累计完成率，识别欠量部位',
    [
      { key: 'date_from', label: '开始日期', type: 'date', required: true },
      { key: 'date_to', label: '截止日期', type: 'date', required: true },
      { key: 'wbs_id', label: '部位（含下级）', type: 'wbs' },
      { key: 'group_by', label: '汇总方式', type: 'select', default: 'item', options: [{ v: 'item', t: '按形象进度项' }, { v: 'wbs', t: '按部位' }, { v: 'month', t: '按月份' }, { v: 'date', t: '按日期' }] }
    ],
    function (p) {
      var gmap = {
        item: ["COALESCE(g.item_name,'未填写')", '形象进度项'],
        wbs: ["COALESCE(w.full_path,g.wbs_name,'未分配')", '部位'],
        month: ["substr(g.biz_date,1,7)", '月份'],
        date: ["g.biz_date", '日期']
      };
      var gkey = p.group_by || 'item';
      var g = gmap[gkey] || gmap.item;
      var gexpr = g[0], glabel = g[1];
      var bf = C.buildFilter(p, { alias: 'g' });
      var rows = DB.query(
        "SELECT " + gexpr + " AS grp, MAX(g.unit) unit, SUM(g.plan_qty) plan_qty, SUM(g.actual_qty) actual_qty, " +
        "MAX(g.cum_plan_qty) cum_plan, MAX(g.cum_actual_qty) cum_actual FROM progress_rec g LEFT JOIN wbs w ON w.id=g.wbs_id " +
        bf.sql + " GROUP BY grp ORDER BY " + (['date', 'month'].indexOf(gkey) >= 0 ? 'grp' : 'plan_qty DESC'), bf.args);
      var out = [], lag = [];
      rows.forEach(function (r) {
        var pq = C.r2(r.plan_qty, 3), aq = C.r2(r.actual_qty, 3);
        var rate = C.pct(aq, pq);
        if (rate !== null && rate < 90) lag.push([r.grp, rate]);
        out.push({
          grp: r.grp, unit: r.unit, plan_qty: pq, actual_qty: aq, diff: C.r2(aq - pq, 3), rate: rate,
          cum_plan: C.r2(r.cum_plan, 3), cum_actual: C.r2(r.cum_actual, 3), cum_rate: C.pct(r.cum_actual, r.cum_plan),
          _tone: (rate || 100) < 80 ? 'bad' : ((rate || 100) < 100 ? 'warn' : 'good')
        });
      });
      var tp = out.reduce(function (s, r) { return s + r.plan_qty; }, 0);
      var ta = out.reduce(function (s, r) { return s + r.actual_qty; }, 0);
      var notes = [];
      if (lag.length) { lag.sort(function (a, b) { return a[1] - b[1]; }); notes.push('完成率低于 90% 的项：' + lag.slice(0, 5).map(function (x) { return x[0] + '（' + x[1] + '%）'; }).join('、') + '。'); }
      if (!rows.length) notes.push('没有形象进度数据。可在「数据导入」里把月度形象进度表导进来，目标表选「形象进度」。');
      return C.result(
        [
          { key: 'grp', label: glabel, type: 'text', width: 200 },
          { key: 'unit', label: '单位', type: 'text', width: 70 },
          { key: 'plan_qty', label: '计划量', type: 'num' },
          { key: 'actual_qty', label: '完成量', type: 'num' },
          { key: 'diff', label: '偏差', type: 'num' },
          { key: 'rate', label: '完成率', type: 'pct' },
          { key: 'cum_plan', label: '累计计划', type: 'num' },
          { key: 'cum_actual', label: '累计完成', type: 'num' },
          { key: 'cum_rate', label: '累计完成率', type: 'pct' }
        ], out,
        [
          { label: '计划量合计', value: C.r2(tp, 2) },
          { label: '完成量合计', value: C.r2(ta, 2) },
          { label: '总完成率', value: C.pct(ta, tp), unit: '%', tone: (C.pct(ta, tp) || 0) >= 100 ? 'good' : 'bad' },
          { label: '欠量项', value: lag.length, unit: '项', tone: lag.length ? 'bad' : 'good' }
        ],
        [{ type: 'bar', title: '计划 vs 完成（' + glabel + '）', labels: out.slice(0, 15).map(function (r) { return String(r.grp); }), series: [{ name: '计划量', data: out.slice(0, 15).map(function (r) { return r.plan_qty; }) }, { name: '完成量', data: out.slice(0, 15).map(function (r) { return r.actual_qty; }) }] }],
        notes);
    });

  // ============ 措施 ============
  reg('measure_track', '措施与效果追踪', '措施',
    '列出区间内针对偏差采取的措施、执行状态、评估效果与折算效益',
    [
      { key: 'date_from', label: '开始日期', type: 'date', required: true },
      { key: 'date_to', label: '截止日期', type: 'date', required: true },
      { key: 'wbs_id', label: '部位（含下级）', type: 'wbs' },
      { key: 'categories', label: '措施类型', type: 'multi', source: 'measure_cat' },
      { key: 'status', label: '状态', type: 'select', default: '', options: [{ v: '', t: '全部' }, { v: '计划中', t: '计划中' }, { v: '执行中', t: '执行中' }, { v: '已完成', t: '已完成' }, { v: '已关闭', t: '已关闭' }] }
    ],
    function (p) {
      var bf = C.buildFilter(p, { alias: 'm' });
      var cats = C.asList(p.categories);
      if (cats.length) { bf.sql += (bf.sql ? ' AND ' : ' WHERE ') + "m.category IN (" + cats.map(function () { return '?'; }).join(',') + ")"; cats.forEach(function (c) { bf.args.push(c); }); }
      if (p.status) { bf.sql += (bf.sql ? ' AND ' : ' WHERE ') + "m.status = ?"; bf.args.push(p.status); }
      var rows = DB.query(
        "SELECT m.id, m.biz_date, m.category, m.issue, m.content, m.owner, m.status, m.plan_finish, m.actual_finish, m.invest_amt, " +
        "COALESCE(w.full_path, m.wbs_name, '-') AS wbs, " +
        "(SELECT COUNT(*) FROM measure_effect e WHERE e.measure_id=m.id) AS eff_cnt, " +
        "(SELECT SUM(e.benefit_amt) FROM measure_effect e WHERE e.measure_id=m.id) AS benefit, " +
        "(SELECT AVG(e.score) FROM measure_effect e WHERE e.measure_id=m.id) AS avg_score, " +
        "(SELECT GROUP_CONCAT(e.direction) FROM measure_effect e WHERE e.measure_id=m.id) AS dirs, " +
        "(SELECT GROUP_CONCAT(e.conclusion, ' / ') FROM measure_effect e WHERE e.measure_id=m.id) AS conclusions " +
        "FROM measure m LEFT JOIN wbs w ON w.id=m.wbs_id " + bf.sql + " ORDER BY m.biz_date DESC, m.id DESC", bf.args);
      var out = [], pos = 0, neg = 0, noEval = 0, totalBenefit = 0, totalInvest = 0;
      rows.forEach(function (r) {
        var dirs = (r.dirs || '');
        var direction;
        if (r.eff_cnt === 0) { direction = '未评估'; noEval++; }
        else if (dirs.indexOf('负向') >= 0) { direction = dirs.indexOf('正向') >= 0 ? '正负并存' : '负向'; neg++; }
        else if (dirs.indexOf('正向') >= 0) { direction = '正向'; pos++; }
        else direction = '无明显影响';
        var benefit = C.r2(r.benefit), invest = C.r2(r.invest_amt);
        totalBenefit += benefit; totalInvest += invest;
        out.push({
          id: r.id, biz_date: r.biz_date, wbs: r.wbs, category: r.category, issue: r.issue, content: r.content, owner: r.owner, status: r.status,
          plan_finish: r.plan_finish, actual_finish: r.actual_finish,
          overdue: (r.plan_finish && r.actual_finish) ? C.daysBetween(r.plan_finish, r.actual_finish) : null,
          invest_amt: invest, eff_cnt: r.eff_cnt, direction: direction, benefit: benefit, net: C.r2(benefit - invest),
          avg_score: C.r2(r.avg_score, 1), conclusions: r.conclusions,
          _tone: direction === '正向' ? 'good' : (direction.indexOf('负向') >= 0 ? 'bad' : (direction === '未评估' ? 'warn' : ''))
        });
      });
      var notes = [];
      if (noEval) notes.push(noEval + ' 条措施还没做效果评估。措施只记不评，等于没闭环——点措施行末的「评估」按钮补上，阶段总结才能自动带出效果结论。');
      if (totalInvest || totalBenefit) {
        var net = totalBenefit - totalInvest;
        notes.push('措施投入 ' + C.r2(totalInvest / 10000) + ' 万元，折算效益 ' + C.r2(totalBenefit / 10000) + ' 万元，净' + (net >= 0 ? '创效' : '损失') + ' ' + C.r2(Math.abs(net) / 10000) + ' 万元。');
      }
      if (!rows.length) notes.push('该区间没有措施记录。在「措施管理」里新增，把现场为纠偏做的动作记下来。');
      return C.result(
        [
          { key: 'biz_date', label: '日期', type: 'date', width: 105 },
          { key: 'wbs', label: '部位', type: 'text', width: 150 },
          { key: 'category', label: '类型', type: 'text', width: 80 },
          { key: 'issue', label: '问题/偏差', type: 'text', width: 200 },
          { key: 'content', label: '采取措施', type: 'text', width: 240 },
          { key: 'owner', label: '责任人', type: 'text', width: 90 },
          { key: 'status', label: '状态', type: 'text', width: 80 },
          { key: 'direction', label: '效果方向', type: 'text', width: 90 },
          { key: 'avg_score', label: '评分', type: 'num' },
          { key: 'invest_amt', label: '投入(元)', type: 'money' },
          { key: 'benefit', label: '效益(元)', type: 'money' },
          { key: 'net', label: '净效益(元)', type: 'money' },
          { key: 'conclusions', label: '效果结论', type: 'text', width: 240 }
        ], out,
        [
          { label: '措施条数', value: out.length, unit: '条' },
          { label: '正向', value: pos, unit: '条', tone: 'good' },
          { label: '负向', value: neg, unit: '条', tone: neg ? 'bad' : '' },
          { label: '未评估', value: noEval, unit: '条', tone: noEval ? 'warn' : '' },
          { label: '措施投入', value: C.r2(totalInvest / 10000), unit: '万元' },
          { label: '折算效益', value: C.r2(totalBenefit / 10000), unit: '万元', tone: totalBenefit >= totalInvest ? 'good' : 'bad' }
        ],
        [{ type: 'pie', title: '措施效果分布', labels: ['正向', '负向/并存', '无明显影响', '未评估'], series: [{ name: '条数', data: [pos, neg, out.length - pos - neg - noEval, noEval] }] }],
        notes);
    });

  // ============ 盈亏 ============
  reg('profit_analysis', '盈亏分析', '盈亏',
    '区间产值与成本对比，算毛利与毛利率，判断对项目是正向还是负向',
    [
      { key: 'date_from', label: '开始日期', type: 'date', required: true },
      { key: 'date_to', label: '截止日期', type: 'date', required: true },
      { key: 'wbs_id', label: '部位（含下级）', type: 'wbs' },
      { key: 'group_by', label: '汇总方式', type: 'select', default: 'wbs', options: [{ v: 'wbs', t: '按部位' }, { v: 'month', t: '按月份' }, { v: 'total', t: '仅总计' }] }
    ],
    function (p) {
      var gkey = p.group_by || 'wbs';
      var ow = C.buildFilter(p, { alias: 'o' }), cw = C.buildFilter(p, { alias: 'c' }),
        mw = C.buildFilter(p, { alias: 'm' }), lw = C.buildFilter(p, { alias: 'l' });
      function total(sql, args) { var r = DB.queryOne(sql, args) || {}; return C.r2(r.v); }
      var income = total("SELECT SUM(o.amount) v FROM output_rec o " + ow.sql, ow.args);
      var costRec = total("SELECT SUM(c.amount) v FROM cost_rec c " + cw.sql, cw.args);
      var matCost = total("SELECT SUM(m.amount) v FROM material_rec m " + mw.sql, mw.args);
      var labCost = total("SELECT SUM(l.amount) v FROM labor_rec l " + lw.sql, lw.args);
      var dup = DB.query("SELECT cost_type, SUM(amount) v FROM cost_rec c " + cw.sql + " GROUP BY cost_type", cw.args);
      var dupMap = {}; dup.forEach(function (r) { dupMap[r.cost_type] = C.r2(r.v); });
      var matInCost = dupMap['材料费'] || 0, labInCost = dupMap['人工费'] || 0;
      var effMat = Math.max(matCost, matInCost), effLab = Math.max(labCost, labInCost);
      var otherCost = costRec - matInCost - labInCost;
      var totalCost = effMat + effLab + otherCost;
      var profit = income - totalCost;
      var margin = C.pct(profit, income);
      var rows = [];
      function unionSql(alias) {
        return "SELECT wbs_id, wbs_name, amount income, 0 mat, 0 lab, 0 oth, biz_date, project_id FROM output_rec " +
          "UNION ALL SELECT wbs_id, wbs_name, 0, amount, 0, 0, biz_date, project_id FROM material_rec " +
          "UNION ALL SELECT wbs_id, wbs_name, 0, 0, amount, 0, biz_date, project_id FROM labor_rec " +
          "UNION ALL SELECT wbs_id, wbs_name, 0, 0, 0, amount, biz_date, project_id FROM cost_rec WHERE cost_type NOT IN ('人工费','材料费')";
      }
      if (gkey === 'wbs' || gkey === 'month') {
        var grpExpr = (gkey === 'wbs') ? "COALESCE(w.full_path, x.wbs_name, '未分配部位')" : "substr(x.biz_date,1,7)";
        rows = DB.query(
          "SELECT " + grpExpr + " AS grp, SUM(x.income) income, SUM(x.mat) mat, SUM(x.lab) lab, SUM(x.oth) oth FROM (" + unionSql() + ") x " +
          "LEFT JOIN wbs w ON w.id=x.wbs_id " + C.reAlias(ow.sql, 'o', 'x') + " GROUP BY grp ORDER BY " + (gkey === 'month' ? 'grp' : 'income DESC'), ow.args);
      }
      var out = rows.map(function (r) {
        var inc = C.r2(r.income), cst = C.r2(r.mat) + C.r2(r.lab) + C.r2(r.oth), pf = inc - cst;
        return { grp: r.grp, income: inc, mat: C.r2(r.mat), lab: C.r2(r.lab), oth: C.r2(r.oth), cost: cst, profit: pf, margin: C.pct(pf, inc), judge: pf > 0 ? '正向' : (pf < 0 ? '负向' : '持平'), _tone: pf > 0 ? 'good' : (pf < 0 ? 'bad' : '') };
      });
      var judge = profit > 0 ? '正向' : (profit < 0 ? '负向' : '持平');
      var notes = [];
      if (income === 0) notes.push('区间内没有产值数据，无法做盈亏判断。先把产值台账导进来。');
      else {
        notes.push('区间产值 ' + C.r2(income / 10000) + ' 万元，归集成本 ' + C.r2(totalCost / 10000) + ' 万元，毛利 ' + C.r2(profit / 10000) + ' 万元，毛利率 ' + margin + '%，对项目' + judge + '影响。');
        if (margin !== null) {
          if (margin < 0) notes.push('毛利为负。优先核查：① 材料超耗（看材料消耗分析）；② 用工效率（看人员投入统计的人均日产值）；③ 是否有产值未及时计量确认。');
          else if (margin < 5) notes.push('毛利率低于 5%，安全垫很薄。建议按部位下钻，定位亏损部位后针对性上措施。');
        }
        var mr = C.pct(effMat, income), lr = C.pct(effLab, income);
        if (mr && mr > 60) notes.push('材料费占产值 ' + mr + '%，偏高，重点查超耗与采购价。');
        if (lr && lr > 35) notes.push('人工费占产值 ' + lr + '%，偏高，重点查窝工与作业效率。');
        var loss = out.filter(function (r) { return r.profit < 0; });
        if (loss.length) { loss.sort(function (a, b) { return a.profit - b.profit; }); notes.push('亏损项：' + loss.slice(0, 5).map(function (r) { return r.grp + '（' + C.r2(r.profit / 10000) + '万元）'; }).join('、') + '。'); }
      }
      return C.result(
        [
          { key: 'grp', label: gkey === 'wbs' ? '部位' : '月份', type: 'text', width: 200 },
          { key: 'income', label: '产值(元)', type: 'money' },
          { key: 'mat', label: '材料费', type: 'money' },
          { key: 'lab', label: '人工费', type: 'money' },
          { key: 'oth', label: '其他成本', type: 'money' },
          { key: 'cost', label: '成本合计', type: 'money' },
          { key: 'profit', label: '毛利(元)', type: 'money' },
          { key: 'margin', label: '毛利率', type: 'pct' },
          { key: 'judge', label: '判断', type: 'text', width: 80 }
        ], out,
        [
          { label: '完成产值', value: C.r2(income / 10000), unit: '万元', tone: 'good' },
          { label: '材料费', value: C.r2(effMat / 10000), unit: '万元' },
          { label: '人工费', value: C.r2(effLab / 10000), unit: '万元' },
          { label: '其他成本', value: C.r2(otherCost / 10000), unit: '万元' },
          { label: '成本合计', value: C.r2(totalCost / 10000), unit: '万元' },
          { label: '毛利', value: C.r2(profit / 10000), unit: '万元', tone: profit > 0 ? 'good' : 'bad' },
          { label: '毛利率', value: margin, unit: '%', tone: (margin || 0) > 5 ? 'good' : 'bad' },
          { label: '综合判断', value: judge, unit: '', tone: judge === '正向' ? 'good' : 'bad' }
        ],
        [
          { type: 'pie', title: '成本构成', labels: ['材料费', '人工费', '其他成本'], series: [{ name: '万元', data: [C.r2(effMat / 10000), C.r2(effLab / 10000), C.r2(otherCost / 10000)] }] },
          { type: 'bar', title: '产值 vs 成本', labels: out.slice(0, 15).map(function (r) { return String(r.grp); }), series: [{ name: '产值(元)', data: out.slice(0, 15).map(function (r) { return r.income; }) }, { name: '成本(元)', data: out.slice(0, 15).map(function (r) { return r.cost; }) }] }
        ],
        notes);
    });

  function _toneRate(v) {
    if (v === null || v === undefined) return '';
    if (v >= 100) return 'good';
    if (v >= 90) return 'warn';
    return 'bad';
  }

  var api = {
    list: function () { return REPORTS; },
    run: function (key, p) { if (!FN[key]) throw new Error('未知报表: ' + key); return FN[key](p || {}); },
    FN: FN, REPORTS: REPORTS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.Reports = api;
})();
