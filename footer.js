/**
 * UYEH TECH — Shared Footer Component
 * Drop in on every page:
 *   <div id="footer"></div>
 *   <script src="/js/footer.js"></script>
 *
 * Self-contained: injects its own CSS, renders the HTML, starts the
 * live clock, and highlights the active nav column based on current URL.
 * No dependencies. No frameworks. Works on every page at any path depth
 * because every href uses an absolute path starting with /.
 */

(function () {
  'use strict';

  // ─── CSS ──────────────────────────────────────────────────────────────────

  const css = `
    .uyeh-footer {
      padding: 4rem 0 2rem;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,.2);
      background: linear-gradient(180deg,#0a0a0a 0%,#000 100%);
      border-top: 2px solid rgba(0,255,136,.3);
      position: relative;
      overflow: hidden;
      font-family: 'Montserrat', sans-serif;
    }
    .uyeh-footer-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
    }
    .uyeh-footer-top {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1fr;
      gap: 3rem;
      padding-bottom: 3rem;
      border-bottom: 1px solid rgba(0,255,136,.2);
    }
    .uyeh-footer-brand { max-width: 350px; }
    .uyeh-footer-logo {
      display: flex;
      align-items: center;
      gap: .75rem;
      margin-bottom: 1.5rem;
    }
    .uyeh-footer-logo-text {
      font-family: 'Playfair Display', serif;
      font-size: 2.5em;
      color: #00ff88;
      text-shadow: 0 0 20px rgba(0,255,136,.4);
      font-weight: 900;
      line-height: 1;
    }
    .uyeh-footer-description {
      color: rgba(255,255,255,.75);
      line-height: 1.8;
      margin-bottom: 1.5rem;
      font-size: .93rem;
    }
    .uyeh-footer-social {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .uyeh-social-icon {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      width: 40px;
      height: 40px;
      background: #1a1a1a;
      color: #00ff88;
      border-radius: 50%;
      text-decoration: none;
      border: 1px solid #333;
      transition: all .3s;
    }
    .uyeh-social-icon:hover {
      background: #00ff88;
      color: #0a0a0a;
      transform: translateY(-3px);
      border-color: #00ff88;
    }
    .uyeh-footer-column { display: flex; flex-direction: column; }
    .uyeh-footer-col-title {
      font-family: 'Playfair Display', serif;
      font-weight: 700;
      font-size: 1.15em;
      color: #00ff88;
      margin-bottom: 18px;
      position: relative;
      padding-bottom: .5rem;
    }
    .uyeh-footer-col-title::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0;
      width: 36px; height: 3px;
      background: #00ff88;
      border-radius: 2px;
    }
    .uyeh-footer-links {
      list-style: none;
      padding: 0; margin: 0;
      display: flex;
      flex-direction: column;
      gap: .7rem;
    }
    .uyeh-footer-link {
      color: rgba(255,255,255,.8);
      text-decoration: none;
      font-size: .9rem;
      transition: all .25s;
      display: flex;
      align-items: center;
      gap: .4rem;
    }
    .uyeh-footer-link::before {
      content: '→';
      opacity: 0;
      transition: opacity .25s;
      color: #00ff88;
      font-size: .8rem;
    }
    .uyeh-footer-link:hover {
      color: #00ff88;
      padding-left: 4px;
    }
    .uyeh-footer-link:hover::before { opacity: 1; }
    .uyeh-footer-link.active {
      color: #00ff88;
      font-weight: 600;
    }
    .uyeh-footer-bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 2rem;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .uyeh-footer-copyright {
      color: rgba(255,255,255,.6);
      font-size: .88rem;
    }
    .uyeh-footer-highlight {
      color: #00ff88;
      font-weight: 600;
    }
    .uyeh-footer-legal {
      display: flex;
      gap: 1.5rem;
      list-style: none;
      padding: 0; margin: 0;
      flex-wrap: wrap;
    }
    .uyeh-footer-legal-link {
      color: rgba(255,255,255,.5);
      text-decoration: none;
      font-size: .85rem;
      transition: color .25s;
    }
    .uyeh-footer-legal-link:hover { color: #00ff88; }
    .uyeh-footer-clock {
      background: rgba(0,255,136,.05);
      border: 1px solid rgba(0,255,136,.15);
      border-radius: 10px;
      padding: .75rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: .5rem;
    }
    .uyeh-clock-row {
      display: flex;
      align-items: center;
      gap: .6rem;
      font-size: .82rem;
    }
    .uyeh-clock-val {
      font-weight: 600;
      color: #00ff88;
      font-family: 'Courier New', monospace;
    }

    /* ── Responsive ─────────────────────────────────────────────── */
    @media (max-width: 1024px) {
      .uyeh-footer-top { grid-template-columns: 1fr 1fr 1fr; }
      .uyeh-footer-brand { grid-column: span 3; max-width: 100%; }
    }
    @media (max-width: 640px) {
      .uyeh-footer-top { grid-template-columns: 1fr 1fr; gap: 2rem; }
      .uyeh-footer-brand { grid-column: span 2; }
    }
    @media (max-width: 400px) {
      .uyeh-footer-top { grid-template-columns: 1fr; }
      .uyeh-footer-brand { grid-column: span 1; }
      .uyeh-footer-bottom { flex-direction: column; text-align: center; }
      .uyeh-footer-legal { justify-content: center; }
    }
  `;

  // ─── SVG ICONS ────────────────────────────────────────────────────────────

  const icons = {
    linkedin: `<svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854V1.146zm4.943 12.248V6.169H2.542v7.225h2.401zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248-.822 0-1.359.54-1.359 1.248 0 .694.521 1.248 1.327 1.248h.016zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016a5.54 5.54 0 0 1 .016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225h2.4z"/></svg>`,
    twitter: `<svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865l8.875 11.633Z"/></svg>`,
    instagram: `<svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.917 3.917 0 0 0-1.417.923A3.927 3.927 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.916 3.916 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.926 3.926 0 0 0-.923-1.417A3.911 3.911 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0h.003zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599.28.28.453.546.598.92.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.47 2.47 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.478 2.478 0 0 1-.92-.598 2.48 2.48 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233 0-2.136.008-2.388.046-3.231.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92.28-.28.546-.453.92-.598.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045v.002zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92zm-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217zm0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334z"/></svg>`,
    facebook: `<svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951z"/></svg>`,
    youtube:  `<svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M8.051 1.999h.089c.822.003 4.987.033 6.11.335a2.01 2.01 0 0 1 1.415 1.42c.101.38.172.883.22 1.402l.01.104.022.26.008.104c.065.914.073 1.77.074 1.957v.075c-.001.194-.01 1.108-.082 2.06l-.008.105-.009.104c-.05.572-.124 1.14-.235 1.558a2.007 2.007 0 0 1-1.415 1.42c-1.16.312-5.569.334-6.18.335h-.142c-.309 0-1.587-.006-2.927-.052l-.17-.006-.087-.004-.171-.007-.171-.007c-1.11-.049-2.167-.128-2.654-.26a2.007 2.007 0 0 1-1.415-1.419c-.111-.417-.185-.986-.235-1.558L.09 9.82l-.008-.104A31.4 31.4 0 0 1 0 7.68v-.123c.002-.215.01-.958.064-1.778l.007-.103.003-.052.008-.104.022-.26.01-.104c.048-.519.119-1.023.22-1.402a2.007 2.007 0 0 1 1.415-1.42c.487-.13 1.544-.21 2.654-.26l.17-.007.172-.006.086-.003.171-.007A99.788 99.788 0 0 1 7.858 2h.193zM6.4 5.209v4.818l4.157-2.408L6.4 5.209z"/></svg>`,
  };

  // ─── FOOTER DATA ──────────────────────────────────────────────────────────

  // Social links are loaded from /api/settings/public (socialMedia object).
  // Fallbacks are used only if the API is unreachable or the field is empty.
  const SOCIAL_FALLBACKS = [
    { key: 'linkedin',  href: 'https://linkedin.com/in/Uyehbayor',                  title: 'LinkedIn',  icon: icons.linkedin  },
    { key: 'twitter',   href: 'https://X.com/UyehTech',                             title: 'X',         icon: icons.twitter   },
    { key: 'instagram', href: 'https://instagram.com/UyehTech',                     title: 'Instagram', icon: icons.instagram },
    { key: 'facebook',  href: 'https://facebook.com/profile.php?id=61583247992766', title: 'Facebook',  icon: icons.facebook  },
  ];

  // Key → display metadata map
  const SOCIAL_META = {
    linkedin:  { title: 'LinkedIn',  icon: icons.linkedin  },
    twitter:   { title: 'X',         icon: icons.twitter   },
    instagram: { title: 'Instagram', icon: icons.instagram },
    facebook:  { title: 'Facebook',  icon: icons.facebook  },
    youtube:   { title: 'YouTube',   icon: icons.youtube   },
  };

  const columns = [
    {
      title: "The Builder",
      links: [
        { label: 'About the Developer', href: 'https://about.uyehtech.com'         },
        { label: 'Services',            href: 'https://about.uyehtech.com/services' },
        { label: 'Portfolio',           href: 'https://about.uyehtech.com/portfolio'},
        { label: 'Work with Me',        href: 'https://about.uyehtech.com/contact'  },
        { label: 'General Contact',     href: '/contact'           },
      ],
    },
    {
      title: 'Marketplace',
      links: [
        { label: 'Browse Products',      href: '/marketplace/'              },
        { label: 'Browse Creators',      href: '/marketplace/creators'      },
        { label: 'Become a Creator',     href: '/marketplace/creator-apply' },
        { label: 'Affiliate Programme',  href: '/marketplace/affiliates'    },
        { label: 'Create Account',       href: '/marketplace/signup'        },
        { label: 'Sign In',              href: '/marketplace/login'         },
      ],
    },
    {
      title: 'Explore',
      links: [
        { label: 'Blog',          href: '/blog/'            },
        { label: 'System Status', href: '/system-status.html'},
        { label: 'Sitemap',       href: '/sitemap.html'     },
        { label: '🍪 Cookie Preferences', action: 'cookieSystem.showSettings()' },
      ],
    },
  ];

  const legalLinks = [
    { label: 'Privacy Policy',  href: '/privacy.html' },
    { label: 'Terms of Service', href: '/terms.html'  },
  ];

  // ─── BUILD HTML ───────────────────────────────────────────────────────────

  // Renders social icons from whatever array is passed in
  function renderSocials(list) {
    return list.map(s => `
      <a href="${s.href}" class="uyeh-social-icon" target="_blank"
         rel="noopener noreferrer" title="${s.title}" aria-label="${s.title}">
        ${s.icon}
      </a>`).join('');
  }

  // Builds socials from the /api/settings/public response.
  // Order matches the order keys appear in the API response.
  function buildSocialsFromSettings(socialMedia) {
    const list = [];
    const order = ['linkedin','twitter','instagram','facebook','youtube'];
    for (const key of order) {
      const url = socialMedia && socialMedia[key];
      if (url && url.trim()) {
        const meta = SOCIAL_META[key];
        if (meta) list.push({ href: url.trim(), title: meta.title, icon: meta.icon });
      }
    }
    // If API returned nothing at all, fall back to hardcoded defaults
    return list.length ? list : SOCIAL_FALLBACKS;
  }

  function buildColumns() {
    return columns.map(col => `
      <div class="uyeh-footer-column">
        <h4 class="uyeh-footer-col-title">${col.title}</h4>
        <ul class="uyeh-footer-links">
          ${col.links.map(l => l.action ? `
            <li>
              <button onclick="${l.action}"
                class="uyeh-footer-link uyeh-footer-link-btn"
                type="button">
                ${l.label}
              </button>
            </li>` : `
            <li>
              <a href="${l.href}" class="uyeh-footer-link" data-href="${l.href}">
                ${l.label}
              </a>
            </li>`).join('')}
        </ul>
      </div>`).join('');
  }

  function buildFooter() {
    return `
      <footer class="uyeh-footer" role="contentinfo">
        <div class="uyeh-footer-container">

          <div class="uyeh-footer-top">

            <!-- Brand -->
            <div class="uyeh-footer-brand">
              <div class="uyeh-footer-logo">
                <span class="uyeh-footer-logo-text">UYEH TECH</span>
              </div>
              <p class="uyeh-footer-description">
                A Nigerian-built digital ecosystem — shop digital products,
                sell as a creator, earn as an affiliate, get live support,
                hire the developer, or read the blog.
                One account, every role.
              </p>
              <div class="uyeh-footer-social">
                ${renderSocials(window._uyehSocials || SOCIAL_FALLBACKS)}
              </div>
            </div>

            <!-- Link columns -->
            ${buildColumns()}

          </div>

          <!-- Bottom bar -->
          <div class="uyeh-footer-bottom">
            <p class="uyeh-footer-copyright">
              © <span id="uyehFooterYear">${new Date().getFullYear()}</span>
              <span class="uyeh-footer-highlight">UYEH TECH</span>.
              All rights reserved.
            </p>

            <ul class="uyeh-footer-legal">
              ${legalLinks.map(l =>
                `<li><a href="${l.href}" class="uyeh-footer-legal-link">${l.label}</a></li>`
              ).join('')}
            </ul>

            <div class="uyeh-footer-clock">
              <div class="uyeh-clock-row">
                <span>📅</span>
                <span class="uyeh-clock-val" id="uyehFooterDate">—</span>
              </div>
              <div class="uyeh-clock-row">
                <span>🕐</span>
                <span class="uyeh-clock-val" id="uyehFooterTime">—</span>
              </div>
            </div>
          </div>

        </div>
      </footer>`;
  }


  // ─── BACK TO TOP ──────────────────────────────────────────────────────────

  const bttCss = `
    #uyeh-btt {
      position: fixed;
      bottom: 30px;
      right: 30px;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      border: none;
      background: linear-gradient(135deg, #00b359, #00ff88);
      color: #0a0a0a;
      font-size: 1.4em;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      visibility: hidden;
      transform: translateY(15px);
      transition: opacity .3s, transform .3s, visibility .3s, box-shadow .3s;
      z-index: 990;
      box-shadow: 0 6px 20px rgba(0,255,136,.35);
    }
    #uyeh-btt.uyeh-btt-show {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }
    #uyeh-btt:hover {
      box-shadow: 0 10px 30px rgba(0,255,136,.55);
      transform: translateY(-3px);
    }
    @media (max-width: 768px) {
      #uyeh-btt { bottom: 20px; right: 20px; width: 44px; height: 44px; font-size: 1.2em; }
    }
  `;

  function mountBackToTop() {
    if (document.getElementById('uyeh-btt')) return;

    const s = document.createElement('style');
    s.id = 'uyeh-btt-styles';
    s.textContent = bttCss;
    document.head.appendChild(s);

    const btn = document.createElement('button');
    btn.id = 'uyeh-btt';
    btn.setAttribute('aria-label', 'Back to top');
    btn.setAttribute('title', 'Back to top');
    btn.innerHTML = '&#8593;';
    document.body.appendChild(btn);

    let ticking = false;
    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          btn.classList.toggle('uyeh-btt-show', window.scrollY > 400);
          ticking = false;
        });
        ticking = true;
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    onScroll();
  }

  // ─── ACTIVE LINK HIGHLIGHT ────────────────────────────────────────────────

  function highlightActiveLinks() {
    const path = window.location.pathname;
    document.querySelectorAll('.uyeh-footer-link[data-href]').forEach(a => {
      const href = a.getAttribute('data-href');
      // exact match, or path starts with href (for /marketplace/ etc.)
      // but avoid / matching everything
      const isActive = href === path ||
        (href.length > 1 && path.startsWith(href));
      if (isActive) a.classList.add('active');
    });
  }

  // ─── LIVE CLOCK ───────────────────────────────────────────────────────────

  function startClock() {
    function tick() {
      const now  = new Date();
      const date = document.getElementById('uyehFooterDate');
      const time = document.getElementById('uyehFooterTime');
      if (date) date.textContent = now.toLocaleDateString('en-GB', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
      });
      if (time) time.textContent = now.toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    tick();
    setInterval(tick, 1000);
  }

  // ─── INJECT CSS ───────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('uyeh-footer-styles')) return;
    const style = document.createElement('style');
    style.id = 'uyeh-footer-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── MOUNT ────────────────────────────────────────────────────────────────

  const BACKEND = 'https://uyehtechbackend.onrender.com';

  function mount() {
    const target = document.getElementById('footer');
    if (!target) {
      console.warn('[footer.js] No <div id="footer"> found on this page.');
      return;
    }

    injectStyles();

    // Render immediately with fallback social links so the footer
    // is never blank while we wait for the API response.
    window._uyehSocials = SOCIAL_FALLBACKS;
    target.innerHTML = buildFooter();
    highlightActiveLinks();
    startClock();
    mountBackToTop();

    // Fetch live social links from the backend settings.
    // Uses a 5-second timeout so a sleeping Render instance
    // doesn't stall the footer on first load.
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 5000);

    fetch(`${BACKEND}/api/settings/public`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        clearTimeout(timeout);
        const social = data?.settings?.socialMedia || {};
        const live   = buildSocialsFromSettings(social);

        // Only re-render the social row — everything else stays intact
        const socialEl = target.querySelector('.uyeh-footer-social');
        if (socialEl && live.length) {
          window._uyehSocials = live;
          socialEl.innerHTML  = renderSocials(live);
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        // Fallback links already rendered — silently stay as-is
      });
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

})();