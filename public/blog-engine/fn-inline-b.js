
    (function(){
      var P=GardenCarousel.DEFAULT_PLANTS, N=P.length;
      var FRAME_TOP=96, FRAME_BOT=Math.round(window.innerHeight*0.30), SOILF=0.663;   // frame insets (match .gframe/.garden clip) + soil seat within frame

      // build the fixed spinning ring (geometry tuned for the right 46% panel)
      var gc=GardenCarousel.create(document.getElementById('garden'),
        { geo:{ cxF:0.56, rxF:0.30, ryF:0.085, soilF:SOILF, sizeMin:0.34, refH:400, flatY:true,
                fitTop:FRAME_TOP, fitBottom:FRAME_BOT } });
      window.__gc=gc; window.__gcOverride=null; window.__storyPos=0;

      // build the scrolling chapters (real stacked sections)
      var col=document.getElementById('col');
      // intro spacer: one empty viewport so the carousel can open the page full-width
      var intro=document.createElement('section'); intro.className='intro'; col.appendChild(intro);
      var VARMAP=[0,2,4,5,1];   // hero treatment follows its content: manuscript 3rd, handwriting 4th, vine last
      var chapters=P.map(function(pl,i){
        var b=pl.beat, v=VARMAP[i];
        var sec=document.createElement('section'); sec.className='chapter chv-'+v; sec.id=pl.key; sec.dataset.i=i;
        sec.innerHTML='<div class="ch-in">'+
          '<span class="ch-k">'+String(i+1).padStart(2,'0')+' — '+b.kicker+'</span>'+
          '<h2 class="ch-t">'+b.title+'</h2>'+
          '<p class="ch-l">'+b.line+'</p>'+
          '<a class="ch-c" href="#'+pl.key+'">'+b.cta+' →</a>'+
          '<div class="ch-rule"><span>'+pl.label+'</span><span class="ln"></span><span>'+String(i+1).padStart(2,'0')+'/'+String(N).padStart(2,'0')+'</span></div>'+
          '</div>';
        var IN=sec.firstChild;
        if(v===1){ IN.querySelector('.ch-t').insertAdjacentHTML('afterend',
          '<svg class="hroot" viewBox="0 0 420 64" preserveAspectRatio="xMinYMid meet" aria-hidden="true">'+
          '<path class="rt r0" pathLength="1" stroke-width="2.6" d="M2 20 C 56 14 88 28 148 24 C 200 21 232 32 296 28 C 344 25 384 31 416 28"></path>'+
          '<path class="rt r1" pathLength="1" stroke-width="1.5" d="M96 23 C 102 34 106 44 102 56"></path>'+
          '<path class="rt r2" pathLength="1" stroke-width="1.5" d="M168 25 C 172 35 180 42 192 46"></path>'+
          '<path class="rt r3" pathLength="1" stroke-width="1.4" d="M250 29 C 246 39 238 46 226 50"></path>'+
          '<path class="rt r4" pathLength="1" stroke-width="1.3" d="M330 28 C 334 36 340 41 348 44"></path>'+
          '<circle class="bud b1" cx="102" cy="58" r="2.4"></circle><circle class="bud b2" cx="194" cy="46.5" r="2.2"></circle>'+
          '<circle class="bud b3" cx="224" cy="50.5" r="2.2"></circle><circle class="bud b4" cx="350" cy="44.5" r="2"></circle>'+
          '<circle class="bud b5" cx="418" cy="28" r="2.6"></circle></svg>'); }
        if(v===2){ IN.insertAdjacentHTML('afterbegin',
          '<svg class="vine" viewBox="0 0 56 420" preserveAspectRatio="xMidYMax meet" aria-hidden="true">'+
          '<path class="vn" pathLength="1" d="M30 416 C 20 380 42 352 30 318 C 20 288 44 258 32 226 C 22 196 44 168 30 136 C 20 108 40 78 30 44 C 26 30 28 18 30 8"></path>'+
          '<g transform="translate(26,362) rotate(18)"><path class="lf l1" d="M0 0 C -12 -3 -16 -13 -7 -18 C 2 -12 3 -6 0 0 Z"></path></g>'+
          '<g transform="translate(36,302) rotate(160)"><path class="lf l2" d="M0 0 C -12 -3 -16 -13 -7 -18 C 2 -12 3 -6 0 0 Z"></path></g>'+
          '<g transform="translate(25,242) rotate(28)"><path class="lf l3" d="M0 0 C -12 -3 -16 -13 -7 -18 C 2 -12 3 -6 0 0 Z"></path></g>'+
          '<g transform="translate(37,182) rotate(150)"><path class="lf l4" d="M0 0 C -12 -3 -16 -13 -7 -18 C 2 -12 3 -6 0 0 Z"></path></g>'+
          '<g transform="translate(25,122) rotate(12)"><path class="lf l5" d="M0 0 C -12 -3 -16 -13 -7 -18 C 2 -12 3 -6 0 0 Z"></path></g>'+
          '<g transform="translate(35,62) rotate(168)"><path class="lf l6" d="M0 0 C -12 -3 -16 -13 -7 -18 C 2 -12 3 -6 0 0 Z"></path></g>'+
          '<circle class="vbud" cx="30" cy="7" r="3"></circle></svg>'); }
        if(v===4){ IN.querySelector('.ch-t').insertAdjacentHTML('afterend',
          '<svg class="flourish" viewBox="0 0 200 26" aria-hidden="true"><path class="fl" pathLength="1" d="M3 16 C 40 6 70 24 105 13 C 135 5 165 16 196 10"></path></svg>');
          IN.insertAdjacentHTML('afterbegin',
          '<svg class="rings" viewBox="0 0 160 160" aria-hidden="true">'+
          '<circle class="gr g1" cx="80" cy="80"></circle>'+
          '<circle class="gr g2" cx="82" cy="79"></circle>'+
          '<circle class="gr g3" cx="79" cy="81"></circle>'+
          '<circle class="gr g4" cx="81" cy="80"></circle>'+
          '<circle class="gr g5" cx="80" cy="79"></circle>'+
          '<circle class="gr g6" cx="79" cy="80"></circle>'+
          '<circle class="gr g7" cx="81" cy="81"></circle>'+
          '<circle class="gr g8" cx="80" cy="80"></circle>'+
          '<circle class="ripple" cx="80" cy="80"></circle></svg>'); }
        if(v===5){ IN.querySelector('.ch-t').insertAdjacentHTML('afterend',
          '<svg class="swash" viewBox="0 0 300 24" aria-hidden="true"><path class="sw" pathLength="1" d="M4 16 C 60 24 110 4 170 12 C 215 18 258 8 296 14"></path></svg>'); }
        col.appendChild(sec); return sec;
      });

      // nav + rail
      var nav=document.getElementById('nav'), rail=document.getElementById('rail');
      var scroller=document.getElementById('scroller');
      var navEls=P.map(function(pl,i){ var a=document.createElement('button'); a.type='button'; a.className='nav-item'; a.textContent=pl.label;
        a.addEventListener('click',function(){ goTo(i); }); nav.appendChild(a); return a; });
      var ticks=P.map(function(pl,i){ var t=document.createElement('span'); t.className='tick';
        t.addEventListener('click',function(){ goTo(i); }); rail.appendChild(t); return t; });

      var gfcap=document.getElementById('gfcap'), gffoot=document.getElementById('gffoot'), soil=document.getElementById('soilline');
      var soilSvg=soil.querySelector('svg'), SOIL_LEN=1180, SOIL_WIN=300, SOIL_TRAVEL=560;   // terrain pans so each specimen sits on a different stretch (SOIL_TRAVEL = total slide across all specimens)
      function panSoil(){ if(!soilSvg) return; var t=(N>1?Math.max(0,Math.min(1,pos/(N-1))):0); var minX=(1-t)*SOIL_TRAVEL; soilSvg.setAttribute('viewBox', minX.toFixed(1)+' 0 '+SOIL_WIN+' 14'); }

      function sizeChapters(){ var h=scroller.clientHeight; intro.style.minHeight=h+'px'; chapters.forEach(function(s){ s.style.minHeight=h+'px'; }); scroller.classList.add('ready'); var fb=document.getElementById('fouc-block'); if(fb) fb.parentNode.removeChild(fb); }
      function chapterH(){ return scroller.clientHeight; }
      function goTo(i){ scroller.scrollTo({ top:(i+1)*chapterH(), behavior:'smooth' }); }

      // ---- decoupled spin: page scrolls normally, ring rotates from scroll progress ----
      // Self-polling rAF: reads scrollTop every frame (independent of scroll events),
      // but only does the heavy ring render while actually moving — cheap when idle.
      var pos=0, targetP=0, curIdx=-1, lastU=-1, uS=0;
      var panelEl=document.querySelector('.garden-fixed');
      function easeU(u){ return u<.5 ? 2*u*u : 1-Math.pow(-2*u+2,2)/2; }
      function setActive(idx){
        navEls.forEach(function(a,i){ a.classList.toggle('on',i===idx); });
        chapters.forEach(function(s,i){ s.classList.toggle('on',i===idx); });
        ticks.forEach(function(t,i){ t.classList.toggle('on',i===idx); t.classList.toggle('past',i<idx); });
        gfcap.textContent='Specimen '+String(idx+1).padStart(2,'0')+' / '+String(N).padStart(2,'0');
        var LAT=['Achillea millefolium','Salix babylonica','Crataegus monogyna','Taraxacum officinale','Acer saccharum'];
        var com=P[idx].key.charAt(0).toUpperCase()+P[idx].key.slice(1);
        gffoot.innerHTML='<span class="gff-c">'+com+'</span><span class="gff-l">'+(LAT[idx]||'')+'</span>';
      }
      function placeChrome(){
        var panel=document.querySelector('.garden-fixed');
        var availH=Math.max(60, panel.clientHeight-FRAME_TOP-FRAME_BOT);
        var sY=FRAME_TOP+availH*SOILF;       // soil line seated inside the frame (matches carousel)
        soil.style.top=sY+'px';
        gffoot.style.top=(sY-FRAME_TOP+14)+'px';   // two-line field label sits beneath the soil line, among the roots
      }
      function ringPos(){ return pos - (1-uS); }   // intro offset: one slot back at the top, spinning forward onto the hawthorn as the panel seats
      function paint(){
        gc.render(ringPos());
        placeChrome();
        panSoil();
        gffoot.style.opacity=Math.max(0,Math.min(1,(uS-0.55)/0.45)).toFixed(2);   // no labels during the full-bleed hero
        var idx=Math.max(0,Math.min(N-1,Math.round(pos)));
        if(idx!==curIdx){ curIdx=idx; setActive(idx); }
      }
      function frame(){
        /* sequence override: pan/zoom drives pos directly */
        if(typeof window.__gcOverride==='number'){
          pos=window.__gcOverride;
          gc.render(pos); placeChrome(); panSoil();
          var idxO=Math.max(0,Math.min(N-1,Math.round(pos)));
          if(idxO!==curIdx){curIdx=idxO;setActive(idxO);}
          window.__storyPos=pos;
          requestAnimationFrame(frame); return;
        }
        window.__storyPos=pos;
        var raw=scroller.scrollTop/chapterH();
        var u=Math.max(0,Math.min(1,raw));        // intro progress: 0 = full-bleed hero, 1 = seated in the frame
        targetP=Math.max(0,raw-1);                // beats start after the intro viewport
        var moved=false;
        if(Math.abs(targetP-pos)>0.0006){
          pos += (targetP-pos)*0.16;
          if(Math.abs(targetP-pos)<0.0006) pos=targetP;
          moved=true;
        }
        if(Math.abs(u-uS)>0.0006){ uS += (u-uS)*0.16; if(Math.abs(u-uS)<0.0006) uS=u; }
        if(Math.abs(uS-lastU)>0.0004){
          lastU=uS;
          panelEl.style.width=(100-48*easeU(uS))+'%';
          moved=true;
        }
        if(moved) paint();
        requestAnimationFrame(frame);
      }

      var cueHidden=false, cue=document.getElementById('cue');
      scroller.addEventListener('scroll',function(){ if(!cueHidden&&scroller.scrollTop>20){cue.classList.add('hide');cueHidden=true;} }, {passive:true});
      window.addEventListener('keydown',function(e){ var cur=Math.round(scroller.scrollTop/chapterH());
        if(e.key==='ArrowDown'||e.key==='ArrowRight'||e.key===' '){ e.preventDefault(); goTo(Math.min(N-1,cur)); }
        if(e.key==='ArrowUp'||e.key==='ArrowLeft'){ e.preventDefault(); goTo(Math.max(-1,cur-2)); } });
      window.addEventListener('resize',function(){ sizeChapters(); gc.render(ringPos()); });

      function boot(){ sizeChapters(); panelEl.style.width='100%'; lastU=0; uS=0; gc.render(-1); gffoot.style.opacity='0'; placeChrome(); panSoil(); setActive(0); curIdx=0; requestAnimationFrame(frame); }
      requestAnimationFrame(function(){ requestAnimationFrame(boot); }); setTimeout(boot,160);

      // test hook
      window.__story={ beats:N, goBeat:function(i){ scroller.scrollTop=(i+1)*chapterH(); pos=targetP=i; uS=lastU=1; panelEl.style.width='52%'; gc.render(pos); placeChrome(); panSoil(); setActive(i); }, get pos(){return pos;}, get idx(){return curIdx;} };

      // theme
      var bL=document.getElementById('t-light'), bD=document.getElementById('t-dark');
      function setTheme(t){ document.documentElement.setAttribute('data-theme',t);
        if(bL)bL.setAttribute('aria-pressed',String(t==='light')); if(bD)bD.setAttribute('aria-pressed',String(t==='dark'));
        try{localStorage.setItem('dv-theme',t)}catch(e){} }
      window.__setTheme=setTheme;
      if(bL)bL.onclick=function(){setTheme('light')}; if(bD)bD.onclick=function(){setTheme('dark')};
      setTheme('dark');   /* start on night mode */
    })();
  

