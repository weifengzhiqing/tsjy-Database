/* 措施管理：记录纠偏动作 + 效果评估闭环 */
App.reg({
  key: 'measure', name: '措施与效果', icon: '◎', group: '日常',
  sub: '记录纠偏动作并评估效果',

  async render(el) {
    el.innerHTML = `
      <div class="note" style="margin-bottom:14px">
        <strong>为什么要记这个：</strong>报表能告诉你「哪里出了问题」，但说不出「你做了什么、有没有用」。
        阶段总结里的「后续措施 / 达到效果 / 正负向判断」，全部来自这张表。
        措施只记不评估等于没闭环 —— 记完记得点「评估效果」。
      </div>
      <div id="ms-body"></div>
      <div class="card">
        <h3>效果评估记录</h3>
        <div id="ef-body"></div>
      </div>`;

    const reloadEff = await CRUD.mount(document.getElementById('ef-body'),
      'measure_effect', { title: '效果评估' });

    const box = document.getElementById('ms-body');
    const reload = await CRUD.mount(box, 'measure',
      { title: '措施台账', defaults: { biz_date: App.today(), status: '执行中' } });

    // 给每行加「评估」按钮
    const patch = () => {
      box.querySelectorAll('.ed').forEach(b => {
        if (b.dataset.p) return;
        b.dataset.p = 1;
        const ev = document.createElement('button');
        ev.className = 'btn-sm';
        ev.style.marginLeft = '4px';
        ev.textContent = '评估';
        ev.onclick = () => this.evaluate(b.dataset.id, reloadEff);
        b.parentNode.appendChild(ev);
      });
    };
    patch();
    new MutationObserver(patch).observe(box, { childList: true, subtree: true });
  },

  async evaluate(mid, reloadEff) {
    const m = (await App.api('/crud/list', { table: 'measure', filters: { id: mid } })).rows[0];
    const box = document.createElement('div');
    box.innerHTML = `
      <div class="note" style="margin-bottom:14px">
        <strong>问题：</strong>${App.esc(m.issue || '-')}<br>
        <strong>措施：</strong>${App.esc(m.content || '-')}
      </div>
      <div class="form-grid">
        <div class="fld"><label>评估日期</label>
          <input type="date" data-k="eval_date" value="${App.today()}"></div>
        <div class="fld"><label>指标名称</label>
          <input list="dl-metric" data-k="metric" placeholder="如：日均产值">
          <datalist id="dl-metric">
            <option value="日均产值"><option value="日均完成方量"><option value="滞后天数">
            <option value="材料超耗率"><option value="用工效率"><option value="返工率">
          </datalist></div>
        <div class="fld"><label>单位</label><input type="text" data-k="unit" placeholder="万元/天"></div>
        <div class="fld"><label>措施前数值</label><input type="number" step="any" data-k="before_val"></div>
        <div class="fld"><label>措施后数值</label><input type="number" step="any" data-k="after_val"></div>
        <div class="fld"><label>折算经济效益(元)</label>
          <input type="number" step="any" data-k="benefit_amt" placeholder="创效填正数，损失填负数"></div>
        <div class="fld"><label>效果方向</label>
          <select data-k="direction"><option>正向</option><option>负向</option>
          <option>无明显影响</option></select></div>
        <div class="fld"><label>评分（1-5）</label>
          <select data-k="score"><option value="5">5 显著有效</option><option value="4">4 有效</option>
          <option value="3" selected>3 一般</option><option value="2">2 效果有限</option>
          <option value="1">1 无效</option></select></div>
        <div class="fld full"><label>结论（会出现在阶段总结里）</label>
          <textarea data-k="conclusion" rows="3"
            placeholder="如：增加一个作业面后日均产值由 12 万提至 18 万，滞后天数由 9 天压缩至 3 天"></textarea></div>
      </div>`;

    App.modal({
      title: '评估措施效果', body: box, width: 760, okText: '保存评估',
      async onOk() {
        const data = { measure_id: Number(mid) };
        box.querySelectorAll('[data-k]').forEach(i => {
          data[i.dataset.k] = i.value === '' ? null :
            (['before_val', 'after_val', 'benefit_amt', 'score'].includes(i.dataset.k)
              ? Number(i.value) : i.value);
        });
        if (!data.metric) { App.err('请填写指标名称'); return false; }
        await App.api('/crud/save', { table: 'measure_effect', data });
        App.ok('评估已保存');
        reloadEff();
      }
    });
  }
});
