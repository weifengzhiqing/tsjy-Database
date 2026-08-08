/* 基础数据：项目 / 部位节点 / 材料字典 / 班组。通用 CRUD 组件在这里定义，其他模块复用。 */

/* 字段元数据：加字段只改这里 */
const SCHEMA = {
  project: [
    { k: 'code', l: '编码', w: 100 }, { k: 'name', l: '项目名称', w: 220, req: 1 },
    { k: 'start_date', l: '开工日期', t: 'date' }, { k: 'end_date', l: '竣工日期', t: 'date' },
    { k: 'contract_amount', l: '合同额(元)', t: 'money' },
    { k: 'owner_unit', l: '业主单位', w: 160 }, { k: 'remark', l: '备注', w: 200 },
  ],
  wbs: [
    { k: 'code', l: '编码', w: 90 }, { k: 'name', l: '部位名称', w: 200, req: 1 },
    { k: 'parent_id', l: '上级部位', t: 'wbs', w: 160 },
    { k: 'plan_start', l: '计划开工', t: 'date' }, { k: 'plan_end', l: '计划完工', t: 'date' },
    { k: 'actual_start', l: '实际开工', t: 'date' }, { k: 'actual_end', l: '实际完工', t: 'date' },
    { k: 'plan_qty', l: '计划工程量', t: 'num' }, { k: 'qty_unit', l: '单位', w: 70 },
    { k: 'plan_amount', l: '计划产值', t: 'money' }, { k: 'budget_cost', l: '预算成本', t: 'money' },
    { k: 'is_milestone', l: '关键节点', t: 'bool' },
    { k: 'sort_no', l: '排序', t: 'num' }, { k: 'remark', l: '备注', w: 160 },
  ],
  material: [
    { k: 'code', l: '编码', w: 90 }, { k: 'name', l: '材料名称', w: 180, req: 1 },
    { k: 'category', l: '类型', t: 'sel', src: 'material_cats', w: 110 },
    { k: 'spec', l: '规格型号', w: 130 }, { k: 'unit', l: '单位', w: 70 },
    { k: 'std_price', l: '标准单价', t: 'money' },
    { k: 'loss_rate', l: '允许损耗%', t: 'num' }, { k: 'remark', l: '备注', w: 150 },
  ],
  team: [
    { k: 'code', l: '编码', w: 90 }, { k: 'name', l: '班组名称', w: 170, req: 1 },
    { k: 'type', l: '类型', t: 'sel', opts: ['劳务队', '自有工班', '专业分包'], w: 110 },
    { k: 'trade', l: '工种', t: 'sel', src: 'trades', w: 110 },
    { k: 'leader', l: '负责人', w: 100 }, { k: 'contact', l: '联系方式', w: 130 },
    { k: 'day_wage', l: '工日单价', t: 'money' }, { k: 'remark', l: '备注', w: 150 },
  ],
  measure: [
    { k: 'biz_date', l: '日期', t: 'date', req: 1 },
    { k: 'wbs_id', l: '部位', t: 'wbs', w: 160 },
    { k: 'category', l: '类型', t: 'sel', src: 'measure_cats', w: 90 },
    { k: 'issue', l: '问题/偏差', t: 'area', w: 220 },
    { k: 'content', l: '采取措施', t: 'area', w: 260, req: 1 },
    { k: 'owner', l: '责任人', w: 90 },
    { k: 'status', l: '状态', t: 'sel', opts: ['计划中', '执行中', '已完成', '已关闭'], w: 90 },
    { k: 'plan_finish', l: '计划完成', t: 'date' }, { k: 'actual_finish', l: '实际完成', t: 'date' },
    { k: 'invest_amt', l: '投入费用', t: 'money' }, { k: 'remark', l: '备注', w: 150 },
  ],
  measure_effect: [
    { k: 'measure_id', l: '措施ID', t: 'num', req: 1 },
    { k: 'eval_date', l: '评估日期', t: 'date' },
    { k: 'metric', l: '指标名称', w: 150 }, { k: 'unit', l: '单位', w: 70 },
    { k: 'before_val', l: '措施前', t: 'num' }, { k: 'after_val', l: '措施后', t: 'num' },
    { k: 'benefit_amt', l: '折算效益(元)', t: 'money' },
    { k: 'direction', l: '效果方向', t: 'sel', opts: ['正向', '负向', '无明显影响'], w: 100 },
    { k: 'score', l: '评分1-5', t: 'num' },
    { k: 'conclusion', l: '结论', t: 'area', w: 240 },
  ],
  output_rec: [
    { k: 'biz_date', l: '日期', t: 'date', req: 1 }, { k: 'wbs_id', l: '部位', t: 'wbs', w: 160 },
    { k: 'item_name', l: '清单/工序', w: 180 }, { k: 'unit', l: '单位', w: 70 },
    { k: 'qty', l: '工程量', t: 'num' }, { k: 'price', l: '单价', t: 'money' },
    { k: 'amount', l: '产值金额', t: 'money' }, { k: 'plan_amount', l: '计划产值', t: 'money' },
    { k: 'remark', l: '备注', w: 150 },
  ],
  material_rec: [
    { k: 'biz_date', l: '日期', t: 'date', req: 1 }, { k: 'wbs_id', l: '部位', t: 'wbs', w: 160 },
    { k: 'material_name', l: '材料名称', w: 160, req: 1 },
    { k: 'category', l: '类型', t: 'sel', src: 'material_cats', w: 100 },
    { k: 'spec', l: '规格', w: 110 }, { k: 'unit', l: '单位', w: 70 },
    { k: 'qty', l: '实耗量', t: 'num' }, { k: 'theory_qty', l: '理论量', t: 'num' },
    { k: 'price', l: '单价', t: 'money' }, { k: 'amount', l: '金额', t: 'money' },
    { k: 'remark', l: '备注', w: 140 },
  ],
  labor_rec: [
    { k: 'biz_date', l: '日期', t: 'date', req: 1 }, { k: 'wbs_id', l: '部位', t: 'wbs', w: 160 },
    { k: 'team_name', l: '班组', w: 140, req: 1 },
    { k: 'trade', l: '工种', t: 'sel', src: 'trades', w: 100 },
    { k: 'person_count', l: '出勤人数', t: 'num' }, { k: 'work_hours', l: '工时', t: 'num' },
    { k: 'unit_cost', l: '工日单价', t: 'money' }, { k: 'amount', l: '人工费', t: 'money' },
    { k: 'remark', l: '备注', w: 140 },
  ],
  cost_rec: [
    { k: 'biz_date', l: '日期', t: 'date', req: 1 }, { k: 'wbs_id', l: '部位', t: 'wbs', w: 160 },
    { k: 'cost_type', l: '成本类型', t: 'sel', src: 'cost_types', w: 120 },
    { k: 'subject', l: '明细科目', w: 160 }, { k: 'amount', l: '发生金额', t: 'money', req: 1 },
    { k: 'budget_amt', l: '预算金额', t: 'money' }, { k: 'remark', l: '备注', w: 150 },
  ],
  progress_rec: [
    { k: 'biz_date', l: '日期', t: 'date', req: 1 }, { k: 'wbs_id', l: '部位', t: 'wbs', w: 160 },
    { k: 'item_name', l: '形象进度项', w: 170, req: 1 }, { k: 'unit', l: '单位', w: 70 },
    { k: 'plan_qty', l: '计划量', t: 'num' }, { k: 'actual_qty', l: '完成量', t: 'num' },
    { k: 'cum_plan_qty', l: '累计计划', t: 'num' }, { k: 'cum_actual_qty', l: '累计完成', t: 'num' },
    { k: 'remark', l: '备注', w: 140 },
  ],
};

