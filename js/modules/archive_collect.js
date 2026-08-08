/* 档案归集（浏览器版）：从本机选择文件上传并登记进档案索引（可填类别/单位工程/部位/日期/责任人），
   文件字节存本浏览器 IndexedDB，可回看下载。支持搜索筛选、编辑、删除、下载、归入卷。 */
App.reg({
  key: 'archive_collect', name: '档案归集', icon: '🗂️', group: '档案管理',
  sub: '从本机上传文件，登记并建立可搜索的档案索引',

  render(el) {
    this.el = el;
    this.tab = 'browse';
    this.selFiles = [];       // 待登记文件：[{file,name,size}]
    this.regRows = [];        // 已登记文件
    this.draw();
  },

  draw() {
    const el = this.el;
    el.innerHTML = `
      <div class="row" style="gap:8px;align-items:center;margin-bottom:12px">
        <div class="seg">
          <button class="seg-btn on" data-tab="browse">浏览归集</button>
          <button class="seg-btn" data-tab="reg">已登记</button>
        </div>
        <span class="sp"></span>
        <span id="ac-root" class="dim"></span>
      </div>
      <div id="ac-body"></div>`;
    el.querySelectorAll('.seg-btn').forEach(b => b.onclick = () => {
      this.tab = b.dataset.tab;
      el.querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('on', x === b));
      this.drawBody();
    });
    App.api('/archive/root').then(r => {
      const tag = el.querySelector('#ac-root');
      if (tag) tag.textContent = '归档位置：' + (r.root || '') +
        (r.browser ? '（文件上传后保存于本浏览器，可回看下载）' : '');
    }).catch(() => {});
    this.drawBody();
  },

  drawBody() {
    const body = this.el.querySelector('#ac-body');
    if (this.tab === 'browse') this.drawBrowse(body);
    else this.drawReg(body);
  },

  // ---------------- 浏览归集（浏览器版：上传登记） ----------------
  drawBrowse(body) {
    const cats = ['隧道工程', '桥涵工程', '路基工程', '临建工程', '其他'];
    const wbsOpts = (App.meta.wbs_flat || [])
      .map(w => `<option>${App.esc(w.name)}</option>`).join('');
    body.innerHTML = `
      <div class="note" style="margin-bottom:10px">
        浏览器版无本地文件夹扫描权限，请<b>从本机选择文件</b>上传登记。文件字节保存于本浏览器（IndexedDB），可在「已登记」中回看下载、编辑、归入卷。
      </div>
      <div id="ac-drop" class="dropzone">
        把文件拖到这里，或 <label class="lk" style="cursor:pointer">点击选择文件
          <input type="file" id="ac-file" multiple hidden></label>
      </div>
      <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0">
        <input class="fld" id="ac-folder" placeholder="归档目录（可选，如 五磊山隧道/进口）" style="width:230px">
        <select class="fld" id="ac-cat" style="width:130px">
          ${cats.map(c => `<option ${c === '隧道工程' ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <input class="fld" id="ac-unit" placeholder="单位工程" style="width:150px">
        <input class="fld" id="ac-wbs" list="ac-wbs" placeholder="部位" style="width:150px">
        <datalist id="ac-wbs">${wbsOpts}</datalist>
        <input class="fld" id="ac-owner" placeholder="责任人/编制单位" style="width:150px">
        <input type="date" id="ac-date">
        <input class="fld" id="ac-remark" placeholder="备注" style="width:140px">
      </div>
      <div id="ac-sel" class="sel-list"></div>
      <div class="row" style="gap:10px;align-items:center;margin-top:8px">
        <button class="btn-p" id="ac-reg-sel">登记所选文件</button>
        <button class="btn-sm" id="ac-clear">清空</button>
        <span id="ac-sel-info" class="dim"></span>
      </div>`;

    const fileInput = body.querySelector('#ac-file');
    const drop = body.querySelector('#ac-drop');
    fileInput.onchange = () => { this.addFiles(fileInput.files); fileInput.value = ''; };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => {
      e.preventDefault(); drop.classList.remove('over');
      if (e.dataTransfer && e.dataTransfer.files) this.addFiles(e.dataTransfer.files);
    };
    body.querySelector('#ac-reg-sel').onclick = () => this.registerSelected();
    body.querySelector('#ac-clear').onclick = () => { this.selFiles = []; this.paintSel(); };
    this.paintSel();
  },

  addFiles(fileList) {
    const arr = Array.prototype.slice.call(fileList || []);
    arr.forEach(f => {
      const name = f.name;
      if (this.selFiles.some(s => s.name === name && s.size === f.size)) return;
      this.selFiles.push({ file: f, name: name, size: f.size });
    });
    this.paintSel();
  },

  paintSel() {
    const box = this.el.querySelector('#ac-sel');
    if (!box) return;
    const info = this.el.querySelector('#ac-sel-info');
    if (info) info.textContent = '已选 ' + this.selFiles.length + ' 个文件';
    if (!this.selFiles.length) { box.innerHTML = ''; return; }
    let h = '<div class="tbl-wrap"><table><thead><tr><th>文件名</th><th>类型</th><th>大小</th><th></th></tr></thead><tbody>';
    this.selFiles.forEach((s, i) => {
      const ext = s.name.indexOf('.') >= 0 ? s.name.split('.').pop().toLowerCase() : '-';
      h += `<tr>
        <td>${App.esc(s.name)}</td>
        <td class="num">${App.esc(ext)}</td>
        <td class="num">${this._sz(s.size)}</td>
        <td><span class="lk" data-rm="${i}">移除</span></td>
      </tr>`;
    });
    h += '</tbody></table></div>';
    box.innerHTML = h;
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      this.selFiles.splice(parseInt(b.dataset.rm, 10), 1); this.paintSel();
    });
  },

  async readFileB64(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const r = fr.result;
        resolve((typeof r === 'string' && r.indexOf(',') >= 0) ? r.slice(r.indexOf(',') + 1) : r);
      };
      fr.onerror = () => reject(new Error('读取文件失败：' + file.name));
      fr.readAsDataURL(file);
    });
  },

  async registerSelected() {
    if (!this.selFiles.length) { App.err('请先选择文件'); return; }
    const el = this.el;
    const folder = (el.querySelector('#ac-folder').value || '').trim().replace(/^\/+|\/+$/g, '');
    const category = el.querySelector('#ac-cat').value;
    const unit_proj = el.querySelector('#ac-unit').value.trim();
    const wbs_name = el.querySelector('#ac-wbs').value.trim();
    const owner = el.querySelector('#ac-owner').value.trim();
    const file_date = el.querySelector('#ac-date').value.trim();
    const remark = el.querySelector('#ac-remark').value.trim();
    const items = [];
    App.ok('正在读取并登记 ' + this.selFiles.length + ' 个文件…');
    for (const s of this.selFiles) {
      try {
        const content = await this.readFileB64(s.file);
        const vname = folder ? (folder + '/' + s.name) : s.name;
        const mtime = s.file.lastModified
          ? new Date(s.file.lastModified).toISOString().slice(0, 10) : '';
        items.push({
          name: vname, content: content, size: s.size, mtime: mtime,
          category: category, unit_proj: unit_proj, wbs_name: wbs_name,
          file_date: file_date, owner: owner, remark: remark
        });
      } catch (e) { App.err(e.message); }
    }
    if (!items.length) return;
    try {
      const r = await App.api('/archive/register', { items });
      App.ok('已登记 ' + r.registered + ' 个文件');
      this.selFiles = []; this.paintSel();
      if (this.tab === 'reg') this.loadReg();
    } catch (e) { App.err(e.message); }
  },

  _sz(n) {
    if (!n) return '-';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  },

  // ---------------- 已登记索引 ----------------
  drawReg(body) {
    body.innerHTML = `
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
        <select class="fld" id="acr-cat" style="width:140px">
          <option value="">全部分类</option>
          <option>隧道工程</option><option>桥涵工程</option><option>路基工程</option>
          <option>临建工程</option><option>其他</option>
        </select>
        <input class="fld" id="acr-kw" placeholder="搜索文件名/部位/责任人" style="flex:1;min-width:160px">
        <label class="dim"><input type="checkbox" id="acr-un"> 仅看未组卷</label>
        <button class="btn-p" id="acr-q">查询</button>
        <span class="sp"></span>
        <button class="btn-sm" id="acr-add">＋ 手动登记</button>
        <button class="btn-sm" id="acr-assign">归入卷</button>
      </div>
      <div id="acr-list"></div>`;
    body.querySelector('#acr-q').onclick = () => this.loadReg();
    body.querySelector('#acr-kw').onkeydown = e => { if (e.key === 'Enter') this.loadReg(); };
    body.querySelector('#acr-add').onclick = () => this.manualAdd();
    body.querySelector('#acr-assign').onclick = () => this.assignUI();
    this.loadReg();
  },

  async loadReg() {
    const box = this.el.querySelector('#acr-list');
    if (!box) return;
    box.innerHTML = '<div class="loading">加载中…</div>';
    const p = {
      category: this.el.querySelector('#acr-cat').value,
      keyword: this.el.querySelector('#acr-kw').value.trim(),
      unassigned: this.el.querySelector('#acr-un').checked ? 1 : 0,
    };
    const r = await App.api('/archive/list', p);
    this.regRows = r.rows || [];
    this.paintReg(this.regRows);
  },

  paintReg(rows) {
    const box = this.el.querySelector('#acr-list');
    if (!box) return;
    if (!rows.length) { box.innerHTML = '<div class="empty">暂无登记文件。到「浏览归集」里上传文件登记，或点「手动登记」。</div>'; return; }
    let h = '<div class="tbl-wrap"><table><thead><tr>'
      + '<th style="width:34px"></th><th>文件名</th><th>类别</th><th>单位工程</th><th>部位</th>'
      + '<th>形成日期</th><th>责任人</th><th>卷</th><th>源路径</th><th></th>'
      + '</tr></thead><tbody>';
    for (const x of rows) {
      h += `<tr data-id="${x.id}">
        <td><input type="checkbox" class="acr-ck" data-id="${x.id}"></td>
        <td>${App.esc(x.name)}</td>
        <td>${App.esc(x.category || '-')}</td>
        <td>${App.esc(x.unit_proj || '-')}</td>
        <td>${App.esc(x.wbs_name || '-')}</td>
        <td class="num">${App.esc(x.file_date || '-')}</td>
        <td>${App.esc(x.owner || '-')}</td>
        <td class="num">${x.volume_id ? '卷#' + x.volume_id : '<span class="dim">未组卷</span>'}</td>
        <td class="dim" title="${App.esc(x.src_path || '')}">${App.esc((x.src_path || '').slice(-40))}</td>
        <td><span class="lk" data-dl="${x.id}">下载</span><span class="lk" data-edit="${x.id}">编辑</span><span class="lk" data-del="${x.id}">删除</span></td>
      </tr>`;
    }
    h += '</tbody></table></div>';
    box.innerHTML = h;
    box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const r = rows.find(x => String(x.id) === b.dataset.edit); this.editReg(r);
    });
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => this.delReg(b.dataset.del));
    box.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => this.downloadFile(b.dataset.dl));
  },

  async downloadFile(id) {
    const row = this.regRows.find(x => String(x.id) === String(id));
    if (!row) return;
    try {
      const r = await App.api('/archive/open', { sub: row.src_path });
      const a = document.createElement('a');
      a.href = 'data:application/octet-stream;base64,' + r.b64;
      a.download = r.filename || row.name;
      a.click();
      App.ok('已下载：' + (r.filename || row.name));
    } catch (e) { App.err(e.message); }
  },

  async editReg(r) {
    const cats = ['隧道工程', '桥涵工程', '路基工程', '临建工程', '其他'];
    const wbsOpts = (App.meta.wbs_flat || []).map(w => `<option ${w.name === r.wbs_name ? 'selected' : ''}>${App.esc(w.name)}</option>`).join('');
    const v = k => r ? (r[k] || '') : '';
    const body = `
      <div class="form-grid">
        <div class="fld"><label>文件名</label><input data-k="name" value="${App.esc(v('name'))}"></div>
        <div class="fld"><label>工程类别</label>
          <select data-k="category">${cats.map(c => `<option ${v('category') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="fld"><label>单位工程</label><input data-k="unit_proj" value="${App.esc(v('unit_proj'))}"></div>
        <div class="fld"><label>部位</label>
          <input data-k="wbs_name" list="ac-wbs2" value="${App.esc(v('wbs_name'))}">
          <datalist id="ac-wbs2">${wbsOpts}</datalist></div>
        <div class="fld"><label>形成日期</label><input type="date" data-k="file_date" value="${App.esc(v('file_date'))}"></div>
        <div class="fld"><label>责任人 / 编制单位</label><input data-k="owner" value="${App.esc(v('owner'))}"></div>
        <div class="fld full"><label>备注</label><input data-k="remark" value="${App.esc(v('remark'))}"></div>
      </div>`;
    App.modal({
      title: '编辑登记：' + (r.name || ''), width: 720, body,
      onOk: async (bd) => {
        const data = { id: r.id };
        bd.querySelectorAll('[data-k]').forEach(inp => { data[inp.dataset.k] = inp.value.trim(); });
        await App.api('/crud/save', { table: 'archive_file', data });
        App.ok('已保存'); await this.loadReg();
      }
    });
  },

  manualAdd() {
    const cats = ['隧道工程', '桥涵工程', '路基工程', '临建工程', '其他'];
    const wbsOpts = (App.meta.wbs_flat || []).map(w => `<option>${App.esc(w.name)}</option>`).join('');
    const body = `
      <div class="form-grid">
        <div class="fld full"><label>文件名（必填，含扩展名）</label>
          <input data-k="name" placeholder="如 五磊山隧道进口开挖记录.pdf"></div>
        <div class="fld"><label>归档目录（可选，如 五磊山隧道/进口）</label><input data-k="folder" placeholder="留空则根目录"></div>
        <div class="fld"><label>工程类别</label>
          <select data-k="category">${cats.map(c => `<option ${c === '隧道工程' ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="fld"><label>单位工程</label><input data-k="unit_proj" placeholder="如 五磊山隧道"></div>
        <div class="fld"><label>部位</label>
          <input data-k="wbs_name" list="ac-wbs3" placeholder="如 进口/开挖支护">
          <datalist id="ac-wbs3">${wbsOpts}</datalist></div>
        <div class="fld"><label>形成日期</label><input type="date" data-k="file_date"></div>
        <div class="fld"><label>责任人 / 编制单位</label><input data-k="owner"></div>
        <div class="fld full"><label>备注</label><input data-k="remark"></div>
      </div>`;
    App.modal({
      title: '手动登记（仅登记索引，无文件字节）', width: 720, body,
      onOk: async (bd) => {
        const meta = {};
        bd.querySelectorAll('[data-k]').forEach(inp => { meta[inp.dataset.k] = inp.value.trim(); });
        if (!meta.name) { App.err('文件名不能为空'); return false; }
        const folder = (meta.folder || '').replace(/^\/+|\/+$/g, '');
        const name = folder ? (folder + '/' + meta.name) : meta.name;
        const item = {
          name: name, size: 0, mtime: '',
          category: meta.category, unit_proj: meta.unit_proj, wbs_name: meta.wbs_name,
          file_date: meta.file_date, owner: meta.owner, remark: meta.remark
        };
        const r = await App.api('/archive/register', { items: [item] });
        if (!r.registered) { App.err('登记失败'); return false; }
        App.ok('已登记'); await this.loadReg();
      }
    });
  },

  async delReg(id) {
    App.confirm('确定删除这条登记吗？（不会删除磁盘上的原文件）', async () => {
      await App.api('/crud/delete', { table: 'archive_file', ids: [id] });
      App.ok('已删除'); await this.loadReg();
    });
  },

  async assignUI() {
    const ids = [...this.el.querySelectorAll('.acr-ck:checked')].map(c => c.dataset.id);
    if (!ids.length) { App.err('请先勾选要归入卷的文件'); return; }
    const vols = await App.api('/crud/list', { table: 'archive_volume', limit: 1000 });
    const list = (vols.rows || []);
    if (!list.length) { App.err('还没有卷，请先到「组卷管理」建卷'); return; }
    const body = `<div class="row" style="gap:8px;flex-wrap:wrap">
      ${list.map(v => `<button class="btn-p" data-vid="${v.id}">${App.esc(v.code || v.name || ('卷#' + v.id))}</button>`).join('')}
    </div>`;
    App.modal({
      title: '归入卷（' + ids.length + ' 个文件）', width: 560, body,
      hideOk: true,
      onOk: null,
    });
    const mask = document.querySelector('.mask');
    mask.querySelectorAll('[data-vid]').forEach(b => b.onclick = async () => {
      try {
        const r = await App.api('/archive/assign', { volume_id: b.dataset.vid, ids });
        App.ok('已归入 ' + r.affected + ' 个文件'); mask.remove(); await this.loadReg();
      } catch (e) { App.err(e.message); }
    });
  },
});
