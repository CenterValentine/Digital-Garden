/* m44-leaf-connect.js
   Layer-bridge: M44 home (L1) → Leaf infographic (L2) → DNA drill-down (L3)
   Each carousel plant species drives a matching botanical leaf form in L2 —
   willow → lanceolate, maple → palmate, yarrow → feathery dissected, etc.
   Depends on: GardenLeaf, GardenDNA, CATS (garden-data.js),
               LeafShapes + LeafSpecial (garden-leaf-shapes.js / garden-leaf-special.js) */
(function (global) {
  'use strict';

  /* ── M44 carousel plant key → garden-data.js CATS key ─────────────────── */
  var PLANT_TO_CAT = {
    hawthorn:  'resume',
    willow:    'writing',
    yarrow:    'about',
    dandelion: 'notes',
    maple:     'garden'
  };

  /* ── Botanical leaf specimens — one per carousel species ───────────────
     Each cfg feeds straight into LeafShapes.render().
     pattern: GardenLeaf silhouette index (0 ovate · 1 lanceolate · 2 cordate · 3 obovate)
     chosen to echo the botanical form so L2's interactive vein diagram
     matches what the decorative specimen card shows.                       */
  var LEAF_SPECIMENS = {
    hawthorn: {
      name: 'Common hawthorn', lat: 'Crataegus monogyna', form: 'PINNATELY LOBED · 3–5 PAIRS',
      cfg: { builder:'simple', seed:33, L:370, maxW:152, e1:0.44, e2:0.52, bow:9,
             lobes:5, lobeDepth:0.68, margin:'lobed', venation:'pinnate',
             veins:5, vend:0.09, vlift:24, petiole:112, midW:2.5 },
      pattern: 2,
      berrySpecimen: true
    },
    willow: {
      name: 'Weeping willow', lat: 'Salix babylonica', form: 'LANCEOLATE · FINELY SERRATE',
      cfg: { builder:'simple', seed:9, L:500, maxW:52, e1:0.62, e2:0.64, bow:28,
             margin:'serrate', teeth:36, toothAmp:0.025, venation:'pinnate',
             veins:10, vend:0.04, vlift:12, petiole:65, midW:1.8 },
      pattern: 1,
      willowSpecimen: true
    },
    yarrow: {
      name: 'Common yarrow', lat: 'Achillea millefolium', form: 'BIPINNATE · FINELY DISSECTED',
      cfg: { builder:'dissected', seed:17, L:420, pairs:8, pinAngle:0.52,
             pinLen:148, order:2, sub:5, subAngle:0.60, subLen:0.34, tipBlade:true },
      pattern: 1,
      yarrowSpecimen: true
    },
    dandelion: {
      name: 'Ribwort plantain', lat: 'Plantago lanceolata', form: 'OVATE · ARCUATE RIBS',
      cfg: { builder:'plantain', seed:3, L:420, maxW:120, e1:0.55, e2:0.72,
             bow:5, margin:'entire', venation:'arcuate', veins:5, petiole:200, midW:2.4 },
      pattern: 1
    },
    maple: {
      name: 'Sugar maple', lat: 'Acer saccharum', form: 'PALMATE · POINTED LOBES',
      cfg: { builder:'palmate', seed:42, L:430, lobes:5, spread:1.18, sinus:0.44,
             baseW:0.08, cordate:true, pointy:true, subTeeth:true, midLong:true, petiole:170 },
      pattern: 3
    }
  };

  /* ── Transition timing constants (mirror David Valentine - Home.html) ── */
  var Z_IN     = 'transform 1s cubic-bezier(.52,0,.34,1), opacity .6s ease .34s';
  var Z_OUT    = 'transform .72s cubic-bezier(.3,0,.32,1), opacity .55s ease';
  var Z_EMERGE = 'transform .68s cubic-bezier(.2,.72,.2,1) .52s, opacity .5s ease .52s, visibility 0s 0s';
  var Z_DIVE   = 'transform 1s cubic-bezier(.52,0,.34,1), opacity .62s ease .36s, visibility 0s 0s';
  var Z_HIDE   = 'transform .6s cubic-bezier(.4,0,.4,1), opacity .44s ease, visibility 0s linear .6s';

  var stage, leafView, dnaView, leafHolder, leafList, dnaHolder, dnaList;
  var curLeaf = null, curDNA = null;

  /* ════════════════════════════════════════════════════════════════════════
     init — call once after M44's chapter-builder script has run            */
  function init() {
    stage      = document.querySelector('.stage');
    leafView   = document.getElementById('leafView');
    dnaView    = document.getElementById('dnaView');
    leafHolder = document.getElementById('leafHolder');
    leafList   = document.getElementById('leafList');
    dnaHolder  = document.getElementById('dnaHolder');
    dnaList    = document.getElementById('dnaList');

    document.getElementById('leafBack').addEventListener('click', closeLeaf);
    document.getElementById('dnaBack').addEventListener('click',  closeDNA);
    var resumeBackEl = document.getElementById('resumeBack');
    if (resumeBackEl) resumeBackEl.addEventListener('click', closeResume);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var rv = document.getElementById('resumeView');
      if (rv && rv.classList.contains('open')) { closeResume(); return; }
      if (dnaView.classList.contains('open'))  closeDNA();
      else if (leafView.classList.contains('open')) closeLeaf();
    });

    /* Wire every chapter CTA to openLeaf */
    document.querySelectorAll('.ch-c').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var sec = btn.closest('section[id]');
        if (sec) openLeaf(sec.id, btn);
      });
    });
  }

  /* ── Notes: the carousel's dandelion seed-head, stem & taproot removed ── */
  function buildDandelionHead(holder, n) {
    holder.classList.add('gc-host');                 // brings in .ray/.pappus/.seed CSS
    var NS = 'http://www.w3.org/2000/svg';
    function mk(tag, attrs) { var e = document.createElementNS(NS, tag); if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }

    var coreCx = 500, coreCy = 330;
    // orbR = central receptacle sphere the pappus/seeds attach to; enlarged so
    // it reads as a proper base for the seed-head rather than a small clump.
    var orbR = 64, R = 150, N = 130, tilt = 0.42;
    var EXT = R + 130;                                 // half-extent of a stable, fixed viewBox

    var svg = mk('svg', {
      viewBox: (coreCx - EXT) + ' ' + (coreCy - EXT) + ' ' + (EXT * 2) + ' ' + (EXT * 2),
      preserveAspectRatio: 'xMidYMid meet', class: 'gc-plant gl-svg'
    });
    holder.appendChild(svg);

    /* deterministic jitter so the head looks the same every open */
    function rng(s) { var x = s >>> 0 || 1; return function () { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
    var rand = rng((4 * 2654435761) >>> 0);

    /* florets as 3-D unit vectors on a Fibonacci sphere */
    var base = [];
    for (var i = 0; i < N; i++) {
      var y = 1 - (i / (N - 1)) * 2, rr = Math.sqrt(Math.max(0, 1 - y * y)), phi = i * 2.3999632;
      var v = { x: Math.cos(phi) * rr + (rand() - 0.5) * 0.05, y: y + (rand() - 0.5) * 0.05, z: Math.sin(phi) * rr + (rand() - 0.5) * 0.05 };
      var m = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1; v.x /= m; v.y /= m; v.z /= m;
      base.push(v);
    }

    /* ── static orb core (a sphere reads the same from any angle) ── */
    var coreG = mk('g', { class: 'dl-core' });
    coreG.appendChild(mk('circle', { cx: coreCx, cy: coreCy, r: orbR, fill: 'var(--ink)', opacity: '0.06' }));
    coreG.appendChild(mk('circle', { cx: (coreCx - orbR * 0.32).toFixed(1), cy: (coreCy - orbR * 0.32).toFixed(1), r: (orbR * 0.52).toFixed(1), fill: 'var(--paper)', opacity: '0.5' }));
    var ON = 64;
    for (var bi = 0; bi < ON; bi++) {
      var rad = orbR * 0.9 * Math.sqrt(bi / ON), oa = bi * 2.3999632;
      var px = coreCx + Math.cos(oa) * rad, py = coreCy + Math.sin(oa) * rad;
      var nx = (px - coreCx) / orbR, ny = (py - coreCy) / orbR;
      var shade = 0.5 - (nx * 0.55 + ny * 0.55), cop = Math.max(0.12, Math.min(0.7, 0.3 + shade));
      coreG.appendChild(mk('circle', { cx: px.toFixed(1), cy: py.toFixed(1), r: (0.7 + (1 - bi / ON) * 0.6).toFixed(1), class: 'seed', opacity: cop.toFixed(2) }));
    }
    coreG.appendChild(mk('circle', { cx: coreCx, cy: coreCy, r: orbR, fill: 'none', stroke: 'var(--ink)', 'stroke-width': '1.1', opacity: '0.4' }));

    /* ── one DOM group per floret: core seed bulb + ray + 3 pappus hairs + tip seed ── */
    var stage = mk('g', {}); svg.appendChild(stage);
    var cells = base.map(function (v, ix) {
      var g = mk('g', { class: 'dl-seed', 'data-i': ix });
      var bulb = mk('ellipse', { class: 'dl-core-seed' });
      var ray  = mk('line', { class: 'ray' });
      var hairs = [mk('line', { class: 'pappus' }), mk('line', { class: 'pappus' }), mk('line', { class: 'pappus' })];
      var tip  = mk('circle', { class: 'seed' });
      g.appendChild(bulb); g.appendChild(ray); hairs.forEach(function (h) { g.appendChild(h); }); g.appendChild(tip);
      return { v: v, g: g, bulb: bulb, ray: ray, hairs: hairs, tip: tip, front: true, z: 0, sx: 0, sy: 0, tx: 0, ty: 0 };
    });

    /* ── 3-D state: scroll/drag rotates the actual sphere ── */
    var angY = 0, angX = 0, hot = null, rafPending = false;
    function rotY(p, c, s) { return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c }; }
    function rotX(p, c, s) { return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c }; }

    function render() {
      var cY = Math.cos(angY), sY = Math.sin(angY);
      var cX = Math.cos(angX + tilt), sX = Math.sin(angX + tilt);
      cells.forEach(function (c) {
        var r = rotX(rotY(c.v, cY, sY), cX, sX);
        c.z = r.z;
        var depth = (r.z + 1) / 2;                       // 0 (back) … 1 (front)
        c.front = r.z >= 0;
        var sx = coreCx + r.x * orbR, sy = coreCy - r.y * orbR;   // sphere-surface point
        var tx = coreCx + r.x * R,    ty = coreCy - r.y * R;      // pappus tip
        c.sx = sx; c.sy = sy; c.tx = tx; c.ty = ty;
        var dx = tx - sx, dy = ty - sy, len = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / len, uy = dy / len;
        var ang = Math.atan2(dy, dx), op = 0.30 + 0.62 * depth;
        // core seed bulb — slender, oriented along the ray
        var bRy = 5.5 + depth * 2.6, bRx = 0.9 + depth * 0.7;
        var bx = sx + ux * bRy, by = sy + uy * bRy;
        c.bulb.setAttribute('cx', bx.toFixed(1)); c.bulb.setAttribute('cy', by.toFixed(1));
        c.bulb.setAttribute('rx', bRx.toFixed(1)); c.bulb.setAttribute('ry', bRy.toFixed(1));
        c.bulb.setAttribute('transform', 'rotate(' + (ang * 180 / Math.PI - 90).toFixed(1) + ' ' + bx.toFixed(1) + ' ' + by.toFixed(1) + ')');
        c.bulb.setAttribute('opacity', (0.4 + depth * 0.5).toFixed(2));
        // ray — starts past the bulb
        c.ray.setAttribute('x1', (sx + ux * bRy * 2).toFixed(1)); c.ray.setAttribute('y1', (sy + uy * bRy * 2).toFixed(1));
        c.ray.setAttribute('x2', tx.toFixed(1)); c.ray.setAttribute('y2', ty.toFixed(1));
        c.ray.setAttribute('stroke-width', (0.5 + depth * 0.9).toFixed(2));
        c.ray.setAttribute('opacity', op.toFixed(2));
        // pappus spray at the tip (kept short)
        var hlen = (92 + depth * 44) * 0.82;
        c.hairs.forEach(function (h, k) {
          var ha = ang + (k - 1) * 0.34;
          h.setAttribute('x1', tx.toFixed(1)); h.setAttribute('y1', ty.toFixed(1));
          h.setAttribute('x2', (tx + Math.cos(ha) * hlen).toFixed(1)); h.setAttribute('y2', (ty + Math.sin(ha) * hlen).toFixed(1));
          h.setAttribute('opacity', (op * 0.8).toFixed(2));
        });
        // tip seed dot
        c.tip.setAttribute('cx', tx.toFixed(1)); c.tip.setAttribute('cy', ty.toFixed(1));
        c.tip.setAttribute('r', (1 + depth * 1.6).toFixed(1)); c.tip.setAttribute('opacity', op.toFixed(2));
        c.g.setAttribute('class', 'dl-seed' + (c.front ? '' : ' dl-back') + (c === hot ? ' dl-hot' : ''));
      });
      // depth-sort everything (florets + core) back→front for correct occlusion
      var all = cells.map(function (c) { return { z: c.z, node: c.g }; });
      all.push({ z: 0, node: coreG });
      all.sort(function (a, b) { return a.z - b.z; });
      all.forEach(function (a) { stage.appendChild(a.node); });
    }
    function schedule() { if (rafPending) return; rafPending = true; requestAnimationFrame(function () { rafPending = false; render(); }); }
    render();

    /* ── scroll / drag: rotate the sphere in 3-D (omni-directional) ── */
    function onWheel(e) { e.preventDefault(); angX += e.deltaY * 0.006; angY += e.deltaX * 0.006; schedule(); }
    holder.addEventListener('wheel', onWheel, { passive: false });
    var tx0 = 0, ty0 = 0, ay0 = 0, ax0 = 0, moved = false;
    function onTouchStart(e) { var t = e.touches[0]; tx0 = t.clientX; ty0 = t.clientY; ay0 = angY; ax0 = angX; moved = false; }
    function onTouchMove(e) {
      var t = e.touches[0], dx = t.clientX - tx0, dy = t.clientY - ty0;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      angY = ay0 + dx * 0.012; angX = ax0 + dy * 0.012; schedule(); e.preventDefault();
    }
    function onTouchEnd() { if (!moved) { angY += 0.5; schedule(); } }
    holder.addEventListener('touchstart', onTouchStart, { passive: false });
    holder.addEventListener('touchmove', onTouchMove, { passive: false });
    holder.addEventListener('touchend', onTouchEnd);

    /* ── hover: nearest FRONT-facing pappus only, with a wide catch radius ── */
    var pt = svg.createSVGPoint();
    function distToSeg(px, py, ax, ay, bx, by) {
      var vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
      var t = (vx * wx + vy * wy) / (vx * vx + vy * vy || 1);
      t = Math.max(0, Math.min(1, t));
      var dx = ax + vx * t - px, dy = ay + vy * t - py;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function setHot(c) { if (c === hot) return; hot = c; render(); }
    function onMove(e) {
      var m = svg.getScreenCTM(); if (!m) return;
      pt.x = e.clientX; pt.y = e.clientY;
      var loc = pt.matrixTransform(m.inverse());
      var best = null, bestD = 40;                       // wide proximity (svg units)
      cells.forEach(function (c) {
        if (!c.front) return;
        var d = distToSeg(loc.x, loc.y, c.sx, c.sy, c.tx, c.ty);
        if (d < bestD) { bestD = d; best = c; }
      });
      setHot(best);
    }
    function onLeave() { setHot(null); }
    holder.addEventListener('mousemove', onMove);
    holder.addEventListener('mouseleave', onLeave);

    return {
      svg: svg,
      highlight: function () {}, clearHighlight: function () {}, play: function () {},
      count: n, getTip: function () { return svg; },
      destroy: function () {
        holder.removeEventListener('wheel', onWheel);
        holder.removeEventListener('touchstart', onTouchStart);
        holder.removeEventListener('touchmove', onTouchMove);
        holder.removeEventListener('touchend', onTouchEnd);
        holder.removeEventListener('mousemove', onMove);
        holder.removeEventListener('mouseleave', onLeave);
        holder.classList.remove('gc-host'); holder.innerHTML = '';
      },
      pattern: 'dandelion'
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
     L1 → L2 : open the leaf view for a carousel plant key                 */
  function openLeaf(plantKey, originEl) {
    if (plantKey === 'hawthorn') { openResume(originEl); return; }
    var catKey = PLANT_TO_CAT[plantKey] || plantKey;
    var data   = global.CATS && global.CATS[catKey];
    if (!data) { console.warn('[m44-connect] no CATS entry for', catKey); return; }

    /* ── populate header ── */
    var isDandelion = (plantKey === 'dandelion');
    /* Notes borrows the résumé header treatment: serif title with an
       italicised accent word, and a "KIND · NAME" pappus tag */
    document.getElementById('leafTitle').innerHTML    = isDandelion ? 'Field <em>Notes.</em>' : (data.title || data.label);
    document.getElementById('leafCrumb').textContent  = (data.label || '').toLowerCase();
    document.getElementById('leafIntro').textContent  = data.intro || '';
    document.getElementById('leafPtag').textContent   =
      isDandelion ? 'pappus · field notes'
                  : (data.kind + ' · ' + String(data.items.length).padStart(2, '0') + ' entries');

    /* Notes drops the botanical specimen card so the Notes header sits up top */
    var specimenCard = document.querySelector('#leafView .leaf-specimen');
    if (specimenCard) specimenCard.style.display = isDandelion ? 'none' : '';

    /* ── botanical specimen card ── */
    var spec = LEAF_SPECIMENS[plantKey];
    var specHolder = document.getElementById('specHolder');
    if (spec && specHolder) {
      specHolder.innerHTML = '';
      if (spec.berrySpecimen) {
        /* hawthorn: berry-and-thorn branch */
        specHolder.innerHTML = hawthornBerchSVG();
      } else if (spec.willowSpecimen) {
        /* willow: drooping twig with catkin */
        specHolder.innerHTML = willowTwigSVG();
      } else if (spec.yarrowSpecimen) {
        /* yarrow: bipinnate lobed leaf */
        specHolder.innerHTML = yarrowLeafSVG();
      } else if (typeof LeafShapes !== 'undefined') {
        LeafShapes.render(specHolder, spec.cfg);
        /* crop SVG viewBox tight to content after it has rendered */
        setTimeout(function () {
          var svg = specHolder.querySelector('svg');
          if (!svg) return;
          try {
            var bb = svg.getBBox();
            var p  = 34;
            svg.setAttribute('viewBox',
              (bb.x - p) + ' ' + (bb.y - p) + ' ' +
              (bb.width + p * 2) + ' ' + (bb.height + p * 2));
          } catch (e) {}
        }, 40);
      }
      var q = function (id) { return document.getElementById(id); };
      if (q('specForm')) q('specForm').textContent = spec.form;
      if (q('specName')) q('specName').textContent = spec.name;
      if (q('specLat'))  q('specLat').textContent  = spec.lat;
    }

    /* ── GardenLeaf interactive infographic ── */
    if (curLeaf) { try { curLeaf.destroy(); } catch (e) {} curLeaf = null; }
    leafHolder.innerHTML = '';

    var rows = [];
    function setRow(ix) {
      rows.forEach(function (r, j) { r.classList.toggle('is-active', j === ix); });
    }

    /* Notes shows the very dandelion seed-head from the carousel — stem and
       taproot stripped so only the floating clock remains. Every other
       category keeps the generative leaf-vein diagram. */
    leafHolder.classList.remove('gc-host');
    if (plantKey === 'dandelion' && global.GardenPlants) {
      curLeaf = buildDandelionHead(leafHolder, data.items.length);
    } else {
      curLeaf = GardenLeaf.create(leafHolder, {
        items:   data.items,
        kind:    data.kind,
        seed:    (catKey.length * 7 + 3) + 4423,
        pattern: spec ? spec.pattern : null,
        onHover:  function (i)      { setRow(i); },
        onLeave:  function ()       { setRow(-1); },
        onSelect: function (i, tip) { openDNA(data.items[i], data.kind, tip || leafHolder); }
      });
    }

    /* ── item list ── */
    leafList.innerHTML = '';
    rows = [];
    data.items.forEach(function (it, i) {
      var li = document.createElement('li');
      li.className = 'leaf-row';
      li.innerHTML =
        '<span class="ri">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="rt">' + it.title + '</span>' +
        '<span class="rm">' + it.meta  + '</span>' +
        (it.blurb ? '<span class="rb">' + it.blurb + '</span>' : '');
      li.addEventListener('mouseenter', function () { if (curLeaf) curLeaf.highlight(i); setRow(i); });
      li.addEventListener('mouseleave', function () { if (curLeaf) curLeaf.clearHighlight(); setRow(-1); });
      li.addEventListener('click',      function () {
        openDNA(it, data.kind, (curLeaf && curLeaf.getTip(i)) || li);
      });
      leafList.appendChild(li);
      rows.push(li);
    });

    /* ── zoom: M44 stage rushes INTO the click point; leaf emerges from there ── */
    var r  = originEl.getBoundingClientRect();
    var fx = r.left + r.width / 2, fy = r.top + r.height / 2;

    stage.style.transition       = Z_IN;
    stage.style.transformOrigin  = fx + 'px ' + fy + 'px';
    stage.style.transform        = 'scale(16)';
    stage.classList.add('zoomed');

    leafView.style.transformOrigin = fx + 'px ' + fy + 'px';
    leafView.style.transition      = Z_EMERGE;
    leafView.style.transform       = '';
    leafView.style.opacity         = '';
    leafView.getBoundingClientRect(); /* force reflow before class add */
    leafView.classList.add('open');
    leafView.setAttribute('aria-hidden', 'false');

    /* trigger leaf draw animation after the view has finished sliding in */
    requestAnimationFrame(function () {
      setTimeout(function () { if (curLeaf && curLeaf.play) curLeaf.play(); }, 900);
    });
  }

  /* ── L2 → L1 : close leaf, return to M44 ───────────────────────────── */
  function closeLeaf() {
    leafView.style.transition = Z_HIDE;
    leafView.classList.remove('open');
    leafView.setAttribute('aria-hidden', 'true');

    stage.style.transition = Z_OUT;
    stage.style.transform  = '';
    stage.classList.remove('zoomed');

    setTimeout(function () {
      if (!leafView.classList.contains('open')) stage.style.transition = '';
    }, 750);
  }

  /* ════════════════════════════════════════════════════════════════════════
     L2 → L3 : open the DNA view for one leaf item                         */
  function openDNA(item, kind, originEl) {
    if (!item || !item.sub) return;

    document.getElementById('dnaTitle').textContent = item.title;
    document.getElementById('dnaCrumb').innerHTML   =
      'davidvalentine.org / <b>' + item.title + '</b>';
    document.getElementById('dnaIntro').textContent = item.blurb || '';
    document.getElementById('dnaPtag').textContent  =
      kind + ' · ' + String(item.sub.length).padStart(2, '0') + ' base pairs';

    dnaList.innerHTML = '';
    var rows = [];
    function setRow(ix) {
      rows.forEach(function (r, j) { r.classList.toggle('is-active', j === ix); });
    }
    item.sub.forEach(function (sb, i) {
      var li = document.createElement('li');
      li.className = 'leaf-row';
      li.innerHTML =
        '<span class="ri">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="rt">' + sb.title + '</span>' +
        (sb.note ? '<span class="rb">' + sb.note + '</span>' : '');
      li.addEventListener('mouseenter', function () { if (curDNA) curDNA.highlight(i); setRow(i); });
      li.addEventListener('mouseleave', function () { if (curDNA) curDNA.clearHighlight(); setRow(-1); });
      dnaList.appendChild(li);
      rows.push(li);
    });

    if (curDNA) { curDNA.destroy(); curDNA = null; }
    curDNA = GardenDNA.create(dnaHolder, {
      item: item, kind: kind, wheelTarget: dnaHolder,
      onHover: function (i) { setRow(i); },
      onLeave: function ()  { setRow(-1); }
    });

    /* zoom: leaf view dives into the vein tip; DNA emerges from there */
    var r  = originEl.getBoundingClientRect();
    var fx = r.left + r.width / 2, fy = r.top + r.height / 2;

    leafView.style.transition      = Z_DIVE;
    leafView.style.transformOrigin = fx + 'px ' + fy + 'px';
    leafView.style.transform       = 'scale(26)';
    leafView.style.opacity         = '0';

    dnaView.style.transformOrigin = fx + 'px ' + fy + 'px';
    dnaView.style.transition      = Z_EMERGE;
    dnaView.style.transform       = '';
    dnaView.style.opacity         = '';
    dnaView.getBoundingClientRect();
    dnaView.classList.add('open');
    dnaView.setAttribute('aria-hidden', 'false');
  }

  /* ── L3 → L2 : close DNA, return to leaf ───────────────────────────── */
  function closeDNA() {
    dnaView.style.transition = Z_HIDE;
    dnaView.classList.remove('open');
    dnaView.setAttribute('aria-hidden', 'true');

    leafView.style.transition = Z_OUT;
    leafView.style.transform  = '';
    leafView.style.opacity    = '';

    if (curDNA) { curDNA.destroy(); curDNA = null; }
  }

  /* ── Growth Rings: resume view for hawthorn ────────────────────────── */
  function openResume(originEl) {
    var data = global.CATS && global.CATS['resume'];
    var resumeView = document.getElementById('resumeView');
    var rvRings    = document.getElementById('rvRings');
    var rvEntries  = document.getElementById('rvEntries');
    if (!data||!resumeView||!rvRings||!rvEntries) return;

    /* ─ build ring SVG ─ realistic end-grain: many fine nested lines ─ */
    /* eras: innermost = newest (idx 0); each era = a cluster of year-lines */
    var labels=data.items.map(function(it){ return it.meta||''; });
    var cx=150, cy=150, Rmax=130;
    /* eccentric pith: every ring centre drifts the SAME way as radius grows,
       so rings stay nested (never cross) but bunch on one flank — real timber */
    var DX=18, DY=-13;
    function center(r){ var k=r/Rmax; return [cx+DX*k, cy+DY*k]; }
    /* ONE shared angular profile reused by every ring → concentric, never crossing */
    function distort(t){
      return 0.50*Math.sin(t+0.7)
           + 0.26*Math.sin(2*t+2.3)
           + 0.15*Math.sin(3*t+4.1)
           + 0.085*Math.sin(5*t+1.2)
           + 0.05*Math.sin(7*t+5.6)
           + 0.03*Math.sin(11*t+3.4);
    }
    var AMP=0.055;
    function loopPath(r){
      var n=80, pts=[], i, t, c, rr;
      for(i=0;i<n;i++){
        t=(i/n)*Math.PI*2;
        c=center(r);
        rr=r*(1+AMP*distort(t));
        pts.push([c[0]+rr*Math.cos(t), c[1]+rr*Math.sin(t)]);
      }
      var d='M'+pts[0][0].toFixed(1)+' '+pts[0][1].toFixed(1);
      for(i=0;i<n;i++){
        var p=pts[i],a=pts[(i+1)%n],b=pts[(i+2)%n],pp=pts[(i-1+n)%n];
        var c1x=p[0]+(a[0]-pp[0])/6,c1y=p[1]+(a[1]-pp[1])/6;
        var c2x=a[0]-(b[0]-p[0])/6,c2y=a[1]-(b[1]-p[1])/6;
        d+=' C'+c1x.toFixed(1)+' '+c1y.toFixed(1)+' '+c2x.toFixed(1)+' '+c2y.toFixed(1)+' '+a[0].toFixed(1)+' '+a[1].toFixed(1);
      }
      return d+'Z';
    }
    /* even-odd annulus between two nested loops */
    function annulus(ro,ri){ return loopPath(ro)+' '+loopPath(ri); }

    /* era boundary radii (pith → bark); 4 eras */
    var bounds=[8,46,80,108,Rmax];
    function eraOf(r){ for(var e=0;e<4;e++){ if(r<=bounds[e+1]) return e; } return 3; }

    /* fine growth-line radii: many thin rings, tightening toward the outside */
    var lineR=[], rr=12;
    while(rr<Rmax-1){
      lineR.push(rr);
      var gap=3.4 - 2.0*(rr/Rmax) + 1.1*Math.abs(Math.sin(rr*0.5)); /* ~1.4–4.5, tighter when old */
      rr += Math.max(1.5,gap);
    }

    var parts=['<svg viewBox="0 0 300 300" width="100%" style="max-width:360px;max-height:360px;display:block" overflow="visible">'];

    /* 1 ─ era tone fills (sapwood→heartwood), outermost first */
    for(var e=3;e>=0;e--){
      parts.push('<path class="rv-zfill" data-idx="'+e+'" fill-rule="evenodd" pointer-events="none" d="'+annulus(bounds[e+1],bounds[e])+'"/>');
    }
    /* 2 ─ fine growth lines (the grain) */
    lineR.forEach(function(r){
      var e=eraOf(r);
      var op=(0.18+0.13*Math.abs(Math.sin(r*0.9+1.1))).toFixed(3);
      parts.push('<path class="rv-line" data-idx="'+e+'" d="'+loopPath(r)+'" fill="none" stroke="var(--accent-warm)" stroke-width="'+(0.4+0.22*Math.abs(Math.sin(r*1.3))).toFixed(2)+'" opacity="'+op+'" pointer-events="none"/>');
    });
    /* 3 ─ era boundary lines (darker year-ring edges) */
    for(var e=0;e<4;e++){
      parts.push('<path class="rv-bound" data-idx="'+e+'" d="'+loopPath(bounds[e+1])+'" fill="none" stroke="var(--accent-warm)" stroke-width="1.1" opacity="0.42" pointer-events="none"/>');
    }
    /* 4 ─ a faint radial check (hairline crack) for character */
    (function(){
      var ang=-0.62, n=10, d='', i, cr, c, jx, x, y;
      for(i=0;i<=n;i++){
        cr=10+(Rmax-12)*(i/n); c=center(cr); jx=ang+0.05*Math.sin(i*1.7);
        x=c[0]+cr*Math.cos(jx); y=c[1]+cr*Math.sin(jx);
        d+=(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)+' ';
      }
      parts.push('<path d="'+d+'" fill="none" stroke="var(--accent-warm)" stroke-width="0.7" opacity="0.2" pointer-events="none"/>');
    })();
    /* 5 ─ pith */
    var pc=center(6);
    parts.push('<path d="'+loopPath(5.5)+'" fill="var(--accent-warm)" opacity="0.5" pointer-events="none"/>');
    parts.push('<circle cx="'+pc[0].toFixed(1)+'" cy="'+pc[1].toFixed(1)+'" r="2.3" fill="var(--accent-warm)" pointer-events="none"/>');
    /* 6 ─ era labels set into the top of each band */
    for(var e=0;e<4;e++){
      var rmid=(bounds[e]+bounds[e+1])/2, c=center(rmid);
      var lbl=(labels[e]||'').toUpperCase().replace('-','\u2013');
      parts.push('<text class="rv-elabel" data-idx="'+e+'" x="'+c[0].toFixed(1)+'" y="'+(c[1]-rmid+5).toFixed(1)+'" text-anchor="middle" font-family="monospace" font-size="7.5" fill="var(--text-soft)" opacity="0.85" pointer-events="none" style="paint-order:stroke;stroke:var(--bg);stroke-width:2.6px;stroke-linejoin:round">'+lbl+'</text>');
    }
    /* 7 ─ transparent hit annuli on top, innermost last */
    for(var e=3;e>=0;e--){
      parts.push('<path class="rv-hit" data-idx="'+e+'" fill-rule="evenodd" fill="transparent" pointer-events="all" d="'+annulus(bounds[e+1],bounds[e])+'"/>');
    }
    parts.push('</svg>');
    rvRings.innerHTML=parts.join('');

    /* ─ interaction: hover era ⇔ highlight entry ─ */
    var entryEls=[];
    function setActive(i){
      rvRings.querySelectorAll('[data-idx]').forEach(function(el){
        el.classList.toggle('is-active', +el.dataset.idx===i);
      });
      var svgEl=rvRings.querySelector('svg'); if(svgEl) svgEl.classList.toggle('has-active', i>=0);
      entryEls.forEach(function(e,j){ e.classList.toggle('is-active',j===i); });
    }
    rvRings.querySelectorAll('.rv-hit').forEach(function(hit){
      var i=+hit.dataset.idx;
      hit.addEventListener('mouseenter',function(){ setActive(i); });
      hit.addEventListener('mouseleave',function(){ setActive(-1); });
      hit.addEventListener('click',function(){
        var sc=document.querySelector('.rv-scroll'), ent=entryEls[i];
        if(sc&&ent) sc.scrollTop=ent.offsetTop-sc.offsetTop-20;
      });
    });

    /* ─ build entry list ─ */
    rvEntries.innerHTML='';
    data.items.forEach(function(item,i){
      var li=document.createElement('li');
      li.className='rv-entry';
      var subs=item.sub?item.sub.map(function(s){ return '<span class="rv-sub">'+s.title+'</span>'; }).join(''):'';
      li.innerHTML=
        '<div class="rv-eh">'+
          '<span class="rv-role">'+item.title+'</span>'+
          '<span class="rv-dates">'+item.meta+'</span>'+
        '</div>'+
        (item.blurb?'<p class="rv-blurb">'+item.blurb+'</p>':'')+
        (subs?'<div class="rv-subs">'+subs+'</div>':'');
      li.addEventListener('mouseenter',function(){ setActive(i); });
      li.addEventListener('mouseleave',function(){ setActive(-1); });
      rvEntries.appendChild(li);
      entryEls.push(li);
    });

    /* ─ zoom-in transition (mirrors openLeaf) ─ */
    var r  = originEl.getBoundingClientRect();
    var fx = r.left + r.width/2, fy = r.top + r.height/2;
    stage.style.transition      = Z_IN;
    stage.style.transformOrigin = fx+'px '+fy+'px';
    stage.style.transform       = 'scale(16)';
    stage.classList.add('zoomed');
    resumeView.style.transformOrigin = fx+'px '+fy+'px';
    resumeView.style.transition      = Z_EMERGE;
    resumeView.style.transform       = '';
    resumeView.style.opacity         = '';
    resumeView.getBoundingClientRect();
    resumeView.classList.add('open');
    resumeView.setAttribute('aria-hidden','false');
  }

  function closeResume() {
    var resumeView = document.getElementById('resumeView');
    if (!resumeView) return;
    resumeView.style.transition = Z_HIDE;
    resumeView.classList.remove('open');
    resumeView.setAttribute('aria-hidden','true');
    stage.style.transition = Z_OUT;
    stage.style.transform  = '';
    stage.classList.remove('zoomed');
    setTimeout(function(){
      if(!resumeView.classList.contains('open')) stage.style.transition='';
    },750);
  }

  /* ── yarrow leaf SVG ──────────────────────────────────────────── */
  function yarrowLeafSVG() {
    /* Achillea millefolium: central rachis, pairs of deeply-lobed pinnae */
    var rows=[[68,24,26],[93,31,29],[118,37,35],[142,40,39],[166,39,41],[190,33,35],[214,26,27],[238,18,20],[260,11,12]];
    function pinna(ox,oy,w,dir){
      var n=Math.max(2,Math.round(w/9));
      var d='M'+ox+' '+(oy+2);
      for(var i=0;i<n;i++){
        var tM=(i+0.5)/n, tB=(i+1)/n;
        var lobH=6+2*Math.sin(Math.PI*tM);
        var pX=(ox+dir*w*tM).toFixed(1), pY=(oy-3-lobH).toFixed(1);
        var v0X=(ox+dir*w*(i/n+0.1/n)).toFixed(1);
        var v1X=(ox+dir*w*(tB-0.1/n)).toFixed(1);
        var eBX=(ox+dir*w*tB).toFixed(1), eBY=(oy-2-w*0.09*Math.sin(Math.PI*tB)).toFixed(1);
        d+=' Q'+v0X+' '+(oy-2)+' '+pX+' '+pY;
        d+=' Q'+v1X+' '+(oy-2)+' '+eBX+' '+eBY;
      }
      d+=' L'+(ox+dir*w).toFixed(1)+' '+(oy-4)+' Q'+(ox+dir*w*0.55).toFixed(1)+' '+(oy+7)+' '+ox+' '+(oy+2)+'Z';
      return d;
    }
    var parts=[];
    rows.forEach(function(r){
      parts.push(
        '<path d="'+pinna(100,r[0],r[1],-1)+'" fill="color-mix(in srgb,var(--bg) 80%,var(--ink))" stroke="var(--ink)" stroke-width="0.72" stroke-linejoin="round"/>',
        '<path d="'+pinna(100,r[0],r[2], 1)+'" fill="color-mix(in srgb,var(--bg) 80%,var(--ink))" stroke="var(--ink)" stroke-width="0.72" stroke-linejoin="round"/>'
      );
    });
    return '<svg viewBox="50 38 100 252" width="118" height="195" style="display:block;margin:auto" overflow="visible">'+
      '<line x1="100" y1="290" x2="100" y2="54" stroke="var(--ink)" stroke-width="1.8" stroke-linecap="round"/>'+
      '<line x1="100" y1="290" x2="100" y2="310" stroke="var(--ink)" stroke-width="1.3" stroke-linecap="round"/>'+
      parts.join('')+'</svg>';
  }

  /* ── willow drooping-twig botanical SVG ──────────────────────────── */
  function willowTwigSVG() {
    /* main branch arcs left; trailing shoots droop down with narrow lance leaves */
    var leaves = [
      /* [x1,y1, x2,y2, cpx,cpy, lx,ly, angle-deg] shoot origin → tip, leaf anchor */
      { ox:105,oy:72,  tip:[78,110],  cp:[90,90],   leaf:[68,128],  la:-22 },
      { ox:100,oy:100, tip:[125,140], cp:[118,118],  leaf:[136,156], la:30  },
      { ox:96, oy:135, tip:[62,172],  cp:[76,152],   leaf:[50,190],  la:-28 },
      { ox:98, oy:168, tip:[128,205], cp:[120,185],  leaf:[138,222], la:25  },
      { ox:95, oy:205, tip:[60,240],  cp:[74,222],   leaf:[48,257],  la:-25 },
    ];
    var leaveSVG = leaves.map(function(l){
      var ax=l.leaf[0], ay=l.leaf[1], a=l.la*(Math.PI/180);
      var len=28, hw=5.5;
      var dx=Math.sin(a)*len, dy=-Math.cos(a)*len;
      var px=-Math.cos(a)*hw, py=-Math.sin(a)*hw;
      return '<path d="M'+ax+' '+ay+
             ' C'+(ax+px*0.6+dx*0.25)+' '+(ay+py*0.6+dy*0.25)+
             ' '+(ax+px*0.2+dx*0.75)+' '+(ay+py*0.2+dy*0.75)+
             ' '+(ax+dx)+' '+(ay+dy)+
             ' C'+(ax-px*0.2+dx*0.75)+' '+(ay-py*0.2+dy*0.75)+
             ' '+(ax-px*0.6+dx*0.25)+' '+(ay-py*0.6+dy*0.25)+
             ' '+ax+' '+ay+'Z"'+
             ' fill="color-mix(in srgb,var(--bg) 80%,var(--ink))" stroke="var(--ink)" stroke-width="0.9"/>'+
             /* midrib */
             '<line x1="'+ax+'" y1="'+ay+'" x2="'+(ax+dx)+'" y2="'+(ay+dy)+'" stroke="var(--ink)" stroke-width="0.5" stroke-linecap="round"/>';
    }).join('');
    var shootSVG = leaves.map(function(l){
      return '<path d="M'+l.ox+' '+l.oy+' Q'+l.cp[0]+' '+l.cp[1]+' '+l.tip[0]+' '+l.tip[1]+'"'+
             ' fill="none" stroke="var(--ink)" stroke-width="1.1" stroke-linecap="round"/>';
    }).join('');
    return '<svg viewBox="20 50 160 230" width="130" height="188" style="display:block;margin:auto" overflow="visible">'+
      /* main branch */
      '<path d="M110 45 C108 80 104 130 100 180 C97 220 95 245 94 265" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round"/>'+
      /* catkin at top */
      '<ellipse cx="112" cy="48" rx="5" ry="14" fill="color-mix(in srgb,var(--accent-warm) 60%,var(--bg))" stroke="var(--ink)" stroke-width="0.9" transform="rotate(-15,112,48)"/>'+
      /* catkin scales */
      '<path d="M108 38 Q113 41 108 44 Q113 47 108 50 Q113 53 108 56" fill="none" stroke="var(--ink)" stroke-width="0.55" stroke-linecap="round" transform="rotate(-15,112,48)"/>'+
      /* catkin stem */
      '<line x1="110" y1="60" x2="110" y2="68" stroke="var(--ink)" stroke-width="1" stroke-linecap="round" transform="rotate(-15,112,48)"/>'+
      shootSVG + leaveSVG +
    '</svg>';
  }

  /* ── hawthorn berry-branch botanical SVG ──────────────────────────── */
  function hawthornBerchSVG() {
    return '<svg viewBox="0 0 200 280" width="140" height="196" style="display:block;margin:auto" overflow="visible">'+
      /* main stem */
      '<path d="M100 260 C100 220 95 190 92 155 C88 115 94 80 100 50" fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-linecap="round"/>'+
      /* thorn */
      '<path d="M96 175 L78 163" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linecap="round"/>'+
      '<path d="M78 163 L82 156" fill="none" stroke="var(--ink)" stroke-width="1.2" stroke-linecap="round"/>'+
      /* left branch */
      '<path d="M95 140 C80 128 65 125 50 120" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-linecap="round"/>'+
      /* right branch */
      '<path d="M97 105 C112 95 128 90 148 88" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-linecap="round"/>'+
      /* leaf cluster left */
      '<path d="M50 120 C42 112 40 105 44 98 C48 91 57 90 62 96 C66 101 63 112 56 116 C53 118 50 120 50 120Z" fill="color-mix(in srgb,var(--bg) 82%,var(--ink))" stroke="var(--ink)" stroke-width="1"/>'+
      '<path d="M50 120 C56 114 66 112 70 106 C74 100 71 91 65 90 C58 89 52 95 51 103 C50 110 50 120 50 120Z" fill="color-mix(in srgb,var(--bg) 78%,var(--ink))" stroke="var(--ink)" stroke-width="1"/>'+
      /* leaf cluster right */
      '<path d="M148 88 C140 80 138 72 143 65 C148 58 158 58 162 65 C166 71 162 82 154 86 C151 88 148 88 148 88Z" fill="color-mix(in srgb,var(--bg) 82%,var(--ink))" stroke="var(--ink)" stroke-width="1"/>'+
      '<path d="M148 88 C155 82 164 81 168 74 C172 67 168 58 161 57 C153 56 147 63 147 72 C146 79 148 88 148 88Z" fill="color-mix(in srgb,var(--bg) 78%,var(--ink))" stroke="var(--ink)" stroke-width="1"/>'+
      /* berry cluster */
      '<circle cx="100" cy="50" r="7.5" fill="color-mix(in srgb,var(--accent-warm) 85%,var(--ink))" stroke="var(--ink)" stroke-width="0.9"/>'+
      '<circle cx="88"  cy="44" r="6.5" fill="color-mix(in srgb,var(--accent-warm) 75%,var(--ink))" stroke="var(--ink)" stroke-width="0.9"/>'+
      '<circle cx="113" cy="46" r="7"   fill="color-mix(in srgb,var(--accent-warm) 80%,var(--ink))" stroke="var(--ink)" stroke-width="0.9"/>'+
      '<circle cx="104" cy="38" r="5.5" fill="color-mix(in srgb,var(--accent-warm) 70%,var(--ink))" stroke="var(--ink)" stroke-width="0.8"/>'+
      '<circle cx="92"  cy="56" r="5"   fill="color-mix(in srgb,var(--accent-warm) 65%,var(--ink))" stroke="var(--ink)" stroke-width="0.8"/>'+
      /* berry stems */
      '<line x1="100" y1="50" x2="100" y2="57" stroke="var(--ink)" stroke-width="0.7" stroke-linecap="round"/>'+
      '<line x1="88"  y1="44" x2="90"  y2="51" stroke="var(--ink)" stroke-width="0.7" stroke-linecap="round"/>'+
      '<line x1="113" y1="46" x2="111" y2="53" stroke="var(--ink)" stroke-width="0.7" stroke-linecap="round"/>'+
      /* calyx dots on berries */
      '<circle cx="100" cy="50" r="1.2" fill="var(--ink)"/>'+
      '<circle cx="88"  cy="44" r="1"   fill="var(--ink)"/>'+
      '<circle cx="113" cy="46" r="1.1" fill="var(--ink)"/>'+
    '</svg>';
  }

  global.M44LeafConnect = { init: init, openLeaf: openLeaf, closeResume: closeResume };

}(window));
