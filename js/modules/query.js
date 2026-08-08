/* 查询中心：所有报表在这里自动生成按钮，点一下就出数 */
App.reg({
  key: 'query', name: '查询中心', icon: '▤', group: '查询分析',
  sub: '点按钮取数 · 报表由后端自动注册',

  render(el) {
    const reps = App.meta.reports || [];
    const groups = {};
    reps.forEach(r => (groups[r.group] ||= []).push(r));

    el.innerHTML = `
      <div class="card">
        <h3>选择报表 <span class="tag">共 ${reps.length} 个，新增报表会自动出现在这里</span></h3>
        ${Object.keys(groups).map(g => `
          <div style="margin-bottom:10px">
            <div class="dim" style="margin-bottom:6px">${g}</div>
            <div class="rep-grid">
              ${groups[g].map(r => `
                <div class="rep-btn" data-k="${r.key}">
                  <div class="n">${r.name}</div>
                  <div class="d">${r.desc || ''}</div>
                </div>`).join('')}
            </div>
          </div>`).join('')}
      </div>
      <div id="qparam"></div>
      <div id="qresult"></div>`;

    el.querySelectorAll('.rep-btn').forEach(b => b.onclick = () => {
      el.querySelectorAll('.rep-btn').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      this.showParams(reps.find(r => r.key === b.dataset.k));
    });

    // 默认打开第一个
    const first = el.querySelector('.rep-btn');
    if (first) first.click();
  },

  showParams(rep) {
    this.rep = rep;
    const box = document.getElementById('qparam');
    box.innerHTML = `
      <div class="card">
        <h3>${rep.name} <span class="tag">${rep.desc || ''}</span></h3>
        <div class="row" id="pform">${rep.params.map(p => this.ctrl(p)).join('')}</div>
        <div class="sp14"></div>
        <div class="row">
          <button class="btn-p" id="btn-run">查询</button>
          <button id="btn-exp">导出 Excel</button>
          <span class="dim" id="qtip"></span>
        </div>
      </div>`;
    document.getElementById('btn-run').onclick = () => this.run();
    document.getElementById('btn-exp').onclick = () => this.exp();
    document.getElementById('qresult').innerHTML = '';
    // 快捷区间
    const df = box.querySelector('[name=date_from]');
    if (df) {
      const bar = document.createElement('div');
      bar.className = 'row';
      bar.style.marginTop = '10px';
      bar.innerHTML = ['本月', '上月', '近7天', '近30天', '近90天', '全部']
        .map(t => `<button class="btn-sm" data-q="${t}">${t}</button>`).join('');
      box.querySelector('.card').insertBefore(bar, box.querySelector('.sp14'));
      bar.querySelectorAll('button').forEach(b => b.onclick = () => {
        const [a, z] = this.range(b.dataset.q);
        box.querySelector('[name=date_from]').value = a;
        box.querySelector('[name=date_to]').value = z;
        this.run();
      });
    }
    this.run();
  },

  range(t) {
    const d = new Date(), z = App.today();
    const iso = x => x.toISOString().slice(0, 10);
    if (t === '本月') return [iso(d).slice(0, 8) + '01', z];
    if (t === '上月') {
      const s = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const e = new Date(d.getFullYear(), d.getMonth(), 0);
      return [iso(s), iso(e)];
    }
    if (t === '近7天') return [App.daysAgo(6), z];
    if (t === '近30天') return [App.daysAgo(29), z];
    if (t === '近90天') return [App.daysAgo(89), z];
    return ['2000-01-01', '2099-12-31'];
  },

  ctrl(p) {
    const w = p.type === 'date' ? 140 : p.type === 'wbs' ? 200 : p.type === 'multi' || p.type === 'material_cat' ? 240 : 150;
    let inner = '';
    if (p.type === 'date') {
      const def = p.key === 'date_from' ? App.monthStart() : App.today();
      inner = `<input type="date" name="${p.key}" value="${def}" style="width:${w}px">`;
    } else if (p.type === 'wbs') {
      inner = `<select name="${p.key}" style="width:${w}px">${App.wbsOptions()}</select>`;
    } else if (p.type === 'select') {
      inner = `<select name="${p.key}" style="width:${w}px">${(p.options || []).map(o =>
        `<option value="${o.v}" ${o.v === p.default ? 'selected' : ''}>${o.t}</option>`).join('')}</select>`;
    } else if (p.type === 'material_cat' || p.type === 'multi') {
      const src = p.type === 'material_cat' ? App.meta.material_cats :
        (p.source === 'trade' ? App.meta.trades : App.meta.measure_cats);
      inner = `<div class="row" name="${p.key}" data-multi="1" style="gap:8px;padding:5px 0">
        ${(src || []).map(c => `<label class="ck"><input type="checkbox" value="${c}">${c}</label>`).join('')
        || '<span class="dim">（暂无可选项）</span>'}</div>`;
    } else if (p.type === 'number') {
      inner = `<input type="number" name="${p.key}" value="${p.default ?? ''}" style="width:110px">`;
    } else {
      inner = `<input type="text" name="${p.key}" placeholder="${p.label}" style="width:${w}px">`;
    }
    return `<div class="fld"><label>${p.label}${p.required ? '<span class="req">*</span>' : ''}</label>${inner}</div>`;
  },

  collect() {
    const f = document.getElementById('pform');
    const o = {};
    f.querySelectorAll('input[name],select[name]').forEach(i => {
      if (i.type !== 'checkbox') o[i.name] = i.value;
    });
    f.querySelectorAll('[data-multi]').forEach(d => {
      o[d.getAttribute('name')] = [...d.querySelectorAll('input:checked')].map(x => x.value);
    });
    return o;
  },

  async run() {
    const box = document.getElementById('qresult');
    box.innerHTML = '<div class="loading">查询中</div>';
    try {
      const p = this.collect();
      const t0 = Date.now();
      const d = await App.api('/report/' + this.rep.key, p);
      document.getElementById('qtip').textContent =
        `${d.rows.length} 行 · ${Date.now() - t0}ms`;
      box.innerHTML =
        App.kpis(d.summary) +
        Chart.render(d.charts) +
        `<div class="card"><h3>明细数据</h3>${App.table(d)}</div>` +
        (d.notes && d.notes.length ? `<div class="card"><h3>分析与建议</h3>${App.notes(d.notes)}</div>` : '');
    } catch (e) {
      box.innerHTML = `<div class="msg err">${e.message}</div>`;
    }
  },

  async exp() {
    try {
      App.toast('正在生成…');
      const p = this.collect();
      p.report_key = this.rep.key;
      p.title = this.rep.name;
      App.download(await App.api('/export/report', p));
    } catch (e) { App.err(e.message); }
  }
});
