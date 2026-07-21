
    M44LeafConnect.init();
    /* Standalone Field Notes: boot straight into the dandelion leaf view
       instead of the home carousel. Suppress the zoom-in so it just appears. */
    (function bootFieldNotes(){
      function go(){
        try {
          document.documentElement.classList.add('fn-standalone');
          // Open + reveal the leaf view FIRST so its holder is laid out before
          // openLeaf() measures the dandelion via getBBox (a hidden subtree
          // returns a 0 box -> scale(Infinity)). visibility set !important to
          // beat the closed-state `#leafView{visibility:hidden!important}` rule.
          var lv = document.getElementById('leafView');
          if (lv){ lv.style.transition='none'; lv.style.transform=''; lv.style.opacity='1'; lv.style.setProperty('visibility','visible','important'); lv.classList.add('open'); lv.setAttribute('aria-hidden','false'); }
          var st = document.querySelector('.stage');
          if (st){ st.style.transition='none'; st.style.transform=''; }
          M44LeafConnect.openLeaf('dandelion', document.body);
        } catch(e){ console.warn('boot field notes', e); }
      }
      if (document.readyState === 'complete') requestAnimationFrame(go);
      else window.addEventListener('load', function(){ requestAnimationFrame(go); });
    })();
  