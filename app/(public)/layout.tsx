import React from "react";

const PUBLIC_SCRIPT = `
(function() {
  // ── Scroll reveal ──────────────────────────────────────────────────────────
  function initReveal() {
    var blocks = document.querySelectorAll('.public-prose [data-block-type]');
    if (!blocks.length) return;
    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        el.classList.add('block-revealed');
        io.unobserve(el);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    blocks.forEach(function(el, i) {
      el.style.setProperty('--reveal-delay', (i * 40) + 'ms');
      io.observe(el);
    });
  }

  // ── Count-up animation ────────────────────────────────────────────────────
  function countUp(el, target, duration) {
    var start = 0;
    var suffix = el.dataset.countValueSuffix || '';
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var val = target % 1 === 0
        ? Math.round(eased * target)
        : (eased * target).toFixed(1);
      el.textContent = val + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initCountUp() {
    var numbers = document.querySelectorAll('[data-count-target]');
    if (!numbers.length) return;
    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        var target = parseFloat(el.dataset.countTarget);
        if (!isNaN(target)) countUp(el, target, 1400);
        io.unobserve(el);
      });
    }, { threshold: 0.2 });
    numbers.forEach(function(el) { io.observe(el); });
  }

  // ── Gallery carousel ──────────────────────────────────────────────────────
  function initCarousels() {
    var carousels = document.querySelectorAll('.block-gallery--carousel');
    carousels.forEach(function(carousel) {
      var track = carousel.querySelector('.block-gallery-track');
      var items = carousel.querySelectorAll('.block-gallery-item');
      var prev = carousel.querySelector('.block-gallery-prev');
      var next = carousel.querySelector('.block-gallery-next');
      var dotsWrap = carousel.querySelector('.block-gallery-dots');
      if (!track || !items.length) return;

      // Build dot buttons dynamically (server emits empty container)
      var dots = [];
      if (dotsWrap) {
        items.forEach(function(_, i) {
          var d = document.createElement('button');
          d.className = 'block-gallery-dot' + (i === 0 ? ' block-gallery-dot--active' : '');
          d.setAttribute('aria-label', 'Go to slide ' + (i + 1));
          dotsWrap.appendChild(d);
          dots.push(d);
        });
      }

      var current = 0;
      var total = items.length;
      var autoScrollTimer = null;
      var autoScroll = carousel.dataset.autoScroll === 'true';

      function goTo(idx) {
        current = (idx + total) % total;
        track.style.transform = 'translateX(-' + (current * 100) + '%)';
        dots.forEach(function(d, i) {
          d.classList.toggle('block-gallery-dot--active', i === current);
        });
      }

      if (prev) prev.addEventListener('click', function() { goTo(current - 1); resetAuto(); });
      if (next) next.addEventListener('click', function() { goTo(current + 1); resetAuto(); });
      dots.forEach(function(d, i) {
        d.addEventListener('click', function() { goTo(i); resetAuto(); });
      });

      // Scroll-linked: advance slide on scroll past carousel
      var scrollUnits = 0;
      var ticking = false;
      window.addEventListener('scroll', function() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function() {
          var rect = carousel.getBoundingClientRect();
          var inView = rect.top < window.innerHeight && rect.bottom > 0;
          if (inView && autoScroll) {
            scrollUnits += 1;
            if (scrollUnits % 8 === 0) goTo(current + 1);
          }
          ticking = false;
        });
      });

      function resetAuto() {
        if (!autoScroll) return;
        clearInterval(autoScrollTimer);
        autoScrollTimer = setInterval(function() { goTo(current + 1); }, 4000);
      }

      if (autoScroll) resetAuto();
      goTo(0);
    });
  }

  // ── Newsletter form fetch enhancement ────────────────────────────────────
  function initNewsletterForms() {
    var forms = document.querySelectorAll('.block-newsletter-form');
    forms.forEach(function(form) {
      var successText = form.dataset.success || 'Thanks!';
      form.addEventListener('submit', function(e) {
        var action = form.getAttribute('action');
        if (!action) return;
        e.preventDefault();
        var email = form.querySelector('input[type=email]');
        if (!email || !email.value) return;
        fetch(action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.value }),
        }).then(function() {
          form.innerHTML = '<p style="margin:0;font-size:0.9rem;color:#4ade80">' + successText + '</p>';
        }).catch(function() {
          form.innerHTML = '<p style="margin:0;font-size:0.9rem;color:#f87171">Something went wrong. Please try again.</p>';
        });
      });
    });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  function boot() {
    initReveal();
    initCountUp();
    initCarousels();
    initNewsletterForms();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
`;

// This layout wraps all public-facing pages.
// It is nested under app/layout.tsx (root) which provides html/body.
// We suppress the default app nav via CSS (same pattern as the notes route).
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // public-route class is used in globals.css to suppress the app nav
    // and remove the default pt-20 padding applied by the root layout
    <div className="public-route min-h-screen bg-[#0a0a0a] text-white">
      {children}
      <script dangerouslySetInnerHTML={{ __html: PUBLIC_SCRIPT }} />
    </div>
  );
}
