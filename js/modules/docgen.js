/* 文字导入与输出：输入文字 + 数据库变量，一键生成给不同单位的话。
   变量两类：① 项目概况里的「数据名称」；② 按日期区间统计的指标。
   模板存 localStorage（单人本地应用，无需入库）。 */
App.reg({
  key: 'docgen', name: '文字导入与输出', icon: '✎', group: '查询分析',
  sub: '输入文字 + 数据库变量，一键生成给不同单位的话',

  async render(el) {
    this.el = el;
    this.tpls = this.loadTpls();
    this.vars = {};
    this.df = App.monthStart();
    this.dt = App.today();
    await this.draw();
  },

  loadTpls() {
    try {
      const s = localStorage.getItem('docgen_tpls');
      if (s) return JSON.parse(s);
    } catch (e) { /* ignore */ }
    return this.presets();
  },
  presets() {
    return [
      { name: '对业主/监理月报段落', content:
`截至{区间结束日期}，本项目累计完成产值{累计产值(万元)}万元，占计划{累计计划产值(万元)}万元的{产值完成率(%)}%。
材料累计消耗{材料消耗总额(万元)}万元，人工费{人工费(万元)}万元；当前总成本约{总成本(万元)}万元，实现盈亏{盈亏(万元)}万元（毛利率{毛利率(%)}%）。
现场峰值出勤{峰值出勤人数}人，在场班组{在场班组数}个；共落实措施{措施条数}项，其中效果正向{效果正向条数}项。
当前滞后节点{滞后节点数}个，最大滞后{最大滞后天数}天。` },
      { name: '对上级单位简报', content:
`【{项目名}】截至{区间结束日期}，累计产值{累计产值(万元)}万元，产值完成率{产值完成率(%)}%，盈亏{盈亏(万元)}万元。
滞后节点{滞后节点数}个，最大滞后{最大滞后天数}天；已采取纠偏措施{措施条数}项。` },
      { name: '现场生产例会通报', content:
`本期（{区间开始日期}至{区间结束日期}）完成产值{累计产值(万元)}万元。
主要材料消耗：{主要材料}{主要材料金额(万元)}万元。
进度方面：滞后节点{滞后节点数}个，最大滞后{最大滞后天数}天，请相关班组本周内纠偏。` },
    ];
  },
  saveTpls() { try { localStorage.setItem('docgen_tpls', JSON.stringify(this.tpls)); } catch (e) {} },

  async draw() {
    const el = this.el;
    const firstTpl = (this.tpls[0] || {}).content || '';
    el.innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between;align-items:flex-end">
          <div>
            <h3 style="margin:0">文字导入与输出</h3>
            <div class="dim" style="margin-top:4px">
              左边写文字、用花括号插入变量（如 {项目名} {累计产值(万元)}），右边从数据库取数一键生成。
              适合把同一套数据换成不同口径发给不同层级的单位。
            </div>
          </div>
          <div class="row">
            <div class="fld" style="width:140px"><label>开始日期</label><input type="date" id="dg-from" value="${this.df}"></div>
            <div class="fld" style="width:140px"><label>结束日期</label><input type="date" id="dg-to" value="${this.dt}"></div>
            <button class="btn-sm" id="dg-refresh">刷新变量</button>
          </div>
        </div>
        <div class="sp14"></div>
        <div style="display:flex;gap:16px;align-items:flex-start">
          <div style="flex:1;min-width:0">
            <div class="row" style="justify-content:space-between">
              <strong>文字模板（导入区）</strong>
              <div class="row">
                <select id="dg-tpl" class="btn-sm" style="min-width:190px">
                  <option value="">— 载入预设/已存模板 —</option>
                  ${this.tpls.map((t, i) => `<option value="${i}">${App.esc(t.name)}</option>`).join('')}
                </select>
                <button class="btn-sm" id="dg-savetpl">存为模板</button>
              </div>
            </div>
            <textarea id="dg-in" rows="15" style="width:100%;margin-top:8px;font-family:inherit;line-height:1.75;font-size:13.5px">${App.esc(this.tpls[0].content)}</textarea>
          </div>
          <div style="width:300px;flex:none" id="dg-vars"></div>
        </div>
        <div class="sp14"></div>
        <div class="row">
          <button class="btn-p" id="dg-gen">生成文字</button>
          <button class="btn-sm" id="dg-copy">复制结果</button>
          <button class="btn-sm" id="dg-dl">导出 txt</button>
          <button class="btn-sm" id="dg-clear">清空</button>
        </div>
        <div class="sp14"></div>
        <strong>生成结果（输出区）</strong>
        <div id="dg-out" class="doc-out"></div>
      </div>`;

    await this.refreshVars();
    el.querySelector('#dg-refresh').onclick = () => this.refreshVars();
    el.querySelector('#dg-gen').onclick = () => this.gen();
    el.querySelector('#dg-clear').onclick = () => { document.getElementById('dg-in').value = ''; };
    el.querySelector('#dg-copy').onclick = () => this.copy();
    el.querySelector('#dg-dl').onclick = () => this.download();
    el.querySelector('#dg-tpl').onchange = e => {
      const i = e.target.value;
      if (i === '') return;
      document.getElementById('dg-in').value = this.tpls[parseInt(i, 10)].content;
    };
    el.querySelector('#dg-savetpl').onclick = () => this.saveTpl();
  },

  async refreshVars() {
    this.df = document.getElementById('dg-from').value;
    this.dt = document.getElementById('dg-to').value;
    try {
      const r = await App.api('/docgen/vars', { date_from: this.df, date_to: this.dt });
      this.vars = r.vars || {};
      this.renderVarsPanel();
      App.ok('变量已刷新（' + Object.keys(this.vars).length + ' 个）');
    } catch (e) { App.err(e.message); }
  },

  renderVarsPanel() {
    const box = document.getElementById('dg-vars');
    if (!box) return;
    const keys = Object.keys(this.vars);
    const metricKeys = keys.filter(k => /万元|%|天|人|个|条|率/.test(k));
    const profKeys = keys.filter(k => !metricKeys.includes(k));
    const chip = k => `<span class="var-chip" data-k="${App.esc(k)}" title="${App.esc(String(this.vars[k]))}">{${App.esc(k)}}</span>`;
    box.innerHTML = `
      <div class="dim" style="margin-bottom:6px">点击变量插入到光标处</div>
      <div class="vg">项目概况</div>
      <div class="chips">${profKeys.map(chip).join('') || '<span class="dim">（暂无，去「项目概况」录入）</span>'}</div>
      <div class="vg" style="margin-top:12px">统计指标（${App.esc(this.df)} ~ ${App.esc(this.dt)}）</div>
      <div class="chips">${metricKeys.map(chip).join('') || '<span class="dim">（暂无数据）</span>'}</div>`;
    box.querySelectorAll('.var-chip').forEach(c => c.onclick = () => this.insert(c.dataset.k));
  },

  insert(k) {
    const ta = document.getElementById('dg-in');
    const tok = '{' + k + '}';
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + tok + ta.value.slice(e);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + tok.length;
  },

  gen() {
    const tpl = document.getElementById('dg-in').value;
    let out = tpl;
    Object.keys(this.vars).forEach(k => {
      const val = this.vars[k];
      out = out.split('{' + k + '}').join(val === '' ? '（空）' : String(val));
    });
    // 未匹配的占位符标出来
    out = out.replace(/\{[^{}\n]+\}/g, m => '⚠' + m + '（未匹配）');
    document.getElementById('dg-out').textContent = out;
  },

  copy() {
    const t = document.getElementById('dg-out').textContent;
    if (!t) return App.err('请先点「生成文字」');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(() => App.ok('已复制到剪贴板'), () => App.err('复制失败'));
    } else {
      App.err('当前环境不支持复制，请手动选择文本复制');
    }
  },

  download() {
    const t = document.getElementById('dg-out').textContent;
    if (!t) return App.err('请先点「生成文字」');
    const blob = new Blob([t], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '项目数据文字_' + App.today() + '.txt';
    a.click();
    App.ok('已导出 txt');
  },

  saveTpl() {
    const name = prompt('模板名称：');
    if (!name) return;
    const content = document.getElementById('dg-in').value;
    this.tpls.push({ name, content });
    this.saveTpls();
    App.ok('已存为模板：' + name);
    this.draw();
  }
});
