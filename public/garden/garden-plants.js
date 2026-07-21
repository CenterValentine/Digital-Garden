/* garden-plants.js — generative companion plants for davidvalentine.org,
   ported from tree-lab-3. Renders small species (Norfolk Island Pine, Yarrow,
   Dandelion, Dandelion seeded-core) into a square 0..1000 SVG with the plant's
   GROUND point at a known fraction down the box, so callers can sit each plant
   on a soil line.

   API:
     var svg = GardenPlants.create(containerEl, cfg);   // appends + renders
     GardenPlants.GROUND[kind]  // 0..1 ground-Y fraction within the viewBox
   cfg.kind: undefined/'tree' (generative tree), 'dandelion', 'dandelion-orb'
*/
(function (global) {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var UP = -Math.PI / 2, DOWN = Math.PI / 2;

  function rng(s){var x=s>>>0||1;return function(){x^=x<<13;x^=x>>>17;x^=x<<5;x>>>=0;return x/4294967296;};}

  function generate(cfg){
    var rand=rng(cfg.seed||7);
    var nodes=[];
    function grow(x,y,angle,len,depth,sys,onLeader){
      var ex=x+Math.cos(angle)*len, ey=y+Math.sin(angle)*len;
      var perp=angle+Math.PI/2;
      var bow=(rand()-0.5)*len*cfg.curl;
      var cx=(x+ex)/2+Math.cos(perp)*bow, cy=(y+ey)/2+Math.sin(perp)*bow;
      var nd={x1:x,y1:y,cx:cx,cy:cy,x2:ex,y2:ey,sys:sys,children:[],tips:0};
      nodes.push(nd);
      if(depth<=0 || len<cfg.minLen || nodes.length>3400){ nd.tips=1; nd.tip=true; return nd; }
      var tgt=(sys==='root')?DOWN:cfg.tropismTarget;
      var isTrunk=(sys==='shoot' && depth===cfg.depth);
      var isRootTrunk=(sys==='root' && depth===cfg.rootDepth);
      var angles=[];
      if(cfg.leader && sys==='shoot' && onLeader){
        angles.push({a:angle+(rand()-0.5)*0.10, leader:true});
        for(var i=0;i<cfg.sideCount;i++){var sgn=(i%2)?1:-1; angles.push({a:angle+sgn*(cfg.spread*(0.7+rand()*0.5)), leader:false});}
      } else if(cfg.taproot && sys==='root' && onLeader){
        angles.push({a:angle+(rand()-0.5)*0.06, taproot:true});
        var nl=3+Math.floor(rand()*2);
        for(var i=0;i<nl;i++){var sg=(i%2)?1:-1; angles.push({a:angle+sg*(0.45+rand()*0.5), strand:true});}
      } else if(cfg.wideRoots && sys==='root'){
        if(isRootTrunk){
          var n=4; for(var i=0;i<n;i++){var frac=(i/(n-1)-0.5); angles.push({a:DOWN+frac*2.5+(rand()-0.5)*0.14, wideRoot:true});}
        } else {
          var n=(rand()<0.55?2:1); for(var i=0;i<n;i++){var frac=n===1?0:(i/(n-1)-0.5); angles.push({a:angle+frac*0.8+(rand()-0.5)*0.3, wideRoot:true});}
        }
      } else if((isTrunk || isRootTrunk) && !cfg.leader && !cfg.taproot){
        var mains=cfg.trunkMains||3;
        for(var i=0;i<mains;i++){var frac=(i/(mains-1)-0.5); angles.push({a:angle+frac*cfg.spread*2 + (rand()-0.5)*0.08});}
      } else if(cfg.fibrous && sys==='root'){
        var n = (depth===cfg.rootDepth) ? (7+Math.floor(rand()*3)) : (rand()<0.7?2:1);
        var sp = (depth===cfg.rootDepth) ? 1.5 : 0.85;
        for(var i=0;i<n;i++){var frac=n===1?0:(i/(n-1)-0.5); angles.push({a:angle+frac*sp*2+(rand()-0.5)*0.45, fibrous:true});}
      } else {
        var inUmbel = cfg.umbel && depth<=cfg.umbelLevels;
        var inWeep = cfg.weep && sys==='shoot' && depth<=cfg.weepLevels;
        var rootStrand = (sys==='root' && cfg.taproot);
        var oakTip = cfg.oakTips && sys==='shoot' && depth<=cfg.oakTipLevels;
        var n = inUmbel ? (cfg.umbelK[0]+Math.floor(rand()*(cfg.umbelK[1]-cfg.umbelK[0]+1)))
                        : inWeep ? (rand()<0.5?1:2)
                        : rootStrand ? (rand()<0.65?2:1)
                        : oakTip ? (2+Math.floor(rand()*2))
                        : (cfg.minK+Math.floor(rand()*(cfg.maxK-cfg.minK+1)));
        var sp = inUmbel ? cfg.spread*1.8 : inWeep ? cfg.spread*0.5 : rootStrand ? 0.5 : oakTip ? 0.52 : cfg.spread;
        var jit = rootStrand ? 0.26 : oakTip ? 0.5 : cfg.jitter;
        for(var i=0;i<n;i++){var frac=n===1?0:(i/(n-1)-0.5); angles.push({a:angle+frac*sp*2+(rand()-0.5)*jit, umbel:inUmbel, weep:inWeep, oakTip:oakTip});}
      }
      angles.forEach(function(k){
        var a2;
        if(cfg.leader && k.leader && sys==='shoot'){ a2=k.a+(UP-k.a)*0.45; }
        else if(cfg.leader && onLeader && sys==='shoot'){ a2=Math.atan2(Math.sin(k.a)+0.5,Math.cos(k.a)); }
        else if(k.taproot){ a2=Math.atan2(Math.sin(k.a)+0.9,Math.cos(k.a)); }
        else if(k.strand){ a2=k.a+(DOWN-k.a)*0.2; }
        else if(k.weep){ a2=Math.atan2(Math.sin(k.a)+cfg.weepPull,Math.cos(k.a)); }
        else if(k.fibrous){ a2=Math.atan2(Math.sin(k.a)+0.13,Math.cos(k.a)); }
        else if(k.wideRoot){ var tH=(Math.cos(k.a)>=0)?0:Math.PI; a2=k.a+(tH-k.a)*0.34; }
        else if(k.oakTip){ a2=k.a+(UP-k.a)*0.15; }
        else if(cfg.vectorGravity && sys==='shoot'){ a2=Math.atan2(Math.sin(k.a)+(tgt===UP?-1:1)*cfg.tropism,Math.cos(k.a)); }
        else { a2=k.a+(tgt-k.a)*cfg.tropism; }
        if(cfg.upAndOut && sys==='shoot' && Math.sin(a2)>0.1) a2=-a2;
        if(k.wideRoot && Math.sin(a2)<0) a2=-a2;
        a2 += (sys==='root'?0:cfg.lean);
        var lf;
        if(cfg.leader && k.leader && sys==='shoot') lf=0.9;
        else if(cfg.leader && onLeader && sys==='shoot') lf=cfg.lenRatio*0.62*(0.8+rand()*0.4);
        else if(k.taproot) lf=0.85;
        else if(k.strand) lf=cfg.lenRatio*0.5*(0.8+rand()*0.4);
        else if(k.weep) lf=cfg.lenRatio*(cfg.weepLen||1.25)*(0.85+rand()*0.3);
        else if(k.fibrous) lf=(depth===cfg.rootDepth?0.62:0.78)*(0.8+rand()*0.4);
        else if(k.wideRoot) lf=cfg.lenRatio*1.05*(0.85+rand()*0.35);
        else if(k.oakTip) lf=0.9*(0.82+rand()*0.34);
        else if(k.umbel) lf=cfg.umbelLenRatio*(0.8+rand()*0.4);
        else lf=cfg.lenRatio*(0.82+rand()*0.32);
        var child=grow(ex,ey,a2,len*lf,depth-1,sys,(k.leader||k.taproot));
        nd.children.push(child); nd.tips+=child.tips;
      });
      return nd;
    }
    grow(cfg.cx,cfg.cy,DOWN+(rand()-0.5)*0.04,cfg.trunk*cfg.rootLen,cfg.rootDepth,'root',true);
    grow(cfg.cx,cfg.cy,UP+(rand()-0.5)*0.04,cfg.trunk,cfg.depth,'shoot',true);
    nodes.forEach(function(n){ n.w=Math.max(0.5, cfg.widthK*Math.pow(n.tips,(cfg.widthPow||0.52))); });
    if(!cfg.fibrous){
      var shootTrunk=null, rootTrunk=null;
      for(var i=0;i<nodes.length;i++){ if(!shootTrunk && nodes[i].sys==='shoot') shootTrunk=nodes[i]; if(!rootTrunk && nodes[i].sys==='root') rootTrunk=nodes[i]; }
      if(rootTrunk && shootTrunk){ var sc=shootTrunk.w/rootTrunk.w; nodes.forEach(function(n){ if(n.sys==='root') n.w*=sc; }); }
    }
    if(cfg.rootWidthMul){ nodes.forEach(function(n){ if(n.sys==='root') n.w*=cfg.rootWidthMul; }); }
    return nodes;
  }

  function needleSpray(svg,n,cfg){
    var dx=n.x2-n.x1, dy=n.y2-n.y1, L=Math.hypot(dx,dy)||1, dir=Math.atan2(dy,dx);
    var samples=Math.max(3,Math.round(L/6));
    var len=cfg.needleLen||13;
    for(var i=0;i<=samples;i++){
      var t=i/samples, px=n.x1+dx*t, py=n.y1+dy*t;
      var per=(i===samples)?4:3;
      for(var k=0;k<per;k++){
        var side=(k%2)?1:-1;
        var na=dir + side*(0.35+Math.random()*0.55);
        na=na+(DOWN-na)*0.28;
        var nl=len*(0.55+Math.random()*0.7);
        var ex=px+Math.cos(na)*nl, ey=py+Math.sin(na)*nl;
        var ln=document.createElementNS(SVGNS,'line');
        ln.setAttribute('x1',px.toFixed(1));ln.setAttribute('y1',py.toFixed(1));
        ln.setAttribute('x2',ex.toFixed(1));ln.setAttribute('y2',ey.toFixed(1));
        ln.setAttribute('class','needle'); svg.appendChild(ln);
      }
    }
  }

  var ANCHOR_X=500, ANCHOR_Y=600, FR_UP=540, FR_DOWN=388, FR_HALF=472;

  function renderTree(svg,cfg){
    var nodes=generate(cfg);
    var g=document.createElementNS(SVGNS,'g'); svg.appendChild(g);
    var ordered=nodes.slice().sort(function(a,b){return b.w-a.w;});
    ['root','shoot'].forEach(function(sysName){
      ordered.forEach(function(n){
        if(n.sys!==sysName) return;
        var p=document.createElementNS(SVGNS,'path');
        p.setAttribute('d','M'+n.x1.toFixed(1)+' '+n.y1.toFixed(1)+' Q'+n.cx.toFixed(1)+' '+n.cy.toFixed(1)+' '+n.x2.toFixed(1)+' '+n.y2.toFixed(1));
        p.setAttribute('class',n.sys==='root'?'b-root':'b-shoot');
        p.setAttribute('stroke-width',n.w.toFixed(2));
        g.appendChild(p);
      });
    });
    if(cfg.needles){
      nodes.forEach(function(n){
        if(n.sys==='root'){ if(n.tip){var c=document.createElementNS(SVGNS,'circle');c.setAttribute('cx',n.x2.toFixed(1));c.setAttribute('cy',n.y2.toFixed(1));c.setAttribute('r','1.2');c.setAttribute('class','bud-root');g.appendChild(c);} return; }
        if(n.tip || n.w<3.6) needleSpray(g,n,cfg);
      });
    } else if(cfg.buds){
      nodes.forEach(function(n){ if(n.tip){var c=document.createElementNS(SVGNS,'circle');c.setAttribute('cx',n.x2.toFixed(1));c.setAttribute('cy',n.y2.toFixed(1));c.setAttribute('r',(1+Math.random()*1.3).toFixed(1));c.setAttribute('class',n.sys==='root'?'bud-root':'bud');g.appendChild(c);} });
    }
    var hx=cfg.cx, hy=cfg.cy, bb=g.getBBox();
    var topExt=Math.max(hy-bb.y,1), botExt=Math.max((bb.y+bb.height)-hy,1);
    var leftExt=Math.max(hx-bb.x,1), rightExt=Math.max((bb.x+bb.width)-hx,1);
    var s=Math.min(FR_UP/topExt, FR_DOWN/botExt, FR_HALF/leftExt, FR_HALF/rightExt);
    g.setAttribute('transform','translate('+ANCHOR_X+' '+ANCHOR_Y+') scale('+s.toFixed(4)+') translate('+(-hx)+' '+(-hy)+')');
  }

  function dandelionTaproot(svg, cx, topY, rand, depth){
    // a single dominant taproot plunging down, tapering, with a few diagonal budding laterals
    var n=7, prevx=cx, prevy=topY, w=6.4;
    for(var i=1;i<=n;i++){
      var t=i/n;
      var nx=cx + Math.sin(i*1.25)*9*(1-t) + (rand()-0.5)*6;   // gentle waver, straightening with depth
      var ny=topY + depth*t;
      var mx=(prevx+nx)/2 + (rand()-0.5)*6, my=(prevy+ny)/2;
      var p=document.createElementNS(SVGNS,'path');
      p.setAttribute('d','M'+prevx.toFixed(1)+' '+prevy.toFixed(1)+' Q'+mx.toFixed(1)+' '+my.toFixed(1)+' '+nx.toFixed(1)+' '+ny.toFixed(1));
      p.setAttribute('class','b-root'); p.setAttribute('stroke-width',w.toFixed(2)); svg.appendChild(p);
      if(i>=2 && i<n){                                          // diagonal lateral rootlets that bud
        var nl=(i%2===0)?2:1;
        for(var k=0;k<nl;k++){
          var side=(k===0?(rand()<0.5?-1:1):-1), ll=22+rand()*22, la=DOWN - side*(0.5+rand()*0.55);
          var lx=nx+Math.cos(la)*ll, ly=ny+Math.sin(la)*ll;
          var lmx=nx+Math.cos(la)*ll*0.5+(rand()-0.5)*5, lmy=ny+Math.sin(la)*ll*0.4;
          var lp=document.createElementNS(SVGNS,'path');
          lp.setAttribute('d','M'+nx.toFixed(1)+' '+ny.toFixed(1)+' Q'+lmx.toFixed(1)+' '+lmy.toFixed(1)+' '+lx.toFixed(1)+' '+ly.toFixed(1));
          lp.setAttribute('class','b-root'); lp.setAttribute('stroke-width',Math.max(1,w*0.42).toFixed(2)); svg.appendChild(lp);
          var bd=document.createElementNS(SVGNS,'circle');
          bd.setAttribute('cx',lx.toFixed(1)); bd.setAttribute('cy',ly.toFixed(1)); bd.setAttribute('r',Math.max(1,w*0.3).toFixed(1)); bd.setAttribute('class','bud-root'); svg.appendChild(bd);
        }
      }
      prevx=nx; prevy=ny; w*=0.82;
    }
    var tip=document.createElementNS(SVGNS,'circle');
    tip.setAttribute('cx',prevx.toFixed(1)); tip.setAttribute('cy',prevy.toFixed(1)); tip.setAttribute('r','1.5'); tip.setAttribute('class','bud-root'); svg.appendChild(tip);
  }

  function resolveToken(name,fallback){
    var v=(getComputedStyle(document.documentElement).getPropertyValue(name)||'').trim();
    return v||fallback;
  }

  function renderDandelion(svg,cfg){
    var rand=rng(cfg.seed||7);
    var cx=500, headY=cfg.headY||330, baseY=782;
    var rayStroke=resolveToken('--text-soft','#a9a48f');
    var seedFill=resolveToken('--accent-warm','#e3a44a');
    var R=cfg.headR||215, N=cfg.rays||150;
    var tilt=0.42, ca=Math.cos(tilt), sa=Math.sin(tilt);
    var sway=(rand()-0.5)*70;
    dandelionTaproot(svg, cx, baseY, rand, cfg.rootDepthPx||168);   // dandelions have a deep taproot, like every other plant
    var stem=document.createElementNS(SVGNS,'path');
    stem.setAttribute('d','M'+cx+' '+baseY+' Q'+(cx+sway)+' '+((headY+baseY)/2)+' '+cx+' '+headY);
    stem.setAttribute('class','stem'); stem.setAttribute('stroke-width','5.5'); svg.appendChild(stem);
    var recR=15;
    var cup=document.createElementNS(SVGNS,'circle');
    cup.setAttribute('cx',cx);cup.setAttribute('cy',headY);cup.setAttribute('r','3.5');cup.setAttribute('class','seed');svg.appendChild(cup);
    var pts=[];
    for(var i=0;i<N;i++){
      var y=1-(i/(N-1))*2, rr=Math.sqrt(Math.max(0,1-y*y)), phi=i*2.3999632;
      var v={x:Math.cos(phi)*rr, y:y, z:Math.sin(phi)*rr};
      v.x+=(rand()-0.5)*0.05; v.y+=(rand()-0.5)*0.05; v.z+=(rand()-0.5)*0.05;
      var ny=v.y*ca - v.z*sa, nz=v.y*sa + v.z*ca; v.y=ny; v.z=nz; pts.push(v);
    }
    pts.sort(function(a,b){return a.z-b.z;});
    pts.forEach(function(v){
      var sx=cx + v.x*R, sy=headY - v.y*R, depth=(v.z+1)/2, op=(0.30+0.62*depth).toFixed(2);
      var ray=document.createElementNS(SVGNS,'line');
      ray.setAttribute('x1',cx);ray.setAttribute('y1',headY);ray.setAttribute('x2',sx.toFixed(1));ray.setAttribute('y2',sy.toFixed(1));
      ray.setAttribute('class','ray');ray.setAttribute('stroke-width',(0.5+depth*0.9).toFixed(2));ray.setAttribute('opacity',op);ray.setAttribute('stroke',rayStroke);svg.appendChild(ray);
      var dirx=sx-cx, diry=sy-headY, ang=Math.atan2(diry,dirx), hairs=3, hlen=32+depth*28;
      for(var h=0;h<hairs;h++){
        var ha=ang+(h-(hairs-1)/2)*0.34, hx=sx+Math.cos(ha)*hlen, hy=sy+Math.sin(ha)*hlen;
        var pp=document.createElementNS(SVGNS,'line');
        pp.setAttribute('x1',sx.toFixed(1));pp.setAttribute('y1',sy.toFixed(1));pp.setAttribute('x2',hx.toFixed(1));pp.setAttribute('y2',hy.toFixed(1));
        pp.setAttribute('class','pappus');pp.setAttribute('opacity',(op*0.8).toFixed(2));pp.setAttribute('stroke',rayStroke);pp.setAttribute('stroke-width','0.6');svg.appendChild(pp);
      }
      var sd=document.createElementNS(SVGNS,'circle');
      sd.setAttribute('cx',sx.toFixed(1));sd.setAttribute('cy',sy.toFixed(1));sd.setAttribute('r',(1+depth*1.6).toFixed(1));sd.setAttribute('class','seed');sd.setAttribute('opacity',op);sd.setAttribute('fill',seedFill);svg.appendChild(sd);
    });
    for(var d=0;d<3;d++){
      var fx=cx+R*(0.9+rand()*0.8)*(rand()<0.5?-1:1), fy=headY-R*(0.4+rand()*0.7);
      var g=document.createElementNS(SVGNS,'g'); g.setAttribute('opacity','0.55');
      var sd2=document.createElementNS(SVGNS,'circle');
      sd2.setAttribute('cx',fx.toFixed(1));sd2.setAttribute('cy',fy.toFixed(1));sd2.setAttribute('r','1.6');sd2.setAttribute('class','seed');sd2.setAttribute('fill',seedFill);g.appendChild(sd2);
      for(var h2=0;h2<5;h2++){var ha2=(-Math.PI/2)+(h2-2)*0.4;var hl=12;var pp2=document.createElementNS(SVGNS,'line');pp2.setAttribute('x1',fx.toFixed(1));pp2.setAttribute('y1',fy.toFixed(1));pp2.setAttribute('x2',(fx+Math.cos(ha2)*hl).toFixed(1));pp2.setAttribute('y2',(fy+Math.sin(ha2)*hl).toFixed(1));pp2.setAttribute('class','pappus');pp2.setAttribute('stroke',rayStroke);pp2.setAttribute('stroke-width','0.6');g.appendChild(pp2);}
      svg.appendChild(g);
    }
  }

  function renderDandelionOrb(svg,cfg){
    var rand=rng(cfg.seed||7);
    var cx=500, headY=cfg.headY||452, baseY=cfg.baseY||910;
    var R=cfg.headR||198, N=cfg.rays||140, orbR=cfg.orbR||26;
    var rayStroke=resolveToken('--text-soft','#a9a48f');
    var seedFill=resolveToken('--accent-warm','#e3a44a');
    var tilt=0.42, ca=Math.cos(tilt), sa=Math.sin(tilt);
    var sway=(rand()-0.5)*95;
    dandelionTaproot(svg, cx, baseY, rand, cfg.rootDepthPx||80);
    var stem=document.createElementNS(SVGNS,'path');
    stem.setAttribute('d','M'+cx+' '+baseY+' Q'+(cx+sway)+' '+((headY+baseY)/2)+' '+cx+' '+(headY+orbR*0.6));
    stem.setAttribute('class','stem'); stem.setAttribute('stroke-width','5.5'); svg.appendChild(stem);
    var pts=[];
    for(var i=0;i<N;i++){
      var y=1-(i/(N-1))*2, rr=Math.sqrt(Math.max(0,1-y*y)), phi=i*2.3999632;
      var v={x:Math.cos(phi)*rr, y:y, z:Math.sin(phi)*rr};
      v.x+=(rand()-0.5)*0.05; v.y+=(rand()-0.5)*0.05; v.z+=(rand()-0.5)*0.05;
      var ny=v.y*ca - v.z*sa, nz=v.y*sa + v.z*ca; v.y=ny; v.z=nz; pts.push(v);
    }
    pts.sort(function(a,b){return a.z-b.z;});
    function floret(v){
      var ox=cx + v.x*orbR, oy=headY - v.y*orbR, sx=cx + v.x*R, sy=headY - v.y*R;
      var depth=(v.z+1)/2, op=(0.30+0.62*depth).toFixed(2);
      var ray=document.createElementNS(SVGNS,'line');
      ray.setAttribute('x1',ox.toFixed(1));ray.setAttribute('y1',oy.toFixed(1));ray.setAttribute('x2',sx.toFixed(1));ray.setAttribute('y2',sy.toFixed(1));
      ray.setAttribute('class','ray');ray.setAttribute('stroke-width',(0.5+depth*0.9).toFixed(2));ray.setAttribute('opacity',op);ray.setAttribute('stroke',rayStroke);svg.appendChild(ray);
      var ang=Math.atan2(sy-oy,sx-ox), hairs=3, hlen=92+depth*44;
      for(var h=0;h<hairs;h++){
        var ha=ang+(h-(hairs-1)/2)*0.34;
        var pp=document.createElementNS(SVGNS,'line');
        pp.setAttribute('x1',sx.toFixed(1));pp.setAttribute('y1',sy.toFixed(1));pp.setAttribute('x2',(sx+Math.cos(ha)*hlen).toFixed(1));pp.setAttribute('y2',(sy+Math.sin(ha)*hlen).toFixed(1));
        pp.setAttribute('class','pappus');pp.setAttribute('opacity',(op*0.8).toFixed(2));pp.setAttribute('stroke',rayStroke);pp.setAttribute('stroke-width','0.6');svg.appendChild(pp);
      }
      var sd=document.createElementNS(SVGNS,'circle');
      sd.setAttribute('cx',sx.toFixed(1));sd.setAttribute('cy',sy.toFixed(1));sd.setAttribute('r',(1+depth*1.6).toFixed(1));sd.setAttribute('class','seed');sd.setAttribute('opacity',op);sd.setAttribute('fill',seedFill);svg.appendChild(sd);
    }
    var back=pts.filter(function(v){return v.z<0;}), front=pts.filter(function(v){return v.z>=0;});
    back.forEach(floret);
    var body=document.createElementNS(SVGNS,'circle');
    body.setAttribute('cx',cx);body.setAttribute('cy',headY);body.setAttribute('r',orbR);body.setAttribute('fill','var(--ink)');body.setAttribute('opacity','0.06');svg.appendChild(body);
    var hl=document.createElementNS(SVGNS,'circle');
    hl.setAttribute('cx',(cx-orbR*0.32).toFixed(1));hl.setAttribute('cy',(headY-orbR*0.32).toFixed(1));hl.setAttribute('r',(orbR*0.52).toFixed(1));hl.setAttribute('fill','var(--paper)');hl.setAttribute('opacity','0.5');svg.appendChild(hl);
    var ON=46;
    for(var bi=0;bi<ON;bi++){
      var rad=orbR*0.9*Math.sqrt(bi/ON), oa=bi*2.3999632, px=cx+Math.cos(oa)*rad, py=headY+Math.sin(oa)*rad;
      var nx=(px-cx)/orbR, ny=(py-headY)/orbR, shade=0.5-(nx*0.55+ny*0.55), op=Math.max(0.12,Math.min(0.7,0.3+shade));
      var so=document.createElementNS(SVGNS,'circle');
      so.setAttribute('cx',px.toFixed(1));so.setAttribute('cy',py.toFixed(1));so.setAttribute('r',(0.8+(1-bi/ON)*0.7).toFixed(1));so.setAttribute('class','seed');so.setAttribute('opacity',op.toFixed(2));svg.appendChild(so);
    }
    var rim=document.createElementNS(SVGNS,'circle');
    rim.setAttribute('cx',cx);rim.setAttribute('cy',headY);rim.setAttribute('r',orbR);rim.setAttribute('fill','none');rim.setAttribute('stroke','var(--ink)');rim.setAttribute('stroke-width','1.1');rim.setAttribute('opacity','0.4');svg.appendChild(rim);
    front.forEach(floret);
  }

  function create(container, cfg){
    var svg=document.createElementNS(SVGNS,'svg');
    svg.setAttribute('viewBox','0 0 1000 1000');
    svg.setAttribute('preserveAspectRatio','xMidYMid meet');
    container.appendChild(svg); // in DOM so getBBox works
    if(cfg.kind==='dandelion') renderDandelion(svg,cfg);
    else if(cfg.kind==='dandelion-orb') renderDandelionOrb(svg,cfg);
    else renderTree(svg,cfg);
    return svg;
  }

  global.GardenPlants = {
    create: create,
    UP: UP, DOWN: DOWN,
    // ground-Y as a fraction of the 1000-tall viewBox, per kind
    GROUND: { tree: 0.60, dandelion: 0.782, 'dandelion-orb': 0.910 }
  };
})(window);
