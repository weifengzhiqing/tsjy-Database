/* ================= 成本数据录入（材料 / 人工 / 其他成本） =================
   - 材料费 = Σ(数量 × 单价)，单价单位见 unit 列（如 元/吨），合计转万元展示。
   - 人工费 = Σ(工时 × 单价)，单价单位见 unit_cost（如 元/工日），合计转万元展示。
   - 其他成本：金额直接录入（单位 万元）。
   - 提供「下载空白模板(Excel)」「导出当前(Excel)」「导入(Excel/CSV)」：
     导入按 id 合并（有 id 更新、无 id 新增），材料/人工自动算 amount。
   - 直接用 window.DB 读写（三张表不在通用 CRUD 白名单内）。
============================================ */
App.reg({
  key: 'cost_input', name: '成本数据录入', icon: '¥', group: '数据管理',
  sub: '材料/人工按单价自动计算，提供 Excel 导入模板',

  async render(el) {
    const DB = window.DB;
    const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; };

    // 三张表的配置：userFields 为用户可填列（不含 id / source）；amountMode 决定金额来源
    const CFG = {
      material: {
        table: 'material_rec', label: '材料消耗',
        amountMode: 'compute', compute: f => num(f.qty) * num(f.price) / 10000,
        need: f => (num(f.qty) > 0 && num(f.price) > 0) ? null : '缺少数量或单价',
        userFields: ['biz_date', 'material_name', 'category', 'spec', 'unit', 'qty', 'price', 'remark'],
        aliases: { biz_date: ['biz_date', '日期'], material_name: ['material_name', '材料名称', '材料'],
          category: ['category', '类别'], spec: ['spec', '规格'], unit: ['unit', '单价单位', '单位'],
          qty: ['qty', '数量'], price: ['price', '单价'], remark: ['remark', '备注'] },
        help: '单价单位填在 unit 列（如 元/吨）；金额 = 数量 × 单价，自动折算为万元。'
      },
      labor: {
        table: 'labor_rec', label: '人员投入',
        amountMode: 'compute', compute: f => num(f.work_hours) * num(f.unit_cost) / 10000,
        need: f => (num(f.work_hours) > 0 && num(f.unit_cost) > 0) ? null : '缺少工时或单价',
        userFields: ['biz_date', 'team_name', 'trade', 'person_count', 'work_hours', 'unit_cost', 'remark'],
        aliases: { biz_date: ['biz_date', '日期'], team_name: ['team_name', '班组', '队伍'],
          trade: ['trade', '工种'], person_count: ['person_count', '人数'],
          work_hours: ['work_hours', '工时'], unit_cost: ['unit_cost', '单价', '人工单价'], remark: ['remark', '备注'] },
        help: '单价单位填在 unit_cost（如 元/工日）；金额 = 工时 × 单价，自动折算为万元。'
      },
      cost: {
        table: 'cost_rec', label: '其他成本',
        amountMode: 'direct', compute: f => num(f.amount),
        need: f => (String(f.amount).trim() !== '' && isFinite(num(f.amount))) ? null : '缺少金额',
        userFields: ['biz_date', 'cost_type', 'subject', 'amount', 'budget_amt', 'remark'],
        aliases: { biz_date: ['biz_date', '日期'], cost_type: ['cost_type', '费用类型', '成本类型'],
          subject: ['subject', '科目', '事项'], amount: ['amount', '金额(万元)', '金额', '金额万元'],
          budget_amt: ['budget_amt', '预算', '预算金额'], remark: ['remark', '备注'] },
        help: '金额直接录入，单位为万元（与概览「其他成本」口径一致）。'
      }
    };
    for (const k in CFG) CFG[k].tplCols = ['id'].concat(CFG[k].userFields);

    function pickKey(cfg, hdr, field) {
      const al = cfg.aliases[field] || [field];
      for (const a of al) {
        const hit = hdr.find(h => h && String(h).trim().toLowerCase() === a.toLowerCase());
        if (hit) return hit;
      }
      return null;
    }

    /* ---------- 读当前数据 ---------- */
    let data = {};
    try {
      for (const k in CFG) data[k] = DB.query(`SELECT * FROM ${CFG[k].table} ORDER BY biz_date DESC, id DESC`);
    } catch (e) {
      el.innerHTML = `<div class="msg err">读取数据失败：${e.message}<br><br>
        可能是浏览器还缓存着旧版 data/project.db。请清空本站点 IndexedDB（DevTools → Application → IndexedDB → pmdb → 删除），再 Ctrl+F5 强刷。</div>`;
      return;
    }

    /* ---------- 导出 ---------- */
    function exportXlsx(rows, filename, sheet) {
      if (typeof XLSX === 'undefined') { App.err('Excel 库未加载，请刷新后重试'); return; }
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}], { skipHeader: false });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheet || '数据');
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([out], { type: 'application/octet-stream' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    }
    function exportTemplate(cfg) {
      const empty = {}; cfg.tplCols.forEach(c => empty[c] = '');
      exportXlsx([empty, Object.assign({}, empty), Object.assign({}, empty)],
        `成本模板_${cfg.label}.xlsx`, cfg.label);
      App.ok(`已下载空白模板：成本模板_${cfg.label}.xlsx`);
    }
    function exportCurrent(cfg, key) {
      const rows = data[key].map(r => { const o = {}; cfg.tplCols.forEach(c => o[c] = r[c]); return o; });
      exportXlsx(rows, `成本当前_${cfg.label}.xlsx`, cfg.label);
      App.ok(`已导出当前 ${rows.length} 行（含 id，可编辑后导入合并）`);
    }

    /* ---------- 导入（按 id 合并；材料/人工自动算 amount） ---------- */
    function invalidList(inv) {
      if (!inv.length) return '';
      const items = inv.map(x => `<li>${App.esc(x.text || '')} — <span class="warn">${App.esc(x.reason)}</span></li>`).join('');
      return `<details style="margin-top:10px"><summary class="dim">查看跳过明细（${inv.length} 行）</summary>
        <ul style="line-height:1.8;margin:8px 0 0 18px">${items}</ul></details>`;
    }
    async function importData(file, key) {
      const cfg = CFG[key];
      const preview = document.getElementById('ci-preview');
      const setPreview = html => { preview.innerHTML = html; };
      try {
        if (typeof XLSX === 'undefined') { App.err('Excel 库未加载，请刷新后重试'); return; }
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        if (!rows.length) { App.err('文件为空或无可识别数据'); return; }

        const hdr = Object.keys(rows[0]);
        const keyMap = {}; cfg.userFields.concat(['id']).forEach(f => { const h = pickKey(cfg, hdr, f); if (h) keyMap[f] = h; });
        if (!keyMap.id && !cfg.userFields.some(f => keyMap[f])) { App.err('未识别到任何有效列，请使用本模块导出的模板'); return; }

        const idSet = {}; data[key].forEach(r => { idSet[r.id] = true; });
        let maxId = data[key].reduce((m, r) => Math.max(m, r.id || 0), 0);

        const updates = [], inserts = [], invalid = [];
        rows.forEach(row => {
          const f = {}; cfg.userFields.forEach(k => { f[k] = keyMap[k] ? (row[keyMap[k]] || '') : ''; });
          const isEmpty = cfg.userFields.every(k => !String(f[k]).trim());
          if (isEmpty) return; // 整行空白：跳过不计数
          const reason = cfg.need(f);
          if (reason) { invalid.push({ text: (f.biz_date || '') + ' / ' + (f.material_name || f.team_name || f.subject || ''), reason }); return; }
          const amountVal = cfg.compute(f);
          const idv = keyMap.id ? parseInt(String(row[keyMap.id] || '').trim(), 10) : 0;
          if (idv && idSet[idv]) {
            const args = []; cfg.userFields.forEach(k => args.push(f[k]));
            if (cfg.amountMode !== 'direct') args.push(amountVal);
            args.push('excel');
            updates.push({ id: idv, args });
          } else {
            const nid = ++maxId; idSet[nid] = true;
            const args = [nid]; cfg.userFields.forEach(k => args.push(f[k]));
            if (cfg.amountMode !== 'direct') args.push(amountVal);
            args.push('excel');
            inserts.push(args);
          }
        });

        if (!updates.length && !inserts.length) {
          App.err('没有可导入的有效数据' + (invalid.length ? '（' + invalid.length + ' 行无效）' : ''));
          if (invalid.length) setPreview(`<div class="card" style="margin:14px 0">${invalidList(invalid)}</div>`);
          return;
        }

        setPreview(`<div class="card" style="margin:14px 0">
          <h3>导入预览</h3>
          <div class="dim" style="line-height:1.9">
            将<span class="good">新增 ${inserts.length}</span> 行、<span class="good">更新 ${updates.length}</span> 行，跳过 <b>${invalid.length}</b> 行。
            <br><span class="warn">注意</span>：导入只改本机浏览器缓存（IndexedDB），不会写回 GitHub 上的 data/project.db；
            若要固化为全站数据，请导出浏览器 db 后由我重新推送；换浏览器/清缓存后他人看到的是旧数据。
          </div>
          <div style="margin-top:10px">
            <button class="tb btn-p" id="ci-apply">应用导入</button>
            <button class="tb" id="ci-cancel">取消</button>
          </div>
          ${invalidList(invalid)}
        </div>`);

        document.getElementById('ci-apply').onclick = () => {
          const colList = cfg.userFields.concat(cfg.amountMode === 'direct' ? ['source'] : ['amount', 'source']);
          const upSql = `UPDATE ${cfg.table} SET ${colList.map(c => c + '=?').join(', ')} WHERE id=?`;
          const insCols = ['id'].concat(colList);
          const insSql = `INSERT INTO ${cfg.table} (${insCols.join(',')}) VALUES (${insCols.map(() => '?').join(',')})`;
          if (updates.length) {
            const args = updates.map(u => u.args.concat([u.id]));
            DB.execMany(upSql, args);
          }
          if (inserts.length) DB.execMany(insSql, inserts);
          DB.flush();
          App.ok(`已导入：新增 ${inserts.length} 行、更新 ${updates.length} 行（本机缓存已自动保存）`);
          preview.innerHTML = '';
          draw(); // 重绘当前 tab
        };
        document.getElementById('ci-cancel').onclick = () => { preview.innerHTML = ''; };
      } catch (err) {
        App.err('解析失败：' + (err && err.message ? err.message : err));
      }
    }

    /* ---------- 渲染 ---------- */
    const tabs = [['material', '材料消耗'], ['labor', '人员投入'], ['cost', '其他成本']];
    let cur = 'material';

    function dispCols(key) {
      if (key === 'material') return [
        { key: 'biz_date', label: '日期' }, { key: 'material_name', label: '材料名称' },
        { key: 'category', label: '类别' }, { key: 'spec', label: '规格' },
        { key: 'unit', label: '单价单位' }, { key: 'qty', label: '数量', type: 'num' },
        { key: 'price', label: '单价(元)', type: 'money' }, { key: 'amount', label: '金额(万元)', type: 'num' },
        { key: 'remark', label: '备注' }
      ];
      if (key === 'labor') return [
        { key: 'biz_date', label: '日期' }, { key: 'team_name', label: '班组' },
        { key: 'trade', label: '工种' }, { key: 'person_count', label: '人数', type: 'num' },
        { key: 'work_hours', label: '工时', type: 'num' }, { key: 'unit_cost', label: '单价(元/工日)', type: 'money' },
        { key: 'amount', label: '金额(万元)', type: 'num' }, { key: 'remark', label: '备注' }
      ];
      return [
        { key: 'biz_date', label: '日期' }, { key: 'cost_type', label: '费用类型' },
        { key: 'subject', label: '科目/事项' }, { key: 'amount', label: '金额(万元)', type: 'num' },
        { key: 'budget_amt', label: '预算(万元)', type: 'num' }, { key: 'remark', label: '备注' }
      ];
    }

    function kpiHtml(key) {
      const rows = data[key];
      const sum = rows.reduce((s, r) => s + (num(r.amount)), 0);
      const unitNote = key === 'material' ? '材料费 = 数量×单价'
        : key === 'labor' ? '人工费 = 工时×单价' : '其他成本（直接录入）';
      return App.kpis([
        { label: (key === 'cost' ? '成本合计' : '合计') + '（万元）', value: sum.toLocaleString('zh-CN', { maximumFractionDigits: 2 }), unit: '万元', tone: 'k' },
        { label: '记录行数', value: rows.length, unit: '行' },
        { label: '计算口径', value: unitNote, unit: '' }
      ]);
    }
    function noteHtml(key) {
      return `<div class="card" style="margin:14px 0">
        <h3>录入说明 <span class="tag">${CFG[key].label}</span></h3>
        <div class="dim" style="line-height:1.9">${CFG[key].help}<br>
        流程：点「下载空白模板」→ 在 Excel 填数量/单价 → 「导入」即可；
        想改已录数据：点「导出当前」拿到带 id 的文件，改完再「导入」会自动按 id 合并更新。</div>
      </div>`;
    }
    function tableHtml(key) {
      const rows = data[key];
      if (!rows.length) return '<div class="tbl-wrap"><div class="empty">还没有数据，点「下载空白模板」开始录入。</div></div>';
      return App.table({ columns: dispCols(key), rows }, {});
    }

    function draw() {
      document.getElementById('ci-kpi').innerHTML = kpiHtml(cur);
      document.getElementById('ci-note').innerHTML = noteHtml(cur);
      document.getElementById('ci-body').innerHTML = tableHtml(cur);
    }

    el.innerHTML = `
      <div class="row" style="margin-bottom:14px">
        ${tabs.map(([k, n]) => `<button class="tb ${k === cur ? 'btn-p' : ''}" data-t="${k}">${n}</button>`).join('')}
        <span class="sp"></span>
        <button class="tb" id="ci-tpl">下载空白模板</button>
        <button class="tb" id="ci-exp">导出当前(Excel)</button>
        <button class="tb" id="ci-imp">导入(Excel/CSV)</button>
        <input type="file" id="ci-file" accept=".xlsx,.xls,.csv" style="display:none">
      </div>
      <div id="ci-preview"></div>
      <div id="ci-kpi"></div>
      <div id="ci-note"></div>
      <div id="ci-body"></div>`;

    document.getElementById('ci-tpl').onclick = () => exportTemplate(CFG[cur]);
    document.getElementById('ci-exp').onclick = () => exportCurrent(CFG[cur], cur);
    document.getElementById('ci-imp').onclick = () => document.getElementById('ci-file').click();
    document.getElementById('ci-file').onchange = e => {
      const f = e.target.files && e.target.files[0];
      if (f) importData(f, cur);
      e.target.value = '';
    };
    el.querySelectorAll('.tb[data-t]').forEach(b => b.onclick = () => {
      cur = b.dataset.t;
      document.getElementById('ci-preview').innerHTML = '';
      el.querySelectorAll('.tb[data-t]').forEach(x => x.classList.toggle('btn-p', x.dataset.t === cur));
      draw();
    });

    draw();
  }
});