;


  /* ===== ONE-TIME PAGE-LOAD INTRO (02 Sprout) ===== */
  (function(){
    'use strict';
    var host=document.getElementById('introhost');
    var wrap=document.querySelector('.garden-fixed');
    var stage=document.querySelector('.stage');
    var scr=document.getElementById('scroller');
    var reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
    var timers=[];
    function later(fn,ms){ timers.push(setTimeout(fn,ms)); }
    function nstack(){
      return '<div class="nstack"><span class="dav">David</span><span class="ess">&rsquo;s</span></div>';
    }
    function run(){
      wrap.classList.add('dim');
      if(stage) stage.classList.add('iv-active');
      var el=document.createElement('div');
      el.className='iv-overlay v2s';
      el.innerHTML=
        '<div class="scrim"></div>'+
        '<div class="sprout">'+
          '<div class="name-soft">'+nstack()+'</div>'+
          '<div class="groundwrap">'+
            '<svg class="ground" viewBox="0 0 720 44" preserveAspectRatio="none" aria-hidden="true">'+
              '<circle class="iv-seed" cx="360" cy="37" r="4"></circle>'+
              '<circle class="iv-ripple" cx="360" cy="37" r="6"></circle>'+
              '<path class="gl" pathLength="1" d="M360 37 C 318 15 250 9 152 37"></path>'+
              '<path class="gl" pathLength="1" d="M360 37 C 402 15 470 9 568 37"></path>'+
              '<circle class="gbud" style="--bd:2.75s;--bx:.1s" cx="152" cy="37" r="3"></circle>'+
              '<circle class="gbud" style="--bd:3.35s;--bx:.2s" cx="568" cy="37" r="3"></circle>'+
            '</svg>'+
            '<span class="intro-rw rw1" style="--bd:2.8s">Knowledge</span>'+
            '<span class="intro-rw rw2" style="--bd:3.1s">Action</span>'+
            '<span class="intro-rw rw3" style="--bd:3.4s">Excellence</span>'+
          '</div>'+
          '<div class="gm"><span class="gi sp3" style="--gd:.35s;--gx:0s">Digital Garden</span></div>'+
          '<img class="treelogo" src="/images/logo-neuron-tree.png" alt="">'+
        '</div>';
      host.appendChild(el);
      var exitAt=reduced?1800:6600;
      /* ── gradual sunrise: ease the lighting from night → day over ~4.5s, then the moon gives way to a rising sun ── */
      function endSunrise(){
        if(window.__setTheme) window.__setTheme('light');
        document.documentElement.classList.remove('sunrise-hold');
        document.body.style.transition='';
        var s=document.getElementById('sunrise-fade'); if(s) s.remove();
      }
      if(reduced){
        later(function(){ if(window.__setTheme) window.__setTheme('light'); }, 600);
      } else {
        var SUN_START=1000, SUN_DUR=4.5;
        later(function(){
          if(!window.__setTheme) return;
          var st=document.createElement('style'); st.id='sunrise-fade';
          st.textContent=
            'body::before{transition:opacity '+SUN_DUR+'s ease !important}'+
            '.stars{transition:opacity '+SUN_DUR+'s ease !important}'+
            '.daytint{transition:opacity '+SUN_DUR+'s ease !important}'+
            '.sunrise-hold .celest .sun{display:none !important}'+
            '.sunrise-hold .celest .moonwrap{display:flex !important}';
          document.head.appendChild(st);
          document.documentElement.classList.add('sunrise-hold');   /* keep the moon up while the light comes in */
          document.body.style.transition='background-color '+SUN_DUR+'s ease, color '+SUN_DUR+'s ease';
          window.__setTheme('light');     /* begin the slow dark → light fade */
        }, SUN_START);
        later(function(){               /* ~65% in: majority of the light is up → the moon gives way to the rising sun */
          document.documentElement.classList.remove('sunrise-hold');
          var cel=document.getElementById('celest');
          if(cel){ cel.classList.remove('arrive'); void cel.offsetWidth; cel.classList.add('arrive'); setTimeout(function(){ cel.classList.remove('arrive'); },1600); }
        }, SUN_START+2900);
        later(function(){ document.body.style.transition=''; var s=document.getElementById('sunrise-fade'); if(s) s.remove(); }, SUN_START+5200);
      }
      later(function(){ el.classList.add('out'); wrap.classList.remove('dim'); },exitAt);
      later(function(){
        if(el.parentNode) el.parentNode.removeChild(el);
        if(stage) stage.classList.remove('iv-active');
        var c=document.getElementById('critter');
        if(c){ c.classList.remove('down','perched'); c.style.setProperty('--bf-dur','1.1s'); }
      },exitAt+1700);
      /* scroll during intro: skip to exit immediately */
      function onIntroScroll(){
        scr.removeEventListener('scroll',onIntroScroll,{passive:true});
        timers.forEach(clearTimeout); timers.length=0;
        endSunrise();
        el.classList.add('out'); wrap.classList.remove('dim');
        setTimeout(function(){
          if(el.parentNode) el.parentNode.removeChild(el);
          if(stage) stage.classList.remove('iv-active');
          var c=document.getElementById('critter');
          if(c){ c.classList.remove('down','perched'); c.style.setProperty('--bf-dur','1.1s'); }
        },900);
      }
      scr.addEventListener('scroll',onIntroScroll,{passive:true,once:true});
    }
    setTimeout(run, 480);
  })();
  

