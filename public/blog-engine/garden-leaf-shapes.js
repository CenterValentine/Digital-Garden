/* ============================================================================
   garden-leaf-shapes.js — parametric botanical leaf "plates" for the garden
   --------------------------------------------------------------------------
   A morphology kit: each builder returns an array of primitives in LEAF-SPACE
   (origin = blade base; apex grows UP = negative y; petiole hangs DOWN = +y).
   LeafShapes.render(holder, cfg) fits the drawing into its card and draws it.

   Primitive shapes:
     {k:'fill', d, cls}                  filled lamina (no stroke)
     {k:'path', d, cls, w}               stroked open/closed path
     {k:'line', x1,y1,x2,y2, cls, w}
     {k:'dot',  x,y,r, cls}

   All colour comes from CSS custom props so plates read in light + dark.
   Companion file garden-leaf-special.js adds the compound / dissected / spike
   / structural builders onto LeafShapes.builders.
   ========================================================================== */
(function (global) {
  'use strict';
  var LS = global.LeafShapes = global.LeafShapes || { builders: {} };

  /* ---------- low-level helpers ---------- */
  function rng(seed) { var x = (seed >>> 0) || 1; return function () { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  LS.rng = rng;

  // Catmull-Rom -> cubic bezier spline through pts. closed optional.
  function spline(pts, closed) {
    var n = pts.length; if (n < 2) return '';
    var d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    var last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var p0 = closed ? pts[(i - 1 + n) % n] : pts[Math.max(i - 1, 0)];
      var p1 = pts[i];
      var p2 = closed ? pts[(i + 1) % n] : pts[Math.min(i + 1, n - 1)];
      var p3 = closed ? pts[(i + 2) % n] : pts[Math.min(i + 2, n - 1)];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += 'C' + f(c1x) + ' ' + f(c1y) + ' ' + f(c2x) + ' ' + f(c2y) + ' ' + f(p2[0]) + ' ' + f(p2[1]);
    }
    if (closed) d += 'Z';
    return d;
  }
  function poly(pts, closed) {
    var d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (var i = 1; i < pts.length; i++) d += 'L' + f(pts[i][0]) + ' ' + f(pts[i][1]);
    if (closed) d += 'Z';
    return d;
  }
  function f(v) { return (Math.round(v * 100) / 100); }
  LS.spline = spline; LS.poly = poly; LS.f = f;

  function peakNorm(e1, e2) { var m = 1e-6; for (var t = 0.01; t < 1; t += 0.01) { var v = Math.pow(t, e1) * Math.pow(1 - t, e2); if (v > m) m = v; } return 1 / m; }

  /* =========================================================================
     SIMPLE LEAF — one lamina. Width profile w(t)=maxW·t^e1·(1-t)^e2 with optional
     lobe modulation, margin teeth, pinnate/palmate-ish venation. Covers ovate,
     orbicular, deltoid, oblong, lyrate, lobed (oak) and friends.
     ======================================================================= */
  function simpleLeaf(cfg) {
    var P = [];
    var L = cfg.L, maxW = cfg.maxW, e1 = cfg.e1, e2 = cfg.e2, NORM = peakNorm(e1, e2);
    var bow = cfg.bow || 0, rand = rng(cfg.seed || 7);
    var margin = cfg.margin || 'entire';
    var lobes = cfg.lobes || 0, lobeDepth = cfg.lobeDepth || 0;

    function midX(t) { return Math.sin(t * Math.PI) * bow; }
    function yAt(t) { return -t * L; }
    function halfW(t) {
      var w = maxW * Math.pow(clamp01(t), e1) * Math.pow(clamp01(1 - t), e2) * NORM;
      if (lobes) {                                   // scalloped width = rounded pinnate lobes (oak)
        var ph = cfg.lobePhase || 0;
        w *= (1 - lobeDepth * (0.5 + 0.5 * Math.cos(lobes * 2 * Math.PI * t + ph)));
      }
      if (cfg.basalLobe && t < 0.18) {               // little basal ears (lyrate / poplar)
        w += cfg.basalLobe * maxW * Math.sin(t / 0.18 * Math.PI);
      }
      return w;
    }
    var fns = { midX: midX, yAt: yAt, halfW: halfW };

    /* -- outline with margin -- */
    var toothy = (margin === 'serrate' || margin === 'dentate' || margin === 'crenate' || margin === 'frill');
    var splined = (margin !== 'serrate' && margin !== 'dentate');
    var teeth = cfg.teeth || (toothy ? 16 : 0);
    var amp = (cfg.toothAmp != null ? cfg.toothAmp : 0.05) * maxW;

    function side(sgn) {
      var N = toothy ? teeth * 2 : 64, base = [];
      for (var i = 0; i <= N; i++) {
        var t = i / N, mx = midX(t), w = halfW(t), y = yAt(t);
        base.push([mx + sgn * w, y, t]);
      }
      if (!toothy) return base;
      var out = [];
      for (var i = 0; i < base.length; i++) {
        var p = base[i], a = base[Math.max(0, i - 1)], b = base[Math.min(base.length - 1, i + 1)];
        var tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
        var nx = -ty / tl, ny = tx / tl;
        if ((p[0] - midX(p[2])) * nx < 0) { nx = -nx; ny = -ny; }     // force outward
        var taper = Math.sin(clamp01(p[2]) * Math.PI);
        var o = (i % 2 === 1) ? amp : -amp * 0.16;
        if (margin === 'frill') o = (i % 2 === 1 ? amp : -amp) * (0.7 + rand() * 0.6);
        o *= taper;
        var sx = p[0] + nx * o, sy = p[1] + ny * o;
        if (margin === 'serrate' && i % 2 === 1) sy += -amp * 0.55 * taper;  // teeth lean to apex
        out.push([sx, sy, p[2]]);
      }
      return out;
    }
    var R = side(1), Lf = side(-1).reverse();
    var outline = R.concat(Lf);
    var od = splined ? spline(outline, true) : poly(outline, true);
    P.push({ k: 'fill', d: od, cls: 'lf-lamina' });
    P.push({ k: 'path', d: od, cls: 'lf-edge', w: cfg.edgeW || 2 });

    /* -- petiole -- */
    var pet = cfg.petiole != null ? cfg.petiole : L * 0.22;
    if (pet > 0) {
      P.push({ k: 'path', d: 'M0 ' + f(pet) + ' Q' + f((rand() - 0.5) * pet * 0.3) + ' ' + f(pet * 0.5) + ' 0 0', cls: 'lf-petiole', w: cfg.petioleW || 3 });
      if (cfg.flatPetiole) P.push({ k: 'path', d: 'M' + 2.4 + ' ' + f(pet) + ' Q' + f((rand() - 0.5) * pet * 0.3 + 2.4) + ' ' + f(pet * 0.5) + ' 1.6 0', cls: 'lf-petiole', w: 1.2 });
    }

    /* -- midrib -- */
    var mid = []; for (var i = 0; i <= 30; i++) { var t = i / 30; mid.push([midX(t), yAt(t)]); }
    P.push({ k: 'path', d: spline(mid, false), cls: 'lf-midrib', w: cfg.midW || 2.4 });

    /* -- venation -- */
    var ven = cfg.venation || 'pinnate';
    if (ven === 'pinnate') pinnate(P, fns, cfg, rand);
    else if (ven === 'palmate') palmateVeins(P, fns, cfg, rand);
    else if (ven === 'parallel') parallelVeins(P, fns, cfg, rand);
    else if (ven === 'arcuate') arcuateVeins(P, fns, cfg, rand);

    return P;
  }
  LS.simpleLeaf = simpleLeaf;
  LS.builders.simple = simpleLeaf;

  /* ---------- venation styles ---------- */
  function pinnate(P, fns, cfg, rand) {
    var n = cfg.veins || 6, vend = cfg.vend || 0.085, lift = cfg.vlift || 26, fine = cfg.fine !== false;
    for (var i = 0; i < n; i++) {
      var t = 0.14 + (i / Math.max(1, n - 1)) * 0.74, sgn = (i % 2 === 0) ? 1 : -1;
      var Mx = fns.midX(t), My = fns.yAt(t);
      var te = Math.min(t + vend, 0.965);
      var Ex = fns.midX(te) + sgn * fns.halfW(te) * 0.88, Ey = fns.yAt(te);
      var cx = (Mx + Ex) / 2 + sgn * 8, cy = (My + Ey) / 2 - lift;
      var d = 'M' + f(Mx) + ' ' + f(My) + ' Q' + f(cx) + ' ' + f(cy) + ' ' + f(Ex) + ' ' + f(Ey);
      P.push({ k: 'path', d: d, cls: 'lf-vein', w: 1.5 });
      if (fine) for (var k = 1; k <= 2; k++) {
        var ft = k / 3, fx = Mx + (Ex - Mx) * ft, fy = My + (Ey - My) * ft;
        var fa = Math.atan2(Ey - My, Ex - Mx) + sgn * (0.65 + rand() * 0.3), fl = 11 + rand() * 12;
        P.push({ k: 'path', d: 'M' + f(fx) + ' ' + f(fy) + ' L' + f(fx + Math.cos(fa) * fl) + ' ' + f(fy + Math.sin(fa) * fl), cls: 'lf-fine', w: 0.8 });
      }
    }
  }
  function palmateVeins(P, fns, cfg, rand) {
    var n = cfg.veins || 5;
    for (var i = 0; i < n; i++) {
      var frac = (i / (n - 1) - 0.5);
      var t = 0.86 - Math.abs(frac) * 0.34;          // outer ribs reach less far up
      var Ex = fns.midX(t) + (frac > 0 ? 1 : frac < 0 ? -1 : 0) * fns.halfW(t) * (0.5 + Math.abs(frac) * 0.9);
      var Ey = fns.yAt(t);
      var cx = Ex * 0.45, cy = Ey * 0.5;
      P.push({ k: 'path', d: 'M0 0 Q' + f(cx) + ' ' + f(cy) + ' ' + f(Ex) + ' ' + f(Ey), cls: 'lf-vein', w: 1.6 });
    }
  }
  function parallelVeins(P, fns, cfg, rand) {
    var n = cfg.veins || 5;
    for (var i = 0; i < n; i++) {
      var frac = (i / (n - 1) - 0.5);
      var pts = [];
      for (var s = 0; s <= 18; s++) { var t = s / 18; pts.push([fns.midX(t) + frac * 2 * fns.halfW(t) * 0.84, fns.yAt(t)]); }
      P.push({ k: 'path', d: spline(pts, false), cls: 'lf-vein', w: Math.abs(frac) < 0.05 ? 1.8 : 1.1 });
    }
  }
  // plantain / ribwort: a few strong ribs that bow out then converge at the apex
  function arcuateVeins(P, fns, cfg, rand) {
    var n = cfg.veins || 5;
    for (var i = 0; i < n; i++) {
      var frac = (i / (n - 1) - 0.5);
      if (Math.abs(frac) < 0.02) { var mp = []; for (var s = 0; s <= 18; s++) { var t = s / 18; mp.push([fns.midX(t), fns.yAt(t)]); } P.push({ k: 'path', d: spline(mp, false), cls: 'lf-vein', w: 1.8 }); continue; }
      var pts = [];
      for (var s = 0; s <= 20; s++) {
        var t = s / 20;
        var bulge = Math.sin(t * Math.PI) * (0.55 + (1 - Math.abs(frac)) * 0.3);  // bow toward margin mid-leaf, return at apex
        pts.push([fns.midX(t) + frac * 2 * fns.halfW(t) * bulge, fns.yAt(t)]);
      }
      P.push({ k: 'path', d: spline(pts, false), cls: 'lf-vein', w: 1.3 });
    }
  }
  LS.pinnate = pinnate;

  /* =========================================================================
     PALMATE LEAF — lobes radiating from the base on a star of main veins.
     Covers mallow (shallow rounded), maple (deep pointed), ivy, etc.
     ======================================================================= */
  function palmateLeaf(cfg) {
    var P = [], K = cfg.lobes || 5, Rmax = cfg.L, spread = cfg.spread || 1.15;
    var sinus = cfg.sinus != null ? cfg.sinus : 0.5, baseW = (cfg.baseW || 0.1) * Rmax;
    var pointy = cfg.pointy, rand = rng(cfg.seed || 7), sub = cfg.subTeeth;
    function pt(ang, r) { return [Math.sin(ang) * r, -Math.cos(ang) * r]; }
    var tips = []; for (var k = 0; k < K; k++) { var fr = K === 1 ? 0 : (k / (K - 1) - 0.5); tips.push(fr * 2 * spread); }
    var lobeR = []; for (var k = 0; k < K; k++) lobeR.push(Rmax * (cfg.midLong ? (1 - Math.abs(tips[k]) * 0.22) : 1));

    var b = [];
    b.push([-baseW, cfg.cordate ? -Rmax * 0.04 : 0]);
    for (var k = 0; k < K; k++) {
      if (k > 0) {
        var sa = (tips[k - 1] + tips[k]) / 2;
        b.push(pt(sa, Rmax * sinus));
      }
      // optional shoulder teeth on the way out to a pointed lobe (maple)
      if (sub && k > 0) { var pa = tips[k] - (tips[k] - tips[k - 1]) * 0.28; b.push(pt(pa, lobeR[k] * 0.74)); }
      b.push(pt(tips[k], lobeR[k]));
      if (sub && k < K - 1) { var pa2 = tips[k] + (tips[k + 1] - tips[k]) * 0.28; b.push(pt(pa2, lobeR[k] * 0.74)); }
    }
    b.push([baseW, cfg.cordate ? -Rmax * 0.04 : 0]);
    if (cfg.cordate) b.push([0, Rmax * 0.05]);          // little notch dip at the very base
    var od = pointy ? poly(b, true) : spline(b, true);
    P.push({ k: 'fill', d: od, cls: 'lf-lamina' });
    P.push({ k: 'path', d: od, cls: 'lf-edge', w: cfg.edgeW || 2 });

    var pet = cfg.petiole != null ? cfg.petiole : Rmax * 0.4;
    P.push({ k: 'path', d: 'M0 ' + f(pet) + ' Q' + f((rand() - 0.5) * pet * 0.25) + ' ' + f(pet * 0.5) + ' 0 0', cls: 'lf-petiole', w: cfg.petioleW || 3.2 });

    for (var k = 0; k < K; k++) {
      var tp = pt(tips[k], lobeR[k] * 0.9);
      P.push({ k: 'path', d: 'M0 0 Q' + f(tp[0] * 0.42) + ' ' + f(tp[1] * 0.5) + ' ' + f(tp[0]) + ' ' + f(tp[1]), cls: 'lf-vein', w: 1.7 });
      // a couple of side veins per lobe
      for (var s = 1; s <= 2; s++) {
        var ft = 0.42 + s * 0.2, bx = tp[0] * ft, by = tp[1] * ft, sgn = (s % 2 ? 1 : -1);
        var ang = Math.atan2(tp[1], tp[0]) + sgn * 0.7, ln = lobeR[k] * 0.16;
        P.push({ k: 'path', d: 'M' + f(bx) + ' ' + f(by) + ' L' + f(bx + Math.cos(ang) * ln) + ' ' + f(by + Math.sin(ang) * ln), cls: 'lf-fine', w: 0.85 });
      }
    }
    return P;
  }
  LS.builders.palmate = palmateLeaf;

  /* =========================================================================
     TRIFOLIATE — three leaflets on a short stalk (clover / strawberry).
     ======================================================================= */
  function trifoliate(cfg) {
    var P = [], rand = rng(cfg.seed || 7);
    // petiole runs from below the base up to the common junction at the origin
    P.push({ k: 'path', d: 'M0 ' + f(cfg.L * 0.95) + ' Q' + f((rand() - 0.5) * 18) + ' ' + f(cfg.L * 0.45) + ' 0 0', cls: 'lf-petiole', w: 3 });
    var angles = [-cfg.spread, 0, cfg.spread];
    angles.forEach(function (a, idx) {
      var lf = LS.simpleLeaf({ L: cfg.leafL, maxW: cfg.leafW, e1: cfg.e1, e2: cfg.e2, bow: 0, margin: cfg.margin, teeth: cfg.teeth, toothAmp: cfg.toothAmp, venation: 'pinnate', veins: cfg.veins, vend: 0.07, vlift: 14, petiole: cfg.leafL * 0.07, midW: 1.6, edgeW: 1.8, seed: (cfg.seed || 7) + idx, fine: false });
      P.push({ k: 'group', items: lf, rot: a, tx: 0, ty: 0 });
    });
    return P;
  }
  LS.builders.trifoliate = trifoliate;

  /* =========================================================================
     PLANTAIN — broad ribbed basal leaf: ovate lamina + arcuate ribs that gather
     into a sheathing base. (Plantago / ribwort.)
     ======================================================================= */
  function plantain(cfg) {
    var P = LS.simpleLeaf(Object.assign({ venation: 'arcuate', margin: 'entire' }, cfg));
    // gathered sheath: a few parallel ribs squeezing together below the blade
    var pet = cfg.petiole != null ? cfg.petiole : cfg.L * 0.35;
    var n = (cfg.veins || 5);
    for (var i = 0; i < n; i++) {
      var frac = (i / (n - 1) - 0.5);
      var x0 = frac * cfg.maxW * 0.5;
      P.push({ k: 'path', d: 'M' + f(frac * 3) + ' ' + f(pet) + ' Q' + f(x0 * 0.4) + ' ' + f(pet * 0.4) + ' ' + f(x0) + ' 0', cls: 'lf-fine', w: 1 });
    }
    return P;
  }
  LS.builders.plantain = plantain;

  /* =========================================================================
     MULLEIN — large oblong felted rosette leaf: soft margin, dense net veins,
     stippled "wool" hairs across the lamina.
     ======================================================================= */
  function mullein(cfg) {
    var P = LS.simpleLeaf(Object.assign({ venation: 'pinnate', margin: 'crenate', toothAmp: 0.025, teeth: 22, veins: 9, vend: 0.05, vlift: 16, fine: true }, cfg));
    // wool: short random hairs scattered inside the lamina silhouette
    var rand = rng((cfg.seed || 7) + 31), maxW = cfg.maxW, L = cfg.L, e1 = cfg.e1, e2 = cfg.e2, NORM = peakNorm(e1, e2);
    var count = cfg.wool || 220;
    for (var i = 0; i < count; i++) {
      var t = 0.04 + rand() * 0.92;
      var w = maxW * Math.pow(t, e1) * Math.pow(1 - t, e2) * NORM * 0.9;
      var x = (rand() * 2 - 1) * w, y = -t * L;
      var a = rand() * Math.PI * 2, ln = 3 + rand() * 4;
      P.push({ k: 'line', x1: x, y1: y, x2: x + Math.cos(a) * ln, y2: y + Math.sin(a) * ln, cls: 'lf-hair', w: 0.6 });
    }
    return P;
  }
  LS.builders.mullein = mullein;

  /* =========================================================================
     RENDER — flatten groups, draw into <svg>, fit bbox to the card frame,
     anchor the leaf base near the bottom-centre.
     ======================================================================= */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function eln(n, a) { var e = document.createElementNS(SVGNS, n); if (a) for (var k in a) e.setAttribute(k, a[k]); return e; }

  var DEG = 180 / Math.PI;
  function drawPrims(parent, prims) {
    prims.forEach(function (p) {
      if (p.k === 'group') {
        var gg = eln('g', { transform: 'translate(' + f(p.tx || 0) + ' ' + f(p.ty || 0) + ') rotate(' + f((p.rot || 0) * DEG) + ')' });
        parent.appendChild(gg);
        drawPrims(gg, p.items);
      } else if (p.k === 'fill') parent.appendChild(eln('path', { d: p.d, class: p.cls }));
      else if (p.k === 'path') parent.appendChild(eln('path', { d: p.d, class: p.cls, 'stroke-width': p.w }));
      else if (p.k === 'line') parent.appendChild(eln('line', { x1: f(p.x1), y1: f(p.y1), x2: f(p.x2), y2: f(p.y2), class: p.cls, 'stroke-width': p.w }));
      else if (p.k === 'dot') parent.appendChild(eln('circle', { cx: f(p.x), cy: f(p.y), r: p.r, class: p.cls }));
    });
  }

  function render(holder, cfg) {
    var VB_W = 600, VB_H = 780, cx = 300, baseY = 712, FrameW = 520, FrameH = 642;
    var svg = eln('svg', { viewBox: '0 0 ' + VB_W + ' ' + VB_H, preserveAspectRatio: 'xMidYMid meet' });
    holder.appendChild(svg);
    var g = eln('g'); svg.appendChild(g);

    var builder = LS.builders[cfg.builder] || LS.simpleLeaf;
    drawPrims(g, builder(cfg));

    // Fit-to-frame. If the holder isn't laid out yet getBBox returns a 0 box,
    // which would make the scale Infinity — retry on the next frame instead.
    function fit() {
      var bb = g.getBBox();
      if (!bb.width || !bb.height) return false;
      var s = Math.min(FrameW / bb.width, FrameH / bb.height) * (cfg.fill || 0.94);
      var bottom = bb.y + bb.height;
      g.setAttribute('transform', 'translate(' + cx + ' ' + baseY + ') scale(' + s.toFixed(4) + ') translate(' + (-(bb.x + bb.width / 2)) + ' ' + (-bottom) + ')');
      return true;
    }
    if (!fit()) requestAnimationFrame(fit);
    return svg;
  }
  LS.render = render;
})(window);
