/* 数据导入：通用列映射，不挑表头格式 */
App.reg({
  key: 'import', name: '数据导入', icon: '↧', group: '数据管理',
  sub: 'Excel → 列映射 → 入库',

  async render(el) {
    this.targets = await App.api('/import/targets', {});
    this.templates = await App.api('/import/templates', {});
    this.file = null;

    el.innerHTML = `
      <div class="card">
        <h3>第 1 步 · 选择数据类型</h3>
        <div class="rep-grid">
          ${Object.keys(this.targets).map(k => `
            <div class="rep-btn tgt" data-k="${k}">
              <div class="n">${this.targets[k].label}</div>
              <div class="d">${this.targets[k].fields.filter(f => f.required)
        .map(f => f.label).join('、')} 为必填</div>
            </div>`).join('')}
        </div>
        <div class="sp14"></div>
        <div class="row">
          <button class="btn-sm" id="dl-tpl">下载标准模板</button>
          <span class="dim">照模板填最省事；已有的表也能直接导，靠下一步的列映射适配。</span>
        </div>
      </div>

      <div class="card">
        <h3>第 2 步 · 上传 Excel</h3>
        <div class="row">
          <input type="file" id="xls" accept=".xlsx,.xlsm">
          <select id="sheet" style="min-width:160px;display:none"></select>
          <div class="fld"><label>表头在第几行</label>
            <input type="number" id="hrow" value="1" min="1" max="20" style="width:80px"></div>
          <button id="btn-read" disabled>读取表头</button>
        </div>
        <div class="dim" style="margin-top:8px">
          只支持 .xlsx（老的 .xls 请先另存为 xlsx）。文件不会上传到任何外部服务器。
        </div>
      </div>

      <div id="map-area"></div>`;

    el.querySelectorAll('.tgt').forEach(b => b.onclick = () => {
      el.querySelectorAll('.tgt').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      this.target = b.dataset.k;
      if (this.file) this.readHeaders();
    });
    el.querySelector('.tgt').click();

    document.getElementById('xls').onchange = e => this.upload(e.target.files[0]);
    document.getElementById('btn-read').onclick = () => this.readHeaders();
    document.getElementById('sheet').onchange = () => this.readHeaders();
    document.getElementById('dl-tpl').onclick = async () => {
      try { App.download(await App.api('/export/template', { target: this.target })); }
      catch (e) { App.err(e.message); }
    };
  },

  async upload(f) {
    if (!f) return;
    App.toast('正在上传…');
    const b64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(f);
    });
    try {
      const r = await App.api('/upload', { filename: f.name, content: b64 });
      this.file = r.file;
      App.ok(`已上传 ${f.name}（${(r.size / 1024).toFixed(0)} KB）`);
      const s = await App.api('/import/sheets', { file: this.file });
      const sel = document.getElementById('sheet');
      sel.innerHTML = s.sheets.map(n => `<option>${App.esc(n)}</option>`).join('');
      sel.style.display = s.sheets.length > 1 ? '' : 'none';
      document.getElementById('btn-read').disabled = false;
      this.readHeaders();
    } catch (e) { App.err(e.message); }
  },

  async readHeaders() {
    if (!this.file) return App.err('先上传文件');
    const area = document.getElementById('map-area');
    area.innerHTML = '<div class="loading">解析中</div>';
    try {
      const d = await App.api('/import/preview', {
        file: this.file,
        sheet: document.getElementById('sheet').value,
        header_row: document.getElementById('hrow').value,
        target: this.target
      });
      this.preview = d;
      this.renderMap(area, d);
    } catch (e) { area.innerHTML = `<div class="msg err">${e.message}</div>`; }
  },

  renderMap(area, d) {
    const t = this.targets[this.target];
    const tpls = this.templates.filter(x => x.target === this.target);
    const opts = ['<option value="">（不导入）</option>']
      .concat(d.headers.map(h => `<option value="${App.esc(h)}">${App.esc(h)}</option>`)).join('');

    area.innerHTML = `
      <div class="card">
        <h3>第 3 步 · 列映射
          <span class="tag">系统已自动匹配了 ${Object.keys(d.guess).length} 列，核对一下</span></h3>
        ${tpls.length ? `<div class="row" style="margin-bottom:12px">
          <div class="fld"><label>套用已保存的模板</label>
            <select id="tpl-sel" style="min-width:220px">
              <option value="">-- 不套用 --</option>
              ${tpls.map(t => `<option value="${t.id}">${App.esc(t.name)}</option>`).join('')}
            </select></div></div>` : ''}

        <table class="map-tbl" style="width:100%;font-size:12.5px">
          <thead><tr>
            <th style="width:170px">数据库字段</th>
            <th style="width:250px">对应 Excel 列</th>
            <th style="width:200px">或填固定值（整表统一）</th>
            <th>示例数据</th>
          </tr></thead>
          <tbody>
          ${t.fields.map(f => `<tr>
            <td>${f.label}${f.required ? '<span class="req">*</span>' : ''}</td>
            <td><select data-f="${f.key}" class="mp">${opts}</select></td>
            <td>${this.fixedCtrl(f)}</td>
            <td class="dim" data-ex="${f.key}"></td>
          </tr>`).join('')}
          </tbody>
        </table>

        <div class="sp14"></div>
        <div class="row">
          <label class="ck"><input type="checkbox" id="save-tpl"> 保存为模板</label>
          <input type="text" id="tpl-name" placeholder="模板名称，如：月度产值台账" style="width:220px;display:none">
        </div>
        <div class="sp14"></div>
        <div class="row">
          <label class="ck"><input type="checkbox" id="overwrite"> 覆盖导入（按业务键替换重复行）</label>
          <span class="dim">勾选后，表中与本次数据「日期 + 部位 + 清单」相同的旧记录会被新值替换，而不是新增重复行</span>
        </div>
        <div class="sp14"></div>
        <div class="row">
          <button class="btn-p" id="btn-import">开始导入</button>
          <span class="dim">共 ${d.rows.length >= 15 ? '15+' : d.rows.length} 行预览，实际按整表导入</span>
        </div>
      </div>

      <div class="card">
        <h3>数据预览 <span class="tag">前 ${d.rows.length} 行</span></h3>
        <div class="tbl-wrap" style="max-height:300px"><table class="pv-tbl">
          <thead><tr>${d.headers.map(h => `<th>${App.esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${d.rows.map(r => `<tr>${d.headers.map((_, i) =>
      `<td>${App.esc(r[i] || '')}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
      </div>

      <div id="imp-result"></div>`;

    // 应用自动猜测
    Object.keys(d.guess).forEach(k => {
      const s = area.querySelector(`select[data-f="${k}"]`);
      if (s) s.value = d.guess[k];
    });
    const refreshEx = () => {
      area.querySelectorAll('.mp').forEach(s => {
        const cell = area.querySelector(`[data-ex="${s.dataset.f}"]`);
        const i = d.headers.indexOf(s.value);
        cell.textContent = (i >= 0 && d.rows.length) ?
          d.rows.slice(0, 3).map(r => r[i]).filter(x => x !== '').join(' | ') : '';
      });
    };
    area.querySelectorAll('.mp').forEach(s => s.onchange = refreshEx);
    refreshEx();

    const tplSel = document.getElementById('tpl-sel');
    if (tplSel) tplSel.onchange = () => {
      const t2 = tpls.find(x => String(x.id) === tplSel.value);
      if (!t2) return;
      area.querySelectorAll('.mp').forEach(s => s.value = t2.mapping[s.dataset.f] || '');
      Object.keys(t2.fixed_vals || {}).forEach(k => {
        const i = area.querySelector(`[data-fx="${k}"]`);
        if (i) i.value = t2.fixed_vals[k];
      });
      refreshEx();
      App.ok('已套用模板：' + t2.name);
    };

    document.getElementById('save-tpl').onchange = e => {
      document.getElementById('tpl-name').style.display = e.target.checked ? '' : 'none';
    };
    document.getElementById('btn-import').onclick = () => this.doImport(area);
  },

  fixedCtrl(f) {
    if (f.key === 'biz_date' || f.key.includes('finish') || f.key.includes('start') || f.key.includes('_end'))
      return `<input type="date" data-fx="${f.key}" style="width:100%">`;
    if (f.key === 'wbs_name')
      return `<select data-fx="${f.key}" style="width:100%">
        <option value="">（用Excel列）</option>
        ${(App.meta.wbs_flat || []).map(w =>
        `<option value="${App.esc(w.name)}">${'　'.repeat((w.level || 1) - 1)}${App.esc(w.name)}</option>`).join('')}
      </select>`;
    if (f.key === 'category' && this.target === 'material_rec')
      return `<select data-fx="${f.key}" style="width:100%"><option value="">（用Excel列）</option>
        ${(App.meta.material_cats || []).map(c => `<option>${App.esc(c)}</option>`).join('')}</select>`;
    if (f.key === 'cost_type')
      return `<select data-fx="${f.key}" style="width:100%"><option value="">（用Excel列）</option>
        ${(App.meta.cost_types || []).map(c => `<option>${App.esc(c)}</option>`).join('')}</select>`;
    return `<input type="text" data-fx="${f.key}" placeholder="留空则用Excel列" style="width:100%">`;
  },

  async doImport(area) {
    const mapping = {}, fixed = {};
    area.querySelectorAll('.mp').forEach(s => { if (s.value) mapping[s.dataset.f] = s.value; });
    area.querySelectorAll('[data-fx]').forEach(i => { if (i.value) fixed[i.dataset.fx] = i.value; });

    const req = this.targets[this.target].fields.filter(f => f.required);
    const miss = req.filter(f => !mapping[f.key] && !fixed[f.key]);
    if (miss.length) return App.err('必填字段未映射：' + miss.map(f => f.label).join('、'));

    const box = document.getElementById('imp-result');
    box.innerHTML = '<div class="loading">导入中</div>';
    try {
      const r = await App.api('/import/run', {
        file: this.file,
        sheet: document.getElementById('sheet').value,
        header_row: document.getElementById('hrow').value,
        target: this.target, mapping, fixed,
        overwrite: document.getElementById('overwrite').checked,
        save_template: document.getElementById('save-tpl').checked,
        template_name: document.getElementById('tpl-name').value
      });
      box.innerHTML = `
        <div class="card">
          <h3>导入结果</h3>
          <div class="msg ok">成功写入 ${r.inserted} 条（源表 ${r.total_rows} 行，
            跳过 ${r.skipped} 行必填为空的行）${r.replaced ? '，覆盖替换了 ' + r.replaced + ' 条旧记录' : ''}</div>
          ${r.errors.length ? `<div class="msg err">
            ${r.errors.length} 处问题：<br>${r.errors.map(App.esc).join('<br>')}</div>` : ''}
          <div class="row">
            <button class="btn-dg btn-sm" id="rb">撤销这批导入</button>
            <button class="btn-sm" onclick="location.hash='records'">去看数据</button>
            <span class="dim">批次号 ${r.batch_id}</span>
          </div>
        </div>`;
      document.getElementById('rb').onclick = () => App.confirm(
        '确定撤销这批导入吗？将删除本次写入的 ' + r.inserted + ' 条记录。',
        async () => {
          await App.api('/import/rollback', { batch_id: r.batch_id });
          App.ok('已撤销');
          box.innerHTML = '';
        });
      await App.reloadMeta();
    } catch (e) {
      box.innerHTML = `<div class="msg err">${e.message}</div>`;
    }
  }
});
