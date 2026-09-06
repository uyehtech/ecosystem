/* ═══════════════════════════════════════════════════════════════
   UYEH TECH — Shared Back-to-Top Button
   /js/backtotop.js

   Fully self-contained: creates its own button element and injects
   its own styles — no HTML markup needed on the page at all.

   USAGE — add this one line before </body> on any page:

     <script src="/backtotop.js" defer></script>

   That's it. Nothing else to wire up, no id to add, no CSS to link.
   Positioned bottom-LEFT deliberately, so it never overlaps the
   chat widget bubble, which sits bottom-right (bottom:90px; right:24px).
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // Don't run twice if this script somehow gets included more than once.
  if (document.getElementById('uyeh-btt-btn')) return;

  var SHOW_AFTER_PX = 400;   // how far down the page before the button appears

  /* ── Inject styles ── */
  var style = document.createElement('style');
  style.textContent = `
    #uyeh-btt-btn {
      position: fixed;
      bottom: 24px;
      left: 24px;
      z-index: 99990;
      width: 50px;
      height: 50px;
      border: none;
      border-radius: 50%;
      background: linear-gradient(135deg, #00cc6e, #00ff88);
      color: #0a0a0a;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(0, 255, 136, 0.35);
      opacity: 0;
      transform: translateY(16px) scale(0.9);
      pointer-events: none;
      transition: opacity 0.25s ease, transform 0.25s ease, box-shadow 0.2s ease;
    }
    #uyeh-btt-btn.show {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    #uyeh-btt-btn:hover {
      box-shadow: 0 6px 28px rgba(0, 255, 136, 0.55);
      transform: translateY(-3px) scale(1.05);
    }
    #uyeh-btt-btn:active { transform: translateY(0) scale(0.95); }
    #uyeh-btt-btn svg { width: 22px; height: 22px; }

    @media (max-width: 600px) {
      #uyeh-btt-btn { bottom: 18px; left: 18px; width: 44px; height: 44px; }
      #uyeh-btt-btn svg { width: 19px; height: 19px; }
    }

    @media (prefers-reduced-motion: reduce) {
      #uyeh-btt-btn { transition: opacity 0.15s linear; }
      #uyeh-btt-btn:hover, #uyeh-btt-btn:active { transform: none; }
    }
  `;
  document.head.appendChild(style);

  /* ── Create the button ── */
  var btn = document.createElement('button');
  btn.id = 'uyeh-btt-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';

  document.body.appendChild(btn);

  /* ── Show/hide on scroll ── */
  var ticking = false;
  function updateVisibility() {
    if (window.scrollY > SHOW_AFTER_PX) {
      btn.classList.add('show');
    } else {
      btn.classList.remove('show');
    }
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) {
      window.requestAnimationFrame(updateVisibility);
      ticking = true;
    }
  }, { passive: true });

  // Check once on load in case the page opens already scrolled (e.g. via anchor link).
  updateVisibility();

  /* ── Scroll to top on click ── */
  btn.addEventListener('click', function () {
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
})();