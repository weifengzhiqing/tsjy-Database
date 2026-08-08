/* 浏览器端通用 Excel 导入：列映射 + 入库（带批次可回滚）。
   用 SheetJS 替换 openpyxl；日期/数字归一、关联匹配、金额补算与 Python 版一致。 */
(function () {
  'use strict';
  var isBrowser = (typeof window !== 'undefined');
  var DB = isBrowser ? window.DB : require('./db.js');
  var FU = isBrowser ? window.FileUtil : require('./fileutil.js');

  var TARGETS = {
    'output_rec': { label: '产值记录', fields: [
      ['biz_date', '日期', true], ['wbs_name', '部位名称', false], ['item_name', '清单/工序', false],
      ['unit', '单位', false], ['qty', '工程量', false], ['price', '单价', false],
      ['amount', '产值金额', false], ['plan_amount', '计划产值', false], ['remark', '备注', false]] },
    'material_rec': { label: '材料消耗', fields: [
      ['biz_date', '日期', true], ['wbs_name', '部位名称', false], ['material_name', '材料名称', true],
      ['category', '材料类型', false], ['spec', '规格型号', false], ['unit', '单位', false],
      ['qty', '实际消耗量', false], ['price', '单价', false], ['amount', '金额', false],
      ['theory_qty', '理论/定额用量', false], ['remark', '备注', false]] },
    'labor_rec': { label: '人员投入', fields: [
      ['biz_date', '日期', true], ['wbs_name', '部位名称', false], ['team_name', '班组名称', true],
      ['trade', '工种', false], ['person_count', '出勤人数', false], ['work_hours', '工时', false],
      ['unit_cost', '工日单价', false], ['amount', '人工费', false], ['remark', '备注', false]] },
    'cost_rec': { label: '成本记录', fields: [
      ['biz_date', '日期', true], ['wbs_name', '部位名称', false], ['cost_type', '成本类型', false],
      ['subject', '明细科目', false], ['amount', '发生金额', true], ['budget_amt', '预算金额', false],
      ['remark', '备注', false]] },
    'progress_rec': { label: '形象进度', fields: [
      ['biz_date', '日期', true], ['wbs_name', '部位名称', false], ['item_name', '形象进度项', true],
      ['unit', '单位', false], ['plan_qty', '计划量', false], ['actual_qty', '完成量', false],
      ['cum_plan_qty', '累计计划量', false], ['cum_actual_qty', '累计完成量', false], ['remark', '备注', false]] },
    'measure': { label: '措施记录', fields: [
      ['biz_date', '日期', true], ['wbs_name', '部位名称', false], ['category', '措施类型', false],
      ['issue', '问题/偏差', false], ['content', '措施内容', true], ['owner', '责任人', false],
      ['status', '状态', false], ['plan_finish', '计划完成日期', false], ['actual_finish', '实际完成日期', false],
      ['invest_amt', '投入费用', false], ['remark', '备注', false]] },
    'wbs': { label: '部位/计划节点', fields: [
      ['cat', '工程类别', false], ['unit_proj', '单位工程', false], ['parent_name', '工作面', false],
      ['name', '施工部位', true], ['qty_unit', '单位', false], ['plan_qty', '设计数量', false],
      ['plan_start', '计划开工', false], ['plan_end', '计划完工', false], ['actual_start', '实际开工', false],
      ['actual_end', '实际完工', false], ['plan_amount', '计划产值', false], ['budget_cost', '预算成本', false],
      ['stat_date', '统计截止日期', false], ['cum_actual_qty', '开累完成数量', false],
      ['remain_qty', '剩余数量', false], ['remark', '备注', false]] },
    'material': { label: '材料字典', fields: [
      ['code', '编码', false], ['name', '材料名称', true], ['category', '材料类型', false],
      ['spec', '规格型号', false], ['unit', '单位', false], ['std_price', '标准单价', false],
      ['loss_rate', '允许损耗率%', false], ['remark', '备注', false]] },
    'team': { label: '班组字典', fields: [
      ['code', '编码', false], ['name', '班组名称', true], ['type', '类型', false], ['trade', '工种', false],
      ['leader', '负责人', false], ['contact', '联系方式', false], ['day_wage', '工日单价', false],
      ['remark', '备注', false]] }
  };

  var NUM_FIELDS = { qty: 1, price: 1, amount: 1, plan_amount: 1, theory_qty: 1, person_count: 1, work_hours: 1, unit_cost: 1, budget_amt: 1, plan_qty: 1, actual_qty: 1, cum_plan_qty: 1, cum_actual_qty: 1, invest_amt: 1, std_price: 1, loss_rate: 1, day_wage: 1, budget_cost: 1 };
  var DATE_FIELDS = { biz_date: 1, plan_finish: 1, actual_finish: 1, plan_start: 1, plan_end: 1, actual_start: 1, actual_end: 1, stat_date: 1 };

  var SYNONYM = {
    'biz_date': ['日期', '时间', '统计日期', '填报日期', '发生日期', '施工日期', '月份', '年月'],
    'wbs_name': ['部位', '工点', '分部', '分项', '工程部位', '施工部位', '单位工程', '区段', '标段'],
    'item_name': ['清单', '工序', '项目', '名称', '工程名称', '子目', '形象', '内容'],
    'unit': ['单位', '计量单位'],
    'qty': ['数量', '工程量', '完成量', '实际用量', '消耗量', '实耗', '本期完成'],
    'price': ['单价', '综合单价', '不含税单价'],
    'amount': ['金额', '产值', '合价', '费用', '成本', '完成产值', '本期产值'],
    'plan_amount': ['计划产值', '计划金额', '计划'],
    'theory_qty': ['理论', '定额', '应耗', '预算量', '计划用量'],
    'material_name': ['材料', '物资', '材料名称', '品名', '物料'],
    'category': ['类型', '类别', '分类', '材料类型', '大类'],
    'spec': ['规格', '型号', '规格型号'],
    'team_name': ['班组', '队伍', '劳务', '施工队', '作业队', '单位'],
    'trade': ['工种', '专业', '岗位'],
    'person_count': ['人数', '出勤', '出勤人数', '人员', '用工'],
    'work_hours': ['工时', '小时', '台班'],
    'unit_cost': ['工日单价', '日工资', '单价'],
    'cost_type': ['成本类型', '费用类型', '科目类别'],
    'subject': ['科目', '明细', '费用名称'],
    'plan_qty': ['计划量', '计划数量', '本期计划', '设计数量', '设计工程量'],
    'actual_qty': ['完成量', '实际量', '本期完成', '实际完成'],
    'cum_plan_qty': ['累计计划'],
    'cum_actual_qty': ['累计完成', '累计实际', '开累完成数量', '开累完成', '开累完成量'],
    'cat': ['工程类别', '工程类', '项目类别', '分项工程类别'],
    'unit_proj': ['单位工程', '单项工程'],
    'stat_date': ['统计截止日期', '截止日期', '统计日期', '快照日期', '填报日期'],
    'remain_qty': ['剩余数量', '剩余', '剩余工程量'],
    'issue': ['问题', '偏差', '原因', '情况'],
    'content': ['措施', '内容', '对策', '办法', '整改'],
    'owner': ['责任人', '负责人', '牵头'],
    'status': ['状态', '进展'],
    'plan_start': ['计划开工', '计划开始', '开始时间'],
    'plan_end': ['计划完工', '计划完成', '计划结束', '节点'],
    'actual_start': ['实际开工', '实际开始'],
    'actual_end': ['实际完工', '实际完成', '实际结束'],
    'name': ['名称', '部位', '材料名称', '班组名称', '施工部位'],
    'parent_name': ['上级部位', '上级', '工作面', '父级', '所属', '分段', '工点'],
    'qty_unit': ['单位', '计量单位', '工程量单位'],
    'budget_cost': ['预算', '预算成本', '成本预算'],
    'code': ['编码', '编号', '代码'],
    'remark': ['备注', '说明', '注']
  };

  function importTargets() {
    var out = {};
    Object.keys(TARGETS).forEach(function (k) {
      out[k] = { label: TARGETS[k].label, fields: TARGETS[k].fields.map(function (f) {
        return { key: f[0], label: f[1], required: f[2] };
      }) };
    });
    return out;
  }

  function importTemplates() {
    var rows = DB.query('SELECT * FROM import_template ORDER BY id DESC');
    rows.forEach(function (r) {
      try { r.mapping = JSON.parse(r.mapping || '{}'); } catch (e) { r.mapping = {}; }
      try { r.fixed_vals = JSON.parse(r.fixed_vals || '{}'); } catch (e) { r.fixed_vals = {}; }
    });
    return rows;
  }

  function cleanHeader(c, idx) {
    if (c === null || c === undefined || String(c).trim() === '') return '（第' + (idx + 1) + '列）';
    return String(c).trim().replace(/\n/g, '');
  }

  // 把 worksheet 转成二维数组（含空行），用 SheetJS utils
  function require_sheet_to_arr(ws) {
    var X = (isBrowser ? window.XLSX : require('../../vendor/xlsx.full.min.js'));
    return X.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: null, raw: true });
  }

  function importSheets(p) {
    var wb = FU.readWorkbook(p.file);
    return { sheets: wb.SheetNames };
  }

  function importPreview(p) {
    var wb = FU.readWorkbook(p.file);
    var name = p.sheet || wb.SheetNames[0];
    var ws = wb.Sheets[name];
    var rowsAll = require_sheet_to_arr(ws);
    var headerRow = parseInt(p.header_row || 1, 10);
    var headers = [], rows = [];
    for (var i = 0; i < rowsAll.length; i++) {
      var rn = i + 1;
      if (rn < headerRow) continue;
      if (rn === headerRow) { headers = (rowsAll[i] || []).map(function (c, j) { return cleanHeader(c, j); }); continue; }
      if (rows.length >= 15) break;
      var row = rowsAll[i] || [];
      if (row.every(function (c) { return c === null || c === undefined || String(c).trim() === ''; })) continue;
      rows.push(row.map(function (c) { return FU.cellStr(c); }));
    }
    var guess = p.target ? guessMapping(headers, p.target) : {};
    return { headers: headers, rows: rows, guess: guess, sheets: wb.SheetNames };
  }

  function guessMapping(headers, target) {
    if (!TARGETS[target]) return {};
    var g = {}, used = {};
    TARGETS[target].fields.forEach(function (f) {
      var fkey = f[0], flabel = f[1];
      var cands = (SYNONYM[fkey] || []).concat([flabel]);
      var best = null, bestScore = 0;
      headers.forEach(function (h) {
        if (used[h] || !h) return;
        var hs = String(h).replace(/ /g, '');
        var score = 0;
        cands.forEach(function (c) {
          if (hs === c) score = Math.max(score, 100);
          else if (c.indexOf(hs) >= 0) score = Math.max(score, 60 + c.length);
          else if (hs.indexOf(c) >= 0) score = Math.max(score, 40 + hs.length);
        });
        if (score > bestScore) { best = h; bestScore = score; }
      });
      if (best && bestScore >= 40) { g[fkey] = best; used[best] = 1; }
    });
    return g;
  }

  function uuid16() {
    // 简化 uuid（浏览器/ node 都可用）
    var s = '';
    for (var i = 0; i < 16; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }

  function importRun(p) {
    var target = p.target;
    if (!TARGETS[target]) throw new Error('未知的目标表: ' + target);
    var mapping = p.mapping || {}, fixed = p.fixed || {};
    if (!Object.keys(mapping).length && !Object.keys(fixed).length) throw new Error('还没有做列映射');

    var wb = FU.readWorkbook(p.file);
    var name = p.sheet || wb.SheetNames[0];
    var ws = wb.Sheets[name];
    var rowsAll = require_sheet_to_arr(ws);
    var headerRow = parseInt(p.header_row || 1, 10);

    var headers = [], dataRows = [];
    for (var i = 0; i < rowsAll.length; i++) {
      var rn = i + 1;
      if (rn < headerRow) continue;
      if (rn === headerRow) { headers = (rowsAll[i] || []).map(function (c, j) { return cleanHeader(c, j); }); continue; }
      var row = rowsAll[i] || [];
      if (row.every(function (c) { return c === null || c === undefined || String(c).trim() === ''; })) continue;
      dataRows.push(row);
    }

    var hidx = {};
    headers.forEach(function (h, i) { hidx[h] = i; });

    var batchId = uuid16();
    var projectId = parseInt(p.project_id || DB.getConfig('cur_project', 1) || 1, 10);
    var wbsMap = wbsNameMap(), matMap = materialMap(), teamMap = teamMapFn();

    var ok = 0, skipped = 0, errors = [];
    var toInsert = [];
    var hierKeys = ['cat', 'unit_proj', 'parent_name'];
    var hierLast = {};

    for (var r = 0; r < dataRows.length; r++) {
      var rec = {};
      try {
        Object.keys(mapping).forEach(function (fkey) {
          var header = mapping[fkey];
          if (header === '' || header === null || header === undefined) return;
          var idx = hidx[header];
          if (idx === undefined || idx >= dataRows[r].length) return;
          rec[fkey] = dataRows[r][idx];
        });
        Object.keys(fixed).forEach(function (fkey) {
          if (fixed[fkey] !== '' && fixed[fkey] !== null && fixed[fkey] !== undefined) rec[fkey] = fixed[fkey];
        });

        if (target === 'wbs') {
          hierKeys.forEach(function (k) {
            var v = rec[k];
            if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
              if (hierLast[k] !== undefined) rec[k] = hierLast[k];
            } else hierLast[k] = v;
          });
        }

        rec = normalize(rec, target);
        if (isBlank(rec, target)) { skipped++; continue; }

        if (target === 'wbs') { toInsert.push(rec); continue; }

        rec.project_id = projectId;
        rec.batch_id = batchId;
        rec.source = 'import';

        var wn = rec.wbs_name;
        if (wn) rec.wbs_id = wbsMap[String(wn).trim()] || 0;
        if (target === 'material_rec') {
          var mn = String(rec.material_name || '').trim();
          var mi = matMap[mn];
          if (mi) {
            rec.material_id = mi.id;
            if (!rec.category) rec.category = mi.category;
            if (!rec.unit) rec.unit = mi.unit;
            if (!rec.price && mi.std_price) rec.price = mi.std_price;
          }
        }
        if (target === 'labor_rec') {
          var tn = String(rec.team_name || '').trim();
          var ti = teamMap[tn];
          if (ti) {
            rec.team_id = ti.id;
            if (!rec.trade) rec.trade = ti.trade;
            if (!rec.unit_cost && ti.day_wage) rec.unit_cost = ti.day_wage;
          }
        }

        if (!rec.amount) {
          if (rec.qty && rec.price) rec.amount = Math.round(parseFloat(rec.qty) * parseFloat(rec.price) * 100) / 100;
          else if (rec.person_count && rec.unit_cost) rec.amount = Math.round(parseFloat(rec.person_count) * parseFloat(rec.unit_cost) * 100) / 100;
        }
        if (!rec.price && rec.amount && rec.qty) {
          try { rec.price = Math.round(parseFloat(rec.amount) / parseFloat(rec.qty) * 10000) / 10000; } catch (e) {}
        }
        toInsert.push(rec);
      } catch (e) { errors.push('第 ' + (r + headerRow + 1) + ' 行: ' + e.message); if (errors.length > 30) break; }
    }

    if (target === 'wbs') ok = insertWbs(toInsert, projectId, batchId);
    else {
      for (var k2 = 0; k2 < toInsert.length; k2++) {
        try { DB.insertRow(target, toInsert[k2]); ok++; }
        catch (e) { errors.push(String(e)); }
      }
    }

    DB.exec('INSERT INTO import_batch(id,target,file_name,sheet_name,row_count,status) VALUES(?,?,?,?,?,\'done\')',
      [batchId, target, p.file || '', p.sheet || '', ok]);

    if (p.save_template && p.template_name) {
      DB.insertRow('import_template', {
        name: p.template_name, target: target,
        mapping: JSON.stringify(mapping), fixed_vals: JSON.stringify(fixed), header_row: headerRow
      });
    }

    return { ok: true, inserted: ok, skipped: skipped, errors: errors.slice(0, 30), batch_id: batchId, total_rows: dataRows.length };
  }

  // ---------------- wbs 建树 ----------------
  function normName(s) {
    s = String(s == null ? '' : s).trim();
    s = s.replace(/[（(][^（）()]*[)）]\s*$/, '').trim();
    return s;
  }

  function insertWbs(recs, projectId, batchId) {
    var META = { cat: 1, unit_proj: 1, stat_date: 1, cum_actual_qty: 1, remain_qty: 1 };
    if (typeof require('crypto') !== 'undefined') { /* noop */ }

    // 组合上级路径
    recs.forEach(function (rec) {
      var segs = ['cat', 'unit_proj', 'parent_name'].map(function (k) { return String(rec[k] == null ? '' : rec[k]).trim(); }).filter(function (s) { return s; });
      if (segs.length) rec.parent_name = segs.join('/');
    });

    var allRows = DB.query('SELECT id,name,full_path,parent_id FROM wbs');
    var nameId = {}, normId = {};
    allRows.forEach(function (r) { nameId[r.name] = r.id; var n = normName(r.name); if (!normId[n]) normId[n] = r.id; });

    function resolve(seg, parent) {
      var ch = DB.queryOne('SELECT id FROM wbs WHERE parent_id=? AND name=?', [parent, seg]);
      if (ch) return ch.id;
      var nseg = normName(seg);
      if (nseg !== seg) { ch = DB.queryOne('SELECT id FROM wbs WHERE parent_id=? AND name=?', [parent, nseg]); if (ch) return ch.id; }
      if (normId[nseg] !== undefined) return normId[nseg];
      return null;
    }

    // 先建父级路径
    recs.forEach(function (rec) {
      var pname = String(rec.parent_name == null ? '' : rec.parent_name).trim();
      if (!pname || nameId[pname] !== undefined) return;
      if (/[/＞>]/.test(pname)) {
        var parts = pname.split(/[/＞>]/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
        var cand = DB.queryOne('SELECT id FROM wbs WHERE full_path=? OR full_path LIKE ?', [pname, '%/' + pname]);
        if (cand) { rec.parent_name = parts[parts.length - 1]; nameId[pname] = cand.id; nameId[parts[parts.length - 1]] = cand.id; return; }
        var cur = 0;
        parts.forEach(function (part) {
          var nid = resolve(part, cur);
          if (nid !== null) { cur = nid; return; }
          nid = DB.insertRow('wbs', { name: part, parent_id: cur, project_id: projectId, batch_id: batchId });
          nameId[part] = nid; normId[normName(part)] = nid; cur = nid;
        });
        rec.parent_name = parts[parts.length - 1];
        nameId[pname] = cur; nameId[parts[parts.length - 1]] = cur;
      } else {
        var cands = DB.query('SELECT id FROM wbs WHERE name=?', [pname]);
        if (cands.length) nameId[pname] = cands[0].id;
      }
    });

    // 两轮建/更新施工部位
    var built = [], leafMap = {};
    for (var round = 0; round < 2; round++) {
      for (var i = recs.length - 1; i >= 0; i--) {
        var rec = recs[i];
        var name = String(rec.name == null ? '' : rec.name).trim();
        if (!name) continue;
        var pname2 = String(rec.parent_name == null ? '' : rec.parent_name).trim();
        if (pname2 && nameId[pname2] === undefined && round === 0) continue;
        var parentId = nameId[pname2] || 0;
        var d = {};
        Object.keys(rec).forEach(function (k) { if (!META[k] && k !== 'parent_name') d[k] = rec[k]; });
        var key = parentId + '|' + normName(name);
        var nid;
        if (leafMap[key] !== undefined) { DB.updateRow('wbs', leafMap[key], d); nid = leafMap[key]; }
        else {
          d.project_id = projectId; d.parent_id = parentId;
          if (batchId) d.batch_id = batchId;
          nid = DB.insertRow('wbs', d);
          leafMap[key] = nid; nameId[name] = nid; normId[normName(name)] = nid;
        }
        recs.splice(i, 1);
        built.push([nid, rec]);
      }
    }
    DB.refreshWbsPath();

    // 写形象进度快照
    built.forEach(function (pair) {
      var nid = pair[0], rec = pair[1];
      if (!rec.cum_actual_qty && !rec.stat_date) return;
      var fp = DB.queryOne('SELECT full_path FROM wbs WHERE id=?', [nid]);
      var biz = String(rec.stat_date || '') || new Date().toISOString().slice(0, 10);
      var prog = {
        biz_date: biz, project_id: projectId, wbs_id: nid,
        wbs_name: (fp && fp.full_path) || String(rec.name || ''),
        item_name: String(rec.name || ''), unit: String(rec.qty_unit || ''),
        plan_qty: parseFloat(rec.plan_qty || 0), actual_qty: parseFloat(rec.cum_actual_qty || 0),
        cum_plan_qty: parseFloat(rec.plan_qty || 0), cum_actual_qty: parseFloat(rec.cum_actual_qty || 0),
        source: 'import', batch_id: batchId,
        remark: (rec.remain_qty !== null && rec.remain_qty !== '' && rec.remain_qty !== undefined) ? ('剩余数量：' + rec.remain_qty) : ''
      };
      DB.insertRow('progress_rec', prog);
    });
    return built.length;
  }

  function importRollback(p) {
    var bid = p.batch_id;
    var b = DB.queryOne('SELECT * FROM import_batch WHERE id=?', [bid]);
    if (!b) throw new Error('批次不存在');
    var tables = [b.target];
    if (b.target === 'wbs') tables.push('progress_rec');
    var n = 0;
    tables.forEach(function (t) {
      DB.exec('DELETE FROM ' + t + ' WHERE batch_id=?', [bid]);
      var ch = DB.queryOne('SELECT changes() AS c');
      n += (ch && ch.c) || 0;
    });
    DB.exec("UPDATE import_batch SET status='rolled_back' WHERE id=?", [bid]);
    return { ok: true, msg: '已撤销批次 ' + bid + '（清理 ' + n + ' 行）' };
  }

  function normalize(rec, target) {
    var out = {};
    Object.keys(rec).forEach(function (k) {
      var v = rec[k];
      if (v === null || v === undefined) return;
      if (DATE_FIELDS[k]) { var d = FU.toDate(v); if (d) out[k] = d; }
      else if (NUM_FIELDS[k]) { var nv = FU.toNum(v); if (nv !== null) out[k] = nv; }
      else { var s = String(v).trim(); if (s) out[k] = s; }
    });
    return out;
  }

  function isBlank(rec, target) {
    var req = TARGETS[target].fields.filter(function (f) { return f[2]; }).map(function (f) { return f[0]; });
    for (var i = 0; i < req.length; i++) if (rec[req[i]] === null || rec[req[i]] === undefined || rec[req[i]] === '') return true;
    return false;
  }

  function wbsNameMap() {
    var m = {};
    DB.query('SELECT id,name,code,full_path FROM wbs').forEach(function (r) {
      [r.name, r.code, r.full_path].forEach(function (k) { if (k) m[String(k).trim()] = r.id; });
    });
    return m;
  }
  function materialMap() {
    var m = {};
    DB.query('SELECT id,name,category,unit,std_price,spec FROM material').forEach(function (r) {
      m[String(r.name).trim()] = r;
      if (r.spec) m[(String(r.name) + String(r.spec)).trim()] = r;
    });
    return m;
  }
  function teamMapFn() {
    var m = {};
    DB.query('SELECT id,name,trade,day_wage FROM team').forEach(function (r) { m[String(r.name).trim()] = r; });
    return m;
  }

  var routes = {};
  routes['/import/targets'] = importTargets;
  routes['/import/templates'] = importTemplates;
  routes['/import/sheets'] = importSheets;
  routes['/import/preview'] = importPreview;
  routes['/import/run'] = importRun;
  routes['/import/rollback'] = importRollback;

  var api = { routes: routes, TARGETS: TARGETS, SYNONYM: SYNONYM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (isBrowser) window.BackendImport = api;
})();
