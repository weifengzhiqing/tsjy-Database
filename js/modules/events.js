/* 大事记：参照通甬铁路XI标大事记台账。多分表（临建/桥涵/隧道/路基/重大检查/日常检查）
   已归一化进一张 event_log 表。支持时间线查看、按日期/分类/关键字筛选、增删改、Excel 导入、导出 txt。 */
App.reg({
  key: 'events', name: '大事记', icon: '📌', group: '查询分析',
  sub: '按日期归集的重要事项：首桩、验收、检查、节点——可发不同层级单位',

  render(el) {
    this.el = el;
    this.draw();
    this.load();
  },

  draw() {
    const el = this.el;
    el.innerHTML = `
      <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
        <input class="fld" type="date" id="ev-from" style="width:150px">
        <span class="dim">至</span>
        <input class="fld" type="date" id="ev-to" style="width:150px">
        <select class="fld" id="ev-cat" style="width:140px">
          <option value="">全部分类</option>
          <option>临建工程</option><option>桥涵工程</option><option>隧道工程</option>
          <option>路基工程</option><option>重大检查</option><option>日常检查</option><option>其他</option>
        </select>
        <input class="fld" id="ev-kw" placeholder="搜索内容/人员/工点" style="flex:1;min-width:160px">
        <button class="btn-p" id="ev-q">查询</button>
        <span class="sp"></span>
        <button class="btn-p" id="ev-add">＋ 新增</button>
        <button class="btn-p" id="ev-imp">从 Excel 导入</button>
        <button class="btn-sm" id="ev-exp">导出 txt</button>
      </div>
      <div id="ev-list" style="margin-top:14px"></div>`;
    el.querySelector('#ev-q').onclick = () => this.load();
    el.querySelector('#ev-add').onclick = () => this.editRow(null);
    el.querySelector('#ev-imp').onclick = () => this.importUI();
    el.querySelector('#ev-exp').onclick = () => this.exportTxt();
    el.querySelector('#ev-kw').onkeydown = e => { if (e.key === 'Enter') this.load(); };
  },

  async load() {
    const box = this.el.querySelector('#ev-list');
    box.innerHTML = '<div class="loading">加载中…</div>';
    const r = await App.api('/crud/list', { table: 'event_log', limit: 5000 });
    let rows = r.rows || [];
    const f = this.el.querySelector('#ev-from').value;
    const t = this.el.querySelector('#ev-to').value;
    const cat = this.el.querySelector('#ev-cat').value;
    const kw = this.el.querySelector('#ev-kw').value.trim();
    if (f) rows = rows.filter(x => x.date && x.date >= f);
    if (t) rows = rows.filter(x => x.date && x.date <= t);
    if (cat) rows = rows.filter(x => x.category === cat);
    if (kw) rows = rows.filter(x =>
      (x.content || '').includes(kw) || (x.people || '').includes(kw) || (x.title || '').includes(kw));
    this.rows = rows;
    this.paint(rows);
  },

  paint(rows) {
    const box = this.el.querySelector('#ev-list');
    if (!rows.length) {
      box.innerHTML = '<div class="empty">暂无大事记。点「＋ 新增」或「从 Excel 导入」。</div>';
      return;
    }
    let html = '<div class="tl">';
    for (const x of rows) {
      const title = x.title ? `<span class="tl-title">${App.esc(x.title)}：</span>` : '';
      const people = x.people ? `<span class="dim">（${App.esc(x.people)}）</span>` : '';
      const note = x.note ? `<div class="tl-note dim">备注：${App.esc(x.note)}</div>` : '';
      html += `<div class="tl-item">
        <div class="tl-date">${App.esc(x.date || '—')}</div>
        <div class="tl-dot"></div>
        <div class="tl-body">
          <div class="tl-head">
            <span class="tag">${App.esc(x.category || '其他')}</span>
            <span class="tl-content">${title}${App.esc(x.content || '')}</span>${people}
          </div>
          ${note}
          <div class="tl-ops">
            <span class="lk" data-edit="${x.id}">编辑</span>
            <span class="lk" data-del="${x.id}">删除</span>
          </div>
        </div>
      </div>`;
    }
    html += '</div>';
    box.innerHTML = html;
    box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const r = rows.find(x => String(x.id) === b.dataset.edit);
      this.editRow(r);
    });
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => this.delRow(b.dataset.del));
  },

  editRow(r) {
    const isNew = !r;
    const v = k => r ? (r[k] || '') : '';
    const body = `
      <div class="row" style="gap:12px">
        <div class="fld" style="width:170px"><label>日期</label>
          <input type="date" data-k="date" value="${App.esc(v('date'))}"></div>
        <div class="fld" style="flex:1"><label>分类</label>
          <select data-k="category">
            ${['临建工程', '桥涵工程', '隧道工程', '路基工程', '重大检查', '日常检查', '其他']
              .map(c => `<option ${v('category') === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select></div>
      </div>
      <div class="fld" style="margin-top:10px"><label>标题（工点）</label>
        <input data-k="title" value="${App.esc(v('title'))}" placeholder="如：跨沈海高速特大桥21#墩"></div>
      <div class="fld" style="margin-top:10px"><label>内容 *</label>
        <textarea data-k="content" rows="3" style="width:100%">${App.esc(v('content'))}</textarea></div>
      <div class="row" style="gap:12px;margin-top:10px">
        <div class="fld" style="flex:1"><label>涉及人员 / 单位</label>
          <input data-k="people" value="${App.esc(v('people'))}"></div>
        <div class="fld" style="flex:1"><label>备注</label>
          <input data-k="note" value="${App.esc(v('note'))}"></div>
      </div>`;
    App.modal({
      title: isNew ? '新增大事记' : '编辑：' + (r.title || r.content || ''),
      width: 720, body,
      onOk: async (bd) => {
        const data = {};
        bd.querySelectorAll('[data-k]').forEach(inp => { data[inp.dataset.k] = inp.value; });
        if (!data.content || !data.content.trim()) { App.err('内容不能为空'); return false; }
        data.content = data.content.trim();
        if (!isNew) data.id = r.id;
        await App.api('/crud/save', { table: 'event_log', data });
        App.ok('已保存');
        await this.load();
      }
    });
  },

  async delRow(id) {
    App.confirm('确定删除这条大事记吗？', async () => {
      await App.api('/crud/delete', { table: 'event_log', ids: [id] });
      App.ok('已删除');
      await this.load();
    });
  },

  importUI() {
    const box = this.el.querySelector('#ev-list');
    box.innerHTML = `
      <div class="card">
        <h3>从 Excel 导入大事记</h3>
        <div class="row">
          <input type="file" id="ev-xls" accept=".xlsx,.xlsm">
          <span class="dim">自动识别各分表（临建/桥涵/隧道/路基/重大、检查事项/日常检查），归一化写入；会覆盖本项目现有大事记。</span>
        </div>
        <div class="sp14"></div>
        <button class="btn-p" id="ev-do" disabled>开始导入</button>
        <div id="ev-imp-res"></div>
      </div>`;
    let file = null;
    box.querySelector('#ev-xls').onchange = async e => {
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
        box.querySelector('#ev-do').disabled = false;
      } catch (err) { App.err(err.message); }
    };
    box.querySelector('#ev-do').onclick = () => {
      if (!file) return;
      App.confirm('这会覆盖本项目当前的全部大事记，确定导入吗？', async () => {
        try {
          const r = await App.api('/event/import', { file });
          box.querySelector('#ev-imp-res').innerHTML =
            `<div class="msg ok">成功导入 ${r.inserted} 条（${r.sheets.join('、')}）</div>`;
          App.ok('导入完成');
          await this.load();
        } catch (err) { App.err(err.message); }
      });
    };
  },

  exportTxt() {
    const rows = this.rows || [];
    let txt = '通甬铁路XI标 大事记\n（共 ' + rows.length + ' 条）\n\n';
    for (const x of rows) {
      txt += '【' + (x.date || '—') + '】[' + (x.category || '其他') + '] '
        + (x.title ? x.title + '：' : '') + (x.content || '');
      if (x.people) txt += '（' + x.people + '）';
      txt += '\n';
    }
    const blob = new Blob(['﻿' + txt], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '大事记.txt';
    a.click();
    URL.revokeObjectURL(a.href);
    App.ok('已导出 大事记.txt');
  }
});
