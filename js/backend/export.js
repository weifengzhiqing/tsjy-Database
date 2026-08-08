/* 浏览器端导出：报表/总结/表/模板 → xlsx（SheetJS 生成 base64）。对齐 app/api_export.py。 */
(function () {
  'use strict';
  var isBrowser = (typeof window !== 'undefined');
  var Reports = isBrowser ? window.Reports : require('./reports.js');
  var Imp = isBrowser ? window.BackendImport : require('./import.js');
  var Crud = isBrowser ? window.BackendCrud : require('./crud.js');

  function XLSX() { return isBrowser ? window.XLSX : require('../../vendor/xlsx.full.min.js'); }

  function nowStr() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' + n : '' + n); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function ts() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' + n : '' + n); }
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }
  function sanitize(s) { return String(s).replace(/[/\\:*?\[\]]/g, '').slice(0, 31); }
  function safeFn(s) { return String(s).replace(/[\\/:*?"<>|]/g, ''); }

  // sheet 定义：{name, aoa:二维数组, cols:[宽度], headerRow:1-based(0=无), freeze:1-based, reqSet:[需标红的表头文本]}
  function buildAndWrite(sheets, filename) {
    var X = XLSX();
    var wb = X.utils.book_new();
    sheets.forEach(function (sh) {
      var ws = X.utils.aoa_to_sheet(sh.aoa);
      ws['!cols'] = (sh.cols || []).map(function (w) { return { wch: w }; });
      if (sh.freeze) ws['!freeze'] = { xSplit: 0, ySplit: sh.freeze };
      if (sh.headerRow) {
        var hdr = sh.aoa[sh.headerRow - 1] || [];
        for (var c = 0; c < hdr.length; c++) {
          var addr = X.utils.encode_cell({ r: sh.headerRow - 1, c: c });
          if (!ws[addr]) ws[addr] = { t: 's', v: hdr[c] };
          var isReq = sh.reqSet && sh.reqSet.indexOf(hdr[c]) >= 0;
          ws[addr].s = {
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            fill: { patternType: 'solid', fgColor: { rgb: isReq ? 'B85450' : '7A6A4F' } },
            alignment: { horizontal: 'center', vertical: 'center', wrap_text: true }
          };
        }
      }
      X.utils.book_append_sheet(wb, ws, sanitize(sh.name).slice(0, 31) || 'Sheet');
    });
    var b64 = X.write(wb, { type: 'base64', bookType: 'xlsx' });
    return { filename: filename, b64: b64 };
  }

  function exportReport(p) {
    var key = p.report_key;
    if (!key) throw new Error('缺少 report_key');
    var data = Reports.run(key, p);
    var title = p.title || key;
    var aoa = [];
    var headerRow = 0;
    aoa.push([title]);
    aoa.push(['统计区间：' + (p.date_from || '-') + ' 至 ' + (p.date_to || '-') + '    导出时间：' + nowStr()]);
    aoa.push([]);
    if (data.summary && data.summary.length) {
      aoa.push(['核心指标']);
      aoa.push(data.summary.map(function (s) { return s.label; }));
      aoa.push(data.summary.map(function (s) { return (s.value === null || s.value === undefined ? '-' : s.value) + (s.unit || ''); }));
      aoa.push([]);
    }
    var cols = data.columns || [];
    if (cols.length) {
      headerRow = aoa.length + 1;
      aoa.push(cols.map(function (c) { return c.label; }));
      (data.rows || []).forEach(function (row) {
        aoa.push(cols.map(function (c) { var v = row[c.key]; return (v === null || v === undefined) ? '' : v; }));
      });
      aoa.push([]);
    }
    if (data.notes && data.notes.length) {
      aoa.push(['分析与建议']);
      data.notes.forEach(function (n) { aoa.push(['· ' + String(n).replace(/\*\*/g, '')]); });
    }
    var widths = cols.map(function (c) { return Math.max(10, Math.min(40, (c.width || 100) / 7)); });
    if (!widths.length) widths = [24];
    return buildAndWrite([{ name: '报表', aoa: aoa, cols: widths, headerRow: headerRow, freeze: headerRow }],
      safeFn(title) + '_' + ts() + '.xlsx');
  }

  function exportSummary(p) {
    var data = Reports.run('stage_summary', p);
    var d = data.stage_data;
    var narrative = data.narrative || '';
    var sheet1 = [], hr1 = 0;
    sheet1.push([p.title || ('阶段总结（' + (p.date_from || '') + ' 至 ' + (p.date_to || '') + '）')]);
    sheet1.push([]);
    narrative.split('\n\n').forEach(function (para) {
      var lines = para.split('\n');
      hr1 = sheet1.length + 1;
      sheet1.push([lines[0]]);
      lines.slice(1).forEach(function (ln) { sheet1.push([ln]); });
      sheet1.push([]);
    });
    var sheet2 = [['维度', '指标', '数值', '单位', '说明']];
    (data.rows || []).forEach(function (r) { sheet2.push([r.dim, r.item, r.val, r.unit || '', r.note || '']); });
    var sheet3 = [['日期', '类型', '问题/偏差', '措施内容', '状态', '效果方向', '投入(元)', '效益(元)', '结论']];
    (d.measures || []).forEach(function (m) {
      sheet3.push([m.date, m.category, m.issue, m.content, m.status, m.direction, m.invest, m.benefit, m.conclusion]);
    });
    return buildAndWrite([
      { name: '总结正文', aoa: sheet1, cols: [110], headerRow: hr1, freeze: 0 },
      { name: '指标明细', aoa: sheet2, cols: [12, 26, 14, 10, 50], headerRow: 1 },
      { name: '措施台账', aoa: sheet3, cols: [12, 10, 34, 40, 10, 12, 12, 12, 34], headerRow: 1 }
    ], '阶段总结_' + (p.date_from || '') + '_' + (p.date_to || '') + '.xlsx');
  }

  function exportTable(p) {
    var data = Crud.routes['/crud/list']({ table: p.table, limit: 100000, date_from: p.date_from, date_to: p.date_to });
    var cols = data.columns;
    var aoa = [cols];
    data.rows.forEach(function (row) { aoa.push(cols.map(function (c) { var v = row[c]; return (v === null || v === undefined) ? '' : v; })); });
    return buildAndWrite([{ name: p.table || 'data', aoa: aoa, cols: cols.map(function () { return 16; }), headerRow: 1, freeze: 1 }],
      safeFn(p.table || 'data') + '_' + ts() + '.xlsx');
  }

  // 标准导入模板（含示例行 + 填写说明）
  var TEMPLATE_STYLE = {
    'wbs': {
      headers: ['工程类别', '单位工程', '工作面', '施工部位（必填）', '单位', '设计数量', '计划开工', '计划完工', '计划产值', '预算成本', '统计截止日期', '开累完成数量', '剩余数量', '备注'],
      req: { '施工部位（必填）': true },
      widths: { 1: 12, 2: 22, 3: 22, 4: 18, 5: 8, 6: 12, 7: 12, 8: 12, 9: 12, 10: 12, 11: 13, 12: 13, 13: 11, 14: 18 },
      examples: [
        ['隧道工程', '五磊山隧道(6829.04m)', '五磊山隧道进口(2034.04m)', '开挖及支护', 'm', 1992, '2026-03-01', '2026-12-31', '', '', '2026-08-04', 1831, 161, ''],
        ['隧道工程', '五磊山隧道(6829.04m)', '五磊山隧道进口(2034.04m)', '仰拱', 'm', 1992, '2026-03-15', '2026-11-30', '', '', '2026-08-04', 1637, 355, ''],
        ['隧道工程', '五磊山隧道(6829.04m)', '五磊山隧道横通道小里程（1110m）', '开挖及支护', 'm', 1110, '2026-03-01', '2026-10-31', '', '', '2026-08-04', 1021, 89, '']
      ],
      tips: {
        '工程类别': '工程大类（如隧道工程）。与「单位工程」「工作面」一起构成该部位的层级路径，导入时自动挂到对应上级。',
        '单位工程': '如「五磊山隧道(6829.04m)」。名称里带 (长度) 这类后缀会自动按核心名匹配已存在节点。',
        '工作面': '该部位的直属上级，如「五磊山隧道进口(2034.04m)」「斜井」。',
        '施工部位（必填）': '最末级部位，如「开挖及支护」「仰拱」「二衬」。必填，是导入后树的最底层节点。',
        '单位': '工程量计量单位，如 m、m³、t。',
        '设计数量': '该部位的设计/计划工程量，导入后写入「计划工程量」，并作为形象进度的累计计划量。',
        '计划开工': '计划开工日期，格式 2026-03-01。',
        '计划完工': '计划完工日期，格式 2026-12-31。',
        '计划产值': '该部位计划产值，选填。',
        '预算成本': '该部位预算成本，选填。',
        '统计截止日期': '本次完成数据的截止日期（即把「开累完成数量」记为该日快照）。留空则默认取今天。',
        '开累完成数量': '截至统计截止日期的累计完成工程量。填了就会自动写入「形象进度」表。',
        '剩余数量': '剩余工程量，仅作形象进度的备注说明，选填。',
        '备注': '其它说明，选填。'
      }
    }
  };

  function exportTemplate(p) {
    var target = p.target;
    var TARGETS = Imp.TARGETS;
    if (!TARGETS[target]) throw new Error('未知目标表');
    var t = TARGETS[target];
    var style = TEMPLATE_STYLE[target];
    var headers, widths, examples = [], tips = {}, reqSet = [];
    if (style) {
      headers = style.headers; widths = style.widths; examples = style.examples; tips = style.tips;
      reqSet = Object.keys(style.req || {});
    } else {
      headers = t.fields.map(function (f) { return f[1] + (f[2] ? '（必填）' : ''); });
      widths = {}; reqSet = t.fields.filter(function (f) { return f[2]; }).map(function (f) { return f[1] + '（必填）'; });
      tips = {
        'biz_date': '日期，支持 2026-08-01 / 2026/8/1 / 20260801 等格式',
        'wbs_name': '部位名称，系统会自动匹配「基础数据-部位」里的记录；匹配不上也会保留原文',
        'amount': '不填的话，系统会用「数量×单价」自动算',
        'theory_qty': '理论/定额用量，填了才能做超耗分析',
        'category': '材料类型，用于查询时按类型筛选'
      };
    }
    var aoa = [headers];
    if (style) examples.forEach(function (row) { aoa.push(row.slice()); });
    else aoa.push(['2026-08-01']);
    var sheet2 = [['字段', '说明']];
    headers.forEach(function (h) { sheet2.push([h, tips[h] || '选填']); });
    var colArr = headers.map(function (h, i) { return widths[i] || 16; });
    return buildAndWrite([
      { name: t.label, aoa: aoa, cols: colArr, headerRow: 1, freeze: 1, reqSet: reqSet },
      { name: '填写说明', aoa: sheet2, cols: [24, 78], headerRow: 1 }
    ], '导入模板_' + t.label + '.xlsx');
  }

  var routes = {};
  routes['/export/report'] = exportReport;
  routes['/export/summary'] = exportSummary;
  routes['/export/table'] = exportTable;
  routes['/export/template'] = exportTemplate;

  var api = { routes: routes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (isBrowser) window.BackendExport = api;
})();