/* ---------- 通用 CRUD 组件 ---------- */
const CRUD = {
  async mount(el, table, opts = {}) {
    const flds = SCHEMA[table];
    el.innerHTML = `
      <div class="card">
        <h3>${opts.title || table} <span class="tag" id="cnt-${table}"></span></h3>
        <div class="row">
          <input type="text" id="kw-${table}" placeholder="搜索关键字" style="width:180px">
          ${flds.some(f => f.k === 'biz_date') ? `
            <input type="date" id="df-${table}" style="width:140px">
            <span class="dim">至</span>
            <input type="date" id="dt-${table}" style="width:140px">` : ''}
          <button class="btn-sm" id="q-${table}">查询</button>
          <span class="sp" style="flex:1"></span>
          <button class="btn-p btn-sm" id="add-${table}">＋ 新增</button>
          <button class="btn-sm" id="exp-${table}">导出</button>
          <button class="btn-dg btn-sm" id="del-${table}">删除选中</button>
        </div>
        <div class="sp14"></div>
        <div id="tb-${table}"><div class="loading">加载中</div></div>
      </div>`;

    const load = async () => {
      const box = document.getElementById('tb-' + table);
      const d = await App.api('/crud/list', {
        table,
        keyword: document.getElementById('kw-' + table).value,
        date_from: (document.getElementById('df-' + table) || {}).value,
        date_to: (document.getElementById('dt-' + table) || {}).value,
        filters: opts.filters || {}
      });
      document.getElementById('cnt-' + table).textContent =
        `共 ${d.total} 条${d.total > d.rows.length ? `，显示前 ${d.rows.length} 条` : ''}`;
      if (!d.rows.length) { box.innerHTML = '<div class="tbl-wrap"><div class="empty">没有数据</div></div>'; return; }
      box.innerHTML = `<div class="tbl-wrap"><table>
        <thead><tr><th style="width:34px"><input type="checkbox" id="ca-${table}"></th>
        ${flds.map(f => `<th class="${['num', 'money'].includes(f.t) ? 'num' : ''}"
          ${f.w ? `style="min-width:${f.w}px"` : ''}>${f.l}</th>`).join('')}
        <th style="width:76px">操作</th></tr></thead>
        <tbody>${d.rows.map(r => `<tr>
          <td><input type="checkbox" class="rk" value="${r.id}"></td>
          ${flds.map(f => `<td class="${['num', 'money'].includes(f.t) ? 'num' : ''}">
            ${this.disp(r[f.k], f)}</td>`).join('')}
          <td><button class="btn-sm ed" data-id="${r.id}">编辑</button></td>
        </tr>`).join('')}</tbody></table></div>`;
      document.getElementById('ca-' + table).onclick = e =>
        box.querySelectorAll('.rk').forEach(c => c.checked = e.target.checked);
      box.querySelectorAll('.ed').forEach(b => b.onclick = () =>
        this.edit(table, d.rows.find(x => String(x.id) === b.dataset.id), load, opts));
    };

    document.getElementById('q-' + table).onclick = load;
    document.getElementById('kw-' + table).onkeydown = e => { if (e.key === 'Enter') load(); };
    document.getElementById('add-' + table).onclick = () =>
      this.edit(table, opts.defaults ? { ...opts.defaults } : {}, load, opts);
    document.getElementById('exp-' + table).onclick = async () => {
      try { App.download(await App.api('/export/table', { table })); } catch (e) { App.err(e.message); }
    };
    document.getElementById('del-' + table).onclick = () => {
      const ids = [...document.querySelectorAll(`#tb-${table} .rk:checked`)].map(c => +c.value);
      if (!ids.length) return App.err('先勾选要删除的行');
      App.confirm(`确定删除选中的 ${ids.length} 条记录？此操作不可撤销。`, async () => {
        await App.api('/crud/delete', { table, ids });
        App.ok('已删除 ' + ids.length + ' 条');
        load();
      });
    };
    await load();
    return load;
  },

  disp(v, f) {
    if (v === null || v === undefined || v === '') return '<span class="dim">-</span>';
    if (f.t === 'wbs') {
      const w = (App.meta.wbs_flat || []).find(x => x.id === v);
      return w ? App.esc(w.name) : '<span class="dim">-</span>';
    }
    if (f.t === 'bool') return v ? '<span class="pill good">是</span>' : '<span class="dim">否</span>';
    if (f.t === 'money') return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (f.t === 'num') return App.fmt(v, 'num');
    const s = App.esc(v);
    return s.length > 40 ? `<span class="cell-clip" title="${s}">${s}</span>` : s;
  },

  edit(table, row, reload, opts = {}) {
    const flds = SCHEMA[table];
    const box = document.createElement('div');
    box.className = 'form-grid';
    box.innerHTML = flds.map(f => {
      const v = row[f.k] ?? '';
      let ctl;
      if (f.t === 'date') ctl = `<input type="date" data-k="${f.k}" value="${v}">`;
      else if (f.t === 'wbs') ctl = `<select data-k="${f.k}">${App.wbsOptions(v)}</select>`;
      else if (f.t === 'bool') ctl = `<select data-k="${f.k}">
        <option value="0" ${!v ? 'selected' : ''}>否</option>
        <option value="1" ${v ? 'selected' : ''}>是</option></select>`;
      else if (f.t === 'sel') {
        const src = f.opts || App.meta[f.src] || [];
        ctl = `<input list="dl-${f.k}" data-k="${f.k}" value="${App.esc(v)}">
          <datalist id="dl-${f.k}">${src.map(o => `<option value="${App.esc(o)}">`).join('')}</datalist>`;
      }
      else if (f.t === 'area') ctl = `<textarea data-k="${f.k}" rows="3">${App.esc(v)}</textarea>`;
      else if (f.t === 'num' || f.t === 'money') ctl = `<input type="number" step="any" data-k="${f.k}" value="${v}">`;
      else ctl = `<input type="text" data-k="${f.k}" value="${App.esc(v)}">`;
      return `<div class="fld ${f.t === 'area' ? 'full' : ''}">
        <label>${f.l}${f.req ? '<span class="req">*</span>' : ''}</label>${ctl}</div>`;
    }).join('');

    App.modal({
      title: (row.id ? '编辑' : '新增') + (opts.title || table),
      body: box, width: 780,
      async onOk() {
        const data = { id: row.id };
        box.querySelectorAll('[data-k]').forEach(i => {
          let v = i.value;
          const f = flds.find(x => x.k === i.dataset.k);
          if (v === '') v = null;
          else if (['num', 'money', 'bool', 'wbs'].includes(f.t)) v = Number(v);
          data[i.dataset.k] = v;
        });
        const miss = flds.filter(f => f.req && !data[f.k]);
        if (miss.length) { App.err('必填：' + miss.map(f => f.l).join('、')); return false; }
        if (table === 'wbs') data.parent_id = data.parent_id || 0;
        await App.api('/crud/save', { table, data });
        App.ok('已保存');
        if (['wbs', 'material', 'team'].includes(table)) await App.reloadMeta();
        reload();
      }
    });
  }
};

