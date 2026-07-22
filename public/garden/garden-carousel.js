/* garden-carousel.js — the rotating specimen "garden" as a reusable module.
   Builds a ring of generative plants into a container and positions them by a
   scroll/progress value. It does NOT own scrolling — the host passes progress.

   Depends on: garden-plants.js (window.GardenPlants).
   Self-contained styling: injects its own scoped CSS (.gc-host) once.

   Usage:
     var gc = GardenCarousel.create(el, {
       geo: { cxF:0.70, rxF:0.205, ryF:0.085, soilF:0.80, sizeMin:0.34 },
       onBeat: function(idx, plant){ ... }
     });
     gc.render(progress);   // progress in [0 .. beats-1]
     gc.beats, gc.plants, gc.focus
*/
(function (global) {
  'use strict';
  var UP = -Math.PI / 2;
  var COMMON = { cx:500, cy:640, rootLen:0.5, minLen:15, buds:true, trunkMains:3 };
  function T(o){ return Object.assign({}, COMMON, o); }

  var DEFAULT_PLANTS = [
    { key:'yarrow', label:'About',    base:288, ground:'tree',
      cfg:T({seed:7,trunk:200,depth:9,minK:2,maxK:2,spread:0.26,jitter:0.6,lenRatio:0.74,tropismTarget:UP,tropism:0.22,lean:0,curl:0.10,rootDepth:5,rootLen:0.24,fibrous:true,widthK:0.95,widthPow:0.32,rootWidthMul:2.4,minLen:9,umbel:true,umbelLevels:3,umbelK:[3,5],umbelLenRatio:0.5}),
      beat:{ kicker:'The Gardener', title:'The soil I<br><em>thrive in...</em>', line:'I’m <b>David Valentine</b> — an execution engineer delivering meaningful results wherever I’ve applied myself. Technology &amp; Operations are the soil I thrive in.', cta:'About me' } },
    { key:'willow', label:'Results',   base:356, ground:'tree',
      cfg:T({seed:9,trunk:165,depth:10,minK:2,maxK:3,spread:0.5,jitter:0.5,lenRatio:0.74,tropismTarget:UP,tropism:0.18,lean:0,curl:0.2,rootDepth:5,cy:660,widthK:0.72,widthPow:0.46,minLen:6,weep:true,weepLevels:5,weepPull:0.85,weepLen:1.54,rootWidthMul:1.25}),
      beat:{ kicker:'The Fruit', title:'My results.<br><em>Our growth.</em>', line:'Results speak louder than actions.', cta:'My work' } },
    { key:'hawthorn', label:'Resume',    base:368, ground:'tree',
      cfg:T({seed:45,trunk:150,depth:7,minK:2,maxK:3,spread:0.46,jitter:0.45,lenRatio:0.75,tropismTarget:UP,tropism:0.10,lean:0.08,curl:0.28,rootDepth:5,widthK:1.55}),
      beat:{ kicker:'The Record', title:'The growth <em>rings.</em>', line:'Over a decade of experience, <b>on record</b>.', cta:'View resume' } },
    { key:'dandelion', label:'Notes',   base:256, ground:'dandelion',
      cfg:{kind:'dandelion',seed:4,headR:152,rays:110,headY:330},
      beat:{ kicker:'Field Notes', title:'My Digital <em>Garden.</em>', line:'Discover different perspectives on a wide range of subjects which I explore.\n\n', cta:'Browse blog' } },
    { key:'maple', label:'The_Garden',    base:348, ground:'tree',
      cfg:T({seed:43,trunk:155,depth:8,minK:2,maxK:3,spread:0.48,jitter:0.55,lenRatio:0.75,tropismTarget:UP,tropism:0.16,lean:0,curl:0.17,rootDepth:5,widthK:1.5}),
      beat:{ kicker:'My Garden', title:'My actual<br><em>Garden</em>', line:'Come see my Permaculture and Desert Gardening project.  The interest started as a resolve for healthier and cheaper food, but ultimately I couldn\'t put down the idea, the challenge, of gardening in a harsh desert, where water is scarce and heat intense.', cta:'See my garden' } }
  ];

  var STYLE_ID = 'gc-style';
  function injectStyle(){
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.gc-host{position:relative;--ink:var(--branch-shoot,#272320);--paper:var(--bg,#f1eadd);--root:var(--branch-root,#a9742a);--soft:var(--text-soft,#6a6256)}'+
      '.gc-host .gc-plant{position:absolute;will-change:transform,width,height,top,left,opacity}'+
      '.gc-host .gc-plant svg{width:100%;height:100%;display:block;overflow:visible}'+
      '.gc-host .b-shoot{stroke:var(--ink);fill:none;stroke-linecap:round;stroke-linejoin:round}'+
      '.gc-host .b-root{stroke:var(--root);fill:none;stroke-linecap:round;stroke-linejoin:round}'+
      '.gc-host .bud{fill:var(--ink)} .gc-host .bud-root{fill:var(--root)}'+
      '.gc-host .needle{stroke:var(--ink);stroke-width:1.4;opacity:.5;stroke-linecap:round;fill:none}'+
      '.gc-host .ray{stroke:var(--soft);fill:none;stroke-linecap:round}'+
      '.gc-host .pappus{stroke:var(--soft);fill:none;stroke-linecap:round;stroke-width:.6}'+
      '.gc-host .seed{fill:var(--ink)}'+
      '.gc-host .stem{stroke:var(--ink);fill:none;stroke-linecap:round}'+
      'html[data-theme="dark"] .gc-host .gc-plant.is-focus{filter:drop-shadow(0 0 6px rgba(138,215,160,.45))}';
    var s=document.createElement('style'); s.id=STYLE_ID; s.textContent=css; document.head.appendChild(s);
  }

  function create(container, opts){
    opts = opts || {};
    injectStyle();
    container.classList.add('gc-host');
    var plants = opts.plants || DEFAULT_PLANTS;
    var N = plants.length;
    var geo = Object.assign({ cxF:0.70, rxF:0.205, ryF:0.085, soilF:0.80, sizeMin:0.34, sizeMax:1.0,
                              opMin:0.24, opMax:1.0 }, opts.geo || {});
    plants.forEach(function(pl){
      var div=document.createElement('div'); div.className='gc-plant'; div.dataset.key=pl.key;
      container.appendChild(div);
      GardenPlants.create(div, pl.cfg);
      pl.div=div; pl.gf=GardenPlants.GROUND[pl.ground];
    });
    var curIdx=-1;
    function render(p){
      var W=container.clientWidth||1280, H=container.clientHeight||820;
      // frame-relative fit: size & seat specimens inside the bordered frame (insets), not the whole panel
      var useFit = (geo.fitTop!=null);
      var fitTop = geo.fitTop||0, fitBot = geo.fitBottom||0;
      var availH = useFit ? Math.max(60, H - fitTop - fitBot) : H;
      var hs = geo.refH ? Math.max(0.7, Math.min(2.6, availH/geo.refH)) : 1;
      var cx=W*geo.cxF, rx=W*geo.rxF, front=Math.PI/2;
      var soilY = useFit ? (fitTop + availH*geo.soilF) : (H*geo.soilF);
      // flatY: pure horizontal carousel — every specimen baseline stays pinned to the soil line
      var ry = geo.flatY ? 0 : (useFit?availH:H)*geo.ryF;
      var cy = soilY - ry;
      plants.forEach(function(pl,i){
        var ang=front + (i - p)*(Math.PI*2/N);
        var fr=(Math.sin(ang)+1)/2;
        var x=cx + rx*Math.cos(ang), y=cy + ry*Math.sin(ang);
        var size=pl.base*hs*(geo.sizeMin + (geo.sizeMax-geo.sizeMin)*fr);
        pl.div.style.width=size+'px'; pl.div.style.height=size+'px';
        pl.div.style.left=(x - size/2)+'px';
        pl.div.style.top=(y - pl.gf*size)+'px';
        pl.div.style.zIndex=String(Math.round(fr*100));
        pl.div.style.opacity=(geo.opMin + (geo.opMax-geo.opMin)*fr).toFixed(2);
      });
      var idx=((Math.round(p)%N)+N)%N;   // wrap, so an intro offset (negative p) focuses the right specimen
      plants.forEach(function(pl,i){ pl.div.classList.toggle('is-focus', i===idx); });
      if(idx!==curIdx){ curIdx=idx; if(opts.onBeat) opts.onBeat(idx, plants[idx]); }
    }
    return { plants:plants, beats:N, render:render, setProgress:render, soilFrac:geo.soilF,
             get focus(){ return curIdx; } };
  }

  global.GardenCarousel = { create:create, DEFAULT_PLANTS:DEFAULT_PLANTS };
})(window);
