/* 分阶段总结：把一段时间的积累变成能直接交出去的报告 */
App.reg({
  key: 'summary', name: '分阶段总结', icon: '▣', group: '查询分析',
  sub: '自动生成阶段报告与优化建议',

  async render(el) {
    el.innerHTML = `
      <div class="card">
        <h3>生成阶段总结</h3>
        <div class="row">
          <div class="fld"><label>开始日期</label>
            <input type="date" id="s-from" value="${App.monthStart()}" style="width:150px"></div>
          <div class="fld"><label>截止日期</label>
            <input type="date" id="s-to" value="${App.today()}" style="width:150px"></div>
          <div class="fld"><label>部位（含下级）</label>
            <select id="s-wbs" style="width:200px">${App.wbsOptions()}</select></div>
          <div class="fld grow"><label>总结标题</label>
            <input type="text" id="s-title" placeholder="留空自动生成" style="width:100%"></div>
        </div>
        <div class="row" style="margin-top:10px">
          ${['本月', '上月', '本季', '近30天', '近90天'].map(t =>
      `<button class="btn-sm qr" data-q="${t}">${t}</button>`).join('')}
        </div>
        <div class="sp14"></div>
        <div class="row">
          <button class="btn-p" id="s-run">生成总结</button>
          <button id="s-save">存档</button>
          <button id="s-exp">导出 Excel</button>
          <button id="s-copy">复制正文</button>
        </div>
      </div>
      <div id="s-result"></div>
      <div class="card">
        <h3>历史存档</h3>
        <div id="s-hist"><div class="loading">加载中</div></div>
      </div>`;

    document.getElementById('s-run').onclick = () => this.run();
    document.getElementById('s-save').onclick = () => this.save();
    document.getElementById('s-exp').onclick = () => this.exp();
    document.getElementById('s-copy').onclick = () => this.copy();
    el.querySelectorAll('.qr').forEach(b => b.onclick = () => {
      const [a, z] = this.range(b.dataset.q);
      document.getElementById('s-from').value = a;
      document.getElementById('s-to').value = z;
      this.run();
    });
    this.hist();
    this.run();
  },

  range(t) {
    const d = new Date(), iso = x => x.toISOString().slice(0, 10);
    if (t === '本月') return [iso(d).slice(0, 8) + '01', App.today()];
    if (t === '上月') return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
    iso(new Date(d.getFullYear(), d.getMonth(), 0))];
    if (t === '本季') return [iso(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)),
      App.today()];
    if (t === '近30天') return [App.daysAgo(29), App.today()];
    return [App.daysAgo(89), App.today()];
  },

  params() {
    return {
      date_from: document.getElementById('s-from').value,
      date_to: document.getElementById('s-to').value,
      wbs_id: document.getElementById('s-wbs').value,
      title: document.getElementById('s-title').value
    };
  },

  async run() {
    const box = document.getElementById('s-result');
    box.innerHTML = '<div class="loading">汇总中</div>';
    try {
      const d = await App.api('/report/stage_summary', this.params());
      this.data = d;
      const g = {};
      d.rows.forEach(r => (g[r.dim] ||= []).push(r));
      box.innerHTML =
        App.kpis(d.summary) +
        `<div class="card"><h3>总结正文 <span class="tag">可直接贴进汇报材料</span></h3>
          <div class="narr" id="narr">${App.esc(d.narrative)}</div></div>` +
        Chart.render(d.charts) +
        `<div class="card"><h3>指标明细</h3>${App.table(d)}</div>` +
        `<div class="card"><h3>优化建议 <span class="tag">根据本期指标自动生成</span></h3>
          ${App.notes(d.notes)}</div>`;
    } catch (e) { box.innerHTML = `<div class="msg err">${e.message}</div>`; }
  },

  async save() {
    try {
      await App.api('/summary/save', { ...this.params(), content: this.data?.narrative });
      App.ok('已存档');
      this.hist();
    } catch (e) { App.err(e.message); }
  },

  async exp() {
    try { App.toast('生成中…'); App.download(await App.api('/export/summary', this.params())); }
    catch (e) { App.err(e.message); }
  },

  copy() {
    if (!this.data) return App.err('先生成总结');
    navigator.clipboard.writeText(this.data.narrative)
      .then(() => App.ok('正文已复制到剪贴板'))
      .catch(() => App.err('复制失败，请手动选中复制'));
  },

  async hist() {
    const box = document.getElementById('s-hist');
    const rows = await App.api('/summary/list', {});
    if (!rows.length) { box.innerHTML = '<div class="dim">还没有存档。生成后点「存档」保留快照，方便以后对比。</div>'; return; }
    box.innerHTML = `<div class="tbl-wrap" style="max-height:300px"><table>
      <thead><tr><th>标题</th><th style="width:110px">开始</th><th style="width:110px">截止</th>
      <th style="width:80px">判断</th><th style="width:150px">生成时间</th>
      <th style="width:120px">操作</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td>${App.esc(r.title)}</td><td>${r.date_from}</td><td>${r.date_to}</td>
        <td><span class="pill ${r.judgement === '正向' ? 'good' : r.judgement === '负向' ? 'bad' : ''}">
          ${r.judgement || '-'}</span></td>
        <td class="dim">${r.created_at}</td>
        <td><button class="btn-sm vw" data-i="${r.id}">查看</button>
            <button class="btn-sm btn-dg dl" data-i="${r.id}">删</button></td>
      </tr>`).join('')}</tbody></table></div>`;
    box.querySelectorAll('.vw').forEach(b => b.onclick = async () => {
      const s = await App.api('/summary/get', { id: b.dataset.i });
      App.modal({
        title: s.title, width: 860, hideOk: true,
        body: `<div class="narr" style="max-height:60vh">${App.esc(s.content)}</div>`
      });
    });
    box.querySelectorAll('.dl').forEach(b => b.onclick = () =>
      App.confirm('删除这份存档？', async () => {
        await App.api('/summary/delete', { id: b.dataset.i });
        App.ok('已删除'); this.hist();
      }));
  }
});
