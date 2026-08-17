/* 轻量 SVG 图表：bar / line / pie。零依赖，离线可用。 */
const Chart = {
  COLORS: ['#c99f5b', '#86a961', '#6f9bab', '#cc6f5c', '#b08fc7', '#d4a04a', '#8fa8b8', '#a89c88'],

  render(list) {
    if (!list || !list.length) return '';
    return '<div class="charts">' + list.map(c => {
      let svg = '';
      try {
        if (c.type === 'pie') svg = this.pie(c);
        else if (c.type === 'line') svg = this.line(c);
        else svg = this.bar(c);
      } catch (e) { svg = '<div class="dim">图表渲染失败</div>'; }
      return `<div class="chart-box"><h4>${c.title || ''}</h4>${svg}</div>`;
    }).join('') + '</div>';
  },

  _empty() { return '<div class="dim" style="padding:30px;text-align:center">暂无数据</div>'; },

  // 取所有数据点的「合理」最大值：
  //   若调用方传 yAxisMax/suggestedMax 则直接使用；
  //   否则取 P95（第 95 百分位）向上 nice-round，
  //   避免个别极值把整张图压扁（如日产值中少数高峰日）。
  _smartMax(values, hintMax) {
    if (hintMax && hintMax > 0) return this._nice(hintMax);
    const arr = (values || []).filter(v => typeof v === 'number' && v > 0).sort((a, b) => a - b);
    if (!arr.length) return 1;
    const p95 = arr[Math.ceil(arr.length * 0.95) - 1] || arr[arr.length - 1];
    return this._nice(p95) || 1;
  },

  _nice(max) {
    if (max <= 0) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(max)));
    const n = max / e;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * e;
  },

  _num(v) {
    const n = Math.abs(v);
    if (n >= 10000) return (v / 10000).toFixed(1) + 'w';
    if (n >= 1000) return (v / 1000).toFixed(1) + 'k';
    if (n >= 100) return v.toFixed(0);
    return (Math.round(v * 100) / 100).toString();
  },

  _clip(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; },

  bar(c) {
    const labels = c.labels || [], series = c.series || [];
    if (!labels.length) return this._empty();
    const W = 480, H = 250, PL = 46, PR = 10, PT = 12, PB = 58;
    const iw = W - PL - PR, ih = H - PT - PB;
    const allVals = [];
    series.forEach(s => (s.data || []).forEach(v => { allVals.push(Number(v) || 0); }));
    const max = this._smartMax(allVals, c.yAxisMax || c.suggestedMax);
    const gw = iw / labels.length;
    const bw = Math.min(26, gw / (series.length + 0.6));
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const y = PT + ih - ih * i / 4;
      g += `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="#332c24" stroke-width="1"/>
            <text x="${PL - 6}" y="${y + 3.5}" fill="#7d7364" font-size="9.5" text-anchor="end">${this._num(max * i / 4)}</text>`;
    }
    labels.forEach((lb, i) => {
      const cx = PL + gw * i + gw / 2;
      series.forEach((s, si) => {
        const v = Number(s.data[i] || 0);
        const h = Math.max(0, v / max * ih);
        const x = cx - (series.length * bw) / 2 + si * bw;
        g += `<rect x="${x}" y="${PT + ih - h}" width="${bw - 2}" height="${h}"
               fill="${this.COLORS[si % 8]}" opacity=".88" rx="2"><title>${lb}: ${v}</title></rect>`;
      });
      const short = this._clip(lb, 8);
      g += `<text x="${cx}" y="${PT + ih + 13}" fill="#a89c88" font-size="9.5"
             text-anchor="end" transform="rotate(-38 ${cx} ${PT + ih + 13})">${this._esc(short)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${g}</svg>` + this._legend(series);
  },

  line(c) {
    const labels = c.labels || [], series = c.series || [];
    if (!labels.length) return this._empty();
    const W = 480, H = 250, PL = 46, PR = 10, PT = 12, PB = 52;
    const iw = W - PL - PR, ih = H - PT - PB;
    const allVals = [];
    series.forEach(s => (s.data || []).forEach(v => { allVals.push(Number(v) || 0); }));
    const max = this._smartMax(allVals, c.yAxisMax || c.suggestedMax);
    const step = labels.length > 1 ? iw / (labels.length - 1) : 0;
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const y = PT + ih - ih * i / 4;
      g += `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="#332c24"/>
            <text x="${PL - 6}" y="${y + 3.5}" fill="#7d7364" font-size="9.5" text-anchor="end">${this._num(max * i / 4)}</text>`;
    }
    series.forEach((s, si) => {
      const col = this.COLORS[si % 8];
      const pts = (s.data || []).map((v, i) =>
        [PL + step * i, PT + ih - Math.max(0, Number(v || 0)) / max * ih]);
      if (!pts.length) return;
      g += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none"
             stroke="${col}" stroke-width="2" stroke-linejoin="round"/>`;
      g += `<polygon points="${PL},${PT + ih} ${pts.map(p => p.join(',')).join(' ')} ${pts[pts.length - 1][0]},${PT + ih}"
             fill="${col}" opacity=".08"/>`;
      pts.forEach((p, i) => {
        g += `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="${col}"><title>${labels[i]}: ${s.data[i]}</title></circle>`;
      });
    });
    const gap = Math.ceil(labels.length / 10);
    labels.forEach((lb, i) => {
      if (i % gap) return;
      const x = PL + step * i;
      g += `<text x="${x}" y="${PT + ih + 13}" fill="#a89c88" font-size="9.5"
             text-anchor="end" transform="rotate(-38 ${x} ${PT + ih + 13})">${this._esc(this._clip(lb, 10))}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${g}</svg>` + this._legend(series);
  },

  pie(c) {
    const labels = c.labels || [];
    const data = ((c.series || [{}])[0].data) || [];
    const tot = data.reduce((a, b) => a + Math.abs(Number(b) || 0), 0);
    if (!tot) return this._empty();
    const W = 460, H = 230, cx = 118, cy = 115, R = 88, r = 46;
    let a0 = -Math.PI / 2, g = '';
    data.forEach((v, i) => {
      const val = Math.abs(Number(v) || 0);
      if (!val) return;
      const a1 = a0 + val / tot * Math.PI * 2;
      const big = (a1 - a0) > Math.PI ? 1 : 0;
      const p = (ang, rad) => [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];
      const [x1, y1] = p(a0, R), [x2, y2] = p(a1, R);
      const [x3, y3] = p(a1, r), [x4, y4] = p(a0, r);
      g += `<path d="M${x1},${y1} A${R},${R} 0 ${big},1 ${x2},${y2} L${x3},${y3}
             A${r},${r} 0 ${big},0 ${x4},${y4} Z" fill="${this.COLORS[i % 8]}" opacity=".9"
             stroke="#282320" stroke-width="1.5"><title>${labels[i]}: ${v} (${(val / tot * 100).toFixed(1)}%)</title></path>`;
      a0 = a1;
    });
    g += `<text x="${cx}" y="${cy - 4}" fill="#a89c88" font-size="10" text-anchor="middle">合计</text>
          <text x="${cx}" y="${cy + 13}" fill="#e9e3d7" font-size="14" font-weight="600" text-anchor="middle">${this._num(tot)}</text>`;
    labels.forEach((lb, i) => {
      if (i > 7) return;
      const y = 26 + i * 23;
      const val = Math.abs(Number(data[i]) || 0);
      g += `<rect x="248" y="${y - 8}" width="9" height="9" rx="2" fill="${this.COLORS[i % 8]}"/>
            <text x="264" y="${y}" fill="#a89c88" font-size="11">${this._esc(this._clip(lb, 9))}</text>
            <text x="${W - 8}" y="${y}" fill="#e9e3d7" font-size="11" text-anchor="end">${this._num(val)} · ${(val / tot * 100).toFixed(1)}%</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${g}</svg>`;
  },

  _legend(series) {
    if (series.length < 2) return '';
    return '<div class="legend">' + series.map((s, i) =>
      `<span><i style="background:${this.COLORS[i % 8]}"></i>${this._esc(s.name || '')}</span>`).join('') + '</div>';
  },

  _esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '<', '>': '>' }[c])); }
};
