/* 数据台账：直接查看和修改原始记录 */
App.reg({
  key: 'records', name: '数据台账', icon: '▦', group: '数据管理',
  sub: '原始记录的增删改查',

  async render(el) {
    const tabs = [
      ['output_rec', '产值记录'], ['material_rec', '材料消耗'],
      ['labor_rec', '人员投入'], ['cost_rec', '成本记录'],
      ['progress_rec', '形象进度']
    ];
    el.innerHTML = `
      <div class="row" style="margin-bottom:14px">
        ${tabs.map(([k, n], i) => `<button class="tb ${i ? '' : 'btn-p'}" data-t="${k}">${n}</button>`).join('')}
      </div>
      <div id="rc-body"></div>
      <div class="card">
        <h3>导入批次 <span class="tag">可以整批撤销导错的数据</span></h3>
        <div id="batches"></div>
      </div>`;

    const show = async k => {
      el.querySelectorAll('.tb').forEach(b => b.classList.toggle('btn-p', b.dataset.t === k));
      await CRUD.mount(document.getElementById('rc-body'), k, {
        title: tabs.find(t => t[0] === k)[1],
        defaults: { biz_date: App.today() }
      });
    };
    el.querySelectorAll('.tb').forEach(b => b.onclick = () => show(b.dataset.t));
    await show('output_rec');
    this.loadBatches();
  },

  async loadBatches() {
    const box = document.getElementById('batches');
    const d = await App.api('/crud/list', { table: 'import_batch', limit: 50 });
    if (!d.rows.length) { box.innerHTML = '<div class="dim">还没有导入记录。</div>'; return; }
    box.innerHTML = `<div class="tbl-wrap" style="max-height:280px"><table>
      <thead><tr><th>时间</th><th>目标</th><th>文件</th><th>工作表</th>
      <th class="num">行数</th><th>状态</th><th style="width:90px">操作</th></tr></thead>
      <tbody>${d.rows.map(b => `<tr>
        <td>${b.created_at}</td><td>${b.target}</td>
        <td>${App.esc(b.file_name || '-')}</td><td>${App.esc(b.sheet_name || '-')}</td>
        <td class="num">${b.row_count}</td>
        <td><span class="pill ${b.status === 'done' ? 'good' : ''}">${b.status === 'done' ? '已导入' : '已撤销'}</span></td>
        <td>${b.status === 'done' ?
        `<button class="btn-sm btn-dg rb" data-b="${b.id}">撤销</button>` : '-'}</td>
      </tr>`).join('')}</tbody></table></div>`;
    box.querySelectorAll('.rb').forEach(btn => btn.onclick = () =>
      App.confirm('撤销这批导入？将删除该批次写入的全部记录。', async () => {
        await App.api('/import/rollback', { batch_id: btn.dataset.b });
        App.ok('已撤销');
        App.go('records');
      }));
  }
});
