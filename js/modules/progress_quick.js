/* ================= 进度快录 =================
   现场轻量录入：选部位(WBS树) → 选形象进度项 → 填完成量 → 提交即入库，
   免去 Excel 中转。写入 progress_rec，batch_id 标记为 quick_*。
   累计完成量由看板实时按 (部位+项) 聚合，不在此落库。
============================================ */
App.reg({
  key: 'progress_quick', name: '进度快录', icon: '✎', group: '数据录入',
  sub: '选部位 → 填完成量 → 提交即入库（免 Excel）',

  async render(el) {
    const DB = window.DB;
    const wbs = (App.meta && App.meta.wbs_flat) || [];
    let items = [], units = [];
    try {
      items = DB.query("SELECT DISTINCT item_name FROM progress_rec WHERE item_name IS NOT NULL AND TRIM(item_name)<>'' ORDER BY item_name");
      units = DB.query("SELECT DISTINCT unit FROM progress_rec WHERE unit IS NOT NULL AND TRIM(unit)<>'' ORDER BY unit");
    } catch (e) {}
    const itemOpts = items.map(r => `<option value="${App.esc(r.item_name)}">${App.esc(r.item_name)}</option>`).join('');
    const unitOpts = units.map(r => `<option value="${App.esc(r.unit)}">${App.esc(r.unit)}</option>`).join('');
    const wbsOpts = wbs.map(w => `<option value="${App.esc(w.name)}">${'　'.repeat((w.level || 1) - 1)}${App.esc(w.name)}</option>`).join('');
    const today = new Date().toISOString().slice(0, 10);

    el.innerHTML = `
      <div class="card">
        <h3>进度快录 · 今日施工完成量</h3>
        <div class="dim" style="margin-bottom:12px">选部位（按 WBS 树层级）→ 选形象进度项 → 填完成量 → 提交即入库，
          无需维护 Excel。开累完成量由看板自动累计。</div>
        <div class="form-grid">
          <label>日期<input type="date" id="pq-date" value="${today}"></label>
          <label>部位名称<select id="pq-wbs" style="width:100%"><option value="">（手填新部位）</option>${wbsOpts}</select></label>
          <label>形象进度项<datalist id="pq-items">${itemOpts}</datalist><input id="pq-item" list="pq-items" placeholder="如 桩基/承台/墩身/开挖及支护" style="width:100%"></label>
          <label>单位<datalist id="pq-units">${unitOpts}</datalist><input id="pq-unit" list="pq-units" placeholder="根/个/孔/m" style="width:100%"></label>
          <label>完成量（本次）<input type="number" id="pq-qty" min="0" step="0.01" style="width:100%"></label>
          <label>备注<input id="pq-remark" placeholder="如 桥梁施工（实际）" style="width:100%"></label>
        </div>
        <div class="row" style="margin-top:14px">
          <button class="btn-p" id="pq-submit">提交入库</button>
          <span id="pq-msg" class="dim"></span>
        </div>
        <div class="dim" style="margin-top:10px">提示：选了下拉部位会自动带入名称；历史用过的「形象进度项 / 单位」会作为候选自动补全。</div>
      </div>`;

    document.getElementById('pq-submit').onclick = async () => {
      const wbsSel = document.getElementById('pq-wbs');
      const wbsName = wbsSel.value || prompt('请填写部位名称（如 慈城特大桥/3#墩）：');
      if (!wbsName) return App.err('请选择或输入部位名称');
      const item = document.getElementById('pq-item').value.trim();
      const qty = document.getElementById('pq-qty').value;
      if (!item) return App.err('请填写形象进度项');
      if (qty === '' || isNaN(parseFloat(qty))) return App.err('请填写完成量（数字）');
      try {
        await App.api('/progress/quickadd', {
          biz_date: document.getElementById('pq-date').value,
          wbs_name: wbsName,
          item_name: item,
          unit: document.getElementById('pq-unit').value.trim(),
          actual_qty: qty,
          remark: document.getElementById('pq-remark').value.trim()
        });
        App.ok('已入库：' + wbsName + ' / ' + item + ' / ' + qty + (document.getElementById('pq-unit').value ? ' ' + document.getElementById('pq-unit').value : ''));
        document.getElementById('pq-qty').value = '';
        document.getElementById('pq-remark').value = '';
      } catch (e) { App.err(e.message); }
    };
  }
});
