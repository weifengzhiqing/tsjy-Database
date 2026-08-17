/* ================= 进度完成情况 =================
   隧道 / 桥梁 / 路基 的 设计·日·周·月·开累 完成数量；
   产值 = 开累完成数量 × 综合单价（★清单完成情况 F 列 = boq_ref.综合单价），前端实时计算，不落库。
   数据表：progress_complete（进度行，按 专业+单位工程+工作面+施工部位 编码）、boq_ref（清单单价参照）。
   说明：本模块直接用 window.DB 查询（两表不在通用 CRUD 白名单内），避免改动 crud.js。
============================================ */
App.reg({
  key: 'progress_complete', name: '进度完成情况', icon: '⛏', group: '数据管理',
  sub: '设计/日/周/月/开累 · 产值按 开累×清单单价 自动计算',

  async render(el) {
    const DB = window.DB;
    let prog, boq;
    try {
      prog = DB.query('SELECT * FROM progress_complete ORDER BY major, unit_project, work_face, id');
      boq = DB.query('SELECT code, sub_code, name, unit, price, chapter FROM boq_ref');
    } catch (e) {
      el.innerHTML = `<div class="msg err">读取数据失败：${e.message}<br><br>
        可能是浏览器还缓存着旧版 data/project.db。请清空本站点 IndexedDB（DevTools → Application → IndexedDB → pmdb → 删除），
        再 Ctrl+F5 强刷；或在部署时由我加上 DB 版本号强制刷新。</div>`;
      return;
    }

    // 清单单价索引
    const boqMap = {};
    boq.forEach(b => { boqMap[b.code] = b; });
    // 清单名称 -> 编码（导入时若用户填了清单名称而非编码，可反查）
    const nameMap = {};
    boq.forEach(b => { if (!nameMap[b.name]) nameMap[b.name] = b.code; });

    // 计算列：单价 + 开累产值（万元）
    prog.forEach(r => {
      const b = r.boq_code && boqMap[r.boq_code];
      r._price = b ? b.price : 0;
      r._boq_name = b ? b.name : '';
      r._chapter = b ? b.chapter : '';
      r._amount_wan = Math.round((r.cum_qty || 0) * (b ? b.price : 0) / 100) / 100; // 万元，2位
      r._matched = !!(r.boq_code && b);
    });

    const majors = ['隧道', '桥梁', '路基'];
    const byMajor = m => prog.filter(r => r.major === m);
    const sumWan = rows => rows.reduce((s, r) => s + (r._amount_wan || 0), 0);
    const cov = rows => { const ok = rows.filter(r => r._matched).length; return ok + '/' + rows.length; };

    /* ---------- 映射候选（实时关键词匹配，供复核采纳） ---------- */
    const MAP = [
      ['开挖', ['开挖', '掘进']], ['支护', ['初期支护', '支护']], ['仰拱', ['仰拱']],
      ['衬', ['衬砌']], ['电缆槽', ['电缆槽']], ['水沟', ['水沟', '中心水沟']],
      ['挖方', ['挖方', '挖土', '土方']], ['填方', ['填方', '填土', '利用土']],
      ['锚杆', ['锚杆']], ['锚索', ['锚索']], ['桩板', ['桩板结构']],
      ['挡土墙', ['挡土墙']], ['护坡', ['护坡']], ['桩基', ['钻孔桩', '桩']],
      ['桩', ['钻孔桩']], ['承台', ['承台']], ['墩', ['墩身', '墩']], ['梁', ['梁']],
      ['基床', ['基床']], ['侧沟', ['侧沟']], ['土工', ['土工']], ['钢筋', ['钢筋']],
      ['混凝土', ['混凝土']], ['框架', ['框架结构', '框架']], ['洞口', ['洞门', '明洞']],
      ['预压', ['预压']], ['天沟', ['天沟']], ['踏步', ['踏步']], ['栏杆', ['栏杆']],
      ['井', ['井']], ['栅栏', ['栅栏']], ['防护', ['防护']], ['U型槽', ['U型槽']],
      ['拱形', ['拱形骨架', '骨架']], ['悬臂', ['悬臂']], ['孔窗', ['孔窗']]
    ];
    function ngrams(t) { const a = String(t || '').split(''); const out = []; for (let i = 0; i < a.length - 1; i++) out.push(a[i] + a[i + 1]); return out; }
    function candidates(text) {
      const scored = {};
      for (const [pk, bks] of MAP) {
        if (String(text || '').indexOf(pk) < 0) continue;
        for (const b of boq) {
          if (bks.some(bk => (b.name || '').indexOf(bk) >= 0))
            scored[b.code] = (scored[b.code] || 0) + 1 + (b.name || '').length / 2000;
        }
      }
      if (!Object.keys(scored).length) {
        const g = ngrams(text);
        for (const b of boq) { let s = 0; for (const x of g) if ((b.name || '').indexOf(x) >= 0) s++; if (s) scored[b.code] = (scored[b.code] || 0) + s * 0.1; }
      }
      return Object.keys(scored).sort((a, b) => scored[b] - scored[a]).slice(0, 5).map(c => boqMap[c]).filter(Boolean);
    }

    /* ---------- 主表列定义 ---------- */
    const cols = [
      { key: 'unit_project', label: '单位工程' },
      { key: 'work_face', label: '工作面' },
      { key: 'item', label: '施工部位' },
      { key: 'unit', label: '单位' },
      { key: 'design_qty', label: '设计数量', type: 'num' },
      { key: 'day_qty', label: '日完成', type: 'num' },
      { key: 'week_qty', label: '周完成', type: 'num' },
      { key: 'month_qty', label: '月完成', type: 'num' },
      { key: 'cum_qty', label: '开累完成', type: 'num' },
      { key: 'price', label: '综合单价(元)', type: 'money' },
      { key: 'boq_name', label: '清单子目' },
      { key: 'amount', label: '开累产值(万元)', type: 'num' },
      { key: 'remark', label: '备注' }
    ];
    function rowObj(r) {
      return Object.assign({}, r, { price: r._price, boq_name: r._boq_name, amount: r._amount_wan,
        _tone: r._matched ? '' : 'warn' });
    }

    /* ---------- 采纳 / 导出 ---------- */
    async function adopt(id, code) {
      if (!boqMap[code]) { App.err('清单编码不存在：' + code); return; }
      DB.exec('UPDATE progress_complete SET boq_code=? WHERE id=?', [code, id]);
      DB.flush();
      App.ok('已更新映射（本机缓存）');
      draw();
    }
    function exportCSV() {
      const head = ['id', '专业', '单位工程', '施工部位', '单位', '开累完成', 'boq_code', '清单名称', '单价(元)', '开累产值(元)', '是否未匹配'];
      const lines = [head.join(',')];
      prog.forEach(r => {
        const vals = [r.id, r.major, r.unit_project, r.item, r.unit, r.cum_qty || '',
          r.boq_code || '', r._boq_name, r._price, Math.round((r.cum_qty || 0) * r._price), r._matched ? '' : '是'];
        lines.push(vals.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','));
      });
      const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '进度-清单映射复核.csv';
      a.click();
      App.ok('已导出：进度-清单映射复核.csv');
    }

    /* ---------- Excel/CSV 导入映射（回填 boq_code） ---------- */
    function invalidList(inv) {
      if (!inv.length) return '';
      const items = inv.map(x => `<li>${App.esc(x.text || '')} — <span class="warn">${App.esc(x.reason)}</span></li>`).join('');
      return `<details style="margin-top:10px"><summary class="dim">查看跳过明细（${inv.length} 行）</summary>
        <ul style="line-height:1.8;margin:8px 0 0 18px">${items}</ul></details>`;
    }
    async function importMap(file) {
      const preview = document.getElementById('pc-import-preview');
      const setPreview = html => { preview.innerHTML = html; };
      try {
        if (typeof XLSX === 'undefined') { App.err('Excel 解析库未加载，请刷新页面后重试'); return; }
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        if (!rows.length) { App.err('文件为空或无可识别数据'); return; }

        const hdr = Object.keys(rows[0]);
        const pick = aliases => {
          for (const a of aliases) {
            const k = hdr.find(h => h && String(h).trim().toLowerCase() === a.toLowerCase());
            if (k) return k;
          }
          return null;
        };
        const kId = pick(['id', '行id', 'row id', '序号']);
        const kCode = pick(['boq_code', '清单编码', '清单代码', 'code']);
        const kName = pick(['清单名称', '清单子目', '名称', 'boq_name']);
        const kMajor = pick(['专业', 'major']);
        const kUnit = pick(['单位工程', 'unit_project']);
        const kItem = pick(['施工部位', 'item']);
        if (!kCode) { App.err('未找到「清单编码 / boq_code」列，无法导入'); return; }

        const idIndex = {}; prog.forEach(r => idIndex[r.id] = r);
        const keyIndex = {}; prog.forEach(r => { keyIndex[(r.major + '|' + r.unit_project + '|' + r.item).replace(/\s+/g, '')] = r; });

        const valid = {}, invalid = [];
        rows.forEach(row => {
          let code = String(row[kCode] || '').trim();
          if (!code && kName) {
            const nm = String(row[kName] || '').trim();
            if (nm && nameMap[nm]) code = nameMap[nm];
          }
          if (!code) return; // 空编码：不更新
          let target = null;
          if (kId) {
            const idv = parseInt(String(row[kId] || '').trim(), 10);
            if (idv && idIndex[idv]) target = idIndex[idv];
          }
          if (!target && (kMajor || kUnit || kItem)) {
            const key = ((row[kMajor] || '') + '|' + (row[kUnit] || '') + '|' + (row[kItem] || '')).replace(/\s+/g, '');
            target = keyIndex[key];
          }
          const label = (kId ? ('id=' + (row[kId] || '')) : (row[kUnit] || '') + '/' + (row[kItem] || ''));
          if (!target) { invalid.push({ text: label, reason: '找不到对应进度行' }); return; }
          if (!boqMap[code]) { invalid.push({ text: label, reason: '清单编码不存在：' + code }); return; }
          valid[target.id] = code; // 同 id 以最后一行覆盖
        });

        const updates = Object.keys(valid).map(id => ({ id: parseInt(id, 10), code: valid[id] }));
        if (!updates.length) {
          App.err('没有可更新的有效映射' + (invalid.length ? '（' + invalid.length + ' 行无效）' : ''));
          if (invalid.length) setPreview(`<div class="card" style="margin:14px 0">${invalidList(invalid)}</div>`);
          return;
        }

        setPreview(`<div class="card" style="margin:14px 0">
          <h3>导入预览</h3>
          <div class="dim" style="line-height:1.9">
            将更新 <b>${updates.length}</b> 行清单映射，跳过 <b>${invalid.length}</b> 行（id 找不到 / 编码不存在）。
            <br><span class="warn">注意</span>：导入只改本机浏览器缓存（IndexedDB），不会写回 GitHub 上的 data/project.db；若要固化为全站数据，请导出 db 后由我重新推送。
          </div>
          <div style="margin-top:10px">
            <button class="tb btn-p" id="pc-apply">应用更新</button>
            <button class="tb" id="pc-cancel-import">取消</button>
          </div>
          ${invalidList(invalid)}
        </div>`);

        document.getElementById('pc-apply').onclick = () => {
          const argList = updates.map(u => [u.code, u.id]);
          DB.execMany('UPDATE progress_complete SET boq_code=? WHERE id=?', argList);
          App.ok('已导入并更新 ' + updates.length + ' 行清单映射（本机缓存已自动保存）');
          preview.innerHTML = '';
          draw();
        };
        document.getElementById('pc-cancel-import').onclick = () => { preview.innerHTML = ''; };
      } catch (err) {
        App.err('解析失败：' + (err && err.message ? err.message : err));
      }
    }

    /* ---------- 渲染 ---------- */
    const tabs = [
      ['all', '全部'], ['隧道', '隧道'], ['桥梁', '桥梁'], ['路基', '路基'], ['review', '映射复核']
    ];
    let cur = 'all';
    el.innerHTML = `
      <div class="row" style="margin-bottom:14px">
        ${tabs.map(([k, n]) => `<button class="tb ${k === 'all' ? 'btn-p' : ''}" data-t="${k}">${n}</button>`).join('')}
        <span class="sp"></span>
        <button class="tb" id="pc-export">导出映射复核(CSV)</button>
        <button class="tb" id="pc-import">导入映射(Excel/CSV)</button>
        <input type="file" id="pc-file" accept=".xlsx,.xls,.csv" style="display:none">
      </div>
      <div id="pc-import-preview"></div>
      <div id="pc-kpi"></div>
      <div id="pc-note"></div>
      <div id="pc-body"></div>`;

    document.getElementById('pc-export').onclick = exportCSV;
    document.getElementById('pc-import').onclick = () => document.getElementById('pc-file').click();
    document.getElementById('pc-file').onchange = e => {
      const f = e.target.files && e.target.files[0];
      if (f) importMap(f);
      e.target.value = '';
    };
    el.querySelectorAll('.tb[data-t]').forEach(b => b.onclick = () => {
      cur = b.dataset.t;
      document.getElementById('pc-import-preview').innerHTML = '';
      el.querySelectorAll('.tb[data-t]').forEach(x => x.classList.toggle('btn-p', x.dataset.t === cur));
      draw();
    });

    function kpiHtml() {
      const k = [
        { label: '开累产值合计', value: sumWan(prog).toLocaleString('zh-CN', { maximumFractionDigits: 1 }), unit: '万元', tone: 'k' },
        ...majors.map(m => ({ label: m + '开累产值', value: sumWan(byMajor(m)).toLocaleString('zh-CN', { maximumFractionDigits: 1 }), unit: '万元' })),
      ];
      return App.kpis(k);
    }
    function noteHtml() {
      const tot = prog.length, ok = prog.filter(r => r._matched).length;
      const mism = prog.filter(r => !r._matched);
      const unitRisk = mism.filter(r => !/m³|方|米|根|km|公里|平方米/.test(r.unit || '')).length;
      return `<div class="card" style="margin:14px 0">
        <h3>映射覆盖 <span class="tag">单价取自 ★清单完成情况 F 列</span></h3>
        <div class="dim" style="line-height:1.9">
          已挂单价 <b>${ok}/${tot}</b> 行；未匹配 <b>${tot - ok}</b> 行（见「映射复核」页签）。
          产值 = 开累完成数量 × 综合单价，前端实时计算。
          <br><span class="warn">风险提示</span>：若进度单位（米/根）与清单单价单位（立方米）不一致，产值会失真——
          请在映射复核中核对「施工部位」与「清单子目」的单位是否对齐，必要时改映射编码。
        </div>
      </div>`;
    }
    function tableHtml(rows) {
      if (!rows.length) return '<div class="tbl-wrap"><div class="empty">没有数据</div></div>';
      // 明细行 -> 计算列
      const data = { columns: cols, rows: rows.map(rowObj) };
      return App.table(data, {});
    }
    function reviewHtml() {
      const mism = prog.filter(r => !r._matched);
      if (!mism.length) return '<div class="empty">全部已匹配清单单价，无需复核。</div>';
      let h = `<div class="tbl-wrap"><table><thead><tr>
        <th>专业</th><th>单位工程</th><th>施工部位</th><th>单位</th><th class="num">开累</th>
        <th>推荐清单子目（点击采纳）</th><th>手动编码</th></tr></thead><tbody>`;
      mism.forEach(r => {
        const cands = candidates(r.item + ' ' + r.unit_project);
        const chip = cands.length ? cands.map(c =>
          `<button class="chip" data-id="${r.id}" data-code="${App.esc(c.code)}" title="${App.esc(c.chapter || '')}"
            style="margin:2px 4px 2px 0;padding:3px 8px;border:1px solid #b07d2b66;border-radius:10px;background:#f3e8cd;color:#8a611d;cursor:pointer;font-size:12px">
            ${App.esc(c.name)} <span class="dim">${(c.price || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}元</span></button>`).join('') : '<span class="dim">无候选</span>';
        h += `<tr>
          <td>${r.major}</td><td>${App.esc(r.unit_project)}</td><td>${App.esc(r.item)}</td><td>${App.esc(r.unit)}</td>
          <td class="num">${App.fmt(r.cum_qty, 'num')}</td>
          <td style="min-width:320px">${chip}</td>
          <td><input class="cin" data-id="${r.id}" placeholder="清单编码"
              style="width:140px;padding:3px 6px;background:#fcf9f3;border:1px solid #d2c6ad;color:#2b2620;border-radius:4px">
              <button class="btn-sm adopt-manual" data-id="${r.id}">确定</button></td>
        </tr>`;
      });
      h += '</tbody></table></div>';
      return h;
    }

    function draw() {
      document.getElementById('pc-kpi').innerHTML = kpiHtml();
      document.getElementById('pc-note').innerHTML = noteHtml();
      const body = document.getElementById('pc-body');
      if (cur === 'review') {
        body.innerHTML = reviewHtml();
        body.querySelectorAll('.chip').forEach(b => b.onclick = () => adopt(parseInt(b.dataset.id, 10), b.dataset.code));
        body.querySelectorAll('.adopt-manual').forEach(b => b.onclick = () => {
          const inp = body.querySelector('.cin[data-id="' + b.dataset.id + '"]');
          const code = (inp.value || '').trim();
          if (code) adopt(parseInt(b.dataset.id, 10), code);
        });
      } else {
        const rows = cur === 'all' ? prog : byMajor(cur);
        body.innerHTML = tableHtml(rows);
      }
    }

    draw();
  }
});
