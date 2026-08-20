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

    // wbs_name 归一：去长度后缀 / 拆冗余父名 / 拆手动空格子部位 / 拆子部位词(出口/进口/横通道/洞门及洞口工程) / 末端“工区”归一 / 类目前缀拆分
    // 与同步脚本 norm_wbs 同源，保证看板层级合并（如 五磊山隧道 与 五磊山隧道(6829.04m) 归并为同一节点）
    function normParts(wbs) {
      const CATS = ['站场路基', '区间路基', '框架涵', '桥涵', '路基', '站场'];
      const SUBLOC = ['洞门及洞口工程', '横通道', '进口', '出口'];
      const stripLen = s => s.replace(/\s*[（(]?\d+(\.\d+)?m[）)]?\s*$/, '');
      const splitSubloc = p => {
        for (const m of SUBLOC) if (p.length > m.length && p.endsWith(m)) return [p.slice(0, p.length - m.length), m];
        return [p];
      };
      let parts = String(wbs || '').split('/').map(s => s.trim()).filter(Boolean);
      const out = [];
      parts.forEach((p, idx) => {
        if (p.includes(' ') && idx === 0) {
          const sp = p.split(/\s+/);
          if (sp.length >= 2) { out.push(stripLen(sp[0])); out.push(stripLen(sp.slice(1).join(' '))); return; }
        }
        out.push(stripLen(p));
      });
      const out2 = [];
      out.forEach(p => { if (p == null) return; splitSubloc(p).forEach(x => out2.push(x)); });
      const root = out2[0] || '';
      for (let i = 1; i < out2.length; i++) {
        if (root && out2[i] && out2[i].startsWith(root)) {
          const rest = out2[i].slice(root.length).trim();
          out2[i] = (rest && !/^[（）()\s]*$/.test(rest)) ? rest : null;
        }
      }
      const final = [];
      out2.forEach(p => {
        if (p == null) return;
        if (p.endsWith('工区')) p = p.slice(0, -2);
        let matched = false;
        for (const cat of CATS) {
          if (p.startsWith(cat) && p.length > cat.length && /DK|（|\(|\d/.test(p.slice(cat.length))) {
            final.push(cat); final.push(p.slice(cat.length).trim()); matched = true; break;
          }
        }
        if (!matched) final.push(p);
      });
      return final.filter(Boolean);
    }

    // 专业归类：将工点归入顶层专业（桥梁工程 / 路基 / 站改 / 其他附属）
    // 隧道与桥涵归桥梁工程；路基及清表归路基；站场及站改配套归站改；其余进“其他附属”
    function categoryOf(name) {
      if (!name) return '其他附属';
      if (name.indexOf('隧道') >= 0) return '桥梁工程';
      if (name.indexOf('特大桥') >= 0 || name.indexOf('大桥') >= 0 || name.indexOf('中桥') >= 0) return '桥梁工程';
      if (name.indexOf('桥涵') >= 0 || name.indexOf('框架涵') >= 0) return '桥梁工程';
      if (name === '正洞') return '桥梁工程';
      if (name.indexOf('路基') >= 0) return '路基';
      if (name === '清表') return '路基';
      if (name.indexOf('站改') >= 0 || name === '庄桥站' || name === '货场' || name === '站场' || name === '临时场站' || name === '慈城牵引变电所') return '站改';
      return '其他附属';
    }

    const tree = { children: {}, items: {} };
    const wbsSet = new Set();   // 归一后的工点数（五磊山隧道/慈城特大桥…），用于 KPI
    let totalCum = 0;
    recs.forEach(r => {
      const parts = normParts(r.wbs_name);
      if (!parts.length) return;
      const cat = categoryOf(parts[0]);
      const full = [cat].concat(parts);
      wbsSet.add(parts[0]);
      let node = tree;
      full.forEach(p => { if (!node.children[p]) node.children[p] = { children: {}, items: {} }; node = node.children[p]; });
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
        <div class="dim" style="margin-top:10px">顶层按专业分组（桥梁工程 / 路基 / 站改 / 其他附属），其下为工点（如 五磊山隧道、慈城特大桥），再下为子部位（进口/出口/斜井）与形象进度项。开累完成量 = 优先取系统记录的累计完成量（如金山同步的"开累完成数量"），无累计时按完成量累加。每日同步为"最新快照覆盖"，看板只显示最新开累，不重复累加。</div>
      </div>`;
   } catch (e) {
     el.innerHTML = '<div class="msg err">形象进度看板渲染失败：' + ((e && (e.stack || e.message)) || e) + '</div>';
   }
  }
});
