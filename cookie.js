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
      font-family: 'Montserrat','Segoe UI',sans-serif;
    }

    /* ════════════════════════════════════════════════
       BANNER
       Bottom-centre on mobile, bottom-left on desktop.
       Wider, bolder, clearly branded.
    ════════════════════════════════════════════════ */
    #ck-banner {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(calc(100% + 48px));
      z-index: 9998;
      width: min(520px, calc(100vw - 32px));
      background: linear-gradient(145deg, #131920 0%, #0d1117 100%);
      border: 1px solid rgba(0,255,136,.3);
      border-radius: 20px;
      padding: 0;
      box-shadow:
        0 24px 64px rgba(0,0,0,.65),
        0 0 0 1px rgba(0,255,136,.08),
        inset 0 1px 0 rgba(255,255,255,.04);
      opacity: 0;
      transition: transform .38s cubic-bezier(.22,.68,0,1.2),
                  opacity .3s ease;
      pointer-events: none;
      overflow: hidden;
    }
    #ck-banner.ck-visible {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
      pointer-events: auto;
    }

    /* green accent bar along the top edge */
    #ck-banner::before {
      content: '';
      display: block;
      height: 3px;
      background: linear-gradient(90deg, #00ff88, #00b359);
      border-radius: 20px 20px 0 0;
    }

    .ck-banner-inner {
      padding: 28px 26px 26px;
    }

    /* top row */
    .ck-banner-top {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 16px;
    }
    .ck-banner-icon-wrap {
      width: 40px; height: 40px;
      background: rgba(0,255,136,.1);
      border: 1px solid rgba(0,255,136,.2);
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.3rem;
      flex-shrink: 0;
    }
    .ck-banner-heading {
      flex: 1;
      color: #fff;
      font-size: 1.05rem;
      font-weight: 800;
      letter-spacing: -.2px;
      line-height: 1.2;
    }
    .ck-banner-close {
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.1);
      color: rgba(255,255,255,.4);
      width: 30px; height: 30px;
      border-radius: 8px;
      font-size: .9rem;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all .2s;
      flex-shrink: 0;
    }
    .ck-banner-close:hover {
      background: rgba(255,77,77,.12);
      border-color: rgba(255,77,77,.25);
      color: #ff6b6b;
    }

    /* body */
    .ck-banner-body {
      color: rgba(255,255,255,.5);
      font-size: .85rem;
      line-height: 1.75;
      margin-bottom: 22px;
    }
    .ck-banner-body a {
      color: #00ff88;
      font-weight: 600;
      text-decoration: none;
      border-bottom: 1px solid rgba(0,255,136,.3);
      transition: border-color .2s;
    }
    .ck-banner-body a:hover { border-color: #00ff88; }

    /* buttons */
    .ck-banner-actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .ck-banner-actions .ck-btn-accept {
      width: 100%;
      padding: 14px 18px;
      font-size: .88rem;
    }
    .ck-banner-actions-secondary {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .ck-btn {
      padding: 11px 18px;
      border-radius: 10px;
      border: none;
      font-size: .83rem;
      font-weight: 700;
      cursor: pointer;
      transition: all .22s;
      white-space: nowrap;
      text-align: center;
      line-height: 1;
    }
    .ck-btn-accept {
      background: linear-gradient(135deg, #00ff88, #00c96a);
      color: #0a0a0a;
      box-shadow: 0 4px 18px rgba(0,255,136,.25);
    }
    .ck-btn-accept:hover {
      box-shadow: 0 6px 24px rgba(0,255,136,.45);
      transform: translateY(-1px);
    }
    .ck-btn-settings {
      background: rgba(0,255,136,.08);
      color: #00ff88;
      border: 1px solid rgba(0,255,136,.22);
    }
    .ck-btn-settings:hover {
      background: rgba(0,255,136,.15);
      border-color: rgba(0,255,136,.4);
    }
    .ck-btn-reject {
      background: rgba(255,255,255,.05);
      color: rgba(255,255,255,.45);
      border: 1px solid rgba(255,255,255,.09);
    }
    .ck-btn-reject:hover {
      color: #fff;
      background: rgba(255,255,255,.09);
    }

    /* ════════════════════════════════════════════════
       OVERLAY
    ════════════════════════════════════════════════ */
    #ck-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.6);
      backdrop-filter: blur(3px);
      z-index: 9998;
      opacity: 0; pointer-events: none;
      transition: opacity .28s;
    }
    #ck-overlay.ck-visible { opacity: 1; pointer-events: auto; }

    /* ════════════════════════════════════════════════
       DRAWER
       Full-height from right. Each category is a
       proper card with clear visual weight.
    ════════════════════════════════════════════════ */
    #ck-drawer {
      position: fixed;
      top: 0; right: 0;
      height: 100%;
      width: 440px;
      max-width: 100vw;
      background: #0c1018;
      border-left: 1px solid rgba(0,255,136,.15);
      z-index: 9999;
      display: flex; flex-direction: column;
      transform: translateX(100%);
      transition: transform .3s cubic-bezier(.22,.68,0,1.1);
      box-shadow: -16px 0 80px rgba(0,0,0,.6);
    }
    #ck-drawer.ck-visible { transform: translateX(0); }

    /* drawer header */
    .ck-drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      height: 66px;
      border-bottom: 1px solid rgba(255,255,255,.06);
      flex-shrink: 0;
      background: linear-gradient(180deg,#111820,#0c1018);
    }
    .ck-drawer-title {
      color: #fff;
      font-size: 1.1rem;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 10px;
      letter-spacing: -.2px;
    }
    .ck-drawer-title span {
      color: #00ff88;
      font-family: 'Playfair Display', serif;
    }
    .ck-drawer-close {
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.1);
      color: rgba(255,255,255,.4);
      width: 34px; height: 34px;
      border-radius: 9px;
      font-size: .9rem;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all .2s;
    }
    .ck-drawer-close:hover {
      background: rgba(255,77,77,.12);
      border-color: rgba(255,77,77,.25);
      color: #ff6b6b;
    }

    /* drawer intro */
    .ck-drawer-intro {
      padding: 14px 24px;
      color: rgba(255,255,255,.38);
      font-size: .8rem;
      line-height: 1.7;
      border-bottom: 1px solid rgba(255,255,255,.04);
      flex-shrink: 0;
    }

    /* scrollable body */
    .ck-drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: flex; flex-direction: column;
      gap: 18px;
    }
    .ck-drawer-body::-webkit-scrollbar { width: 3px; }
    .ck-drawer-body::-webkit-scrollbar-thumb {
      background: rgba(0,255,136,.18);
      border-radius: 4px;
    }

    /* category card */
    .ck-category {
      background: #111820;
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 14px;
      overflow: hidden;
      transition: border-color .2s, box-shadow .2s;
    }
    .ck-category:hover {
      border-color: rgba(0,255,136,.22);
      box-shadow: 0 4px 20px rgba(0,255,136,.06);
    }

    /* category header row — name left, toggle right */
    .ck-cat-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 18px 14px;
      gap: 14px;
    }
    .ck-cat-left {
      display: flex;
      align-items: center;
      gap: 11px;
      flex: 1;
    }
    .ck-cat-icon-wrap {
      width: 36px; height: 36px;
      border-radius: 10px;
      background: rgba(0,255,136,.08);
      border: 1px solid rgba(0,255,136,.14);
      display: flex; align-items: center; justify-content: center;
      font-size: 1rem;
      flex-shrink: 0;
    }
    .ck-cat-name-wrap { display: flex; flex-direction: column; gap: 3px; }
    .ck-cat-name {
      color: #fff;
      font-size: .92rem;
      font-weight: 700;
      line-height: 1;
    }
    .ck-always-on {
      display: inline-block;
      font-size: .65rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .8px;
      color: #00ff88;
      background: rgba(0,255,136,.1);
      border: 1px solid rgba(0,255,136,.22);
      padding: 2px 7px;
      border-radius: 20px;
      line-height: 1.5;
    }

    /* toggle */
    .ck-toggle {
      position: relative;
      width: 46px; height: 26px;
      flex-shrink: 0;
    }
    .ck-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
    .ck-toggle-track {
      position: absolute; inset: 0;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 13px;
      cursor: pointer;
      transition: all .22s;
    }
    .ck-toggle-track::after {
      content: '';
      position: absolute;
      top: 4px; left: 4px;
      width: 16px; height: 16px;
      background: rgba(255,255,255,.35);
      border-radius: 50%;
      transition: transform .22s, background .22s;
      box-shadow: 0 1px 4px rgba(0,0,0,.4);
    }
    .ck-toggle input:checked ~ .ck-toggle-track {
      background: rgba(0,255,136,.2);
      border-color: rgba(0,255,136,.5);
    }
    .ck-toggle input:checked ~ .ck-toggle-track::after {
      transform: translateX(20px);
      background: #00ff88;
      box-shadow: 0 0 8px rgba(0,255,136,.5);
    }
    .ck-toggle input:disabled ~ .ck-toggle-track {
      cursor: default; opacity: .7;
    }
    .ck-toggle input:checked:disabled ~ .ck-toggle-track {
      background: rgba(0,255,136,.18);
      border-color: rgba(0,255,136,.35);
    }

    /* description + meta */
    .ck-cat-body {
      padding: 0 18px 18px;
      border-top: 1px solid rgba(255,255,255,.05);
      padding-top: 14px;
    }
    .ck-cat-desc {
      color: rgba(255,255,255,.45);
      font-size: .82rem;
      line-height: 1.7;
      margin-bottom: 14px;
    }
    .ck-cat-meta {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .ck-meta-pill {
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: .74rem;
      line-height: 1.55;
    }
    .ck-meta-label {
      color: rgba(0,255,136,.7);
      font-weight: 700;
    }
    .ck-meta-val { color: rgba(255,255,255,.4); }

    /* drawer footer */
    .ck-drawer-footer {
      padding: 22px 24px;
      border-top: 1px solid rgba(255,255,255,.06);
      display: flex;
      flex-direction: column;
      gap: 12px;
      flex-shrink: 0;
      background: #0c1018;
    }
    .ck-drawer-footer .ck-btn-accept {
      width: 100%;
      padding: 14px 16px;
    }
    .ck-drawer-footer-secondary {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .ck-drawer-footer .ck-btn-reject { padding: 11px 14px; }

    /* ── Responsive ─────────────────────────────────── */
    @media (max-width: 540px) {
      .ck-banner-actions {
        grid-template-columns: 1fr 1fr;
      }
      .ck-btn-accept { grid-column: span 2; }
    }
    @media (max-width: 380px) {
      .ck-banner-actions-secondary { grid-template-columns: 1fr; }
      .ck-drawer-footer-secondary { grid-template-columns: 1fr; }
      #ck-drawer { width: 100vw; }
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
    <div class="ck-banner-top">
      <div class="ck-banner-icon-wrap">🍪</div>
      <span class="ck-banner-heading">We use cookies</span>
      <button class="ck-banner-close" onclick="cookieSystem.rejectAll()" aria-label="Reject and close">✕</button>
    </div>
    <p class="ck-banner-body">
      We use cookies to keep you logged in, analyse traffic, and personalise
      your experience. <a href="/privacy.html">Privacy Policy</a>
    </p>
    <div class="ck-banner-actions">
      <button class="ck-btn ck-btn-accept" onclick="cookieSystem.acceptAll()">✓ Accept All</button>
      <div class="ck-banner-actions-secondary">
        <button class="ck-btn ck-btn-settings" onclick="cookieSystem.showSettings()">Manage</button>
        <button class="ck-btn ck-btn-reject"   onclick="cookieSystem.rejectAll()">Reject</button>
      </div>
    </div>
  </div>
</div>`;
  }

  function buildCategoryCard(cat) {
    const id = `ck-toggle-${cat.id}`;
    return `
<div class="ck-category">
  <div class="ck-cat-head">
    <div class="ck-cat-left">
      <div class="ck-cat-icon-wrap">${cat.icon}</div>
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
    <div class="ck-drawer-title">🍪 Cookie <span>Preferences</span></div>
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