;


    /* B — sun/moon arc + day-night CYCLE: the sun arcs across the sky as you descend; when it reaches the
       far edge (scroll bottom) the page flips to night and a FULL moon returns to the starting position.
       Scrolling back up sails the moon across the night sky (waning as it goes); when it completes its pass
       at the top, day returns. Manual toggle still works. */
    (function(){
      var celest=document.getElementById('celest'), carve=document.getElementById('mcarve'), tint=document.getElementById('daytint');
      var N=(window.__story&&window.__story.beats)||6;
      function lerp(a,b,t){return a+(b-a)*t;}
      function mix(c1,c2,t){return 'rgb('+Math.round(lerp(c1[0],c2[0],t))+','+Math.round(lerp(c1[1],c2[1],t))+','+Math.round(lerp(c1[2],c2[2],t))+')';}
      var DAY=[[252,240,214],[230,168,94],[196,96,48]];     // soft warm → amber → deep dusk orange
      var NIGHT=[[120,140,200],[58,80,150],[22,32,78]];      // soft moonlight → → deep night
      function stop(s,t){ return t<=0.5 ? mix(s[0],s[1],t/0.5) : mix(s[1],s[2],(t-0.5)/0.5); }
      var prevT=null, leftTop=false, leftBottom=true, scroller=null;
      var sky=celest.parentElement;
      /* the sky sits beneath the scroller, so overlay a hit-target that tracks the sun/moon and toggles theme */
      var hit=document.createElement('button');
      hit.id='celestHit'; hit.type='button'; hit.setAttribute('aria-label','Toggle day or night');
      hit.style.cssText='position:fixed;width:108px;height:108px;margin:0;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer;z-index:40;display:none';
      hit.addEventListener('click',function(){
        var d=document.documentElement.getAttribute('data-theme')==='dark';
        if(window.__setTheme) window.__setTheme(d?'light':'dark');
      });
      document.body.appendChild(hit);
      function handoff(){                                   // old body falls off the edge; new one rises into place
        var dark=document.documentElement.getAttribute('data-theme')==='dark';
        var out=celest.querySelector(dark?'.moonwrap':'.sun'); if(!out) return;
        var fall=document.createElement('div'); fall.className='fallbody';
        fall.style.left=celest.style.left; fall.style.top=celest.style.top;
        var c=out.cloneNode(true);
        c.querySelectorAll('[id]').forEach(function(n){ n.removeAttribute('id'); });   // no duplicate ids
        fall.appendChild(c); sky.appendChild(fall);
        setTimeout(function(){ fall.remove(); },1400);
        celest.classList.remove('arrive'); void celest.offsetWidth; celest.classList.add('arrive');
        setTimeout(function(){ celest.classList.remove('arrive'); },1600);
      }
      function loop(){
        var pos=window.__storyPos||0;
        var t=N>1?Math.max(0,Math.min(1,pos/(N-1))):0;
        var dark=document.documentElement.getAttribute('data-theme')==='dark';
        if(!scroller) scroller=document.querySelector('.scroller');
        var atTop, atBottom;
        if(scroller){ atTop=scroller.scrollTop<=4; atBottom=(scroller.scrollTop+scroller.clientHeight)>=(scroller.scrollHeight-4); }
        else { atTop=t<=0.02; atBottom=t>=0.98; }
        if(!atTop) leftTop=true;        // user moved down, away from the top
        if(!atBottom) leftBottom=true;  // user moved up, away from the bottom
        // reach the bottom → night; return to the top → day. Fires once the edge has been left,
        // so even a small scroll down then back up flips reliably at the top.
        if(window.__setTheme){
          if(!dark && leftBottom && atBottom){ handoff(); window.__setTheme('dark'); dark=true; leftBottom=false; }
          else if(dark && leftTop && atTop){ handoff(); window.__setTheme('light'); dark=false; leftTop=false; }
        }
        prevT=t;
        var px=t;                                           // moon stays where the sun ended; rides the same arc back up
        var pp=dark?1-t:t;                                  // phase/hue progress through the night pass (full at dusk → new by the top)
        var x=(0.10+0.80*px)*innerWidth, y=(0.31-0.14*Math.sin(px*Math.PI))*innerHeight;
        celest.style.left=x+'px'; celest.style.top=y+'px';
        var hb=celest.getBoundingClientRect(), stg=document.querySelector('.stage');
        if(hb.width && !(stg&&stg.classList.contains('seq-zoom'))){ hit.style.display='block'; hit.style.left=(hb.left+hb.width/2-54)+'px'; hit.style.top=(hb.top+hb.height/2-54)+'px'; }
        else hit.style.display='none';
        carve.setAttribute('cx',(-36+96*pp).toFixed(1));    // full (dusk, bottom) → new (end of the night pass, top)
        var col=stop(dark?NIGHT:DAY,pp);
        tint.style.mixBlendMode=dark?'screen':'soft-light';
        // hue softest at the starting position, building to most intense by the end of each pass
        tint.style.opacity=(dark?lerp(0.12,0.70,pp):lerp(0.10,0.92,pp)).toFixed(2);
        tint.style.background='radial-gradient(120% 115% at '+(x/innerWidth*100).toFixed(1)+'% '+(y/innerHeight*100).toFixed(1)+'%, '+col+' 0%, transparent 60%)';
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    })();
  

;


    /* passing showers: at a random moment each minute, a brief rain falls directly over one of the trees */
    (function(){
      var svg=document.getElementById('tendsvg');
      var garden=document.getElementById('garden');
      if(!svg||!garden) return;
      var panel=document.querySelector('.garden-fixed'), overlay=svg.parentNode;
      var FRAME_TOP=96, SOILF=0.663, NS='http://www.w3.org/2000/svg';
      var reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
      function el(n,at){ var e=document.createElementNS(NS,n); for(var k in at) e.setAttribute(k,at[k]); svg.appendChild(e); return e; }
      function soilLocalY(){
        var availH=Math.max(60, panel.clientHeight-FRAME_TOP-Math.round(innerHeight*0.30));
        return FRAME_TOP+availH*SOILF;   // overlay now starts at the page top, behind the nav bar
      }
      // pick a tree that's currently facing the viewer (front half of the ring)
      function pickTree(){
        var kids=[].slice.call(garden.children).filter(function(d){
          return parseFloat(d.style.opacity||1)>0.5 && d.offsetWidth>40;
        });
        if(!kids.length) return null;
        return kids[Math.floor(Math.random()*kids.length)];
      }
      function cloudWash(uid){
        /* C5 layered wash from the cloud lab: three blurred washes stacked */
        var d='M-52 14 C -58 8 -54 -2 -44 -3 C -46 -13 -36 -19 -27 -15 C -25 -24 -12 -28 -4 -22 '+
              'C 2 -29 16 -28 21 -20 C 30 -25 43 -19 42 -10 C 52 -9 57 1 51 8 C 55 13 51 15 46 15 L -46 15 C -51 15 -54 15 -52 14 Z';
        return '<filter id="cwb'+uid+'" x="-40%" y="-80%" width="180%" height="260%"><feGaussianBlur stdDeviation="3.2"></feGaussianBlur></filter>'+
          '<g filter="url(#cwb'+uid+')" transform="scale(1.3)">'+
          '<path transform="scale(1.18) translate(2,2)" d="'+d+'"></path>'+
          '<path transform="scale(1.02)" d="'+d+'"></path>'+
          '<path transform="scale(.82) translate(-4,-3)" d="'+d+'"></path></g>';
      }

      function shower(){
        var tree=pickTree(); if(!tree) return;
        var oR=overlay.getBoundingClientRect(), tR=tree.getBoundingClientRect();
        var cx=tR.left+tR.width/2-oR.left;
        var bar=document.querySelector('.topbar');
        var topY=((bar?bar.offsetHeight:70))+26;         // rain emerges from the top of the page, just under the nav
        var soilY=soilLocalY();
        var span=Math.min(tR.width*0.62, 150);           // shower is as wide as the canopy
        window.__rain={ x:oR.left+cx, span:span, start:Date.now()+1400, end:Date.now()+1400+3200+900 };
        // the layered-wash rain cloud drifts in light, then DARKENS just before the rain lets go
        var cloud=el('g',{class:'cloud'});
        cloud.innerHTML=cloudWash(Date.now()%100000);
        cloud.style.transform='translate('+cx+'px,'+(topY-16)+'px)';
        cloud.animate([
          {transform:'translate('+(cx-26)+'px,'+(topY-16)+'px)',opacity:0},
          {transform:'translate('+cx+'px,'+(topY-16)+'px)',opacity:.42,offset:.1},
          {transform:'translate('+(cx+3)+'px,'+(topY-16)+'px)',opacity:1,offset:.2},
          {transform:'translate('+(cx+10)+'px,'+(topY-16)+'px)',opacity:1,offset:.8},
          {transform:'translate('+(cx+30)+'px,'+(topY-16)+'px)',opacity:0}
        ],{duration:reduced?1200:6800,easing:'ease-in-out'}).onfinish=function(){ cloud.remove(); };
        var damp=el('ellipse',{class:'damp',cx:cx,cy:soilY+5,rx:span*0.62,ry:4.5,opacity:0});
        damp.animate([{opacity:0},{opacity:0,offset:.12},{opacity:.4,offset:.3},{opacity:.4,offset:.62},{opacity:0}],
          {duration:9500,easing:'ease'}).onfinish=function(){ damp.remove(); };
        if(reduced) return;
        var n=26, fallDur=3200;                          // a gentle pass, ~3s of rain
        for(var i=0;i<n;i++){
          (function(i){
            setTimeout(function(){
              var dx=cx+(Math.random()*span-span/2), dy=topY+Math.random()*10;
              var drop=el('circle',{class:'drop',cx:dx,cy:dy,r:1.4+Math.random()*0.5,opacity:0});
              var fall=soilY-dy;
              drop.animate([
                {transform:'translate(0,0)',opacity:0},
                {transform:'translate('+(Math.random()*3-1.5)+'px,'+(fall*0.25)+'px)',opacity:.8,offset:.25},
                {transform:'translate('+(Math.random()*6-3)+'px,'+fall+'px)',opacity:.75}
              ],{duration:760+Math.random()*220,easing:'cubic-bezier(.5,.05,.85,.5)'}).onfinish=function(){
                if(i%3===0){
                  var sp=el('ellipse',{class:'splash',cx:dx,cy:soilY+1,rx:1,ry:.6,opacity:.65});
                  sp.animate([{rx:1,opacity:.65},{rx:6.5,ry:1.5,opacity:0}],{duration:360,easing:'ease-out'}).onfinish=function(){ sp.remove(); };
                }
                drop.remove();
              };
            }, 1400+Math.random()*fallDur);
          })(i);
        }
        // the rained-on tree gets a brief flush of life
        garden.classList.add('tended');
        setTimeout(function(){ garden.classList.remove('tended'); },4200);
        // …and as the water soaks in, its roots glimmer trunk→tip as if they are growing
        setTimeout(function(){
          var roots=tree.querySelectorAll('path.b-root, circle.bud-root');
          if(!roots.length) return;
          for(var r=0;r<roots.length;r++) roots[r].style.animationDelay=(r*5)+'ms';
          tree.classList.add('rained');
          setTimeout(function(){
            tree.classList.remove('rained');
            for(var r=0;r<roots.length;r++) roots[r].style.animationDelay='';
          }, 2600+roots.length*5+300);
        }, 2300);
      }
      // somewhere at random within each minute, one shower passes — but only while the page is watched
      function loop(){
        setTimeout(function(){
          if(!document.hidden) shower();   // tab inactive: skip this shower, keep the clock
          loop();
        }, 6000+Math.random()*54000);
      }
      loop();
      window.__shower=shower;   // test hook
    })();
  

;


    /* the resident: the M1 monarch, fluttering lazily about the garden.
       It perches on titles, buttons and nav links (in FRONT of the text); the mouse —
       or any scroll — scares it off. Caught under a shower it drops to the soil and
       waits out the rain. It never goes below the soil line. */
    (function(){
      var el=document.getElementById('critter'), dir=document.getElementById('critterdir');
      if(!el) return;
      var reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
      var FRAME_TOP=96, SOILF=0.663;
      function soilY(){ var availH=Math.max(60, innerHeight-FRAME_TOP-Math.round(innerHeight*0.30)); return FRAME_TOP+availH*SOILF; }
      function topY(){ var b=document.querySelector('.topbar'); return (b?b.offsetHeight:90)+24; }

      var x=innerWidth*0.62, y=topY()+120, vx=0, vy=0, t=Math.random()*100;
      var tx=x, ty=y, retarget=0, facing=1;
      var state='fly', groundT=0;
      lx=x; ly=y;
      var noPerchUntil=Date.now()+6000, nextPerch=Date.now()+8000+Math.random()*6000;
      var perchEl=null, perchFx=0.5, perchUntil=0, approach=false, perchBB=null, hops=0;
      var bodyEl=el.querySelector('.layer.body'), bodyTilt=52, burstUntil=0, fallT=0, lx=0, ly=0;

      function pickTarget(){
        var sy=soilY();
        tx=40+Math.random()*(innerWidth-80);
        ty=topY()+Math.random()*(sy-topY()-60);
        retarget=Date.now()+4500+Math.random()*5000;
        if(Math.random()<0.25 && !approach) el.classList.toggle('behind');
      }
      pickTarget();

      /* things worth landing on: hero titles, kickers, CTAs, nav links, the specimen name */
      function perchSpots(){
        var sy=soilY(), out=[];
        var els=document.querySelectorAll('.ch-t,.ch-c,.ch-k,.topbar a,.gfname');
        for(var i=0;i<els.length;i++){
          var cs=getComputedStyle(els[i]);
          if(cs.visibility==='hidden' || +cs.opacity<0.5) continue;
          var r=pRect(els[i]);
          if(r.width<24||r.height<8) continue;
          if(r.top<topY()-12||r.top>sy-24) continue;
          if(r.left<12||r.right>innerWidth-12) continue;
          out.push(els[i]);
        }
        /* …and the soft flowers in the garden itself: dandelion and yarrow (never the trees) */
        var pls=document.querySelectorAll('.gc-plant[data-key="dandelion"],.gc-plant[data-key="yarrow"]');
        for(var j=0;j<pls.length;j++){
          var pcs=getComputedStyle(pls[j]); if(+pcs.opacity<0.55) continue;
          var pr=pls[j].getBoundingClientRect();
          if(pr.width<60 || pr.left<0 || pr.right>innerWidth) continue;
          out.push(pls[j]);
        }
        return out;
      }
      function pRect(e){
        try{ var rg=document.createRange(); rg.selectNodeContents(e);
          var r=rg.getBoundingClientRect(); if(r.width>4 && r.height>4) return r; }catch(_){}
        return e.getBoundingClientRect();
      }
      function perchPoint(){
        if(!perchEl) return null;
        var cs=getComputedStyle(perchEl);
        if(cs.visibility==='hidden' || +cs.opacity<0.5) return null;
        if(perchEl.classList.contains('gc-plant')){
          /* land on the flower head: map the plant svg's drawn bounds to the screen */
          var svg=perchEl.querySelector('svg'); if(!svg) return null;
          var sr=svg.getBoundingClientRect(); if(sr.width<40) return null;
          try{ if(!perchBB) perchBB=svg.getBBox(); }catch(_){ return null; }
          var s=Math.min(sr.width,sr.height)/1000;
          var ox=sr.left+(sr.width-1000*s)/2, oy=sr.top+(sr.height-1000*s)/2;
          var px=ox+(perchBB.x+perchBB.width*(0.38+perchFx*0.24))*s;
          var py=oy+(perchBB.y+perchBB.height*0.07)*s;
          if(py>soilY()-20) return null;
          return { x:px, y:py };
        }
        var r=pRect(perchEl);
        if(r.width<5) return null;
        return { x:r.left+r.width*perchFx, y:r.top+r.height*0.18-4 };
      }
      function startApproach(){
        var spots=perchSpots(); if(!spots.length){ nextPerch=Date.now()+5000; return; }
        perchEl=spots[Math.floor(Math.random()*spots.length)]; perchBB=null;
        perchFx=0.18+Math.random()*0.64;
        approach=true; el.classList.remove('behind');
      }
      function takeOff(scareX){
        state='fly'; approach=false; perchEl=null; perchBB=null;
        burstUntil=Date.now()+420;   /* beat the wings before lifting */
        el.classList.remove('perched'); el.classList.remove('front');
        noPerchUntil=Date.now()+2600+Math.random()*1500;
        nextPerch=Date.now()+7000+Math.random()*7000;
        if(typeof scareX==='number'){ vx=(x<scareX?-1:1)*0.7; vy=-0.45; }
        pickTarget();
      }

      function inRain(){ var w=window.__rain; if(!w) return false; var now=Date.now();
        return now>=w.start && now<=w.end && Math.abs(x-w.x)<(w.span/2+26); }
      function rainActive(){ var w=window.__rain; if(!w) return false; var now=Date.now(); return now>=w.start&&now<=w.end; }
      function caughtByRain(){ state='fall'; vy=0.25; fallT=0; approach=false; perchEl=null;
        el.classList.add('down'); el.classList.remove('perched'); el.classList.remove('front'); }

      function step(){
        var sy=soilY(), floor=sy-6;
        t+=0.016;
        if(state==='fly'){
          if(approach){
            var p=perchPoint();
            if(!p){ takeOff(); }
            else{
              tx=p.x; ty=p.y;
              if(Math.hypot(tx-x,ty-y)<7 && Math.abs(vx)+Math.abs(vy)<1.1){
                state='perch'; x=tx; y=ty; vx=vy=0;
                perchUntil=Date.now()+6000+Math.random()*9000;
                el.classList.add('perched'); el.classList.add('front');
              }
            }
          } else if(Date.now()>nextPerch && Date.now()>noPerchUntil){
            startApproach();
          } else if(Date.now()>retarget || (Math.abs(x-tx)<26 && Math.abs(y-ty)<26)){
            pickTarget();
          }
          /* slow, fluttering travel — monarchs amble, they don't dart */
          if(Date.now()<burstUntil){ vx*=0.9; vy=0; }
          else{ vx+=(tx-x)*0.0003; vy+=(ty-y)*0.0003; }
          vx*=0.975; vy*=0.975;
          var dT=Math.hypot(tx-x,ty-y);
          var sp=Math.hypot(vx,vy), cap=approach?0.42:0.34, lo=(dT>40)?0.26:0;
          if(sp>cap){ vx*=cap/sp; vy*=cap/sp; }
          else if(lo && sp>0.001 && sp<lo){ vx*=lo/sp; vy*=lo/sp; }   /* keep a steady amble — no crawling */
          x+=vx+Math.sin(t*1.7)*0.09;
          y+=vy+Math.sin(t*2.6)*0.22;
          if(y>floor){ y=floor; vy=0; }
          if(y<topY()){ y=topY(); vy=0; }
          if(inRain()) caughtByRain();
        } else if(state==='perch'){
          var pp=perchPoint();
          if(!pp){ takeOff(); }
          else if(Date.now()>perchUntil){ takeOff(undefined, true); }
          else{ x=pp.x; y=pp.y; if(inRain()) caughtByRain(); }
        } else if(state==='fall'){
          /* spiralling down, like a leaf */
          fallT+=0.016; vx*=0.9;
          vy=Math.min(vy+0.045,0.9);
          x+=vx+Math.cos(fallT*4.6)*1.5*Math.min(1,fallT*2.5);
          y+=vy+Math.sin(fallT*4.6)*0.45;
          if(y>=floor){ y=floor; vy=0; state='ground'; groundT=Date.now(); el.classList.add('flat'); }
        } else if(state==='ground'){
          y=floor; x+=Math.sin(t*1.2)*0.05;
          if(!rainActive() && Date.now()-groundT>800){ state='rise'; vy=-0.05; burstUntil=Date.now()+500; el.classList.remove('down'); el.classList.remove('flat'); }
        } else if(state==='rise'){
          if(Date.now()<burstUntil){ vy=-0.02; }   /* wings first, lift second */
          else vy=Math.max(vy-0.0028,-0.45);        /* a slow, gathering take-off */
          y+=vy+Math.sin(t*3.5)*0.3; x+=Math.sin(t*0.9)*0.5;
          if(y<sy-110){ state='fly'; noPerchUntil=Date.now()+4000; pickTarget(); }
          if(inRain()){ state='fall'; vy=0.3; el.classList.add('down'); }
        }
        if(state!=='perch'){
          /* hard ceiling on travel speed — excitement allowed, darting not */
          var ddx=x-lx, ddy=y-ly, dd=Math.hypot(ddx,ddy), MAXD=(state==='fall')?1.1:0.38;
          if(dd>MAXD){ x=lx+ddx*MAXD/dd; y=ly+ddy*MAXD/dd; }
        }
        lx=x; ly=y;
        var f=(vx>0.05)?1:(vx<-0.05)?-1:facing; facing=f;
        var fast=(Date.now()<burstUntil)||(state!=='perch' && vy<-0.06);
        el.style.setProperty('--bf-dur', fast?'0.55s':(state==='perch'?'2.6s':'1.1s'));
        var bT=(state!=='perch' && vy<-0.06)?0:52;   /* climbing: original torso angle */
        bodyTilt+=(bT-bodyTilt)*0.08;
        bodyEl.style.transform='rotate('+bodyTilt.toFixed(1)+'deg)';
        el.style.transform='translate3d('+(x-17)+'px,'+(y-22)+'px,0)';
        dir.style.transform='scaleX('+f+')';
        requestAnimationFrame(step);
      }

      /* the mouse scares it: flee the cursor, abandon any perch */
      addEventListener('mousemove',function(e){
        var d=Math.hypot(e.clientX-x, e.clientY-y);
        if(d<95){
          if(state==='perch'||approach){ takeOff(e.clientX); }
          else if(state==='fly'){ vx+=(x<e.clientX?-1:1)*0.3; vy-=0.15; noPerchUntil=Math.max(noPerchUntil,Date.now()+2000); }
        }
      },{passive:true});

      /* scrolling scares it too — no perching while the page is moving */
      function scare(){
        if(state==='perch'||approach) takeOff();
        noPerchUntil=Math.max(noPerchUntil,Date.now()+2500);
        nextPerch=Math.max(nextPerch,Date.now()+3500);
      }
      var scr=document.getElementById('scroller');
      if(scr) scr.addEventListener('scroll',scare,{passive:true});
      addEventListener('wheel',scare,{passive:true});

      if(reduced){
        el.style.transform='translate3d('+(innerWidth*0.68)+'px,'+(topY()+140)+'px,0)';
      } else {
        requestAnimationFrame(step);
      }
      addEventListener('resize',function(){ x=Math.min(x,innerWidth-30); });
      window.__critter={ get state(){return state;}, get pos(){return {x:x,y:y};}, get perchEl(){return perchEl;} };
    })();
  

;


    /* night sky: a seeded scatter of very tiny stars; a few of them twinkle */
    (function(){
      var svg=document.getElementById('starsky'); if(!svg) return;
      function seeded(s){ return function(){ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
      function build(){
        var W=innerWidth, H=innerHeight, rnd=seeded(77), out='';
        svg.setAttribute('viewBox','0 0 '+W+' '+H);
        var n=Math.round(W*H/14000);   // density: ~90 stars on a laptop viewport
        for(var i=0;i<n;i++){
          var x=rnd()*W, y=rnd()*H, r=0.4+rnd()*0.7, o=0.15+rnd()*0.45;
          var tw=(i%6===0), dl=(rnd()*4).toFixed(1);
          out+='<circle '+(tw?'class="tw" style="animation-delay:'+dl+'s" ':'')+'cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+r.toFixed(2)+'" opacity="'+o.toFixed(2)+'"></circle>';
        }
        svg.innerHTML=out;
      }
      build();
      addEventListener('resize', build);
    })();
  

;


  (function(){
    'use strict';
    var stage    = document.querySelector('.stage');
    var panel    = document.querySelector('.garden-fixed');
    var gardenEl = document.getElementById('garden');
    var col      = document.getElementById('col');
    if (!stage||!panel||!gardenEl||!col) return;

    var phase  = 'idle';  // idle | expand | pan | zoom | zoomed | returning
    var zPlant = 0;
    var hint   = null;

    /* helpers */
    function ease(t){ return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2; }
    function plantN(){ return window.GardenCarousel&&GardenCarousel.DEFAULT_PLANTS?GardenCarousel.DEFAULT_PLANTS.length:5; }
    function plantKey(i){ return window.GardenCarousel&&GardenCarousel.DEFAULT_PLANTS?GardenCarousel.DEFAULT_PLANTS[i].key:''; }

    /* intercept CTA + nav clicks (capture phase so we always win) */
    document.addEventListener('click',function(e){
      if (phase==='zoomed'||phase==='nerve'){ e.preventDefault(); returnHome(); return; }
      if (phase!=='idle') return;
      var cta=e.target.closest('.ch-c'), nav=e.target.closest('.nav-item');
      if (!cta&&!nav) return;
      e.preventDefault(); e.stopPropagation();
      var idx=0;
      if(cta){ var s=cta.closest('[data-i]'); idx=s?+s.dataset.i:0; }
      else { var ns=[].slice.call(document.querySelectorAll('.nav-item')); idx=Math.max(0,ns.indexOf(nav)); }
      zPlant=idx; doExpand(idx);
    },true);

    document.addEventListener('keydown',function(e){
      if(e.key!=='Escape'||phase==='idle'||phase==='returning') return;
      /* defer to m44-leaf-connect when L2/L3 is open */
      var lv=document.getElementById('leafView'), dv=document.getElementById('dnaView'), rv=document.getElementById('resumeView');
      if((lv&&lv.classList.contains('open'))||(dv&&dv.classList.contains('open'))||(rv&&rv.classList.contains('open'))) return;
      returnHome();
    });

    /* ── Phase 1: instantly expand garden to full width (image-1 → image-2) ── */
    function doExpand(idx){
      phase='expand';
      /* freeze the carousel at its current scroll-driven pos */
      window.__gcOverride = window.__storyPos||0;
      stage.classList.add('seq-zoom');

      col.style.transition   ='opacity .15s ease,transform .18s ease';
      col.style.opacity      ='0';
      col.style.transform    ='translateX(-28px)';
      col.style.pointerEvents='none';

      panel.style.transition ='width .2s cubic-bezier(.2,.7,.2,1)';
      panel.style.width      ='100%';

      gardenEl.style.transition='clip-path .2s ease';
      gardenEl.style.clipPath  ='inset(96px 0% 0% 0%)';

      setTimeout(function(){ doPan(idx); },220);
    }

    /* ── Phase 2: pan directly to target plant ── */
    function doPan(idx){
      phase='pan';
      var n    = plantN();
      var from = ((window.__storyPos||0)%n+n)%n;
      var t0   = Date.now(), DUR=320;
      /* take the shortest arc around the ring to reach idx */
      var diff = idx - from;
      if(diff >  n/2) diff -= n;
      if(diff < -n/2) diff += n;

      function raf(){
        if(phase!=='pan') return;
        var t=Math.min(1,(Date.now()-t0)/DUR);
        var p=((from+ease(t)*diff)%n+n)%n;
        window.__gcOverride=p;
        if(t<1){ requestAnimationFrame(raf); }
        else {
          window.__gcOverride=idx;
          /* whitewash fires 90ms after pan ends (= 410ms from pan start, 50ms before zoom) */
          setTimeout(function(){ doWhitewash(idx); }, 90);
          setTimeout(function(){ doZoom(idx); },140);
        }
      }
      requestAnimationFrame(raf);
    }

    /* ── Phase 3: extreme zoom into the plant's canopy ── */
    function doZoom(idx){
      phase='zoom';

      /* locate the target plant element */
      var k=plantKey(idx);
      var tEl=k?document.querySelector('#garden .gc-plant[data-key="'+k+'"]'):null;
      if(!tEl){
        var best=null,bestS=-1;
        [].forEach.call(document.querySelectorAll('#garden .gc-plant'),function(p){
          var r=p.getBoundingClientRect(),op=parseFloat(p.style.opacity||'1');
          var s=r.width*r.height*op; if(s>bestS){bestS=s;best=p;}
        });
        tEl=best;
      }
      if(!tEl){ phase='idle'; return; }

      var r   =tEl.getBoundingClientRect();
      /* canopy = 13% down from top of the plant's bounding box */
      var cx  =r.left+r.width*0.50;
      var cy  =r.top +r.height*0.13;
      var ox  =(cx/window.innerWidth *100).toFixed(2)+'%';
      var oy  =(cy/window.innerHeight*100).toFixed(2)+'%';

      /* unlock overflow so the zoom fills the whole viewport */
      panel.style.overflow   ='visible';
      gardenEl.style.clipPath='none';

      gardenEl.style.transformOrigin=ox+' '+oy;
      gardenEl.style.transition     ='transform 0.55s cubic-bezier(.14,.72,.05,1)';
      gardenEl.style.transform      ='scale(80)';

      /* auto-whitewash → nerve view after zoom settles */
      /* whitewash is now triggered from doPan for earlier timing */
    }

    /* ── Return to image-1 ── */
    function returnHome(){
      if(phase==='returning') return;
      var fromNerve=(phase==='nerve'||!!document.getElementById('seq-nerve'));
      phase='returning';
      hideHint();
      /* clean up any wash overlay */
      var washEl=document.getElementById('seq-wash');
      if(washEl){ washEl.style.opacity='0'; setTimeout(function(){ washEl.remove(); },600); }
      if(fromNerve){
        /* just fade out the nerve view and restore */
        var nEl=document.getElementById('seq-nerve');
        if(nEl){ nEl.style.transition='opacity .4s ease'; nEl.style.opacity='0'; setTimeout(function(){ nEl.remove(); },450); }
        window.__gcOverride=null;
        gardenEl.style.transition=''; gardenEl.style.transform='';
        gardenEl.style.clipPath=''; gardenEl.style.transformOrigin='';
        panel.style.overflow=''; panel.style.transition='width .65s cubic-bezier(.2,.7,.2,1)';
        col.style.transition='opacity .55s ease,transform .55s ease';
        col.style.opacity='1'; col.style.transform=''; col.style.pointerEvents='';
        stage.classList.remove('seq-zoom');
        setTimeout(function(){ phase='idle'; },750);
        return;
      }
      /* from zoom: unzoom normally */
      gardenEl.style.transition='transform 0.4s cubic-bezier(.2,.7,.2,1)';
      gardenEl.style.transform ='';
      setTimeout(function(){
        window.__gcOverride=null;
        gardenEl.style.transition=''; gardenEl.style.transformOrigin='';
        gardenEl.style.clipPath=''; panel.style.overflow='';
        panel.style.transition='width .3s cubic-bezier(.2,.7,.2,1)';
        col.style.transition='opacity .28s ease,transform .28s ease';
        col.style.opacity='1'; col.style.transform=''; col.style.pointerEvents='';
        stage.classList.remove('seq-zoom');
        setTimeout(function(){ phase='idle'; },350);
      },440);
    }
    window.__seqReturn=returnHome;

    /* ── Whitewash → L2 leaf view via M44LeafConnect ── */
    function doWhitewash(idx){
      phase='whitewash';
      var wash=document.createElement('div');
      wash.id='seq-wash';
      wash.style.cssText='position:fixed;inset:0;z-index:82;background:var(--bg);opacity:0;transition:opacity .28s ease;pointer-events:none';
      document.body.appendChild(wash);
      requestAnimationFrame(function(){ wash.style.opacity='1'; });
      setTimeout(function(){
        /* snap-unzoom & fully restore garden behind the wash */
        gardenEl.style.transition='none'; gardenEl.style.transform='';
        gardenEl.style.clipPath=''; gardenEl.style.transformOrigin='';
        panel.style.overflow=''; panel.style.transition=''; panel.style.width='';
        window.__gcOverride=null;
        col.style.transition='none'; col.style.opacity='1';
        col.style.transform=''; col.style.pointerEvents='';
        stage.classList.remove('seq-zoom');
        /* dissolve wash */
        wash.style.transition='opacity .24s ease';
        wash.style.opacity='0';
        setTimeout(function(){ wash.remove(); },280);
        /* pre-hide stage so openLeaf's internal scale animation is invisible */
        stage.style.transition='none';
        stage.classList.add('zoomed');
        /* hand off to L2 leaf view */
        var key=plantKey(idx);
        var originEl=document.querySelector('#garden .gc-plant[data-key="'+key+'"]')||panel;
        if(key==='yarrow'){   window.location.href='about-c.html';     return; }
        if(key==='willow'){   window.location.href='work-results.html';  return; }
        if(key==='hawthorn'){ window.location.href='resume-rings.html';  return; }
        if(window.M44LeafConnect) M44LeafConnect.openLeaf(key, originEl);
        phase='idle';
      },320);
    }

    function buildNerveView(idx){
      var DATA=[
        {name:'HAWTHORN', lat:'Crataegus monogyna',   form:'PINNATELY LOBED'},
        {name:'WILLOW',   lat:'Salix babylonica',     form:'LANCEOLATE'},
        {name:'YARROW',   lat:'Achillea millefolium', form:'PINNATELY COMPOUND'},
        {name:'DANDELION',lat:'Taraxacum officinale', form:'RUNCINATE LOBED'},
        {name:'MAPLE',    lat:'Acer saccharum',       form:'PALMATELY LOBED'}
      ];
      var d=DATA[idx]||DATA[0];
      var el=document.createElement('div');
      el.id='seq-nerve';
      el.style.cssText='position:fixed;inset:0;z-index:81;display:flex;flex-direction:column;'+
        'align-items:center;justify-content:center;gap:28px;background:var(--bg);'+
        'opacity:0;transition:opacity .6s ease';
      var svgH=Math.min(Math.round(window.innerHeight*0.55),340);
      var svgW=Math.round(svgH*0.58);
      /* vein data: [midrib_y, lx, ly, rx, ry, sw] */
      var VD=[
        [78, 70,62, 130,62, .95],[116,55,101,145,101,.90],
        [156,48,143,152,143,.85],[196,47,183,153,183,.80],
        [238,53,226,147,226,.75],[278,63,268,137,268,.70]
      ];
      var veins=VD.map(function(v){
        return '<line x1="100" y1="'+v[0]+'" x2="'+v[1]+'" y2="'+v[2]+'" stroke="var(--text)" stroke-width="'+v[5]+'" stroke-linecap="round"/>'+
               '<line x1="100" y1="'+v[0]+'" x2="'+v[3]+'" y2="'+v[4]+'" stroke="var(--text)" stroke-width="'+v[5]+'" stroke-linecap="round"/>';
      }).join('');
      var NP=[
        [100,14,3.5],
        [100,78,4.5],[70,62,2.8],[130,62,2.8],
        [100,116,4.5],[55,101,2.8],[145,101,2.8],
        [100,156,4.5],[48,143,2.8],[152,143,2.8],
        [100,196,4.5],[47,183,2.8],[153,183,2.8],
        [100,238,4.5],[53,226,2.8],[147,226,2.8],
        [100,278,4.5],[63,268,2.8],[137,268,2.8],
        [100,332,4.0]
      ];
      var ndsvg=NP.map(function(p){
        return '<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+p[2]+'" fill="var(--accent-warm)" stroke="var(--text)" stroke-width="0.65"/>';
      }).join('');
      el.innerHTML=
        '<svg viewBox="0 0 200 370" width="'+svgW+'" height="'+svgH+'" overflow="visible">'+
          '<path d="M100 14 C132 36 155 92 155 148 C155 228 133 292 100 332 C67 292 45 228 45 148 C45 92 68 36 100 14Z" '+
               'fill="color-mix(in srgb,var(--bg) 88%,var(--text))" stroke="var(--text)" stroke-width="1.1"/>'+
          '<line x1="100" y1="14" x2="100" y2="332" stroke="var(--text)" stroke-width="1.3" stroke-linecap="round"/>'+
          '<line x1="100" y1="332" x2="100" y2="356" stroke="var(--text)" stroke-width="1.3" stroke-linecap="round"/>'+
          veins+ndsvg+
        '</svg>'+
        '<div style="text-align:center;display:flex;flex-direction:column;gap:6px">'+
          '<div style="font-family:var(--mono);font-size:9.5px;letter-spacing:.28em;text-transform:uppercase;color:var(--accent-warm)">'+d.form+'</div>'+
          '<div style="font-family:var(--mono);font-size:12.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--text)">'+d.name+'</div>'+
          '<div style="font-family:var(--serif);font-style:italic;font-size:13.5px;color:var(--text-soft)">'+d.lat+'</div>'+
        '</div>'+
        '<button id="nerve-esc" style="font-family:var(--mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;'+
          'color:var(--text);background:none;border:1px solid color-mix(in srgb,var(--text) 22%,transparent);'+
          'border-radius:999px;padding:9px 20px;cursor:pointer;margin-top:4px">ESC · back to garden</button>';
      el.querySelector('#nerve-esc').addEventListener('click',returnHome);
      return el;
    }

    /* ── inject invisible leaf buds into every plant SVG (visible only on micro-zoom) ── */
    function leafSVG(){
      /* 3.5-unit node — ~1.5px at garden scale, ~280px at 80× zoom */
      return '<circle class="gc-zoom-leaf" cx="500" cy="130" r="3.5" fill="var(--root)" stroke="var(--ink)" stroke-width="0.6" style="pointer-events:none"/>';
    }
    function injectLeafBuds(){
      document.querySelectorAll('#garden .gc-plant').forEach(function(pl){
        if (pl.querySelector('.gc-zoom-leaf')) return;
        var svg = pl.querySelector('svg');
        if (!svg) return;
        var g = document.createElementNS('http://www.w3.org/2000/svg','g');
        g.innerHTML = leafSVG(pl.dataset.key);
        svg.appendChild(g.firstChild);
      });
    }
    /* run once after carousel has booted */
    setTimeout(injectLeafBuds, 800);

    /* ── ESC hint ── */
    function showHint(){
      if(hint) return;
      hint=document.createElement('button');
      hint.textContent='ESC · back to garden';
      hint.style.cssText='position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:90;'+
        'font-family:var(--mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;'+
        'color:var(--text);background:color-mix(in srgb,var(--bg) 84%,transparent);'+
        'border:1px solid color-mix(in srgb,var(--text) 22%,transparent);border-radius:999px;'+
        'padding:9px 20px;cursor:pointer;opacity:0;transition:opacity .6s .9s ease;'+
        'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)';
      hint.addEventListener('click',function(){ if(phase==='zoomed') returnHome(); });
      document.body.appendChild(hint);
      requestAnimationFrame(function(){ hint.style.opacity='1'; });
    }
    function hideHint(){
      if(!hint) return;
      var h=hint; hint=null;
      h.style.transition='opacity .3s ease'; h.style.opacity='0';
      setTimeout(function(){ h.remove(); },350);
    }
  })();
  