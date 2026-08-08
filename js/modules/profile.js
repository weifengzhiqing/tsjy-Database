/* 项目概况 / 项目常用数据：维护对外的单位名称、账号、标段、投资额等。
   支持从 Excel 的「项目常用数据」表一键导入。 */
App.reg({
  key: 'profile', name: '项目概况', icon: '▤', group: '数据管理',
  sub: '项目常用数据：单位名称、账号、标段、投资额一目了然',

  async render(el) {
    this.el = el;
    await this.load();
  },

  async load() {
    const r = await App.api('/crud/list', { table: 'project_profile', limit: 2000 });
    this.paint(r.rows || []);
  },

  paint(rows) {
    const el = this.el;
    el.innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div>
            <h3 style="margin:0">项目概况 / 项目常用数据</h3>
            <div class="dim" style="margin-top:4px">
              维护对外的单位名称、账号、标段、投资额等。可直接从 Excel 的「项目常用数据」表一键导入，
              文字导入与输出功能会直接引用这里的「数据名称」作为变量。
            </div>
          </div>
          <div class="row">
            <button class="btn-p" id="pp-add">＋ 新增条目</button>
            <button class="btn-sm" id="pp-imp">从 Excel 导入</button>
          </div>
        </div>
        <div class="sp14"></div>
        <div class="tbl-wrap" style="max-height:62vh">
          <table>
            <thead><tr>
              <th style="width:54px">序号</th>
              <th style="width:200px">数据名称</th>
              <th>内容</th>
              <th style="width:96px">操作</th>
            </tr></thead>
            <tbody>
            ${rows.map(r => `
              <tr>
                <td class="num">${r.seq || ''}</td>
                <td><strong>${App.esc(r.name || '')}</strong>${this._supBadge(r)}</td>
                <td style="white-space:pre-wrap">${App.esc(r.content || '') || '<span class="dim">—</span>'}</td>
                <td>
                  <button class="lk" data-edit="${r.id}">编辑</button>
                  <button class="lk" data-del="${r.id}">删除</button>
                </td>
              </tr>`).join('')}
            ${rows.length ? '' :
              '<tr><td colspan="4" class="dim" style="text-align:center;padding:22px">暂无数据，点「从 Excel 导入」或「新增条目」</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div id="pp-imp-area"></div>`;

    el.querySelector('#pp-add').onclick = () => this.editRow(null);
    el.querySelector('#pp-imp').onclick = () => this.importUI();
    el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const r = rows.find(x => String(x.id) === b.dataset.edit);
      this.editRow(r);
    });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => this.delRow(b.dataset.del));
  },

  _supBadge(r) {
    let n = 0;
    for (let i = 1; i <= 9; i++) if (r['sup' + i]) n++;
    return n ? `<div class="dim" style="font-size:11px;margin-top:3px">含补充 ${n} 项 ▾</div>` : '';
  },

  _supFields(r) {
    const v = k => r ? (r[k] || '') : '';
    return Array.from({ length: 9 }, (_, i) => i + 1).map(i => `
      <div class="fld" style="flex:1 1 30%">
        <label>补充${i}</label>
        <textarea data-k="sup${i}" rows="2" style="width:100%">${App.esc(v('sup' + i))}</textarea>
      </div>`).join('');
  },

  editRow(r) {
    const isNew = !r;
    const v = k => r ? (r[k] || '') : '';
    const body = `
      <div class="row" style="gap:12px">
        <div class="fld" style="width:80px"><label>序号</label>
          <input type="number" data-k="seq" value="${App.esc(v('seq'))}"></div>
        <div class="fld" style="flex:1"><label>数据名称 *</label>
          <input data-k="name" value="${App.esc(v('name'))}"></div>
      </div>
      <div class="fld" style="margin-top:10px"><label>内容</label>
        <textarea data-k="content" rows="4" style="width:100%">${App.esc(v('content'))}</textarea></div>
      <div class="dim" style="margin:10px 0 4px">补充信息（选填，最多 9 项，用于账号、税号等多行内容）</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px">${this._supFields(r)}</div>`;

    App.modal({
      title: isNew ? '新增项目概况条目' : '编辑：' + r.name,
      width: 760,
      body,
      onOk: async (bd) => {
        const data = { name: bd.querySelector('[data-k=name]').value.trim() };
        if (!data.name) { App.err('数据名称不能为空'); return false; }
        bd.querySelectorAll('[data-k]').forEach(inp => {
          const k = inp.dataset.k;
          if (k === 'name') return;
          data[k] = inp.value;
        });
        if (!isNew) data.id = r.id;
        await App.api('/crud/save', { table: 'project_profile', data });
        App.ok('已保存');
        await this.load();
      }
    });
  },

  async delRow(id) {
    App.confirm('确定删除这条项目概况吗？', async () => {
      await App.api('/crud/delete', { table: 'project_profile', ids: [id] });
      App.ok('已删除');
      await this.load();
    });
  },

  importUI() {
    const area = document.getElementById('pp-imp-area');
    area.innerHTML = `
      <div class="card">
        <h3>从 Excel 导入「项目常用数据」</h3>
        <div class="row">
          <input type="file" id="pp-xls" accept=".xlsx,.xlsm">
          <span class="dim">自动识别名为「项目常用数据 / 项目概况」的工作表，按 数据名称 / 内容 / 补充1-9 写入，并覆盖本项目现有概况。</span>
        </div>
        <div class="sp14"></div>
        <button class="btn-p" id="pp-do" disabled>开始导入</button>
        <div id="pp-imp-res"></div>
      </div>`;
    let file = null;
    area.querySelector('#pp-xls').onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      App.toast('上传中…');
      const b64 = await new Promise(res => {
        const rd = new FileReader();
        rd.onload = () => res(rd.result);
        rd.readAsDataURL(f);
      });
      try {
        const r = await App.api('/upload', { filename: f.name, content: b64 });
        file = r.file;
        App.ok('已上传 ' + f.name);
        area.querySelector('#pp-do').disabled = false;
      } catch (err) { App.err(err.message); }
    };
    area.querySelector('#pp-do').onclick = () => {
      if (!file) return;
      App.confirm('这会覆盖本项目当前的全部项目概况数据，确定导入吗？', async () => {
        try {
          const r = await App.api('/profile/import', { file });
          area.querySelector('#pp-imp-res').innerHTML =
            `<div class="msg ok">成功导入 ${r.inserted} 条项目概况</div>`;
          App.ok('导入完成');
          await this.load();
        } catch (err) { App.err(err.message); }
      });
    };
  }
});
