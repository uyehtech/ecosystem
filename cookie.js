/**
 * UYEH TECH — Shared Cookie Consent Component v3.1
 *
 * Drop in on every page (before </body>):
 *   <div id="cookie-consent"></div>
 *   <script src="/js/cookie.js"></script>
 *
 * Public API:
 *   window.cookieSystem.acceptAll()
 *   window.cookieSystem.rejectAll()
 *   window.cookieSystem.showSettings()
 *   window.cookieSystem.reset()
 *   window.cookieSystem.getStatus()
 */

(function () {
  'use strict';

  // ─── CSS ──────────────────────────────────────────────────────────────────

  const css = `
    /* ── Scoped reset ──────────────────────────────── */
    #ck-banner *, #ck-drawer *, #ck-overlay {
      box-sizing: border-box;
      margin: 0; padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    /* ════════════════════════════════════════════════
       BANNER
       Slim full-width strip pinned to the bottom.
       Deliberately neutral — a consent notice, not a
       themed marketing card.
    ════════════════════════════════════════════════ */
    #ck-banner {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 9998;
      background: #ffffff;
      border-top: 1px solid #e5e7eb;
      box-shadow: 0 -2px 16px rgba(0,0,0,.1);
      transform: translateY(100%);
      transition: transform .25s ease;
      pointer-events: none;
    }
    #ck-banner.ck-visible {
      transform: translateY(0);
      pointer-events: auto;
    }

    .ck-banner-inner {
      max-width: 1100px;
      margin: 0 auto;
      padding: 18px 24px;
      display: flex;
      align-items: center;
      gap: 24px;
    }

    .ck-banner-body {
      flex: 1;
      color: #4b5563;
      font-size: .875rem;
      line-height: 1.6;
    }
    .ck-banner-body strong { color: #111827; font-weight: 600; }
    .ck-banner-body a {
      color: #111827;
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .ck-banner-body a:hover { color: #000; }

    /* buttons */
    .ck-banner-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }
    .ck-btn {
      padding: 9px 16px;
      border-radius: 6px;
      border: 1px solid transparent;
      font-size: .8125rem;
      font-weight: 600;
      cursor: pointer;
      transition: background .15s, border-color .15s, color .15s;
      white-space: nowrap;
      text-align: center;
      line-height: 1.3;
    }
    .ck-btn-accept {
      background: #111827;
      border-color: #111827;
      color: #ffffff;
    }
    .ck-btn-accept:hover {
      background: #000000;
      border-color: #000000;
    }
    .ck-btn-settings,
    .ck-btn-reject {
      background: #ffffff;
      color: #374151;
      border-color: #d1d5db;
    }
    .ck-btn-settings:hover,
    .ck-btn-reject:hover {
      background: #f9fafb;
      border-color: #9ca3af;
    }

    .ck-banner-close {
      background: transparent;
      border: none;
      color: #9ca3af;
      font-size: 1rem;
      cursor: pointer;
      flex-shrink: 0;
      padding: 4px;
      line-height: 1;
      transition: color .15s;
    }
    .ck-banner-close:hover {
      color: #111827;
    }

    /* ════════════════════════════════════════════════
       OVERLAY
    ════════════════════════════════════════════════ */
    #ck-overlay {
      position: fixed; inset: 0;
      background: rgba(17,24,39,.55);
      z-index: 9998;
      opacity: 0; pointer-events: none;
      transition: opacity .2s;
    }
    #ck-overlay.ck-visible { opacity: 1; pointer-events: auto; }

    /* ════════════════════════════════════════════════
       PREFERENCES MODAL
       Centred dialog — a proper settings modal rather
       than a themed side-drawer.
    ════════════════════════════════════════════════ */
    #ck-drawer {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -46%);
      width: min(480px, calc(100vw - 32px));
      max-height: min(80vh, 620px);
      background: #ffffff;
      border-radius: 12px;
      z-index: 9999;
      display: flex; flex-direction: column;
      opacity: 0;
      pointer-events: none;
      transition: opacity .2s ease, transform .2s ease;
      box-shadow: 0 24px 60px rgba(0,0,0,.3);
      overflow: hidden;
    }
    #ck-drawer.ck-visible {
      opacity: 1;
      pointer-events: auto;
      transform: translate(-50%, -50%);
    }

    /* modal header */
    .ck-drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 22px;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
    }
    .ck-drawer-title {
      color: #111827;
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: -.1px;
    }
    .ck-drawer-title span {
      color: #111827;
      font-weight: 700;
    }
    .ck-drawer-close {
      background: transparent;
      border: none;
      color: #9ca3af;
      width: 28px; height: 28px;
      border-radius: 6px;
      font-size: .9rem;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background .15s, color .15s;
    }
    .ck-drawer-close:hover {
      background: #f3f4f6;
      color: #111827;
    }

    /* modal intro */
    .ck-drawer-intro {
      padding: 14px 22px;
      color: #6b7280;
      font-size: .8125rem;
      line-height: 1.6;
      border-bottom: 1px solid #f3f4f6;
      flex-shrink: 0;
    }

    /* scrollable body */
    .ck-drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 4px 22px;
    }
    .ck-drawer-body::-webkit-scrollbar { width: 6px; }
    .ck-drawer-body::-webkit-scrollbar-thumb {
      background: #e5e7eb;
      border-radius: 4px;
    }

    /* category row */
    .ck-category {
      padding: 16px 0;
      border-bottom: 1px solid #f3f4f6;
    }
    .ck-category:last-child { border-bottom: none; }

    /* category header row — name left, toggle right */
    .ck-cat-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
    }
    .ck-cat-left {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
    }
    .ck-cat-name-wrap { display: flex; align-items: center; gap: 8px; }
    .ck-cat-name {
      color: #111827;
      font-size: .9rem;
      font-weight: 600;
      line-height: 1.3;
    }
    .ck-always-on {
      display: inline-block;
      font-size: .6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .4px;
      color: #6b7280;
    }

    /* toggle — monochrome */
    .ck-toggle {
      position: relative;
      width: 38px; height: 22px;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .ck-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
    .ck-toggle-track {
      position: absolute; inset: 0;
      background: #e5e7eb;
      border-radius: 11px;
      cursor: pointer;
      transition: background .18s;
    }
    .ck-toggle-track::after {
      content: '';
      position: absolute;
      top: 3px; left: 3px;
      width: 16px; height: 16px;
      background: #ffffff;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,.3);
      transition: transform .18s;
    }
    .ck-toggle input:checked ~ .ck-toggle-track {
      background: #111827;
    }
    .ck-toggle input:checked ~ .ck-toggle-track::after {
      transform: translateX(16px);
    }
    .ck-toggle input:disabled ~ .ck-toggle-track {
      cursor: default; opacity: .55;
    }

    /* description + meta */
    .ck-cat-body {
      padding-top: 10px;
    }
    .ck-cat-desc {
      color: #6b7280;
      font-size: .8125rem;
      line-height: 1.6;
      margin-bottom: 10px;
    }
    .ck-cat-meta {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .ck-meta-pill {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: .75rem;
      line-height: 1.5;
    }
    .ck-meta-label {
      color: #374151;
      font-weight: 600;
    }
    .ck-meta-val { color: #9ca3af; }

    /* modal footer */
    .ck-drawer-footer {
      padding: 16px 22px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-shrink: 0;
    }
    .ck-drawer-footer .ck-btn-accept {
      width: 100%;
      padding: 11px 16px;
    }
    .ck-drawer-footer-secondary {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    /* ── Responsive ─────────────────────────────────── */
    @media (max-width: 640px) {
      .ck-banner-inner {
        flex-wrap: wrap;
        padding: 16px 20px;
      }
      .ck-banner-body { flex: 1 1 100%; }
      .ck-banner-actions { flex: 1 1 100%; }
      .ck-banner-actions .ck-btn { flex: 1; }
    }
    @media (max-width: 380px) {
      .ck-drawer-footer-secondary { grid-template-columns: 1fr; }
      #ck-drawer { width: calc(100vw - 24px); max-height: 85vh; }
    }
  `;

  // ─── CONFIG ───────────────────────────────────────────────────────────────

  const CONFIG = {
    consentKey:     'uyeh_cookie_consent',
    consentDateKey: 'uyeh_cookie_consent_date',
    backendCookies: ['uyeh_auth_token','uyeh_user','uyeh_access_session'],
    expiryDays:     365,
    showDelay:      2000,
  };

  // ─── CATEGORIES ───────────────────────────────────────────────────────────

  const CATEGORIES = [
    {
      id:       'essential',
      icon:     '🔐',
      name:     'Essential',
      alwaysOn: true,
      desc:     'Required for login sessions, security, and basic site function. Cannot be disabled.',
      meta: [
        { label: 'Purpose', value: 'Authentication, session management, security' },
        { label: 'Cookies', value: 'uyeh_auth_token (7d), uyeh_user (7d), uyeh_access_session (30m)' },
      ],
    },
    {
      id:       'analytics',
      icon:     '📊',
      name:     'Analytics',
      alwaysOn: false,
      desc:     'Helps us understand how visitors use the site so we can improve it.',
      meta: [
        { label: 'Purpose',  value: 'Page views, user behaviour analysis' },
        { label: 'Cookies',  value: '_ga (2y), _gid (24h), _gat (1m)' },
        { label: 'Provider', value: 'Google Analytics' },
      ],
    },
    {
      id:       'marketing',
      icon:     '📢',
      name:     'Marketing',
      alwaysOn: false,
      desc:     'Tracks visits across sites to show you relevant ads and campaigns.',
      meta: [
        { label: 'Purpose',  value: 'Advertising, retargeting' },
        { label: 'Cookies',  value: '_fbp (90d), fr (90d)' },
        { label: 'Provider', value: 'Facebook / Meta' },
      ],
    },
    {
      id:       'preference',
      icon:     '⚙️',
      name:     'Preferences',
      alwaysOn: false,
      desc:     'Remembers your settings — theme, language, and personalisation choices.',
      meta: [
        { label: 'Purpose', value: 'Theme, language, UI customisations' },
        { label: 'Storage', value: 'localStorage (persistent)' },
      ],
    },
  ];

  // ─── BUILD HTML ───────────────────────────────────────────────────────────

  function buildBanner() {
    return `
<div id="ck-banner" role="dialog" aria-label="Cookie consent">
  <div class="ck-banner-inner">
    <p class="ck-banner-body">
      <strong>We use cookies.</strong> This helps us keep you logged in, understand site traffic, and improve your experience. <a href="/privacy.html">Privacy Policy</a>
    </p>
    <div class="ck-banner-actions">
      <button class="ck-btn ck-btn-settings" onclick="cookieSystem.showSettings()">Manage</button>
      <button class="ck-btn ck-btn-reject"   onclick="cookieSystem.rejectAll()">Reject</button>
      <button class="ck-btn ck-btn-accept"   onclick="cookieSystem.acceptAll()">Accept All</button>
    </div>
    <button class="ck-banner-close" onclick="cookieSystem.rejectAll()" aria-label="Reject and close">✕</button>
  </div>
</div>`;
  }

  function buildCategoryCard(cat) {
    const id = `ck-toggle-${cat.id}`;
    return `
<div class="ck-category">
  <div class="ck-cat-head">
    <div class="ck-cat-left">
      <div class="ck-cat-name-wrap">
        <span class="ck-cat-name">${cat.name}</span>
        ${cat.alwaysOn ? `<span class="ck-always-on">Always on</span>` : ''}
      </div>
    </div>
    <label class="ck-toggle" title="${cat.alwaysOn ? 'Required — cannot be disabled' : `Toggle ${cat.name} cookies`}">
      <input type="checkbox" id="${id}" ${cat.alwaysOn ? 'checked disabled' : ''} aria-label="${cat.name} cookies">
      <span class="ck-toggle-track"></span>
    </label>
  </div>
  <div class="ck-cat-body">
    <p class="ck-cat-desc">${cat.desc}</p>
    <div class="ck-cat-meta">
      ${cat.meta.map(m => `
      <div class="ck-meta-pill">
        <span class="ck-meta-label">${m.label}:</span>
        <span class="ck-meta-val">${m.value}</span>
      </div>`).join('')}
    </div>
  </div>
</div>`;
  }

  function buildDrawer() {
    return `
<div id="ck-overlay" onclick="cookieSystem.closeSettings()" aria-hidden="true"></div>
<div id="ck-drawer" role="dialog" aria-label="Cookie preferences" aria-modal="true">
  <div class="ck-drawer-header">
    <div class="ck-drawer-title">Cookie <span>Preferences</span></div>
    <button class="ck-drawer-close" onclick="cookieSystem.closeSettings()" aria-label="Close">✕</button>
  </div>
  <p class="ck-drawer-intro">
    Choose which cookies to enable. Essential cookies are always active —
    everything else is your choice.
  </p>
  <div class="ck-drawer-body">
    ${CATEGORIES.map(buildCategoryCard).join('')}
  </div>
  <div class="ck-drawer-footer">
    <button class="ck-btn ck-btn-accept" onclick="cookieSystem.acceptAll()">Accept All</button>
    <div class="ck-drawer-footer-secondary">
      <button class="ck-btn ck-btn-reject"   onclick="cookieSystem.rejectAll()">Reject All</button>
      <button class="ck-btn ck-btn-settings" onclick="cookieSystem.saveSettings()">Save</button>
    </div>
  </div>
</div>`;
  }

  // ─── COOKIE SYSTEM ────────────────────────────────────────────────────────

  const cookieSystem = {

    init() {
      const consent = this.getConsent();
      if (!consent) {
        setTimeout(() => this.showBanner(), CONFIG.showDelay);
      } else {
        this.applyPreferences(consent);
      }
      this.checkBackendAuth();
      this.monitorBackendCookies();
    },

    showBanner() {
      const el = document.getElementById('ck-banner');
      if (el) el.classList.add('ck-visible');
    },
    hideBanner() {
      const el = document.getElementById('ck-banner');
      if (el) el.classList.remove('ck-visible');
    },

    showSettings() {
      const drawer  = document.getElementById('ck-drawer');
      const overlay = document.getElementById('ck-overlay');
      if (!drawer) return;
      const consent = this.getConsent();
      CATEGORIES.filter(c => !c.alwaysOn).forEach(cat => {
        const el = document.getElementById(`ck-toggle-${cat.id}`);
        if (el && consent) el.checked = !!consent[cat.id];
      });

      // Hide the banner while the drawer is open — otherwise it sits
      // dimmed-but-live behind the modal for the whole interaction.
      this.hideBanner();

      // Remember what had focus so we can return it on close (a11y), and
      // lock background scroll like a proper modal.
      this._lastFocused = document.activeElement;
      document.body.style.overflow = 'hidden';

      drawer.classList.add('ck-visible');
      if (overlay) overlay.classList.add('ck-visible');
      document.addEventListener('keydown', this._onDrawerKeydown);
      setTimeout(() => {
        const first = drawer.querySelector('button');
        if (first) first.focus();
      }, 50);
    },
    closeSettings() {
      document.getElementById('ck-drawer')?.classList.remove('ck-visible');
      document.getElementById('ck-overlay')?.classList.remove('ck-visible');
      document.body.style.overflow = '';
      document.removeEventListener('keydown', this._onDrawerKeydown);

      // Closed without choosing anything yet (X / overlay click, not
      // Save/Accept/Reject) — bring the banner back so they can still
      // consent without needing to refresh the page.
      if (!this.getConsent()) this.showBanner();

      if (this._lastFocused && typeof this._lastFocused.focus === 'function') {
        this._lastFocused.focus();
      }
    },
    _onDrawerKeydown(e) {
      if (e.key === 'Escape') cookieSystem.closeSettings();
    },

    acceptAll() {
      this.saveConsent({ essential:true, analytics:true, marketing:true, preference:true });
      this.hideBanner();
      this.closeSettings();
    },
    rejectAll() {
      this.saveConsent({ essential:true, analytics:false, marketing:false, preference:false });
      this.hideBanner();
      this.closeSettings();
    },
    saveSettings() {
      const prefs = { essential: true };
      CATEGORIES.filter(c => !c.alwaysOn).forEach(cat => {
        const el = document.getElementById(`ck-toggle-${cat.id}`);
        prefs[cat.id] = el ? el.checked : false;
      });
      this.saveConsent(prefs);
      this.closeSettings();
      this.hideBanner();
    },

    saveConsent(prefs) {
      localStorage.setItem(CONFIG.consentKey,     JSON.stringify(prefs));
      localStorage.setItem(CONFIG.consentDateKey, new Date().toISOString());
      this.applyPreferences(prefs);
    },
    getConsent() {
      const raw = localStorage.getItem(CONFIG.consentKey);
      return raw ? JSON.parse(raw) : null;
    },

    applyPreferences(prefs) {
      if (prefs.analytics) this.enableAnalytics();
      else                 this.disableAnalytics();
      if (prefs.marketing) this.enableMarketing();
      else                 this.disableMarketing();
    },

    enableAnalytics() {
      if (typeof gtag !== 'undefined')
        gtag('consent','update',{ analytics_storage:'granted' });
    },
    disableAnalytics() {
      if (typeof gtag !== 'undefined')
        gtag('consent','update',{ analytics_storage:'denied' });
    },
    enableMarketing() {
      if (typeof fbq !== 'undefined') fbq('consent','grant');
    },
    disableMarketing() {
      if (typeof fbq !== 'undefined') fbq('consent','revoke');
    },

    getCookie(name) {
      const v = `; ${document.cookie}`;
      const p = v.split(`; ${name}=`);
      return p.length === 2 ? p.pop().split(';').shift() : null;
    },
    checkBackendAuth() {
      const token = this.getCookie('uyeh_auth_token');
      const raw   = this.getCookie('uyeh_user');
      if (token && raw) {
        try { this.updateUIForLoggedInUser(JSON.parse(decodeURIComponent(raw))); }
        catch (_) {}
      } else {
        this.updateUIForLoggedOutUser();
      }
    },
    monitorBackendCookies() {
      let last = this.getCookie('uyeh_auth_token');
      setInterval(() => {
        const current = this.getCookie('uyeh_auth_token');
        if (current !== last) {
          if (current) this.checkBackendAuth();
          else         this.updateUIForLoggedOutUser();
          last = current;
        }
      }, 2000);
    },

    // Extend these to update nav/UI when login state changes
    updateUIForLoggedInUser(_user) {},
    updateUIForLoggedOutUser()     {},

    reset() {
      localStorage.removeItem(CONFIG.consentKey);
      localStorage.removeItem(CONFIG.consentDateKey);
      location.reload();
    },
    getStatus() {
      return {
        consent:     this.getConsent(),
        backendAuth: this.getCookie('uyeh_auth_token') ? 'Active' : 'Inactive',
        cookies:     document.cookie,
      };
    },
  };

  // ─── MOUNT ────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('uyeh-cookie-styles')) return;
    const s = document.createElement('style');
    s.id = 'uyeh-cookie-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function mount() {
    const target = document.getElementById('cookie-consent');
    if (!target) {
      console.warn('[cookie.js] No <div id="cookie-consent"> found.');
      return;
    }
    injectStyles();
    target.innerHTML = buildBanner() + buildDrawer();
    cookieSystem.init();
    window.cookieSystem = cookieSystem;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

})();