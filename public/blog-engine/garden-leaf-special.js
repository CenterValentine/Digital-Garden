/* ============================================================================
   garden-leaf-special.js — structural leaf builders (attach to LeafShapes)
   compound · dissected · fan(palm/ginkgo) · needles · flytrap · onion ·
   grass blade · grass spike.  Leaf-space: base at origin, apex UP = -y.
   ========================================================================== */
(function (global) {
  'use strict';
  var LS = global.LeafShapes = global.LeafShapes || { builders: {} };
  var f = LS.f, spline = LS.spline, poly = LS.poly, rng = LS.rng;

  function midFn(bow) { return function (t) { return Math.sin(t * Math.PI) * (bow || 0); }; }

  /* ---------- COMPOUND PINNATE (tomato, ash) ---------- */
  function compoundPinnate(cfg) {
    var P = [], rand = rng(cfg.seed || 7), L = cfg.L, mid = midFn(cfg.bow);
    var rp = []; for (var i = 0; i <= 24; i++) { var t = i / 24; rp.push([mid(t), -t * L]); }
    P.push({ k: 'path', d: spline(rp, false), cls: 'lf-midrib', w: cfg.rachisW || 2.6 });
    var pet = cfg.petiole != null ? cfg.petiole : L * 0.16;
    P.push({ k: 'path', d: 'M0 ' + f(pet) + ' L0 0', cls: 'lf-petiole', w: cfg.petioleW || 3 });

    var pairs = cfg.pairs || 4, ang = cfg.leafAngle || 0.5;
    function leaflet(size, seed) {
      return LS.simpleLeaf({ L: size, maxW: size * (cfg.leafWR || 0.42), e1: cfg.e1 || 0.55, e2: cfg.e2 || 0.62, bow: 0, margin: cfg.lmargin || 'serrate', teeth: cfg.lteeth || 9, toothAmp: cfg.ltoothAmp || 0.09, veins: 3, vend: 0.07, vlift: size * 0.12, petiole: size * 0.05, midW: 1.4, edgeW: 1.6, fine: false, seed: seed });
    }
    for (var j = 0; j < pairs; j++) {
      var t = 0.16 + (pairs === 1 ? 0 : j / (pairs - 1)) * 0.72;
      var ins = [mid(t), -t * L], size = (cfg.leafL || L * 0.3) * (1 - j * 0.13);
      [-1, 1].forEach(function (sd) {
        P.push({ k: 'path', d: 'M' + f(ins[0]) + ' ' + f(ins[1]) + ' l' + f(sd * 6) + ' ' + f(-2), cls: 'lf-vein', w: 1.2 });
        P.push({ k: 'group', items: leaflet(size, (cfg.seed || 7) + j * 7 + (sd > 0 ? 3 : 1)), rot: sd * ang, tx: ins[0] + sd * 5, ty: ins[1] - 1 });
      });
      if (cfg.interject && j < pairs - 1) {            // tomato's small interjected leaflets
        var ti = t + 0.36 / (pairs - 1), insi = [mid(ti), -ti * L], sz = size * 0.4;
        [-1, 1].forEach(function (sd) { P.push({ k: 'group', items: leaflet(sz, (cfg.seed || 7) + j + (sd > 0 ? 50 : 60)), rot: sd * (ang + 0.15), tx: insi[0] + sd * 3, ty: insi[1] }); });
      }
    }
    P.push({ k: 'group', items: leaflet((cfg.leafL || L * 0.3) * 1.06, (cfg.seed || 7) + 99), rot: 0, tx: mid(1) * 1, ty: -L });
    return P;
  }
  LS.builders.compound = compoundPinnate;

  /* ---------- DISSECTED / FEATHERY (carrot tripinnate, yarrow bipinnate) ---------- */
  function dissected(cfg) {
    var P = [], rand = rng(cfg.seed || 7), L = cfg.L, mid = midFn(cfg.bow);
    var rp = []; for (var i = 0; i <= 24; i++) { var t = i / 24; rp.push([mid(t), -t * L]); }
    P.push({ k: 'path', d: spline(rp, false), cls: 'lf-midrib', w: cfg.rachisW || 2 });
    var pet = cfg.petiole != null ? cfg.petiole : L * 0.18;
    P.push({ k: 'path', d: 'M0 ' + f(pet) + ' L0 0', cls: 'lf-petiole', w: cfg.petioleW || 2.6 });

    function frondlet(bx, by, dx, dy, len, order) {
      var ex = bx + dx * len, ey = by + dy * len;
      P.push({ k: 'path', d: 'M' + f(bx) + ' ' + f(by) + ' L' + f(ex) + ' ' + f(ey), cls: order >= 1 ? 'lf-vein' : 'lf-fine', w: order >= 1 ? 1.1 : 0.7 });
      if (order <= 0) { if (cfg.tipBlade) P.push({ k: 'dot', x: ex, y: ey, r: 1.1, cls: 'lf-fine-dot' }); return; }
      var sub = cfg.sub || 5, ang = Math.atan2(dy, dx);
      for (var k = 1; k <= sub; k++) {
        var tt = k / (sub + 1), px = bx + (ex - bx) * tt, py = by + (ey - by) * tt;
        var sl = len * (cfg.subLen || 0.34) * (0.6 + 0.7 * Math.sin(tt * Math.PI));
        [-1, 1].forEach(function (s) {
          var na = ang + s * (cfg.subAngle || 0.7);
          // tilt sub-segments toward apex (up = -y)
          na = Math.atan2(Math.sin(na) - 0.18, Math.cos(na));
          frondlet(px, py, Math.cos(na), Math.sin(na), sl, order - 1);
        });
      }
    }
    var pairs = cfg.pairs || 7, pang = cfg.pinAngle || 0.62;
    for (var j = 0; j < pairs; j++) {
      var t = 0.08 + (pairs === 1 ? 0 : j / (pairs - 1)) * 0.84;
      var bx = mid(t), by = -t * L;
      var len = (cfg.pinLen || L * 0.42) * (0.45 + 0.8 * Math.sin((0.15 + 0.85 * (1 - t)) * Math.PI * 0.8));
      [-1, 1].forEach(function (s) {
        var dx = s * Math.sin(pang), dy = -Math.cos(pang);
        frondlet(bx, by, dx, dy, len, (cfg.order || 2) - 1);
      });
    }
    // terminal frondlet straight up
    frondlet(mid(1), -L, 0, -1, (cfg.pinLen || L * 0.42) * 0.5, (cfg.order || 2) - 1);
    return P;
  }
  LS.builders.dissected = dissected;

  /* ---------- FAN: palm (costapalmate) & ginkgo (dichotomous sector) ---------- */
  function fan(cfg) {
    var P = [], rand = rng(cfg.seed || 7), R = cfg.L;
    function pt(a, r) { return [Math.sin(a) * r, -Math.cos(a) * r]; }
    var spread = cfg.spread || 1.45;

    if (cfg.style === 'ginkgo') {
      var hub = [0, -R * 0.04];
      var rim = [];
      var steps = 40;
      for (var i = 0; i <= steps; i++) {
        var a = -spread + (i / steps) * 2 * spread;
        var notch = 1 - cfg.notch * Math.exp(-Math.pow(a / (spread * 0.16), 2));   // central cleft
        var wob = 1 + 0.02 * Math.sin(a * 9);
        rim.push(pt(a, R * notch * wob));
      }
      var outline = [pt(-spread * 0.04, R * 0.0)].concat(rim).concat([pt(spread * 0.04, R * 0.0)]);
      // close down to base
      outline.push([0, R * 0.02]);
      var od = spline(outline, true);
      P.push({ k: 'fill', d: od, cls: 'lf-lamina' });
      P.push({ k: 'path', d: od, cls: 'lf-edge', w: cfg.edgeW || 2 });
      P.push({ k: 'path', d: 'M0 ' + f(R * 0.45) + ' L0 0', cls: 'lf-petiole', w: cfg.petioleW || 3 });
      // dichotomous veins: fan from base, fork toward rim
      var nv = cfg.veins || 11;
      for (var v = 0; v < nv; v++) {
        var a0 = -spread * 0.86 + (v / (nv - 1)) * 2 * spread * 0.86;
        var nf = 1 - cfg.notch * Math.exp(-Math.pow(a0 / (spread * 0.16), 2));
        var mid = pt(a0, R * 0.5 * nf), tip = pt(a0, R * 0.9 * nf);
        P.push({ k: 'path', d: 'M0 0 L' + f(mid[0]) + ' ' + f(mid[1]), cls: 'lf-vein', w: 1 });
        // fork
        [-1, 1].forEach(function (s) {
          var af = a0 + s * 0.06, tf = pt(af, R * 0.9 * nf);
          P.push({ k: 'path', d: 'M' + f(mid[0]) + ' ' + f(mid[1]) + ' L' + f(tf[0]) + ' ' + f(tf[1]), cls: 'lf-vein', w: 0.9 });
        });
      }
      return P;
    }

    /* palm — costapalmate: segments emanate from a short curved costa as wedge
       strips (narrow at base, widening, split & drooping at the tip). */
    var costaR = R * (cfg.costa || 0.18), hubY = -costaR;
    P.push({ k: 'path', d: 'M0 ' + f(R * 0.5) + ' L0 ' + f(hubY * 0.5), cls: 'lf-petiole', w: cfg.petioleW || 6 });
    var K = cfg.segments || 15;
    for (var k = 0; k < K; k++) {
      var fr = (k / (K - 1) - 0.5);
      var a = fr * 2 * spread;
      // base sits on a small fan arc (the costa) so segments don't collapse to a point
      var bx = Math.sin(a) * costaR * 0.55, by = -Math.cos(a) * costaR * 0.55;
      var droop = (cfg.droop || 0.3) * fr * fr;
      var len = R * (1 - Math.abs(fr) * 0.1);
      var tipX = Math.sin(a) * len, tipY = by - Math.cos(a) * len + droop * R;
      var perpA = a + Math.PI / 2;
      var baseW = R * (cfg.segW || 0.06) * 0.5, tipW = R * (cfg.segW || 0.06);
      var bL = [bx + Math.cos(perpA) * baseW, by + Math.sin(perpA) * baseW];
      var bR = [bx - Math.cos(perpA) * baseW, by - Math.sin(perpA) * baseW];
      // split V tip
      var tC = [tipX, tipY];
      var tL = [tipX + Math.cos(perpA) * tipW, tipY + Math.sin(perpA) * tipW - Math.cos(a) * R * 0.02];
      var tR = [tipX - Math.cos(perpA) * tipW, tipY - Math.sin(perpA) * tipW - Math.cos(a) * R * 0.02];
      var midL = [(bL[0] + tL[0]) / 2 + Math.sin(a) * 3, (bL[1] + tL[1]) / 2];
      var midR = [(bR[0] + tR[0]) / 2 - Math.sin(a) * 3, (bR[1] + tR[1]) / 2];
      var od = spline([bL, midL, tL, [tipX + Math.sin(a) * R * 0.012, tipY + R * 0.012], tR, midR, bR], true);
      P.push({ k: 'fill', d: od, cls: 'lf-lamina' });
      P.push({ k: 'path', d: od, cls: 'lf-edge', w: 1.3 });
      P.push({ k: 'path', d: 'M' + f(bx) + ' ' + f(by) + ' L' + f(tipX) + ' ' + f(tipY), cls: 'lf-vein', w: 1.1 });   // pleat
    }
    return P;
  }
  LS.builders.fan = fan;

  /* ---------- NEEDLES — pine fascicle bound at a basal sheath ---------- */
  function needles(cfg) {
    var P = [], rand = rng(cfg.seed || 7), L = cfg.L, n = cfg.count || 3;
    var sheath = L * 0.12;
    // sheath wrap
    P.push({ k: 'path', d: 'M' + f(-cfg.sheathW || -5) + ' ' + f(sheath * 0.2) + ' L' + f(cfg.sheathW || 5) + ' ' + f(sheath * 0.2) + ' L' + f((cfg.sheathW || 5) * 0.7) + ' ' + f(-sheath * 0.9) + ' L' + f(-(cfg.sheathW || 5) * 0.7) + ' ' + f(-sheath * 0.9) + ' Z', cls: 'lf-lamina', edge: 1 });
    P.push({ k: 'path', d: 'M' + f(-(cfg.sheathW || 5)) + ' ' + f(sheath * 0.2) + ' L' + f(cfg.sheathW || 5) + ' ' + f(sheath * 0.2) + ' L' + f((cfg.sheathW || 5) * 0.7) + ' ' + f(-sheath * 0.9) + ' L' + f(-(cfg.sheathW || 5) * 0.7) + ' ' + f(-sheath * 0.9) + ' Z', cls: 'lf-edge', w: 1.6 });
    for (var s = 0; s < 3; s++) P.push({ k: 'line', x1: -(cfg.sheathW || 5), y1: -sheath * (0.1 + s * 0.28), x2: (cfg.sheathW || 5), y2: -sheath * (0.1 + s * 0.28), cls: 'lf-fine', w: 0.7 });
    for (var i = 0; i < n; i++) {
      var fr = n === 1 ? 0 : (i / (n - 1) - 0.5);
      var spread = (cfg.fan || 0.16) * fr;
      var topY = -L, topX = Math.sin(spread) * L + fr * cfg.tipFan * L;
      var cx = (0 + topX) / 2 + fr * 14, cy = (-sheath - L) / 2;
      // each needle = a hair-thin double edge (semi-terete)
      P.push({ k: 'path', d: 'M0 ' + f(-sheath) + ' Q' + f(cx) + ' ' + f(cy) + ' ' + f(topX) + ' ' + f(topY), cls: 'lf-needle', w: 2.4 });
      P.push({ k: 'path', d: 'M' + 1.1 + ' ' + f(-sheath) + ' Q' + f(cx + 1.1) + ' ' + f(cy) + ' ' + f(topX + 0.6) + ' ' + f(topY), cls: 'lf-needle-hi', w: 0.7 });
    }
    return P;
  }
  LS.builders.needles = needles;

  /* ---------- VENUS FLY TRAP — winged phyllode + hinged toothed trap ---------- */
  function flytrap(cfg) {
    var P = [], rand = rng(cfg.seed || 7), L = cfg.L;
    var phyTop = -L * 0.5, phyW = cfg.phyW || L * 0.16;
    // winged petiole (obovate phyllode)
    var ph = []; var N = 24;
    for (var i = 0; i <= N; i++) { var t = i / N; ph.push([phyW * Math.pow(t, 0.5) * Math.pow(1 - t, 0.7) * 3.1, -t * L * 0.5]); }
    var phl = []; for (var i = N; i >= 0; i--) { var t = i / N; phl.push([-phyW * Math.pow(t, 0.5) * Math.pow(1 - t, 0.7) * 3.1, -t * L * 0.5]); }
    var phd = spline(ph.concat(phl), true);
    P.push({ k: 'fill', d: phd, cls: 'lf-lamina' });
    P.push({ k: 'path', d: phd, cls: 'lf-edge', w: 1.8 });
    P.push({ k: 'path', d: 'M0 ' + f(L * 0.04) + ' L0 ' + f(phyTop), cls: 'lf-midrib', w: 1.6 });

    // the trap: two lobes hinged on a vertical midline above the phyllode
    var hinge = phyTop, lobeR = cfg.lobeR || L * 0.26, lobeH = cfg.lobeH || L * 0.42;
    P.push({ k: 'path', d: 'M0 ' + f(hinge + 4) + ' L0 ' + f(hinge - lobeH), cls: 'lf-midrib', w: 1.8 });   // hinge/midrib
    [-1, 1].forEach(function (sd) {
      // half-lobe outline: from hinge top, bulge out, back to hinge bottom
      var pts = [
        [0, hinge - lobeH + 4],
        [sd * lobeR * 0.62, hinge - lobeH * 1.02],
        [sd * lobeR, hinge - lobeH * 0.55],
        [sd * lobeR * 0.9, hinge - lobeH * 0.12],
        [sd * lobeR * 0.4, hinge + 2],
        [0, hinge + 2]
      ];
      var d = spline(pts, true);
      P.push({ k: 'fill', d: d, cls: 'lf-lamina' });
      P.push({ k: 'path', d: d, cls: 'lf-edge', w: 1.8 });
      // marginal cilia (the interlocking "teeth")
      var teeth = cfg.cilia || 11;
      for (var c = 0; c <= teeth; c++) {
        var tt = c / teeth;
        // sample along the outer rim (approx between the bulge points)
        var ang = Math.PI * (0.5 - tt);   // sweep
        var rx = sd * lobeR * Math.cos(Math.PI / 2 - tt * Math.PI) * 0 + sd * lobeR * (0.4 + 0.6 * Math.sin(tt * Math.PI));
        var ry = hinge - lobeH * (0.1 + 0.85 * tt);
        var ox = sd * (Math.abs(rx) + 1);
        var clen = cfg.ciliaLen || lobeR * 0.5;
        var oa = Math.atan2((ry - (hinge - lobeH * 0.5)), ox) ;
        P.push({ k: 'line', x1: rx, y1: ry, x2: rx + sd * clen * 0.5, y2: ry - clen * 0.5 * (tt < 0.5 ? 1 : -0.2), cls: 'lf-cilia', w: 1.4 });
      }
      // trigger hairs (dots) inside
      for (var h = 0; h < 3; h++) P.push({ k: 'dot', x: sd * lobeR * 0.42, y: hinge - lobeH * (0.3 + h * 0.22), r: 1.6, cls: 'lf-trigger' });
    });
    return P;
  }
  LS.builders.flytrap = flytrap;

  /* ---------- ONION — hollow terete (tubular) leaves from a bulb ---------- */
  function onion(cfg) {
    var P = [], rand = rng(cfg.seed || 7), L = cfg.L, n = cfg.count || 3;
    // bulb hint
    P.push({ k: 'fill', d: spline([[-cfg.bulbW || -16, L * 0.12], [-cfg.bulbW * 0.6 || -10, L * 0.34], [0, L * 0.4], [cfg.bulbW * 0.6 || 10, L * 0.34], [cfg.bulbW || 16, L * 0.12], [0, L * 0.02]], true), cls: 'lf-lamina' });
    P.push({ k: 'path', d: 'M0 ' + f(L * 0.4) + ' Q' + f(-(cfg.bulbW || 16)) + ' ' + f(L * 0.18) + ' 0 0', cls: 'lf-fine', w: 0.9 });
    P.push({ k: 'path', d: 'M0 ' + f(L * 0.4) + ' Q' + f(cfg.bulbW || 16) + ' ' + f(L * 0.18) + ' 0 0', cls: 'lf-fine', w: 0.9 });
    for (var i = 0; i < n; i++) {
      var fr = n === 1 ? 0 : (i / (n - 1) - 0.5);
      var lean = fr * (cfg.lean || 0.5), len = L * (0.78 + (0.5 - Math.abs(fr)) * 0.4);
      var tw = (cfg.tubeW || 9) * (1 - Math.abs(fr) * 0.2);
      var tipX = Math.sin(lean) * len + fr * 95, tipY = -len;
      var c1x = fr * 60, c1y = -len * 0.5;
      // centerline
      function curve(off) { return 'M' + f(off) + ' 0 Q' + f(c1x + off) + ' ' + f(c1y) + ' ' + f(tipX + off * 0.3) + ' ' + f(tipY); }
      // tube body as a closed shape (left edge up, right edge down)
      var left = [], right = [];
      for (var s = 0; s <= 16; s++) {
        var t = s / 16;
        var bx = (1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * c1x + t * t * tipX;
        var by = (1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * c1y + t * t * tipY;
        var w = tw * (1 - t * 0.92);
        left.push([bx - w, by]); right.push([bx + w, by]);
      }
      var od = spline(left.concat(right.slice().reverse()), true);
      P.push({ k: 'fill', d: od, cls: 'lf-lamina' });
      P.push({ k: 'path', d: od, cls: 'lf-edge', w: 1.6 });
      P.push({ k: 'path', d: curve(0), cls: 'lf-fine', w: 0.8 });    // glossy ridge
    }
    return P;
  }
  LS.builders.onion = onion;

  /* ---------- GRASS BLADE — long arching linear blade ---------- */
  function grassBlade(cfg) {
    var P = [], L = cfg.L, arc = cfg.arc || 0.5, w0 = cfg.bladeW || 22;
    // centerline (arched): parametric
    function cl(t) { return [Math.sin(t * Math.PI * 0.5) * arc * L * 0.0 + arc * L * t * t, -t * L]; }
    var left = [], right = [];
    for (var s = 0; s <= 30; s++) {
      var t = s / 30, c = cl(t);
      var w = w0 * Math.pow(1 - t, 0.7) * (t < 0.06 ? t / 0.06 : 1);
      // perpendicular ~ horizontal
      left.push([c[0] - w, c[1]]); right.push([c[0] + w, c[1]]);
    }
    var od = spline(left.concat(right.slice().reverse()), true);
    P.push({ k: 'fill', d: od, cls: 'lf-lamina' });
    P.push({ k: 'path', d: od, cls: 'lf-edge', w: 1.8 });
    // midvein + parallels
    var midp = []; for (var s = 0; s <= 30; s++) { var t = s / 30; midp.push(cl(t)); }
    P.push({ k: 'path', d: spline(midp, false), cls: 'lf-midrib', w: 1.8 });
    [-0.5, 0.5].forEach(function (fr) {
      var pts = []; for (var s = 0; s <= 30; s++) { var t = s / 30, c = cl(t), w = w0 * Math.pow(1 - t, 0.7); pts.push([c[0] + fr * 2 * w * 0.6, c[1]]); }
      P.push({ k: 'path', d: spline(pts, false), cls: 'lf-fine', w: 0.8 });
    });
    // basal sheath
    P.push({ k: 'path', d: 'M' + f(-w0 * 0.6) + ' ' + f(L * 0.12) + ' L0 0 L' + f(w0 * 0.6) + ' ' + f(L * 0.12), cls: 'lf-fine', w: 1 });
    return P;
  }
  LS.builders.grass = grassBlade;

  /* ---------- GRASS SPIKE — wheat / barley ear ---------- */
  function grassSpike(cfg) {
    var P = [], rand = rng(cfg.seed || 7), L = cfg.L;
    var earBot = -L * (cfg.earStart || 0.34), earTop = -L * (cfg.earTop || 0.92);
    var earLen = earBot - earTop;
    // culm (stem) + a flag-leaf hint
    P.push({ k: 'path', d: 'M0 ' + f(L * 0.06) + ' L0 ' + f(earBot), cls: 'lf-midrib', w: cfg.culmW || 3 });
    if (cfg.flag) P.push({ k: 'path', d: 'M0 ' + f(L * 0.34 * -1) + ' Q' + f(cfg.flag * L) + ' ' + f(-L * 0.2) + ' ' + f(cfg.flag * L * 0.7) + ' ' + f(L * 0.02), cls: 'lf-lamina', w: 0 });
    // rachis through the ear
    P.push({ k: 'path', d: 'M0 ' + f(earBot) + ' L0 ' + f(earTop), cls: 'lf-fine', w: 1 });
    var rows = cfg.rows || 7;
    for (var r = 0; r < rows; r++) {
      var t = r / (rows - 1);
      var y = earBot + (earTop - earBot) * t;
      [-1, 1].forEach(function (sd) {
        var off = (cfg.grainOff || 7) * (1 - t * 0.2);
        var gx = sd * off, gy = y - earLen * 0.02;
        // grain (filled lens)
        var gw = cfg.grainW || 6, gh = cfg.grainH || 11;
        var gd = spline([[gx, gy + gh * 0.5], [gx + sd * gw, gy + gh * 0.1], [gx + sd * gw * 0.7, gy - gh * 0.5], [gx, gy - gh * 0.55], [gx - sd * gw * 0.2, gy]], true);
        P.push({ k: 'fill', d: gd, cls: 'lf-grain' });
        P.push({ k: 'path', d: gd, cls: 'lf-edge', w: 1 });
        // awn (bristle) from grain tip
        if (cfg.awnLen) {
          var aL = cfg.awnLen * L * (0.85 + rand() * 0.3);
          var ax = sd * 0.4, atop = gy - gh * 0.4 - aL, atx = ax + sd * cfg.awnSpread * aL;
          P.push({ k: 'path', d: 'M' + f(gx + sd * gw * 0.4) + ' ' + f(gy - gh * 0.3) + ' L' + f(atx) + ' ' + f(atop), cls: 'lf-awn', w: cfg.awnW || 1 });
        }
      });
    }
    // terminal awns / tuft from the very top
    if (cfg.awnLen) for (var a = -1; a <= 1; a++) {
      var aL = cfg.awnLen * L * 1.05;
      P.push({ k: 'path', d: 'M0 ' + f(earTop) + ' L' + f(a * cfg.awnSpread * aL * 0.7) + ' ' + f(earTop - aL) + '', cls: 'lf-awn', w: cfg.awnW || 1 });
    }
    return P;
  }
  LS.builders.spike = grassSpike;
})(window);
