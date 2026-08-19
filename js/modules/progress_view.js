/* ================= 形象进度看板 =================
   基于 progress_rec（「形象进度」导入 / 「进度快录」写入的数据），
   按部位名称的「/」层级钻取，开累完成量 = 该(部位+项)全部完成量实时累加，不落冗余 cum 列。
   与 progress_complete 模块（progress_complete 表 + boq_ref 产值）是两套独立数据，本模块只展示形象进度实物量。
============================================ */
App.reg({
  key: 'progress_view', name: '形象进度看板', icon: '⛏', group: '数据看板',
  sub: '按部位层级钻取 · 开累完成量实时累计',

  async render(el) {
   try {
    const DB = window.DB;
    let recs = [];
    try {
      recs = DB.query("SELECT biz_date, wbs_name, item_name, unit, actual_qty, cum_actual_qty FROM progress_rec WHERE wbs_name IS NOT NULL");
    } catch (e) {
      el.innerHTML = `<div class="msg err">读取 progress_rec 失败：${e.message}</div>`;
      return;
    }

    const tree = {};
    const wbsSet = new Set();
    let totalCum = 0;
    recs.forEach(r => {
      if (r.wbs_name) wbsSet.add(r.wbs_name);
      const parts = String(r.wbs_name || '(未填部位)').split('/').map(s => s.trim()).filter(s => s);
      let node = tree;
      parts.forEach(p => { if (!node[p]) node[p] = { children: {}, items: {} }; node = node[p]; });
      const it = r.item_name || '(未填项)';
      const a = node.items[it] || { unit: '', cum: 0, last: '', n: 0 };
      // 开累优先取累计完成量(cum_actual_qty，来自金山同步的开累完成数量)；无累计时回退逐条完成量累加(快录/导入场景)
      const rawCum = r.cum_actual_qty;
      const rowCum = (rawCum !== null && rawCum !== undefined) ? parseFloat(rawCum) : (parseFloat(r.actual_qty) || 0);
      a.cum += rowCum;
      a.unit = a.unit || r.unit;
      if (r.biz_date > a.last) a.last = r.biz_date;
      a.n++;
      node.items[it] = a;
      totalCum += rowCum;
    });

    function renderNode(node, depth) {
      const pad = 6 + depth * 20;
      let h = '';
      Object.keys(node.children).sort().forEach(k => {
        h += `<div class="pv-node" style="margin-left:${pad}px">
          <div class="pv-h" onclick="var c=this.parentNode.querySelector('.pv-ch');c.style.display = c.style.display==='none'?'':'none'">
            <span class="pv-toggle">▸</span> <b>${App.esc(k)}</b></div>
          <div class="pv-ch" style="display:none">${renderNode(node.children[k], depth + 1)}</div>
        </div>`;
      });
      const items = Object.keys(node.items);
      if (items.length) {
        h += `<div class="pv-items" style="margin-left:${pad + 20}px"><table class="pv-tbl">
          <thead><tr><th>形象进度项</th><th>单位</th><th class="num">开累完成量</th><th>最近日期</th></tr></thead><tbody>
          ${items.sort().map(it => { const a = node.items[it]; return `<tr><td>${App.esc(it)}</td><td>${App.esc(a.unit || '')}</td><td class="num">${a.cum.toFixed(2)}</td><td class="dim">${App.esc(a.last || '')}</td></tr>`; }).join('')}
          </tbody></table></div>`;
      }
      return h;
    }

    el.innerHTML = `
      <div id="pv-kpi">${App.kpis([
        { label: '开累完成量合计', value: totalCum.toFixed(1), unit: '（按完成量汇总）', tone: 'k' },
        { label: '在档部位数', value: wbsSet.size, unit: '个' }
      ])}</div>
      <div class="card"><h3>形象进度 · 按部位层级钻取（点击 ▸ 展开）</h3>
        <div id="pv-tree">${recs.length ? renderNode(tree, 0) : '<div class="empty">还没有形象进度数据，去「进度快录」或「数据导入」录入吧。</div>'}</div>
        <div class="dim" style="margin-top:10px">开累完成量 = 优先取系统记录的累计完成量（如金山同步的"开累完成数量"），无累计时按完成量累加（快录/导入场景）。每日同步为"最新快照覆盖"，看板只显示最新开累，不重复累加。</div>
      </div>`;
   } catch (e) {
     el.innerHTML = '<div class="msg err">形象进度看板渲染失败：' + ((e && (e.stack || e.message)) || e) + '</div>';
   }
  }
});
