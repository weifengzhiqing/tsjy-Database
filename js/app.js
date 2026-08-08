/* ================= 应用框架 =================
   加一个窗口只需要在 web/js/modules/ 下新建一个 js：
     App.reg({key:'xx', name:'窗口名', icon:'●', group:'分组', render(el){...}});
   然后在 index.html 里加一行 <script src="js/modules/xx.js"></script>
============================================ */
const App = {
  MODULES: [],
  meta: null,
  cur: null,

  reg(m) { this.MODULES.push(m); },

  /* ---------- API（浏览器端：直接调用本地 JS 后端，无服务器） ---------- */
  async api(path, params = {}) {
    // 浏览器版：数据层跑在本地（SQL.js + IndexedDB），所有 /api/* 由 Backend.dispatch 处理
    if (window.Backend) {
      try { return await window.Backend.dispatch(path, params || {}); }
      catch (e) { throw (e && e.message) ? e : new Error(String(e)); }
    }
    // 兜底：若仍以静态服务器方式部署（保留 /api 后端），走 fetch
    const r = await fetch('/api' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const j = await r.json();
    if (!j.ok) { throw new Error(j.error || '请求失败'); }
    return j.data;
  },

  async boot() {
    try {
      window.__bootShow && window.__bootShow('正在初始化本地数据库…');
      this.meta = await this.api('/meta/all');
    } catch (e) {
      window.__bootFail && window.__bootFail('数据库初始化失败', e.message);
      return;
    }
    this.renderNav();
    const key = location.hash.slice(1) || 'dashboard';
    this.go(key);
    window.addEventListener('hashchange', () => this.go(location.hash.slice(1) || 'dashboard'));
    window.__bootHide && window.__bootHide();   // 启动成功，关闭浮层并解除错误拦截
  },

  async reloadMeta() { this.meta = await this.api('/meta/all'); },

  renderNav() {
    const groups = {};
    this.MODULES.forEach(m => { (groups[m.group || '功能'] ||= []).push(m); });
    const order = ['日常', '查询分析', '数据管理', '档案管理', '系统'];
    const keys = Object.keys(groups).sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    document.getElementById('nav').innerHTML = keys.map(g =>
      `<div class="nav-group">${g}</div>` +
      groups[g].map(m => `<div class="nav-item" data-k="${m.key}">
          <span class="ic">${m.icon || '●'}</span><span>${m.name}</span></div>`).join('')
    ).join('');
    document.querySelectorAll('.nav-item').forEach(el =>
      el.onclick = () => { location.hash = el.dataset.k; });
  },

  go(key) {
    const m = this.MODULES.find(x => x.key === key) || this.MODULES[0];
    this.cur = m;
    document.querySelectorAll('.nav-item').forEach(el =>
      el.classList.toggle('on', el.dataset.k === m.key));
    document.getElementById('page-title').textContent = m.name;
    document.getElementById('page-sub').textContent = m.sub || '';
    const view = document.getElementById('view');
    view.innerHTML = '<div class="loading">加载中</div>';
    Promise.resolve(m.render(view)).catch(e => {
      view.innerHTML = `<div class="msg err">出错了：${e.message}</div>`;
      console.error(e);
    });
  },

  /* ---------- UI 工具 ---------- */
  toast(msg, type = '') {
    const d = document.createElement('div');
    d.className = 'tst ' + type;
    d.textContent = msg;
    document.getElementById('toast').appendChild(d);
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 300); }, 3200);
  },
  ok(m) { this.toast(m, 'ok'); },
  err(m) { this.toast(m, 'err'); },

  modal({ title, body, width = 720, onOk, okText = '保存', hideOk }) {
    const mask = document.createElement('div');
    mask.className = 'mask';
    mask.innerHTML = `<div class="modal" style="width:${width}px">
        <div class="modal-h"><h3>${title}</h3><span class="x">&times;</span></div>
        <div class="modal-b"></div>
        <div class="modal-f">
          <button class="c">取消</button>
          ${hideOk ? '' : `<button class="btn-p k">${okText}</button>`}
        </div></div>`;
    const bd = mask.querySelector('.modal-b');
    if (typeof body === 'string') bd.innerHTML = body; else bd.appendChild(body);
    const close = () => mask.remove();
    mask.querySelector('.x').onclick = close;
    mask.querySelector('.c').onclick = close;
    if (!hideOk) mask.querySelector('.k').onclick = async () => {
      try { const r = await onOk(bd, close); if (r !== false) close(); }
      catch (e) { App.err(e.message); }
    };
    mask.onclick = e => { if (e.target === mask) close(); };
    document.body.appendChild(mask);
    return { el: mask, body: bd, close };
  },

  confirm(msg, cb) {
    this.modal({
      title: '确认', width: 400, okText: '确定',
      body: `<div style="line-height:1.8">${msg}</div>`,
      onOk: () => cb()
    });
  },

  /* ---------- 格式化 ---------- */
  fmt(v, type) {
    if (v === null || v === undefined || v === '') return '<span class="dim">-</span>';
    switch (type) {
      case 'money': return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'num': return typeof v === 'number' ? (Number.isInteger(v) ? v : v.toLocaleString('zh-CN', { maximumFractionDigits: 3 })) : v;
      case 'pct': return v === null ? '-' : Number(v).toFixed(1) + '%';
      default: return String(v).replace(/[<>]/g, c => ({ '<': '&lt;', '>': '&gt;' }[c]));
    }
  },

  /* ---------- 通用表格渲染 ---------- */
  table(data, opts = {}) {
    const cols = data.columns || [];
    const rows = data.rows || [];
    if (!rows.length) return `<div class="tbl-wrap"><div class="empty">没有符合条件的数据</div></div>`;
    let h = '<div class="tbl-wrap"><table><thead><tr>';
    cols.forEach(c => {
      const cls = ['num', 'money', 'pct'].includes(c.type) ? 'num' : '';
      h += `<th class="${cls}" ${c.width ? `style="min-width:${c.width}px"` : ''}>${c.label}</th>`;
    });
    if (opts.actions) h += '<th style="min-width:90px">操作</th>';
    h += '</tr></thead><tbody>';
    rows.forEach((r, i) => {
      h += `<tr class="${r._tone || ''}" data-i="${i}">`;
      cols.forEach(c => {
        const v = r[c.key];
        const isNum = ['num', 'money', 'pct'].includes(c.type);
        let cls = isNum ? 'num' : '';
        if (isNum && typeof v === 'number') cls += v < 0 ? ' neg' : '';
        const txt = this.fmt(v, c.type);
        h += `<td class="${cls}">${c.width > 180 ? `<span class="cell-clip">${txt}</span>` : txt}</td>`;
      });
      if (opts.actions) h += `<td>${opts.actions(r, i)}</td>`;
      h += '</tr>';
    });
    return h + '</tbody></table></div>';
  },

  kpis(list) {
    if (!list || !list.length) return '';
    return '<div class="kpis">' + list.map(s => `
      <div class="kpi ${s.tone || ''}">
        <div class="l">${s.label}</div>
        <div class="v">${s.value === null || s.value === undefined ? '-' :
        (typeof s.value === 'number' ? s.value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : s.value)}<span class="u">${s.unit || ''}</span></div>
      </div>`).join('') + '</div>';
  },

  notes(list) {
    if (!list || !list.length) return '';
    return '<div class="notes">' + list.map(n =>
      `<div class="note">${String(n).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</div>`).join('') + '</div>';
  },

  /* ---------- 部位下拉 ---------- */
  wbsOptions(sel) {
    let h = '<option value="">全部部位</option>';
    (this.meta.wbs_flat || []).forEach(w => {
      const pad = '　'.repeat((w.level || 1) - 1);
      h += `<option value="${w.id}" ${String(sel) === String(w.id) ? 'selected' : ''}>${pad}${w.name}</option>`;
    });
    return h;
  },

  /* ---------- 日期工具 ---------- */
  today() { return new Date().toISOString().slice(0, 10); },
  daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); },
  monthStart() { const d = new Date(); return d.toISOString().slice(0, 8) + '01'; },

  /* ---------- 下载 ---------- */
  download(res) {
    const a = document.createElement('a');
    a.href = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + res.b64;
    a.download = res.filename;
    a.click();
    this.ok('已导出：' + res.filename);
  },

  esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
};
