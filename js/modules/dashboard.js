/* 概览：一眼看清数据积累情况和待办 */
App.reg({
  key: 'dashboard', name: '概览', icon: '◈', group: '日常',
  sub: '数据积累与待办',

  async render(el) {
    const s = await App.api('/meta/stats');
    const c = s.counts, t = s.totals;
    // 各台账 amount 字段原始单位为「元」（Excel 导入原值），展示时统一转「万元」即 ÷10000
    const wan = v => Math.round((v || 0) / 10000 * 100) / 100;

    // 理论产值 = progress_complete.开累 × boq_ref.综合单价（与「进度完成情况」同源）
    let theoryWan = 0;
    try {
      const DB = window.DB;
      const bp = {};
      DB.query('SELECT code,price FROM boq_ref').forEach(b => { bp[b.code] = b.price; });
      DB.query('SELECT cum_qty,boq_code FROM progress_complete').forEach(r => {
        if (r.boq_code && bp[r.boq_code]) theoryWan += (r.cum_qty || 0) * bp[r.boq_code];
      });
      theoryWan = Math.round(theoryWan * 100) / 100; // 元（原始精度）
    } catch (e) { theoryWan = 0; }

    // 人工费：正确口径 = 出勤人数 × 工时 × 工日单价（person_count × work_hours × unit_cost），
    // 与查询中心「人员投入统计」的 SUM(amount) 在 amount 已按三项乘积填充时完全等价（= 18984.2 万元）。
    // 材料费：数量 × 单价（qty × price），与「材料统计」口径一致。
    let materialWan = 0, laborWan = 0;
    try {
      const DB = window.DB;
      materialWan = t.material ? wan(t.material) : (() => {
        const mr = DB.query("SELECT COALESCE(SUM(qty*price),0) v FROM material_rec")[0];
        return mr.v / 10000;
      })();
      const lr = DB.query("SELECT COALESCE(SUM(person_count*work_hours*unit_cost),0) v FROM labor_rec")[0];
      laborWan = lr.v / 10000;
      if (laborWan === 0 && t.labor) laborWan = wan(t.labor); // 兜底：三项有缺时回退账面 amount
    } catch (e) {}

    el.innerHTML = `
      ${App.kpis([
      { label: '累计计价产值', value: wan(t.output), unit: '万元', tone: 'good' },
      { label: '理论产值(进度×清单)', value: wan(theoryWan), unit: '万元', tone: 'k' },
      { label: '材料费', value: materialWan.toFixed(2), unit: '万元' },
      { label: '人工费', value: laborWan.toFixed(2), unit: '万元' },
      { label: '其他成本', value: wan(t.cost), unit: '万元' },
      {
        label: '毛利', value: (wan(t.output) - materialWan - laborWan - wan(t.cost)).toFixed(2), unit: '万元',
        tone: (wan(t.output) - materialWan - laborWan - wan(t.cost)) >= 0 ? 'good' : 'bad'
      },
    ])}
      <div class="dim" style="margin:-6px 0 14px;line-height:1.7">
        「累计计价产值」来自产值台账(output_rec)，为实际报量/计价口径；「理论产值」= 开累完成量×清单综合单价，
        来自「进度完成情况」。两者口径不同：理论产值含未计价部分，且隧道单位口径待复核（可能偏高），仅作进度参考。<br>
        「人工费」= 出勤人数 × 工时 × 工日单价（person_count×work_hours×unit_cost，与查询中心「人员投入统计」一致），
        「材料费」= 数量 × 单价（qty×price，与「材料统计」一致），合计以万元展示；
        台账为空时显示 0，填入数据后自动计算。
      </div>

      <div class="card">
        <h3>数据积累 <span class="tag">${s.date_range.from ?
        `${s.date_range.from} ~ ${s.date_range.to}` : '还没有数据'}</span></h3>
        <div class="kpis" style="margin:0">
          ${[['产值记录', c.output, 'output_rec'], ['材料消耗', c.material, 'material_rec'],
        ['人员投入', c.labor, 'labor_rec'], ['成本记录', c.cost, 'cost_rec'],
        ['形象进度', c.progress, 'progress_rec'], ['措施记录', c.measure, 'measure'],
        ['部位节点', c.wbs, 'wbs'], ['阶段总结', c.summary, '']]
        .map(([n, v]) => `<div class="kpi"><div class="l">${n}</div>
              <div class="v">${v}<span class="u">条</span></div></div>`).join('')}
        </div>
      </div>

      ${s.recent_output.length ? `<div class="card"><h3>近期产值走势</h3>
        ${Chart.render([{
          type: 'line', title: '',
          labels: s.recent_output.map(r => r.d.slice(5)),
          series: [{ name: '产值(万元)', data: s.recent_output.map(r => (r.a / 10000).toFixed(2)) }]
        }])}</div>` : ''}

      <div class="card">
        <h3>在办措施 <span class="tag">${s.no_eval_cnt ?
        `${s.no_eval_cnt} 条措施尚未做效果评估` : '措施均已评估'}</span></h3>
        ${s.pending_measures.length ? `<div class="tbl-wrap"><table>
          <thead><tr><th style="min-width:100px">日期</th><th>问题</th><th>措施</th>
          <th style="min-width:80px">状态</th></tr></thead><tbody>
          ${s.pending_measures.map(m => `<tr><td>${m.biz_date}</td>
            <td>${App.esc(m.issue || '-')}</td><td>${App.esc(m.content || '-')}</td>
            <td><span class="pill warn">${m.status}</span></td></tr>`).join('')}
        </tbody></table></div>` : '<div class="dim">没有在办措施。</div>'}
      </div>

      <div class="card">
        <h3>下一步</h3>
        <div class="rep-grid">
          ${this.guide(c).map(g => `<div class="rep-btn" onclick="location.hash='${g.k}'">
            <div class="g">${g.tag}</div><div class="n">${g.t}</div><div class="d">${g.d}</div>
          </div>`).join('')}
        </div>
      </div>`;
  },

  guide(c) {
    const g = [];
    if (!c.wbs || c.wbs <= 4) g.push({
      k: 'basedata', tag: '① 先做这个', t: '维护部位与计划节点',
      d: '把你的分部分项、计划开完工日期录进去。这是进度对比和产值归集的骨架。'
    });
    if (!c.output) g.push({
      k: 'import', tag: '② 导数据', t: '导入产值台账',
      d: '把现有的 Excel 日报/台账导进来，列映射一次就能存成模板复用。'
    });
    g.push({
      k: 'query', tag: '查询', t: '查询中心',
      d: '产值、材料、人员、进度、措施、盈亏，点按钮取数。'
    });
    g.push({
      k: 'summary', tag: '输出', t: '生成阶段总结',
      d: '选个区间，自动出完整阶段报告和优化建议，可导出。'
    });
    if (c.measure === 0) g.push({
      k: 'measure', tag: '闭环', t: '记录措施与效果',
      d: '现场为纠偏做的动作记下来并评估效果，总结才能体现管理价值。'
    });
    return g;
  }
});
