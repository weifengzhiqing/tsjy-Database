/* 组卷管理：把已登记的文件编成「卷」，查看卷内文件、生成卷内目录（Excel）与案卷目录。
   卷与文件通过 archive_volume / archive_file 两张表关联。 */
App.reg({
  key: 'archive_volume', name: '组卷管理', icon: '📚', group: '档案管理',
  sub: '将已登记文件编组为案卷，一键生成卷内目录与案卷目录',

  render(el) {
    this.el = el;
    this.curVol = null;
    this.draw();
    this.load();
  },

  draw() {
    const el = this.el;
    el.innerHTML = `
      <div class="row" style="gap:8px;align-items:center;margin-bottom:12px">
        <button class="btn-p" id="av-new">＋ 新建卷</button>
        <button class="btn-sm" id="av-cat">导出案卷目录</button>
        <span class="sp"></span>
        <span id="av-cnt" class="dim"></span>
      </div>
      <div class="arch-layout">
        <div class="arch-tree">
          <div class="arch-tree-h">案卷（点击查看卷内文件）</div>
          <div id="av-list" class="wbs-tree"></div>
        </div>
        <div class="arch-files">
          <div id="av-detail"></div>
        </div>
      </div>`;
    el.querySelector('#av-new').onclick = () => this.editVol(null);
    el.querySelector('#av-cat').onclick = () => this.exportCatalog();
  },

  async load() {
    const r = await App.api('/crud/list', { table: 'archive_volume', limit: 1000 });
    this.vols = r.rows || [];
    const total = (await App.api('/crud/list', { table: 'archive_file', limit: 1 })).total || 0;
    this.el.querySelector('#av-cnt').textContent =
      `共 ${this.vols.length} 卷 · 已登记文件 ${total} 个`;
    this.paintVols();
    if (this.curVol == null && this.vols.length) this.openVol(this.vols[0].id);
    else if (!this.vols.length) this.el.querySelector('#av-detail').innerHTML =
      '<div class="empty">还没有卷。点「＋ 新建卷」建立第一个案卷，再去「档案归集」把文件归入。</div>';
  },

  paintVols() {
    const box = this.el.querySelector('#av-list');
    if (!this.vols.length) { box.innerHTML = '<div class="dim" style="padding:8px">（无卷）</div>'; return; }
    let h = '<ul class="wt-ul">';
    for (const v of this.vols) {
      const on = this.curVol === v.id ? 'style="background:var(--bg-hover);border-color:var(--accent-dk)"' : '';
      h += `<li class="wt-li"><div class="wt-node" data-vid="${v.id}" ${on}>
        <span class="wt-name">📁 ${App.esc(v.code || v.name || ('卷#' + v.id))}</span>
        <span class="wt-meta">${App.esc(v.unit_proj || '')}</span>
      </div></li>`;
    }
    h += '</ul>';
    box.innerHTML = h;
    box.querySelectorAll('[data-vid]').forEach(n => n.onclick = () => this.openVol(Number(n.dataset.vid)));
  },

  async openVol(id) {
    this.curVol = id;
    this.paintVols();
    const v = this.vols.find(x => x.id === id);
    const box = this.el.querySelector('#av-detail');
    box.innerHTML = '<div class="loading">加载中…</div>';
    const r = await App.api('/archive/list', { volume_id: id });
    const files = r.rows || [];
    let info = '';
    if (v) {
      info = `<div class="card" style="margin-bottom:12px">
        <div class="row" style="gap:14px;align-items:center">
          <div><div class="dim">卷号</div><b>${App.esc(v.code || '-')}</b></div>
          <div><div class="dim">案卷题名</div><b>${App.esc(v.name || '-')}</b></div>
          <div><div class="dim">工程类别</div>${App.esc(v.category || '-')}</div>
          <div><div class="dim">单位工程</div>${App.esc(v.unit_proj || '-')}</div>
          <span class="sp"></span>
          <button class="btn-sm" id="av-exp">导出卷内目录</button>
          <button class="btn-sm" id="av-edit">编辑</button>
          <button class="btn-sm" id="av-del">删除</button>
        </div>
        ${v.remark ? `<div class="dim" style="margin-top:8px">备注：${App.esc(v.remark)}</div>` : ''}
      </div>`;
    }
    box.innerHTML = info + `<div class="dim" style="margin-bottom:6px">卷内文件（${files.length}）</div>` + this._filesHtml(files);
    box.querySelector('#av-exp').onclick = () => this.exportVol(id);
    box.querySelector('#av-edit').onclick = () => this.editVol(v);
    box.querySelector('#av-del').onclick = () => this.delVol(id);
    box.querySelectorAll('[data-un]').forEach(b => b.onclick = () => this.unassign(b.dataset.un));
  },

  _filesHtml(files) {
    if (!files.length) return '<div class="empty">该卷还没有文件。到「档案归集 → 已登记」勾选文件后「归入卷」。</div>';
    let h = '<div class="tbl-wrap"><table><thead><tr>'
      + '<th>序号</th><th>文件题名</th><th>类别</th><th>部位</th><th>形成日期</th><th>责任人</th><th></th>'
      + '</tr></thead><tbody>';
    files.forEach((f, i) => {
      h += `<tr>
        <td class="num">${i + 1}</td>
        <td>${App.esc(f.name)}</td>
        <td>${App.esc(f.category || '-')}</td>
        <td>${App.esc(f.wbs_name || '-')}</td>
        <td class="num">${App.esc(f.file_date || '-')}</td>
        <td>${App.esc(f.owner || '-')}</td>
        <td><span class="lk" data-un="${f.id}">移出卷</span></td>
      </tr>`;
    });
    h += '</tbody></table></div>';
    return h;
  },

  editVol(v) {
    const isNew = !v;
    const cats = ['隧道工程', '桥涵工程', '路基工程', '临建工程', '其他'];
    const val = k => v ? (v[k] || '') : '';
    const body = `
      <div class="form-grid">
        <div class="fld"><label>卷号</label><input data-k="code" value="${App.esc(val('code'))}" placeholder="如 A-01"></div>
        <div class="fld"><label>案卷题名</label><input data-k="name" value="${App.esc(val('name'))}" placeholder="如 五磊山隧道进口施工记录"></div>
        <div class="fld"><label>工程类别</label>
          <select data-k="category">${cats.map(c => `<option ${val('category') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="fld"><label>单位工程</label><input data-k="unit_proj" value="${App.esc(val('unit_proj'))}"></div>
        <div class="fld full"><label>备注</label><input data-k="remark" value="${App.esc(val('remark'))}"></div>
      </div>`;
    App.modal({
      title: isNew ? '新建案卷' : '编辑卷：' + (v.name || ''), width: 720, body,
      onOk: async (bd) => {
        const data = {};
        bd.querySelectorAll('[data-k]').forEach(inp => { data[inp.dataset.k] = inp.value.trim(); });
        if (!data.name && !data.code) { App.err('卷号或案卷题名至少填一项'); return false; }
        if (!isNew) data.id = v.id;
        await App.api('/crud/save', { table: 'archive_volume', data });
        App.ok('已保存'); await this.load();
      }
    });
  },

  async delVol(id) {
    App.confirm('确定删除这个卷吗？卷内文件会自动解除归属（不会删除文件本身）。', async () => {
      await App.api('/crud/delete', { table: 'archive_volume', ids: [id] });
      App.ok('已删除'); this.curVol = null; await this.load();
    });
  },

  async unassign(id) {
    await App.api('/archive/unassign', { ids: [id] });
    App.ok('已移出卷'); if (this.curVol) this.openVol(this.curVol);
  },

  async exportVol(id) {
    const r = await App.api('/archive/volume_export', { volume_id: id });
    App.download(r);
  },

  async exportCatalog() {
    const r = await App.api('/archive/catalog_export', {});
    App.download(r);
  },
});
