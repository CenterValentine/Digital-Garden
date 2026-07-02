/**
 * FIELD_NOTES_MARKUP — de-bundled body scaffold for the /blog Field Notes
 * page (extracted from the former public/field-notes.html single-file export).
 * The generative engine in /blog-engine/*.js owns this DOM after mount, exactly
 * like M44_MARKUP for the home garden. Scripts/styles were stripped out; styles
 * live in field-notes.css, scripts load via FieldNotesPage.
 */

export const FIELD_NOTES_MARKUP = `<div class="stage">
    <div class="sky" aria-hidden="true">
      <div class="celest" id="celest">
        <div class="sun"></div>
        <div class="moonwrap">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <defs><mask id="mphase">
              <circle cx="60" cy="60" r="46" fill="#fff"></circle>
              <circle id="mcarve" cx="-36" cy="60" r="46" fill="#000"></circle>
            </mask></defs>
            <circle cx="60" cy="60" r="46" fill="#eef2ff" mask="url(#mphase)"></circle>
            <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(196,208,240,.22)" stroke-width="1"></circle>
          </svg>
        </div>
      </div>
    </div>
    <div class="daytint" id="daytint" aria-hidden="true"></div>
    <div class="stars" aria-hidden="true"><svg id="starsky" preserveAspectRatio="none"></svg></div>
    <div class="critter" id="critter" aria-hidden="true"><div class="dir" id="critterdir">
      <div class="bf">
        <div class="layer fore b"><svg viewBox="0 0 340 320"><defs>
            <radialGradient id="dg-mb" cx="0.55" cy="0.85" r="0.95"><stop offset="0" stop-color="#F4A03C"></stop><stop offset="0.6" stop-color="#E8741A"></stop><stop offset="1" stop-color="#C9560E"></stop></radialGradient>
            <clipPath id="cs-mb"><path d="M176 236 C 150 175 120 105 80 52 C 112 60 165 78 190 98 C 198 158 192 205 176 236 Z"></path></clipPath>
          </defs><g transform="rotate(33.36 176 236)"><g transform="matrix(1.711 -0.371 -0.371 1.1935 -37.58 19.62)">
            <path d="M176 236 C 150 175 120 105 80 52 C 112 60 165 78 190 98 C 198 158 192 205 176 236 Z" fill="url(#dg-mb)" stroke="#1A1208" stroke-width="6" stroke-linejoin="round"></path>
            <g clip-path="url(#cs-mb)" fill="none" stroke="#1A1208" stroke-width="3" stroke-linecap="round">
              <path d="M176 236 C 150 175 120 108 82 54"></path>
              <path d="M176 236 C 158 178 150 120 132 70"></path>
              <path d="M176 236 C 168 170 178 118 190 100"></path>
              <path d="M176 236 C 178 188 186 150 192 112"></path>
              <path d="M176 236 C 180 196 190 196 198 196"></path>
            </g>
            <path d="M80 52 C 112 60 152 72 174 88 C 148 76 110 64 86 56 Z" fill="#1A1208"></path>
            <circle cx="190" cy="98" r="3.3" fill="#fff"></circle><circle cx="172" cy="82" r="3.3" fill="#fff"></circle><circle cx="150" cy="70" r="3.3" fill="#fff"></circle><circle cx="124" cy="60" r="3.3" fill="#fff"></circle><circle cx="150" cy="150" r="3.3" fill="#fff"></circle><circle cx="180" cy="200" r="3.3" fill="#fff"></circle>
            <circle cx="184" cy="120" r="1.9" fill="#fff" fill-opacity="0.85"></circle><circle cx="182" cy="168" r="1.9" fill="#fff" fill-opacity="0.85"></circle>
          </g></g></svg></div>
        <div class="layer body"><svg viewBox="0 0 340 320">
          <ellipse cx="158" cy="272" rx="15" ry="36" transform="rotate(36 158 272)" fill="#1A1208"></ellipse>
          <g stroke="#000" stroke-opacity="0.28" stroke-width="1.6" stroke-linecap="round">
            <line x1="176" y1="244" x2="186" y2="252"></line><line x1="166" y1="258" x2="176" y2="266"></line>
            <line x1="156" y1="272" x2="166" y2="280"></line><line x1="146" y1="286" x2="156" y2="294"></line>
          </g>
          <ellipse cx="184" cy="228" rx="17" ry="15" fill="#1A1208"></ellipse>
          <circle cx="197" cy="213" r="9.5" fill="#1A1208"></circle><circle cx="200" cy="211" r="2.3" fill="#3a2c14"></circle>
          <path d="M203 206 C 218 184 230 164 240 146" fill="none" stroke="#1A1208" stroke-width="2.8" stroke-linecap="round"></path>
          <path d="M199 207 C 209 187 215 169 221 151" fill="none" stroke="#1A1208" stroke-width="2.8" stroke-linecap="round"></path>
          <circle cx="240" cy="145" r="3.3" fill="#1A1208"></circle><circle cx="221" cy="150" r="3.3" fill="#1A1208"></circle>
          <g stroke="#1A1208" stroke-width="2.4" stroke-linecap="round" fill="none">
            <path d="M182 240 C 188 252 184 262 177 268"></path><path d="M172 242 C 173 254 167 262 159 266"></path>
          </g>
        </svg></div>
        <div class="layer fore a"><svg viewBox="0 0 340 320"><defs>
            <radialGradient id="dg-ma" cx="0.55" cy="0.85" r="0.95"><stop offset="0" stop-color="#F4A03C"></stop><stop offset="0.6" stop-color="#E8741A"></stop><stop offset="1" stop-color="#C9560E"></stop></radialGradient>
            <clipPath id="cs-ma"><path d="M176 236 C 150 175 120 105 80 52 C 112 60 165 78 190 98 C 198 158 192 205 176 236 Z"></path></clipPath>
          </defs><g transform="matrix(1.711 -0.371 -0.371 1.1935 -37.58 19.62)">
            <path d="M176 236 C 150 175 120 105 80 52 C 112 60 165 78 190 98 C 198 158 192 205 176 236 Z" fill="url(#dg-ma)" stroke="#1A1208" stroke-width="6" stroke-linejoin="round"></path>
            <g clip-path="url(#cs-ma)" fill="none" stroke="#1A1208" stroke-width="3" stroke-linecap="round">
              <path d="M176 236 C 150 175 120 108 82 54"></path>
              <path d="M176 236 C 158 178 150 120 132 70"></path>
              <path d="M176 236 C 168 170 178 118 190 100"></path>
              <path d="M176 236 C 178 188 186 150 192 112"></path>
              <path d="M176 236 C 180 196 190 196 198 196"></path>
            </g>
            <path d="M80 52 C 112 60 152 72 174 88 C 148 76 110 64 86 56 Z" fill="#1A1208"></path>
            <circle cx="190" cy="98" r="3.3" fill="#fff"></circle><circle cx="172" cy="82" r="3.3" fill="#fff"></circle><circle cx="150" cy="70" r="3.3" fill="#fff"></circle><circle cx="124" cy="60" r="3.3" fill="#fff"></circle><circle cx="150" cy="150" r="3.3" fill="#fff"></circle><circle cx="180" cy="200" r="3.3" fill="#fff"></circle>
            <circle cx="184" cy="120" r="1.9" fill="#fff" fill-opacity="0.85"></circle><circle cx="182" cy="168" r="1.9" fill="#fff" fill-opacity="0.85"></circle>
          </g></svg></div>
      </div>
      <span class="ff"></span>
    </div></div>
    <header class="topbar">
      <a class="logo" href="#"><span class="wd"><span class="wn">David Valentine<span class="dot">.</span></span><span class="wt">MY&nbsp;DIGITAL GARDEN</span></span></a>
      <nav class="nav" id="nav" aria-label="Garden"></nav>
      <a class="signin" href="#signin" aria-label="My Sign In">My Sign In</a>
    </header>

    <!-- fixed, only spins -->
    <div class="garden-fixed" aria-hidden="true">
      <div class="gframe"><span class="gf-cap" id="gfcap">Specimen 01 / 06</span><span class="gf-foot" id="gffoot">Hawthorn</span>
        <div class="southline" aria-hidden="true"></div>
      </div>
      <div class="soilline" id="soilline" aria-hidden="true"><svg viewBox="0 0 300 14" preserveAspectRatio="none"><path class="sl-ghost" vector-effect="non-scaling-stroke" d="M0 7.5 L4 9.6 L8 8.3 L12 6.5 L16 6.9 L20 6.8 L24 8.1 L28 7.6 L32 8.2 L36 8.5 L40 6.3 L44 5.9 L48 4.9 L52 6.3 L56 7.6 L60 9.8 L64 7.2 L68 4.6 L72 6.5 L76 6.2 L80 8.6 L84 7.6 L88 9.4 L92 9.1 L96 9.5 L100 6.9 L104 7.3 L108 5.8 L112 5.4 L116 4.9 L120 6.4 L124 4.9 L128 6.2 L132 7.3 L136 3.8 L140 6.9 L144 7.5 L148 8.3 L152 7.7 L156 8.6 L160 9.2 L164 5 L168 7.9 L172 7.6 L176 7.3 L180 8.7 L184 7.7 L188 7.5 L192 6.7 L196 5.9 L200 5.7 L204 7.6 L208 8 L212 9.3 L216 8.3 L220 8.5 L224 9 L228 5.8 L232 9.1 L236 9.2 L240 8.2 L244 9 L248 4.9 L252 5.4 L256 6.1 L260 3.8 L264 3.5 L268 5.3 L272 5.9 L276 6.5 L280 6.8 L284 7.5 L288 7 L292 4.8 L296 4.6 L300 6.4 L304 6.2 L308 6.1 L312 4.6 L316 2.9 L320 2.7 L324 2.9 L328 3.4 L332 3.6 L336 4.2 L340 4.3 L344 3.9 L348 2.5 L352 2.7 L356 3.2 L360 2.4 L364 3.6 L368 2.4 L372 4.8 L376 4.6 L380 5.8 L384 3.7 L388 3.8 L392 3.2 L396 2.7 L400 4.3 L404 3.4 L408 2.3 L412 3.8 L416 2.7 L420 4.3 L424 4.5 L428 6.1 L432 6.5 L436 7.4 L440 7.1 L444 5.4 L448 6.9 L452 4.7 L456 5.7 L460 5.7 L464 5.6 L468 4.1 L472 3.4 L476 3.1 L480 5.6 L484 5.9 L488 6.8 L492 6.5 L496 6.8 L500 6.3 L504 4.2 L508 5.2 L512 6.4 L516 8.1 L520 3.8 L524 6.6 L528 7.4 L532 6 L536 3.9 L540 3.6 L544 5.1 L548 3.6 L552 5.7 L556 6.2 L560 4.9 L564 6.9 L568 4.8 L572 6.5 L576 6.6 L580 8.3 L584 8.2 L588 6.5 L592 5.4 L596 4.6 L600 5.1 L604 8.2 L608 6.5 L612 6.9 L616 7.5 L620 7 L624 7.8 L628 8.2 L632 7.6 L636 8.6 L640 10.2 L644 8.7 L648 9.3 L652 9.1 L656 6.5 L660 8.2 L664 8.6 L668 8.8 L672 9 L676 9.6 L680 9.7 L684 8 L688 6.6 L692 8 L696 7 L700 8.7 L704 10.1 L708 9.5 L712 8.7 L716 8.6 L720 10.2 L724 10.1 L728 8.1 L732 9 L736 6.8 L740 6 L744 5.3 L748 4.6 L752 4.1 L756 4.3 L760 5.4 L764 7 L768 6.4 L772 7.2 L776 7.4 L780 6 L784 5.8 L788 5.1 L792 6.1 L796 4.6 L800 5.7 L804 5 L808 3 L812 3.7 L816 3.7 L820 3.2 L824 4 L828 4.4 L832 2.6 L836 3.6 L840 3.9 L844 2.9 L848 3.3 L852 4.3 L856 4.8 L860 6.6 L864 6.8 L868 4.2 L872 4.5 L876 3.3 L880 3.4 L884 3.6 L888 3.4 L892 4.8 L896 5.6 L900 2.7 L904 4 L908 4.1 L912 6.6 L916 4 L920 10.2 L924 6.5 L928 8.1 L932 6.3 L936 5.2 L940 4.6 L944 5 L948 4.2 L952 4.9 L956 4.2 L960 3.6 L964 3.8 L968 4.4 L972 3.8 L976 5.2 L980 7.7 L984 5.7 L988 4.6 L992 3.7 L996 6.2 L1000 4.4 L1004 4.7 L1008 5.6 L1012 6.1 L1016 5.8 L1020 5.3 L1024 4 L1028 2.8 L1032 2.9 L1036 2.9 L1040 4.8 L1044 5.6 L1048 6.2 L1052 4.9 L1056 5.7 L1060 5.1 L1064 6.1 L1068 8.2 L1072 6.7 L1076 6.7 L1080 6.1 L1084 5.2 L1088 5.2 L1092 4.8 L1096 6.1 L1100 6.4 L1104 8.2 L1108 8.4 L1112 7.4 L1116 8.4 L1120 7.7 L1124 9.1 L1128 8 L1132 10.6 L1136 10.7 L1140 9.7 L1144 10.1 L1148 6.2 L1152 8.7 L1156 8.9 L1160 6.4 L1164 9.4 L1168 8.5 L1172 7 L1176 6.8 L1180 7.4"></path><path class="sl-main" vector-effect="non-scaling-stroke" d="M0 5.6 L4 7.2 L8 6.5 L12 5.3 L16 5.3 L20 5.2 L24 6.9 L28 5.9 L32 6.5 L36 6.2 L40 4 L44 3.9 L48 3 L52 4.4 L56 5.4 L60 8.1 L64 5.7 L68 3.5 L72 4.9 L76 5 L80 7 L84 5.6 L88 7.2 L92 6.5 L96 7 L100 4.5 L104 5.2 L108 4.3 L112 3.6 L116 3.3 L120 4.7 L124 3.8 L128 4.7 L132 5.4 L136 1.9 L140 4.5 L144 5.6 L148 6.1 L152 6.1 L156 6.9 L160 7.4 L164 3.5 L168 6.7 L172 6.2 L176 5.5 L180 6.6 L184 5.3 L188 5 L192 4.5 L196 3.9 L200 3.9 L204 6.3 L208 6.9 L212 7.7 L216 7.2 L220 7.1 L224 7.1 L228 4.2 L232 7.3 L236 7.3 L240 5.5 L244 7.1 L248 3.2 L252 4 L256 4.5 L260 2.8 L264 2.2 L268 3.7 L272 4.7 L276 4.6 L280 5 L284 5.2 L288 4.4 L292 2.6 L296 3 L300 4.7 L304 4.8 L308 4.7 L312 3.3 L316 1.2 L320 1.2 L324 1.2 L328 1.2 L332 1.2 L336 1.9 L340 1.9 L344 2.1 L348 1.2 L352 1.3 L356 1.4 L360 1.2 L364 2.2 L368 1.2 L372 2.8 L376 2.2 L380 3.7 L384 1.4 L388 1.2 L392 1.2 L396 1.2 L400 2.5 L404 1.8 L408 1.2 L412 2.3 L416 1.2 L420 2.2 L424 2.7 L428 4 L432 4 L436 5.1 L440 5 L444 4 L448 5.5 L452 3.4 L456 4.1 L460 4.7 L464 4.4 L468 2.1 L472 1.6 L476 1.2 L480 2.9 L484 3.4 L488 4.6 L492 4.5 L496 5.1 L500 4.6 L504 2.5 L508 3.7 L512 5.1 L516 6 L520 1.9 L524 4.5 L528 5 L532 3.4 L536 1.6 L540 1.9 L544 3.7 L548 2.4 L552 4.7 L556 5 L560 3.6 L564 5.2 L568 3.2 L572 4.6 L576 4.5 L580 6 L584 6.3 L588 4.8 L592 3.6 L596 3.1 L600 3.9 L604 6.9 L608 4.6 L612 4.9 L616 5.2 L620 4.4 L624 5.3 L628 6.1 L632 5.9 L636 6.9 L640 8.7 L644 7.5 L648 7.7 L652 7.9 L656 5.2 L660 6.8 L664 6.8 L668 6.9 L672 6.6 L676 7.2 L680 7.4 L684 5.7 L688 5.1 L692 6.9 L696 5.8 L700 7 L704 8.5 L708 8.1 L712 7 L716 6.7 L720 7.8 L724 7.5 L728 5.8 L732 7.3 L736 5.2 L740 4.9 L744 3.6 L748 3.5 L752 3 L756 2.6 L760 3.7 L764 4.9 L768 4.4 L772 5.2 L776 5.2 L780 3.9 L784 4.1 L788 3.9 L792 4.5 L796 3 L800 4.3 L804 3.5 L808 1.2 L812 1.2 L816 1.2 L820 1.2 L824 1.9 L828 2.5 L832 1.2 L836 2.4 L840 2.7 L844 1.2 L848 2.1 L852 2.3 L856 3 L860 4.6 L864 4.2 L868 2 L872 2.6 L876 1.2 L880 1.9 L884 2.1 L888 2.1 L892 3.7 L896 4 L900 1.2 L904 1.8 L908 1.7 L912 4.6 L916 1.6 L920 8.1 L924 4.9 L928 6.2 L932 4.4 L936 3.6 L940 3.4 L944 3.8 L948 2.6 L952 3.4 L956 2.3 L960 1.3 L964 1.2 L968 2.6 L972 1.9 L976 3.7 L980 6.3 L984 4.2 L988 3.1 L992 2.5 L996 4.8 L1000 2.9 L1004 2.8 L1008 3.2 L1012 3.8 L1016 3.6 L1020 3 L1024 2 L1028 1.2 L1032 1.2 L1036 1.5 L1040 3.6 L1044 4 L1048 4.5 L1052 2.5 L1056 3.8 L1060 3.1 L1064 4.1 L1068 6.1 L1072 5 L1076 5.1 L1080 5.1 L1084 4.1 L1088 3.6 L1092 3.1 L1096 4.1 L1100 4.3 L1104 5.7 L1108 6.2 L1112 5.1 L1116 6 L1120 5.6 L1124 7.8 L1128 6.5 L1132 9.3 L1136 9.5 L1140 7.8 L1144 8.1 L1148 4.4 L1152 6.8 L1156 6.5 L1160 4 L1164 7.4 L1168 6.8 L1172 5.6 L1176 5.2 L1180 5.8"></path></svg></div>
      <div class="garden gp-host" id="garden"></div>
      <div class="tend" aria-hidden="true"><svg id="tendsvg"></svg></div>
    </div>

    <div id="introhost"></div>

    <!-- normal scrolling page -->
    <div class="scroller" id="scroller">
      <div class="col" id="col"></div>
    </div>

    <nav class="rail" id="rail" aria-label="Garden progress"></nav>
    <div class="cue" id="cue"><span class="wheel"></span>scroll the page</div>
  </div>


  <!-- ═══════════════ LEAF VIEW · L2 ═══════════════ -->
  <!-- ═══════════════ RESUME VIEW ═══════════════ -->
  <section id="resumeView" aria-hidden="true" aria-label="Résumé — Growth Rings">
    <div class="leaf-top">
      <button class="leaf-back" id="resumeBack">← back to the garden</button>
      <div class="leaf-crumb">davidvalentine.org / <b>résumé</b></div>
    </div>
    <div class="rv-stage">
      <div class="rv-rings" id="rvRings"></div>
      <div class="rv-scroll">
        <span class="rv-ptag">ROOT · RÉSUMÉ</span>
        <h2 class="rv-title">The Growth <em>Rings.</em></h2>
        <p class="rv-intro">Over a decade of building, in reverse order. The rings that hold the rest up.</p>
        <ul class="rv-entries" id="rvEntries"></ul>
        <div class="rv-foot">each ring is a chapter — hover to illuminate it</div>
      </div>
    </div>
  </section>

  <section id="leafView" aria-hidden="true" aria-label="Category leaf">
    <div class="leaf-top">
      <div class="lv-logo-group">
        <a class="lv-logo" href="#">
          
          
          <span class="wd"><span class="wn">David Valentine<span class="dot">.</span></span><span class="ws">MY DIGITAL GARDEN</span></span>
        </a>
        <button class="leaf-back lv-back" id="leafBack" onclick="window.location.href='/'">← back to the garden</button>
      </div>
      <div class="leaf-crumb">davidvalentine.org / <b id="leafCrumb">about</b></div>
    </div>
    <div class="leaf-stage">
      <div class="leaf-holder" id="leafHolder"></div>
      <div class="leaf-panel">
        <div class="leaf-specimen">
          <div class="spec-hold" id="specHolder"></div>
          <div class="spec-info">
            <div class="spec-form" id="specForm">PINNATELY LOBED</div>
            <div class="spec-nm" id="specName">White oak</div>
            <div class="spec-lat" id="specLat">Quercus alba</div>
          </div>
        </div>
        <span class="ptag" id="leafPtag">IDEA PAPPUS: THOUGHT-SEEDS IN FLIGHT</span>
        <h2 id="leafTitle">Category</h2>
        <p class="pintro" id="leafIntro">My day-to-day insights, experiments, explorations, and adventures.</p>
        <ul class="leaf-list" id="leafList"></ul>
        <div class="leaf-foot">Each section is a blog section, click to dive in.</div>
      </div>
    </div>
  </section>

  <!-- ═══════════════ DNA VIEW · L3 ═══════════════ -->
  <section id="dnaView" aria-hidden="true" aria-label="Item DNA">
    <div class="leaf-top">
      <button class="leaf-back" id="dnaBack">← back to the leaf</button>
      <div class="leaf-crumb" id="dnaCrumb">davidvalentine.org / <b>item</b></div>
    </div>
    <div class="leaf-stage">
      <div class="leaf-holder" id="dnaHolder"></div>
      <div class="leaf-panel">
        <span class="ptag" id="dnaPtag">strand · 04 base pairs</span>
        <h2 id="dnaTitle">Item</h2>
        <p class="pintro" id="dnaIntro"></p>
        <ul class="leaf-list" id="dnaList"></ul>
        <div class="leaf-foot">scroll the helix to turn it · hover a rung to trace it</div>
      </div>
    </div>
  </section>


  
  
  
  
  
  
  
  
  

  <!-- ═══ CTA SEQUENCE: image-1 → full-pan → canopy zoom ═══ -->
  

  <!-- ═══ L2/L3 dependencies ═══ -->`;
