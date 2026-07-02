/* ============================================================================
   garden-leaf.js — generative leaf "trace" infographic for davidvalentine.org
   --------------------------------------------------------------------------
   A category zooms into a leaf. Each secondary vein = one item (numbered at the
   tip; the side list is the legend). Clicking a vein drills deeper (into the
   item's DNA). An assortment of leaf SHAPES is chosen at random each open so no
   two categories feel identical. All color comes from CSS custom properties, so
   the same leaf renders in both light and dark themes.

   GardenLeaf.create(container, { items, kind, seed, pattern,
                                  onHover, onLeave, onSelect })
   ========================================================================== */
(function (global) {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(n, a) { var e = document.createElementNS(SVGNS, n); if (a) for (var k in a) e.setAttribute(k, a[k]); return e; }
  function rng(seed) { var x = seed >>> 0 || 1; return function () { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

  // leaf silhouettes — exponents shape the width profile t^e1 * (1-t)^e2
  var PATTERNS = [
    { name: 'ovate',      maxW: 206, e1: 0.45, e2: 0.78, bow: 14, vlift: 26, vend: 0.085 },
    { name: 'lanceolate', maxW: 150, e1: 0.55, e2: 0.60, bow: 9,  vlift: 36, vend: 0.10 },
    { name: 'cordate',    maxW: 230, e1: 0.34, e2: 0.92, bow: 16, vlift: 22, vend: 0.075 },
    { name: 'obovate',    maxW: 204, e1: 0.82, e2: 0.46, bow: 12, vlift: 30, vend: 0.09 }
  ];
  function peakNorm(e1, e2) { var m = 0; for (var t = 0.01; t < 1; t += 0.01) { var v = Math.pow(t, e1) * Math.pow(1 - t, e2); if (v > m) m = v; } return 1 / m; }

  function smooth(pts, closed) {
    var n = pts.length, d = 'M' + pts[0][0].toFixed(2) + ' ' + pts[0][1].toFixed(2);
    var last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      if (!closed) { p0 = pts[Math.max(i - 1, 0)]; p2 = pts[Math.min(i + 1, n - 1)]; p3 = pts[Math.min(i + 2, n - 1)]; }
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += 'C' + c1x.toFixed(2) + ' ' + c1y.toFixed(2) + ' ' + c2x.toFixed(2) + ' ' + c2y.toFixed(2) + ' ' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2);
    }
    if (closed) d += 'Z';
    return d;
  }

  function create(container, opts) {
    var o = Object.assign({ items: [], kind: 'shoot', seed: 3, pattern: null, onHover: null, onLeave: null, onSelect: null }, opts || {});
    var rand = rng((o.seed * 2654435761) >>> 0);
    var P = PATTERNS[(o.pattern == null) ? Math.floor(Math.random() * PATTERNS.length) : (o.pattern % PATTERNS.length)];
    var NORM = peakNorm(P.e1, P.e2);
    var items = o.items.slice(0, 8), n = items.length;

    var VB_W = 620, VB_H = 880, cx = 305, baseY = 778, topY = 64, axis = baseY - topY;
    container.innerHTML = '';
    var svg = el('svg', { viewBox: '0 0 ' + VB_W + ' ' + VB_H, class: 'gl-svg', preserveAspectRatio: 'xMidYMid meet' });
    svg.setAttribute('data-pattern', P.name);
    if (o.kind === 'root') svg.classList.add('gl--root');
    container.appendChild(svg);

    function midX(t) { return cx + Math.sin(t * Math.PI) * P.bow; }
    function yAt(t) { return baseY - t * axis; }
    function halfW(t) { return P.maxW * Math.pow(Math.max(t, 0), P.e1) * Math.pow(Math.max(1 - t, 0), P.e2) * NORM; }

    // lamina outline
    var STEPS = 48, right = [], left = [];
    for (var s = 0; s <= STEPS; s++) { var t = s / STEPS, w = halfW(t), mx = midX(t), y = yAt(t); right.push([mx + w, y]); left.push([mx - w, y]); }
    var outline = right.concat(left.slice().reverse());
    var laminaPath = smooth(outline, true);
    var lamina = el('path', { d: laminaPath, class: 'gl-lamina' });
    var edge = el('path', { d: laminaPath, class: 'gl-edge' });
    svg.appendChild(lamina);

    var petiole = el('path', { d: 'M' + cx + ' ' + (baseY + 62) + ' L' + cx + ' ' + baseY, class: 'gl-petiole' });
    var midPts = []; for (var ms = 0; ms <= 30; ms++) { var mt = ms / 30; midPts.push([midX(mt), yAt(mt)]); }
    var midrib = el('path', { d: smooth(midPts, false), class: 'gl-midrib' });
    svg.appendChild(petiole);

    var fineG = el('g'), areoleG = el('g'), veinG = el('g'), labelG = el('g', { class: 'gl-labels' });
    svg.appendChild(fineG); svg.appendChild(areoleG); svg.appendChild(veinG);
    svg.appendChild(midrib); svg.appendChild(edge); svg.appendChild(labelG);

    var cells = [];
    for (var i = 0; i < n; i++) {
      var ti = n === 1 ? 0.5 : (0.16 + (i / (n - 1)) * 0.7);
      var side = (i % 2 === 0) ? 1 : -1;
      var Mx = midX(ti), My = yAt(ti);
      var tEnd = Math.min(ti + P.vend, 0.97);
      var Ex = midX(tEnd) + side * halfW(tEnd) * 0.9, Ey = yAt(tEnd);
      var ctrlX = (Mx + Ex) / 2 + side * 8, ctrlY = (My + Ey) / 2 - P.vlift;
      var vd = 'M' + Mx.toFixed(1) + ' ' + My.toFixed(1) + ' Q' + ctrlX.toFixed(1) + ' ' + ctrlY.toFixed(1) + ' ' + Ex.toFixed(1) + ' ' + Ey.toFixed(1);

      var g = el('g', { class: 'gl-cell', tabindex: '0', role: 'button', 'data-i': i });
      var areole = el('path', { d: vd, class: 'gl-areole' });
      var vein = el('path', { d: vd, class: 'gl-vein' });
      var dot = el('circle', { cx: Ex, cy: Ey, r: 5.2, class: 'gl-tip' });
      for (var k = 1; k <= 3; k++) {
        var ft = k / 4, fx = Mx + (Ex - Mx) * ft, fy = My + (Ey - My) * ft;
        var fang = Math.atan2(Ey - My, Ex - Mx) + side * (0.7 + rand() * 0.3), flen = 15 + rand() * 14;
        fineG.appendChild(el('path', { d: 'M' + fx.toFixed(1) + ' ' + fy.toFixed(1) + ' L' + (fx + Math.cos(fang) * flen).toFixed(1) + ' ' + (fy + Math.sin(fang) * flen).toFixed(1), class: 'gl-fine' }));
      }
      var lx = Ex + side * 15;
      var label = el('text', { x: lx, y: Ey, class: 'gl-label', 'text-anchor': side > 0 ? 'start' : 'end', 'dominant-baseline': 'middle' });
      label.textContent = String(i + 1).padStart(2, '0');

      areoleG.appendChild(areole);
      g.appendChild(vein); g.appendChild(dot); veinG.appendChild(g); labelG.appendChild(label);

      (function (ix, grp, lab, aro, tip) {
        grp.addEventListener('mouseenter', function () { hi(ix); if (o.onHover) o.onHover(ix); });
        grp.addEventListener('mouseleave', function () { lo(); if (o.onLeave) o.onLeave(ix); });
        grp.addEventListener('focus', function () { hi(ix); if (o.onHover) o.onHover(ix); });
        grp.addEventListener('blur', function () { lo(); if (o.onLeave) o.onLeave(ix); });
        grp.addEventListener('click', function () { if (o.onSelect) o.onSelect(ix, tip); });
        grp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (o.onSelect) o.onSelect(ix, tip); } });
        cells.push({ group: grp, label: lab, areole: aro, vein: vein, dot: tip });
      })(i, g, label, areole, dot);
    }

    function hi(ix) { cells.forEach(function (c, j) { var a = j === ix; c.group.classList.toggle('is-active', a); c.label.classList.toggle('is-active', a); c.areole.classList.toggle('is-active', a); }); svg.classList.add('has-active'); }
    function lo() { cells.forEach(function (c) { c.group.classList.remove('is-active'); c.label.classList.remove('is-active'); c.areole.classList.remove('is-active'); }); svg.classList.remove('has-active'); }

    var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function play() {
      if (reduced) return;
      [lamina, edge].forEach(function (p) { try { var L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; p.style.transition = 'stroke-dashoffset 1s ease, fill-opacity .9s ease .4s'; requestAnimationFrame(function () { p.style.strokeDashoffset = '0'; }); } catch (e) {} });
      try { var Lm = midrib.getTotalLength(); midrib.style.strokeDasharray = Lm; midrib.style.strokeDashoffset = Lm; midrib.style.transition = 'stroke-dashoffset .8s ease'; requestAnimationFrame(function () { midrib.style.strokeDashoffset = '0'; }); } catch (e) {}
      cells.forEach(function (c, j) {
        var v = c.vein;
        try { var L = v.getTotalLength(); v.style.strokeDasharray = L; v.style.strokeDashoffset = L; v.style.transition = 'stroke-dashoffset .55s ease ' + (0.35 + j * 0.07) + 's'; requestAnimationFrame(function () { v.style.strokeDashoffset = '0'; }); } catch (e) {}
        c.dot.style.opacity = '0'; c.dot.style.transition = 'opacity .4s ease ' + (0.6 + j * 0.07) + 's';
        c.label.style.opacity = '0'; c.label.style.transition = 'opacity .5s ease ' + (0.65 + j * 0.07) + 's';
        requestAnimationFrame(function () { c.dot.style.opacity = ''; c.label.style.opacity = ''; });
      });
    }

    return { svg: svg, highlight: hi, clearHighlight: lo, play: play, count: n,
             getTip: function (i) { return cells[i] && cells[i].dot; }, pattern: P.name };
  }
  global.GardenLeaf = { create: create };
})(window);
