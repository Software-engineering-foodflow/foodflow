// 以元素 id 畫正交箭頭。edges: [from, to, {label, dash, fs, ts, lx, ly, mid}]
// fs/ts: 'b','t','l','r'（起訖邊），預設上下。
function drawEdges(edges) {
  const root = document.getElementById('canvas');
  const rb = root.getBoundingClientRect();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', rb.width); svg.setAttribute('height', rb.height);
  svg.style.position = 'absolute'; svg.style.left = 0; svg.style.top = 0; svg.style.pointerEvents = 'none';
  svg.innerHTML = `<defs>
   <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d4a5c"/></marker>
   <marker id="ahd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#7a8494"/></marker></defs>`;
  root.appendChild(svg);
  const pt = (el, side, off) => {
    const b = el.getBoundingClientRect();
    const x = b.left - rb.left, y = b.top - rb.top;
    off = off || 0;
    if (side === 'b') return [x + b.width / 2 + off, y + b.height];
    if (side === 't') return [x + b.width / 2 + off, y];
    if (side === 'l') return [x, y + b.height / 2 + off];
    return [x + b.width, y + b.height / 2 + off];
  };
  for (const [f, t, o = {}] of edges) {
    const a = document.getElementById(f), c = document.getElementById(t);
    const fs = o.fs || 'b', ts = o.ts || 't';
    let [x1, y1] = pt(a, fs, o.fo), [x2, y2] = pt(c, ts, o.to);
    let d;
    const vert = s => s === 'b' || s === 't';
    if (o.straightX) { x2 = x1; }
    if (o.straightY) { y2 = y1; }
    if (vert(fs) && vert(ts)) {
      const my = o.mid !== undefined ? o.mid : (y1 + y2) / 2;
      d = `M${x1},${y1} L${x1},${my} L${x2},${my} L${x2},${y2}`;
    } else if (!vert(fs) && !vert(ts)) {
      const mx = o.mid !== undefined ? o.mid : (x1 + x2) / 2;
      d = `M${x1},${y1} L${mx},${y1} L${mx},${y2} L${x2},${y2}`;
    } else if (!vert(fs)) {
      d = `M${x1},${y1} L${x2},${y1} L${x2},${y2}`;
    } else {
      d = `M${x1},${y1} L${x1},${y2} L${x2},${y2}`;
    }
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d); p.setAttribute('fill', 'none');
    p.setAttribute('stroke', o.dash ? '#7a8494' : '#3d4a5c');
    p.setAttribute('stroke-width', o.dash ? 1.8 : 2.2);
    if (o.dash) p.setAttribute('stroke-dasharray', '7 5');
    p.setAttribute('marker-end', o.dash ? 'url(#ahd)' : 'url(#ah)');
    if (o.both) p.setAttribute('marker-start', 'url(#ah)');
    if (o.cls) p.setAttribute('class', o.cls);
    svg.appendChild(p);
    if (o.label) {
      const lx = (o.lx !== undefined ? o.lx : (x1 + x2) / 2 + 8), ly = (o.ly !== undefined ? o.ly : (y1 + y2) / 2);
      const l = document.createElement('div');
      l.className = 'elabel' + (o.cls ? ' ' + o.cls : '');
      l.innerHTML = o.label;
      l.style.left = lx + 'px'; l.style.top = ly + 'px';
      if (o.anchor === 'c') l.style.transform = 'translate(-50%,-50%)';
      if (o.anchor === 'r') l.style.transform = 'translate(-100%,-50%)';
      if (!o.anchor) l.style.transform = 'translate(0,-50%)';
      root.appendChild(l);
    }
  }
}