/* ---------- 部位与计划节点：分级树形菜单 ---------- */
/* 按 单项工程→单位工程→分部工程→分项工程 四级展开，点击节点下钻，逐层编辑。*/
const WBS_TREE = {
  LEVELS: ['单项工程', '单位工程', '分部工程', '分项工程'],
  lvlName(l) { return this.LEVELS[l - 1] || ('第' + l + '级'); },

  async render(box) {
    box.innerHTML = `
      <div class="card">
        <h3>部位与计划节点 <span class="tag" id="wbst-cnt"></span></h3>
        <div class="note" style="margin-bottom:12px">
          按 <b>单项工程 → 单位工程 → 分部工程 → 分项工程</b> 四级划分。
          点击节点下钻展开下级；每个节点可「＋下级 / 编辑 / 删除」。<b>上级部位</b>用下拉框关联，
          产值、材料、进度统计时会自动含入下级。层级（level）随上级自动推算，无需手填。
        </div>
        <div class="row" style="margin-bottom:12px">
          <input type="text" id="wbst-kw" placeholder="搜索部位名称 / 编码" style="width:210px">
          <button class="btn-sm" id="wbst-exp">展开全部</button>
          <button class="btn-sm" id="wbst-col">折叠全部</button>
          <span class="sp" style="flex:1"></span>
          <button class="btn-p btn-sm" id="wbst-add">＋ 新增顶级部位</button>
        </div>
        <div id="wbst-tree" class="wbs-tree"><div class="loading">加载中</div></div>
      </div>`;

    const tree = document.getElementById('wbst-tree');

    const build = (nodes, depth = 0) => {
      if (!nodes.length) return '';
      return '<ul class="wt-ul">' + nodes.map(n => {
        const kids = n.children || [];
        const has = kids.length > 0;
        const lv = n.level || 1;
        const meta = [];
        if (n.plan_end) meta.push('计划完工 ' + n.plan_end);
        if (n.plan_amount) meta.push('计划产值 ¥' +
          Number(n.plan_amount).toLocaleString('zh-CN', { maximumFractionDigits: 0 }));
        if (n.is_milestone) meta.push('<span class="pill warn">关键节点</span>');
        return `<li class="wt-li" data-id="${n.id}">
          <div class="wt-node" data-id="${n.id}" style="padding-left:${depth * 22 + 8}px">
            <span class="wt-ar ${has ? '' : 'empty'}" data-toggle="${n.id}">${has ? '▾' : '•'}</span>
            <span class="wt-badge lv${lv}">${WBS_TREE.lvlName(lv)}</span>
            <span class="wt-name">${App.esc(n.name)}</span>
            <span class="wt-meta">${meta.join(' · ')}</span>
            <span class="wt-act">
              <button class="btn-sm wt-add" data-id="${n.id}">＋下级</button>
              <button class="btn-sm wt-ed" data-id="${n.id}">编辑</button>
              <button class="btn-sm btn-dg wt-del" data-id="${n.id}">删除</button>
            </span>
          </div>
          <div class="wt-children" id="wtc-${n.id}">${has ? build(kids, depth + 1) : ''}</div>
        </li>`;
      }).join('') + '</ul>';
    };

    const toggle = (id) => {
      const el = document.getElementById('wtc-' + id);
      if (!el || !el.children.length) return;
      const hidden = el.style.display === 'none';
      el.style.display = hidden ? '' : 'none';
      const ar = document.querySelector('.wt-ar[data-toggle="' + id + '"]');
      if (ar) ar.textContent = hidden ? '▾' : '▸';
    };

    const expandAll = (expand) => {
      tree.querySelectorAll('.wt-children').forEach(c => { c.style.display = expand ? '' : 'none'; });
      tree.querySelectorAll('.wt-ar[data-toggle]').forEach(a => { a.textContent = expand ? '▾' : '▸'; });
    };

    const byId = () => {
      const m = {}; (App.meta.wbs_flat || []).forEach(r => m[r.id] = r); return m;
    };
    const ancestorsOf = (id, m) => {
      const s = new Set(); let p = m[id] ? m[id].parent_id : 0;
      while (p) { s.add(p); p = m[p] ? m[p].parent_id : 0; } return s;
    };
    const applyFilter = () => {
      const kw = document.getElementById('wbst-kw').value.trim().toLowerCase();
      const lis = tree.querySelectorAll('.wt-li');
      if (!kw) { lis.forEach(li => li.style.display = ''); return; }
      const m = byId();
      const keep = new Set();
      (App.meta.wbs_flat || []).forEach(r => {
        if ((r.name || '').toLowerCase().includes(kw) || (r.code || '').toLowerCase().includes(kw)) {
          keep.add(r.id); ancestorsOf(r.id, m).forEach(x => keep.add(x));
        }
      });
      lis.forEach(li => { li.style.display = keep.has(+li.dataset.id) ? '' : 'none'; });
      expandAll(true);
    };

    const addChild = (id) => CRUD.edit('wbs', { parent_id: id }, load, {});
    const editNode = (id) => {
      const row = (App.meta.wbs_flat || []).find(r => r.id === id);
      CRUD.edit('wbs', row || { id }, load, {});
    };
    const delNode = async (id) => {
      const flat = App.meta.wbs_flat || [];
      const m = byId();
      const ids = [id], stack = [id];
      while (stack.length) {
        const cur = stack.pop();
        flat.forEach(r => { if (r.parent_id === cur) { ids.push(r.id); stack.push(r.id); } });
      }
      const name = (m[id] || {}).name || ('ID ' + id);
      const cnt = ids.length;
      App.confirm(`确定删除「${name}」${cnt > 1 ? ' 及其下共 ' + cnt + ' 个节点' : ''}？` +
        '含下级将一并删除，此操作不可撤销。', async () => {
        await App.api('/crud/delete', { table: 'wbs', ids });
        await App.api('/wbs/refresh_path');
        App.ok('已删除 ' + cnt + ' 个节点');
        await load();
      });
    };

    const bind = () => {
      tree.querySelectorAll('.wt-ar[data-toggle]').forEach(a =>
        a.onclick = e => { e.stopPropagation(); toggle(+a.dataset.toggle); });
      tree.querySelectorAll('.wt-node').forEach(n => n.onclick = () => toggle(+n.dataset.id));
      tree.querySelectorAll('.wt-add').forEach(b => b.onclick = e => { e.stopPropagation(); addChild(+b.dataset.id); });
      tree.querySelectorAll('.wt-ed').forEach(b => b.onclick = e => { e.stopPropagation(); editNode(+b.dataset.id); });
      tree.querySelectorAll('.wt-del').forEach(b => b.onclick = e => { e.stopPropagation(); delNode(+b.dataset.id); });
    };

    const load = async () => {
      await App.reloadMeta();
      const roots = App.meta.wbs_tree || [];
      const cnt = (App.meta.wbs_flat || []).length;
      document.getElementById('wbst-cnt').textContent = '共 ' + cnt + ' 个节点';
      tree.innerHTML = roots.length
        ? build(roots)
        : '<div class="empty">暂无部位，点「＋ 新增顶级部位」开始建立工程划分</div>';
      bind();
      applyFilter();
    };

    document.getElementById('wbst-kw').oninput = applyFilter;
    document.getElementById('wbst-exp').onclick = () => expandAll(true);
    document.getElementById('wbst-col').onclick = () => expandAll(false);
    document.getElementById('wbst-add').onclick = () => CRUD.edit('wbs', { parent_id: 0 }, load, {});
    await load();
  }
};

/* ---------- 窗口注册 ---------- */
App.reg({
  key: 'basedata', name: '基础数据', icon: '⚙', group: '数据管理',
  sub: '部位节点 / 材料 / 班组 / 项目',
  async render(el) {
    const tabs = [
      ['wbs', '部位与计划节点'], ['material', '材料字典'],
      ['team', '班组'], ['project', '项目']
    ];
    el.innerHTML = `<div class="row" style="margin-bottom:14px">
      ${tabs.map(([k, n], i) => `<button class="tb ${i ? '' : 'btn-p'}" data-t="${k}">${n}</button>`).join('')}
      </div><div id="bd-body"></div>`;
    const show = async k => {
      el.querySelectorAll('.tb').forEach(b =>
        b.classList.toggle('btn-p', b.dataset.t === k));
      const body = document.getElementById('bd-body');
      if (k === 'wbs') {
        await WBS_TREE.render(body);
      } else {
        await CRUD.mount(body, k, { title: tabs.find(t => t[0] === k)[1] });
      }
    };
    el.querySelectorAll('.tb').forEach(b => b.onclick = () => show(b.dataset.t));
    show('wbs');
  }
});
