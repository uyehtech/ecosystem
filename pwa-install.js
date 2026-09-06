
(function () {
  'use strict';

  const SW_PATH             = '/sw.js';
  const SW_SCOPE            = '/';
  const DISMISS_KEY         = 'uyeh_pwa_dismissed_until';
  const DISMISS_DURATION    = 7 * 24 * 60 * 60 * 1000;
  const IS_PRIVILEGED       = /\/(admin|agent|super-admin)/i.test(window.location.pathname);

  let registration   = null;
  let deferredPrompt = null;
  let newWorker      = null;

  const API_URL           = 'https://uyehtechbackend.onrender.com';
  const NOTIF_DISMISS_KEY = 'uyeh_notif_dismissed_until';

  // ── CAPTURE beforeinstallprompt AS EARLY AS POSSIBLE ──────────────────────
  // This listener must be registered synchronously before the event fires.
  // Do NOT put it inside window.onload or DOMContentLoaded.
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();          // stop the browser's default mini-infobar
    deferredPrompt = e;
    console.log('[PWA] Install prompt captured ✅');

    if (IS_PRIVILEGED)       return;
    if (isAlreadyInstalled()) return;
    if (isDismissed())        return;

    // Show after 3s so it doesn't interrupt page load
    setTimeout(showInstallBanner, 3000);
  });

  window.addEventListener('appinstalled', function() {
    hideInstallBanner();
    deferredPrompt = null;
    console.log('[PWA] App installed ✅');
    showToast('✅ UYEH TECH installed! Find it on your home screen.', 'success', 5000);
  });

  // ── REGISTER SERVICE WORKER ────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    // Register immediately — not in window.load — so SW is ready faster
    navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE })
      .then(function(reg) {
        registration = reg;
        console.log('[PWA] SW registered:', reg.scope);
        reg.update().catch(function() {});

        reg.addEventListener('updatefound', function() {
          newWorker = reg.installing;
          newWorker.addEventListener('statechange', function() {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner();
            }
          });
        });

        // ── PUSH NOTIFICATIONS ──────────────────────────────────────────────
        // This registration is a prerequisite for push, but on its own does
        // NOT subscribe anyone. Previously nothing ever called this next step
        // — pushSubscriptions stayed empty for every user, and admin pushes
        // silently reached 0 recipients. This adds the missing piece.
        initPushFlow(reg);
      })
      .catch(function(err) {
        console.warn('[PWA] SW registration failed:', err.message);
      });

    // Reload when a new SW takes control
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  // ── iOS install hint (Safari — no beforeinstallprompt) ─────────────────────
  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }
  if (isIos() && !isStandalone() && !IS_PRIVILEGED && !isDismissed()) {
    setTimeout(showIosHint, 4000);
  }

  // ── Online / offline toasts ────────────────────────────────────────────────
  window.addEventListener('online',  function() {
    showToast('✅ Back online!', 'success', 3000);
    document.dispatchEvent(new CustomEvent('uyeh:online'));
  });
  window.addEventListener('offline', function() {
    showToast('⚠️ You\'re offline — some features may be limited', 'warning', 5000);
    document.dispatchEvent(new CustomEvent('uyeh:offline'));
  });

  // ════════════════════════════════════════════════════════════════════════════
  // INSTALL BANNER
  // ════════════════════════════════════════════════════════════════════════════
  function showInstallBanner() {
    if (document.getElementById('uyeh-install-banner')) return;
    injectStyles();

    var banner = document.createElement('div');
    banner.id        = 'uyeh-install-banner';
    banner.className = 'uyeh-pwa-banner';
    banner.innerHTML = [
      '<div class="uyeh-pwa-banner-inner">',
        '<img class="uyeh-pwa-icon" src="/icons/icon-192.png" alt="UYEH TECH"',
             'onerror="this.style.display=\'none\'">',
        '<div class="uyeh-pwa-info">',
          '<div class="uyeh-pwa-title">Install UYEH TECH</div>',
          '<div class="uyeh-pwa-desc">Faster · Works offline · Home screen access</div>',
        '</div>',
        '<div class="uyeh-pwa-actions">',
          '<button id="uyeh-install-btn"     class="uyeh-pwa-btn-install">Install</button>',
          '<button id="uyeh-install-dismiss" class="uyeh-pwa-btn-dismiss" aria-label="Dismiss">✕</button>',
        '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(banner);
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { banner.classList.add('uyeh-pwa-banner--visible'); });
    });

    document.getElementById('uyeh-install-btn').addEventListener('click', function() {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(choice) {
        console.log('[PWA] User choice:', choice.outcome);
        deferredPrompt = null;
        hideInstallBanner();
      });
    });

    document.getElementById('uyeh-install-dismiss').addEventListener('click', function() {
      hideInstallBanner();
      try { localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DURATION)); } catch(_) {}
    });
  }

  function hideInstallBanner() {
    var banner = document.getElementById('uyeh-install-banner');
    if (!banner) return;
    banner.classList.remove('uyeh-pwa-banner--visible');
    banner.classList.add('uyeh-pwa-banner--hiding');
    setTimeout(function() { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 500);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // iOS HINT
  // ════════════════════════════════════════════════════════════════════════════
  function showIosHint() {
    if (document.getElementById('uyeh-ios-hint')) return;
    injectStyles();

    var hint = document.createElement('div');
    hint.id        = 'uyeh-ios-hint';
    hint.className = 'uyeh-ios-hint';
    hint.innerHTML = [
      '<div class="uyeh-ios-hint-inner">',
        '<img class="uyeh-pwa-icon" src="/icons/icon-192.png" alt="" onerror="this.style.display=\'none\'">',
        '<div style="flex:1">',
          '<div class="uyeh-pwa-title" style="margin-bottom:6px;">Install UYEH TECH</div>',
          '<div class="uyeh-pwa-desc">',
            'Tap the <strong style="color:#fff;">Share ↑</strong> button at the bottom of your browser,',
            ' then tap <strong style="color:#fff;">"Add to Home Screen"</strong>.',
          '</div>',
        '</div>',
        '<button id="uyeh-ios-dismiss" class="uyeh-pwa-btn-dismiss" aria-label="Close">✕</button>',
      '</div>',
      '<div class="uyeh-ios-arrow"></div>'
    ].join('');

    document.body.appendChild(hint);
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { hint.classList.add('uyeh-ios-hint--visible'); });
    });

    document.getElementById('uyeh-ios-dismiss').addEventListener('click', function() {
      hint.classList.remove('uyeh-ios-hint--visible');
      setTimeout(function() { if (hint.parentNode) hint.parentNode.removeChild(hint); }, 400);
      try { localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DURATION)); } catch(_) {}
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UPDATE BANNER
  // ════════════════════════════════════════════════════════════════════════════
  function showUpdateBanner() {
    if (document.getElementById('uyeh-update-banner')) return;
    injectStyles();

    var banner = document.createElement('div');
    banner.id        = 'uyeh-update-banner';
    banner.className = 'uyeh-update-banner';
    banner.innerHTML = [
      '<span style="font-size:.85rem;color:rgba(255,255,255,.8);">🆕 A new version is available</span>',
      '<button id="uyeh-update-now" class="uyeh-pwa-btn-install" style="padding:7px 14px;font-size:.8rem;">Update Now</button>',
      '<button id="uyeh-update-later" class="uyeh-pwa-btn-dismiss" style="padding:7px 12px;">Later</button>'
    ].join('');

    document.body.appendChild(banner);
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { banner.classList.add('uyeh-update-banner--visible'); });
    });

    document.getElementById('uyeh-update-now').addEventListener('click', function() {
      if (newWorker) newWorker.postMessage({ type: 'SKIP_WAITING' });
      else if (registration && registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      else window.location.reload();
    });

    document.getElementById('uyeh-update-later').addEventListener('click', function() {
      banner.classList.remove('uyeh-update-banner--visible');
      setTimeout(function() { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 400);
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TOAST
  // ════════════════════════════════════════════════════════════════════════════
  function showToast(msg, type, duration) {
    injectStyles();
    duration = duration || 4000;
    var toast = document.createElement('div');
    toast.className = 'uyeh-pwa-toast uyeh-pwa-toast--' + (type || 'info');
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { toast.classList.add('uyeh-pwa-toast--visible'); });
    });
    setTimeout(function() {
      toast.classList.remove('uyeh-pwa-toast--visible');
      setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 400);
    }, duration);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════════════════
  function isAlreadyInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }
  function isDismissed() {
    try { return Date.now() < parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10); }
    catch(_) { return false; }
  }

  // ── Inject CSS once ────────────────────────────────────────────────────────
  var _stylesInjected = false;
  function injectStyles() {
    if (_stylesInjected || document.getElementById('uyeh-pwa-styles')) return;
    _stylesInjected = true;
    var s = document.createElement('style');
    s.id = 'uyeh-pwa-styles';
    s.textContent = `
      .uyeh-pwa-banner {
        position:fixed;bottom:20px;left:50%;z-index:99997;
        transform:translateX(-50%) translateY(140px);opacity:0;
        background:linear-gradient(135deg,#0e1f14,#0a1509);
        border:1px solid rgba(0,255,136,.4);border-radius:18px;
        padding:16px 20px;
        box-shadow:0 12px 48px rgba(0,0,0,.7),0 0 0 1px rgba(0,255,136,.08);
        font-family:'Space Grotesk','Montserrat',sans-serif;
        max-width:min(480px,calc(100vw - 32px));width:100%;
        transition:transform .5s cubic-bezier(.34,1.56,.64,1),opacity .4s ease;
      }
      .uyeh-pwa-banner--visible { transform:translateX(-50%) translateY(0);opacity:1; }
      .uyeh-pwa-banner--hiding  { transform:translateX(-50%) translateY(140px);opacity:0; }
      .uyeh-pwa-banner-inner    { display:flex;align-items:center;gap:14px; }

      .uyeh-ios-hint {
        position:fixed;bottom:24px;left:50%;z-index:99997;
        transform:translateX(-50%) translateY(150px);opacity:0;
        background:linear-gradient(135deg,#0e1f14,#0a1509);
        border:1px solid rgba(0,255,136,.4);border-radius:18px;
        padding:18px 20px 28px;
        max-width:min(360px,calc(100vw - 32px));width:100%;
        box-shadow:0 12px 48px rgba(0,0,0,.7);
        font-family:'Space Grotesk','Montserrat',sans-serif;
        transition:transform .5s cubic-bezier(.34,1.56,.64,1),opacity .4s ease;
      }
      .uyeh-ios-hint--visible  { transform:translateX(-50%) translateY(0);opacity:1; }
      .uyeh-ios-hint-inner     { display:flex;align-items:flex-start;gap:12px; }
      .uyeh-ios-arrow {
        position:absolute;bottom:-11px;left:50%;transform:translateX(-50%);
        border-left:11px solid transparent;border-right:11px solid transparent;
        border-top:11px solid rgba(0,255,136,.4);
      }

      .uyeh-update-banner {
        position:fixed;top:16px;right:16px;z-index:99998;
        display:flex;align-items:center;gap:10px;flex-wrap:wrap;
        background:#0e2018;border:1px solid rgba(0,255,136,.4);
        border-radius:14px;padding:13px 16px;
        font-family:'Space Grotesk','Montserrat',sans-serif;
        box-shadow:0 6px 32px rgba(0,0,0,.5);
        max-width:calc(100vw - 32px);
        transform:translateY(-90px);opacity:0;
        transition:transform .4s ease,opacity .4s ease;
      }
      .uyeh-update-banner--visible { transform:translateY(0);opacity:1; }

      .uyeh-pwa-toast {
        position:fixed;bottom:90px;left:50%;z-index:99999;
        transform:translateX(-50%) translateY(20px);opacity:0;
        padding:11px 22px;border-radius:50px;
        font-family:'Space Grotesk','Montserrat',sans-serif;
        font-size:.84rem;font-weight:600;
        color:#fff;white-space:nowrap;pointer-events:none;
        box-shadow:0 4px 24px rgba(0,0,0,.5);
        transition:transform .3s ease,opacity .3s ease;
      }
      .uyeh-pwa-toast--visible  { transform:translateX(-50%) translateY(0);opacity:1; }
      .uyeh-pwa-toast--success  { background:#0a2e1a;border:1px solid #00ff88; }
      .uyeh-pwa-toast--warning  { background:#2e1f07;border:1px solid #ffa500; }
      .uyeh-pwa-toast--info     { background:#0d2d45;border:1px solid #0096ff; }

      .uyeh-pwa-icon     { width:44px;height:44px;border-radius:11px;flex-shrink:0;border:1px solid rgba(0,255,136,.2); }
      .uyeh-pwa-info     { flex:1;min-width:0; }
      .uyeh-pwa-title    { font-weight:700;font-size:.9rem;color:#fff;margin-bottom:3px; }
      .uyeh-pwa-desc     { font-size:.75rem;color:rgba(255,255,255,.6);line-height:1.45; }
      .uyeh-pwa-actions  { display:flex;gap:8px;flex-shrink:0; }

      .uyeh-pwa-btn-install {
        padding:9px 18px;border-radius:9px;border:none;cursor:pointer;
        background:linear-gradient(135deg,#00b359,#00ff88);
        color:#07090a;font-weight:700;
        font-family:'Space Grotesk','Montserrat',sans-serif;font-size:.83rem;
        white-space:nowrap;transition:transform .2s,box-shadow .2s;
      }
      .uyeh-pwa-btn-install:hover { transform:translateY(-1px);box-shadow:0 4px 18px rgba(0,255,136,.4); }
      .uyeh-pwa-btn-dismiss {
        padding:9px 12px;border-radius:9px;cursor:pointer;
        border:1px solid rgba(255,255,255,.2);background:transparent;
        color:rgba(255,255,255,.5);
        font-family:'Space Grotesk','Montserrat',sans-serif;font-size:.85rem;
        transition:color .2s,border-color .2s;
      }
      .uyeh-pwa-btn-dismiss:hover { color:#fff;border-color:rgba(255,255,255,.4); }
    `;
    document.head.appendChild(s);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  window.uyehPwa = {
    promptInstall: function() {
      if (!deferredPrompt) {
        if (isIos()) { showIosHint(); return; }
        showToast('Open in Chrome on Android to install', 'info');
        return;
      }
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(c) {
        if (c.outcome === 'accepted') { deferredPrompt = null; hideInstallBanner(); }
      });
    },
    isInstalled:  isAlreadyInstalled,
    sendToSW:     function(msg) { if (registration && registration.active) registration.active.postMessage(msg); },
    clearApiCache:function() { if (registration && registration.active) registration.active.postMessage({ type: 'CLEAR_API_CACHE' }); }
  };

})();