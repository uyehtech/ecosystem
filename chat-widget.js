/**
 * UYEH TECH — Live Chat Widget
 * Version: 2.0 (Standalone Option B)
 *
 * DROP THIS FILE into your Netlify frontend repo root.
 * Then add ONE line before </body> on every page (or use Netlify Snippet Injection):
 *
 *   <script src="/chat-widget.js"></script>
 *
 * Pages excluded automatically (edit _CW_EXCLUDE below to add more):
 *   /agent-login, /agent-dashboard, /admin
 *
 * Features:
 *  ✅ Auto-detects logged-in user — skips name/email form entirely
 *  ✅ Guest mode — minimal name + email + subject form
 *  ✅ File uploads with preview tray (images thumbnail, docs icon)
 *  ✅ Reply threading, emoji reactions, message delete
 *  ✅ Typing indicator, delivery ticks, unread badge
 *  ✅ WebSocket with auto-reconnect (×5, exponential backoff)
 *  ✅ Session restore across page navigations
 *  ✅ Image lightbox
 *  ✅ Post-chat star rating
 *  ✅ FontAwesome auto-injected if not already on page
 *  ✅ Zero CSS conflicts — all classes/vars prefixed cw- / --cw-
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     CONFIG — edit these if your backend URL or WS path changes
     ═══════════════════════════════════════════════════════════ */
  const _CW_API = 'https://uyehtechbackend.onrender.com';
  const _CW_WS  = 'wss://uyehtechbackend.onrender.com/wss';

  /* Pages where the widget should NOT appear */
  const _CW_EXCLUDE = ['/agent-login', '/agent-dashboard', '/chat'];

  /* ── Guard: skip excluded pages ── */
  if (_CW_EXCLUDE.some(p => location.pathname.startsWith(p))) return;

  /* ── Guard: only inject once ── *
  if (document.getElementById('uyeh-cw-root')) return;

  /* ═══════════════════════════════════════════════════════════
     STEP 1 — Inject FontAwesome if not already on the page
     ═══════════════════════════════════════════════════════════ */
  if (!document.querySelector('link[href*="font-awesome"],link[href*="fontawesome"],link[href*="all.min.css"]')) {
    const fa = document.createElement('link');
    fa.rel  = 'stylesheet';
    fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    document.head.appendChild(fa);
  }

  /* ═══════════════════════════════════════════════════════════
     STEP 2 — Inject scoped CSS
     All selectors are prefixed with #uyeh-cw-root or .cw-*
     CSS variables are --cw-* — cannot clash with host page vars
     ═══════════════════════════════════════════════════════════ */
  const _cwCSS = `
/* ── tokens ── */
#uyeh-cw-root{--cw-g:#00ff88;--cw-g2:#00c866;--cw-ink:#0a0a0a;--cw-surface:#111;--cw-panel:#181818;--cw-card:#1e1e1e;--cw-rim:rgba(0,255,136,.18);--cw-rim2:rgba(255,255,255,.07);--cw-text:#f0f0f0;--cw-muted:#888;--cw-danger:#ff4d4d;--cw-warn:#ffaa00;--cw-r:14px;--cw-r2:20px;--cw-ease:cubic-bezier(.4,0,.2,1);font-family:'Montserrat',sans-serif}
/* toggle button */
#uyeh-cw-btn{position:fixed;bottom:90px;right:24px;z-index:99999;width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,var(--cw-g2),var(--cw-g));border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(0,255,136,.35);transition:transform .2s var(--cw-ease),box-shadow .2s var(--cw-ease)}
#uyeh-cw-btn:hover{transform:scale(1.08);box-shadow:0 8px 32px rgba(0,255,136,.45)}
#uyeh-cw-btn .cw-ico{font-size:22px;color:var(--cw-ink);transition:all .25s;position:absolute}
#uyeh-cw-btn .cw-ico-open{opacity:1;transform:scale(1)}
#uyeh-cw-btn .cw-ico-close{opacity:0;transform:rotate(-90deg) scale(.7)}
#uyeh-cw-root.cw-open #uyeh-cw-btn .cw-ico-open{opacity:0;transform:rotate(90deg) scale(.7)}
#uyeh-cw-root.cw-open #uyeh-cw-btn .cw-ico-close{opacity:1;transform:rotate(0) scale(1)}
#uyeh-cw-notif{position:absolute;top:-2px;right:-2px;width:20px;height:20px;background:var(--cw-danger);border:2px solid var(--cw-ink);border-radius:50%;font-size:10px;font-weight:700;color:#fff;display:none;align-items:center;justify-content:center}
#uyeh-cw-notif.show{display:flex}
/* window */
#uyeh-cw-win{position:fixed;bottom:160px;right:24px;z-index:99998;width:380px;max-height:620px;background:var(--cw-surface);border:1px solid var(--cw-rim);border-radius:var(--cw-r2);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.7);transform-origin:bottom right;transform:scale(.92) translateY(12px);opacity:0;pointer-events:none;transition:transform .28s var(--cw-ease),opacity .28s var(--cw-ease)}
#uyeh-cw-root.cw-open #uyeh-cw-win{transform:scale(1) translateY(0);opacity:1;pointer-events:all}
@media(max-width:440px){#uyeh-cw-btn{bottom:80px;right:16px}#uyeh-cw-win{width:calc(100vw - 32px);right:16px;bottom:150px;max-height:75vh}}
/* header */
#uyeh-cw-hdr{background:linear-gradient(135deg,var(--cw-g2),var(--cw-g));padding:14px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.cw-hdr-l{display:flex;align-items:center;gap:10px}
.cw-avi-wrap{position:relative;flex-shrink:0}
.cw-avi{width:38px;height:38px;border-radius:50%;border:2px solid rgba(0,0,0,.2);object-fit:cover;background:var(--cw-ink)}
.cw-ring{position:absolute;bottom:0;right:0;width:11px;height:11px;border-radius:50%;border:2px solid var(--cw-g);background:#2ecc71;transition:background .3s}
.cw-ring.offline{background:var(--cw-muted)}
.cw-ring.connecting{background:var(--cw-warn);animation:cw-blink 1s infinite}
@keyframes cw-blink{0%,100%{opacity:1}50%{opacity:.4}}
.cw-hdr-info h4{font-size:14px;font-weight:600;color:var(--cw-ink);margin:0}
.cw-hdr-info span{font-size:11px;color:rgba(0,0,0,.6)}
.cw-hdr-r{display:flex;gap:6px}
.cw-hbtn{width:30px;height:30px;border:none;border-radius:8px;background:rgba(0,0,0,.12);color:var(--cw-ink);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;transition:background .2s}
.cw-hbtn:hover{background:rgba(0,0,0,.22)}
/* banner */
#uyeh-cw-banner{background:rgba(255,170,0,.12);border-bottom:1px solid rgba(255,170,0,.2);padding:7px 16px;font-size:12px;color:var(--cw-warn);text-align:center;display:none;flex-shrink:0}
#uyeh-cw-banner.cw-err{background:rgba(255,77,77,.1);border-color:rgba(255,77,77,.2);color:var(--cw-danger)}
/* welcome */
#uyeh-cw-welcome{flex:1;overflow-y:auto;padding:24px 20px;display:flex;flex-direction:column}
.cw-hero{text-align:center;margin-bottom:22px}
.cw-hero-emoji{font-size:44px;line-height:1;margin-bottom:10px;display:block}
.cw-hero h3{font-size:16px;font-weight:700;margin-bottom:5px;color:var(--cw-text)}
.cw-hero p{font-size:13px;color:var(--cw-muted);line-height:1.6}
.cw-auth-strip{background:rgba(0,255,136,.08);border:1px solid rgba(0,255,136,.2);border-radius:12px;padding:12px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px}
.cw-auth-avi{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--cw-g2),var(--cw-g));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;color:var(--cw-ink);flex-shrink:0;overflow:hidden}
.cw-auth-avi img{width:100%;height:100%;object-fit:cover;border-radius:50%}
.cw-auth-info{flex:1;min-width:0}
.cw-auth-info strong{display:block;font-size:13px;font-weight:600;color:var(--cw-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cw-auth-info small{font-size:11px;color:var(--cw-muted)}
.cw-form-row{margin-bottom:13px}
.cw-form-row label{display:block;font-size:12px;font-weight:500;color:var(--cw-muted);margin-bottom:5px}
.cw-form-row label span{color:var(--cw-danger);margin-left:2px}
.cw-ctrl{width:100%;padding:10px 13px;background:var(--cw-card);border:1px solid var(--cw-rim2);border-radius:var(--cw-r);color:var(--cw-text);font-size:14px;font-family:inherit;outline:none;transition:border-color .2s;box-sizing:border-box}
.cw-ctrl:focus{border-color:var(--cw-g)}
.cw-start-btn{width:100%;padding:13px;background:linear-gradient(135deg,var(--cw-g2),var(--cw-g));color:var(--cw-ink);font-size:15px;font-weight:700;font-family:inherit;border:none;border-radius:var(--cw-r);cursor:pointer;transition:opacity .2s,transform .15s;margin-top:4px;display:flex;align-items:center;justify-content:center;gap:8px;box-sizing:border-box}
.cw-start-btn:hover:not(:disabled){opacity:.9;transform:translateY(-1px)}
.cw-start-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
/* panel */
#uyeh-cw-panel{flex:1;display:none;flex-direction:column;overflow:hidden}
#uyeh-cw-panel.cw-visible{display:flex}
/* messages */
.cw-msgs{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:4px;scroll-behavior:smooth}
.cw-msgs::-webkit-scrollbar{width:3px}
.cw-msgs::-webkit-scrollbar-thumb{background:rgba(0,255,136,.2);border-radius:2px}
/* bubbles */
.cw-row{display:flex;gap:7px;margin-bottom:2px;animation:cw-pop .18s ease}
@keyframes cw-pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.cw-row.me{flex-direction:row-reverse}
.cw-avi-sm{width:27px;height:27px;border-radius:50%;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--cw-g);flex-shrink:0;align-self:flex-end;overflow:hidden}
.cw-avi-sm img{width:100%;height:100%;object-fit:cover}
.cw-row.me .cw-avi-sm{display:none}
.cw-bubble-wrap{max-width:78%;display:flex;flex-direction:column;gap:3px}
.cw-row.me .cw-bubble-wrap{align-items:flex-end}
.cw-sender{font-size:10px;color:var(--cw-muted);padding:0 4px;margin-bottom:1px}
.cw-bubble{padding:9px 12px;border-radius:16px;font-size:13.5px;line-height:1.5;color:var(--cw-text);word-break:break-word;position:relative}
.cw-row.me .cw-bubble{background:linear-gradient(135deg,var(--cw-g2),var(--cw-g));color:var(--cw-ink);border-bottom-right-radius:4px}
.cw-row:not(.me) .cw-bubble{background:var(--cw-card);border:1px solid var(--cw-rim2);border-bottom-left-radius:4px}
.cw-bubble.cw-system{background:rgba(255,255,255,.04);border:1px dashed var(--cw-rim2);font-size:12px;color:var(--cw-muted);text-align:center;border-radius:10px;padding:7px 12px}
.cw-meta{display:flex;align-items:center;gap:5px;padding:0 4px}
.cw-row.me .cw-meta{flex-direction:row-reverse}
.cw-time{font-size:10px;color:var(--cw-muted)}
.cw-tick{font-size:11px;color:var(--cw-muted)}
.cw-tick.delivered,.cw-tick.read{color:var(--cw-g)}
/* reply quote */
.cw-reply-quote{background:rgba(0,255,136,.07);border-left:3px solid var(--cw-g);border-radius:6px;padding:5px 8px;margin-bottom:5px;font-size:11px}
.cw-reply-quote strong{color:var(--cw-g);display:block;margin-bottom:2px;font-size:10px}
.cw-reply-quote span{color:var(--cw-muted)}
/* attachments */
.cw-img-attach{max-width:220px;border-radius:1px;display:block;cursor:pointer;margin-top:4px;object-fit:cover}
.cw-file-attach{display:flex;align-items:center;gap:10px;padding:9px 12px;background:rgba(255,255,255,.05);border-radius:10px;text-decoration:none;margin-top:4px;transition:background .2s}
.cw-file-attach:hover{background:rgba(255,255,255,.09)}
.cw-file-icon{font-size:20px;flex-shrink:0;width:28px;text-align:center}
.cw-file-info{display:flex;flex-direction:column;min-width:0}
.cw-file-name{color:#fff;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px}
.cw-file-hint{color:rgba(255,255,255,.45);font-size:10.5px;margin-top:1px}
.cw-lb-download{position:absolute;bottom:24px;display:inline-flex;align-items:center;gap:8px;padding:10px 18px;background:var(--cw-g);color:#0a0a0a;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px}
/* reactions */
.cw-reacts{display:flex;flex-wrap:wrap;gap:3px;margin-top:3px}
.cw-react-chip{background:rgba(255,255,255,.07);border:1px solid var(--cw-rim2);border-radius:20px;padding:2px 7px;font-size:12px;cursor:pointer;transition:background .15s}
.cw-react-chip:hover{background:rgba(0,255,136,.12)}
/* typing */
#uyeh-cw-typing{padding:6px 14px;font-size:12px;color:var(--cw-muted);display:none;flex-shrink:0;align-items:center;gap:6px}
#uyeh-cw-typing.show{display:flex}
.cw-dots{display:flex;gap:3px}
.cw-dots span{width:5px;height:5px;border-radius:50%;background:var(--cw-g);animation:cw-bounce .8s infinite}
.cw-dots span:nth-child(2){animation-delay:.15s}
.cw-dots span:nth-child(3){animation-delay:.3s}
@keyframes cw-bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
/* reply bar */
#uyeh-cw-replybar{background:rgba(0,255,136,.06);border-top:1px solid rgba(0,255,136,.15);padding:7px 14px;display:none;align-items:center;gap:8px;flex-shrink:0}
#uyeh-cw-replybar.show{display:flex}
.cw-rb-body{flex:1;min-width:0}
.cw-rb-name{font-size:11px;font-weight:600;color:var(--cw-g);margin-bottom:2px}
.cw-rb-text{font-size:12px;color:var(--cw-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cw-rb-close{background:none;border:none;color:var(--cw-muted);cursor:pointer;font-size:14px;flex-shrink:0;line-height:1}
/* file tray */
#uyeh-cw-filetray{display:none;flex-wrap:wrap;gap:6px;padding:8px 14px;border-top:1px solid var(--cw-rim2)}
#uyeh-cw-filetray.show{display:flex}
.cw-fchip{display:flex;align-items:center;gap:5px;padding:3px 9px 3px 6px;background:rgba(0,255,136,.07);border:1px solid rgba(0,255,136,.2);border-radius:20px;font-size:11px;color:var(--cw-muted);max-width:160px}
.cw-fchip img{width:24px;height:24px;object-fit:cover;border-radius:4px;flex-shrink:0}
.cw-fchip-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.cw-fchip-x{cursor:pointer;color:var(--cw-danger);flex-shrink:0;font-size:14px;line-height:1;margin-left:2px}
/* input bar */
#uyeh-cw-inputbar{padding:10px 12px;border-top:1px solid var(--cw-rim2);flex-shrink:0}
.cw-input-row{display:flex;align-items:flex-end;gap:8px}
.cw-icon-btn{width:34px;height:34px;border:none;background:rgba(0,255,136,.08);border-radius:9px;color:var(--cw-g);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;transition:background .15s}
.cw-icon-btn:hover{background:rgba(0,255,136,.16)}
.cw-textarea{flex:1;background:var(--cw-card);border:1px solid var(--cw-rim2);border-radius:10px;color:var(--cw-text);font-size:13.5px;font-family:inherit;padding:9px 12px;resize:none;outline:none;max-height:110px;line-height:1.5;transition:border-color .2s;box-sizing:border-box}
.cw-textarea:focus{border-color:var(--cw-g)}
.cw-send-btn{width:34px;height:34px;border:none;border-radius:9px;background:linear-gradient(135deg,var(--cw-g2),var(--cw-g));color:var(--cw-ink);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;transition:opacity .15s,transform .15s}
.cw-send-btn:hover{opacity:.88;transform:scale(1.06)}
.cw-send-btn:disabled{opacity:.4;cursor:not-allowed;transform:none}
/* rating */
#uyeh-cw-rating{position:absolute;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(8px);z-index:10;display:none;align-items:center;justify-content:center;padding:20px}
#uyeh-cw-rating.show{display:flex}
.cw-rating-card{background:var(--cw-panel);border:1px solid var(--cw-rim);border-radius:var(--cw-r2);padding:28px 24px;text-align:center;width:100%;max-width:300px}
.cw-rating-card h3{font-size:17px;font-weight:700;margin-bottom:6px;color:var(--cw-text)}
.cw-rating-card p{font-size:13px;color:var(--cw-muted);margin-bottom:16px}
.cw-stars{display:flex;justify-content:center;gap:6px;margin-bottom:14px}
.cw-stars button{background:none;border:none;font-size:28px;cursor:pointer;transition:transform .15s;line-height:1}
.cw-stars button.cw-active{transform:scale(1.2)}
.cw-rating-txt{width:100%;background:var(--cw-card);border:1px solid var(--cw-rim2);border-radius:10px;color:var(--cw-text);font-size:13px;font-family:inherit;padding:9px 12px;resize:none;outline:none;margin-bottom:14px;transition:border-color .2s;box-sizing:border-box}
.cw-rating-txt:focus{border-color:var(--cw-g)}
.cw-rating-submit{width:100%;padding:11px;background:linear-gradient(135deg,var(--cw-g2),var(--cw-g));color:var(--cw-ink);font-size:14px;font-weight:700;font-family:inherit;border:none;border-radius:var(--cw-r);cursor:pointer;margin-bottom:8px;transition:opacity .15s}
.cw-rating-submit:hover{opacity:.9}
.cw-rating-skip{background:none;border:none;color:var(--cw-muted);font-size:12px;cursor:pointer;font-family:inherit}
.cw-rating-skip:hover{color:var(--cw-text)}
/* context menu */
#uyeh-cw-ctx{position:fixed;z-index:999999;background:var(--cw-panel);border:1px solid var(--cw-rim2);border-radius:12px;padding:6px;min-width:160px;display:none;box-shadow:0 8px 32px rgba(0,0,0,.5)}
#uyeh-cw-ctx.show{display:block}
.cw-ctx-item{padding:8px 12px;border-radius:8px;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px;color:var(--cw-text);transition:background .15s;user-select:none}
.cw-ctx-item:hover{background:rgba(255,255,255,.06)}
.cw-ctx-item.cw-danger{color:var(--cw-danger)}
.cw-ctx-item i{width:14px;text-align:center}
/* emoji */
#uyeh-cw-emoji{position:fixed;z-index:999999;background:var(--cw-panel);border:1px solid var(--cw-rim2);border-radius:12px;padding:8px;display:none;gap:4px}
#uyeh-cw-emoji.show{display:flex}
#uyeh-cw-emoji button{background:none;border:none;font-size:20px;cursor:pointer;line-height:1;padding:2px 4px;border-radius:6px;transition:background .15s}
#uyeh-cw-emoji button:hover{background:rgba(255,255,255,.08)}
/* lightbox */
#uyeh-cw-lb{position:fixed;inset:0;z-index:9999999;background:rgba(0,0,0,.92);display:none;align-items:center;justify-content:center}
#uyeh-cw-lb.show{display:flex}
#uyeh-cw-lb img{max-width:90vw;max-height:90vh;border-radius:10px;object-fit:contain}
.cw-lb-close{position:absolute;top:16px;right:16px;background:rgba(255,255,255,.1);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center}
/* toasts */
#uyeh-cw-toasts{position:fixed;bottom:100px;right:24px;z-index:9999999;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.cw-toast{padding:10px 16px;border-radius:10px;font-size:13px;font-family:'Montserrat',sans-serif;display:flex;align-items:center;gap:8px;animation:cw-tin .25s ease;pointer-events:none;max-width:280px}
@keyframes cw-tin{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
.cw-toast.ok{background:#1a2e1a;border:1px solid rgba(0,255,136,.25);color:#00ff88}
.cw-toast.warn{background:#2e2600;border:1px solid rgba(255,170,0,.25);color:#ffaa00}
.cw-toast.err{background:#2e1414;border:1px solid rgba(255,77,77,.25);color:#ff6b6b}
`;

  const styleEl = document.createElement('style');
  styleEl.id = 'uyeh-cw-css';
  styleEl.textContent = _cwCSS;
  document.head.appendChild(styleEl);

  /* ═══════════════════════════════════════════════════════════
     STEP 3 — Build and inject the widget HTML into <body>
     ═══════════════════════════════════════════════════════════ */
  const _cwHTML = `
<div id="uyeh-cw-root">
  <button id="uyeh-cw-btn" title="Live Support" aria-label="Open support chat">
    <i class="fas fa-comments cw-ico cw-ico-open"></i>
    <i class="fas fa-times cw-ico cw-ico-close"></i>
    <span id="uyeh-cw-notif"></span>
  </button>
  <div id="uyeh-cw-win" role="dialog" aria-label="Support chat">
    <div id="uyeh-cw-hdr">
      <div class="cw-hdr-l">
        <div class="cw-avi-wrap">
          <img class="cw-avi" id="uyeh-cw-avi"
            src="https://ui-avatars.com/api/?name=Support&background=0a0a0a&color=00ff88&size=80" alt="Agent"/>
          <span class="cw-ring connecting" id="uyeh-cw-ring"></span>
        </div>
        <div class="cw-hdr-info">
          <h4 id="uyeh-cw-aname">UYEH TECH Support</h4>
          <span id="uyeh-cw-status">Connecting…</span>
        </div>
      </div>
      <div class="cw-hdr-r">
        <button class="cw-hbtn" id="uyeh-cw-minbtn" title="Minimise"><i class="fas fa-minus"></i></button>
        <button class="cw-hbtn" id="uyeh-cw-closebtn" title="End chat"><i class="fas fa-times"></i></button>
      </div>
    </div>
    <div id="uyeh-cw-banner"></div>
    <div id="uyeh-cw-welcome">
      <div class="cw-hero">
        <span class="cw-hero-emoji">👋</span>
        <h3>Welcome to UYEH TECH Support</h3>
        <p>We're here to help. An agent will join you shortly.</p>
      </div>
      <div class="cw-auth-strip" id="uyeh-cw-authstrip" style="display:none">
        <div class="cw-auth-avi" id="uyeh-cw-authavi"></div>
        <div class="cw-auth-info">
          <strong id="uyeh-cw-authname">—</strong>
          <small id="uyeh-cw-authemail">—</small>
        </div>
      </div>
      <div class="cw-form-row">
        <label>What do you need help with? <span>*</span></label>
        <input class="cw-ctrl" id="uyeh-cw-fSubject" type="text" placeholder="e.g. I can't access my purchase"/>
      </div>
      <div id="uyeh-cw-guestfields">
        <div class="cw-form-row">
          <label>Your Name <span>*</span></label>
          <input class="cw-ctrl" id="uyeh-cw-fName" type="text" placeholder="e.g. Ada Okonkwo" autocomplete="name"/>
        </div>
        <div class="cw-form-row">
          <label>Email Address <span>*</span></label>
          <input class="cw-ctrl" id="uyeh-cw-fEmail" type="email" placeholder="you@example.com" autocomplete="email"/>
        </div>
      </div>
      <button class="cw-start-btn" id="uyeh-cw-startbtn">
        <i class="fas fa-comment-dots"></i> Start Chat
      </button>
    </div>
    <div id="uyeh-cw-panel">
      <div class="cw-msgs" id="uyeh-cw-msgs"></div>
      <div id="uyeh-cw-typing">
        <div class="cw-dots"><span></span><span></span><span></span></div>
        <span id="uyeh-cw-typing-label">Agent is typing…</span>
      </div>
      <div id="uyeh-cw-replybar">
        <div class="cw-rb-body">
          <div class="cw-rb-name" id="uyeh-cw-rbname"></div>
          <div class="cw-rb-text" id="uyeh-cw-rbtext"></div>
        </div>
        <button class="cw-rb-close" id="uyeh-cw-rb-close"><i class="fas fa-times"></i></button>
      </div>
      <div id="uyeh-cw-filetray"></div>
      <div id="uyeh-cw-inputbar">
        <div class="cw-input-row">
          <button class="cw-icon-btn" id="uyeh-cw-attachbtn" title="Attach file" aria-label="Attach">
            <i class="fas fa-paperclip"></i>
          </button>
          <input type="file" id="uyeh-cw-fileinput" multiple style="display:none"
            accept="image/*,.pdf,.doc,.docx,.txt,.zip"/>
          <textarea class="cw-textarea" id="uyeh-cw-input" rows="1"
            placeholder="Type a message…" aria-label="Message"></textarea>
          <button class="cw-send-btn" id="uyeh-cw-sendbtn" aria-label="Send">
            <i class="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
    </div>
    <div id="uyeh-cw-rating">
      <div class="cw-rating-card">
        <h3>How was your experience?</h3>
        <p id="uyeh-cw-rating-agent">Rate your conversation with our agent</p>
        <div class="cw-stars" id="uyeh-cw-stars">
          <button data-v="1" aria-label="1 star">⭐</button>
          <button data-v="2" aria-label="2 stars">⭐</button>
          <button data-v="3" aria-label="3 stars">⭐</button>
          <button data-v="4" aria-label="4 stars">⭐</button>
          <button data-v="5" aria-label="5 stars">⭐</button>
        </div>
        <textarea class="cw-rating-txt" id="uyeh-cw-rating-comment" rows="3"
          placeholder="Optional — share your thoughts…"></textarea>
        <button class="cw-rating-submit" id="uyeh-cw-rating-submit">Submit Rating</button><br>
        <button class="cw-rating-skip" id="uyeh-cw-rating-skip">Skip for now</button>
      </div>
    </div>
  </div>
</div>
<div id="uyeh-cw-ctx">
  <div class="cw-ctx-item" id="uyeh-cw-ctx-reply"><i class="fas fa-reply"></i> Reply</div>
  <div class="cw-ctx-item" id="uyeh-cw-ctx-copy"><i class="fas fa-copy"></i> Copy text</div>
  <div class="cw-ctx-item" id="uyeh-cw-ctx-react"><i class="fas fa-smile"></i> React</div>
  <div class="cw-ctx-item cw-danger" id="uyeh-cw-ctx-del"><i class="fas fa-trash"></i> Delete</div>
</div>
<div id="uyeh-cw-emoji">
  <button data-emoji="👍">👍</button>
  <button data-emoji="❤️">❤️</button>
  <button data-emoji="😂">😂</button>
  <button data-emoji="😮">😮</button>
  <button data-emoji="😢">😢</button>
  <button data-emoji="🙏">🙏</button>
</div>
<div id="uyeh-cw-lb">
  <button class="cw-lb-close" id="uyeh-cw-lb-close"><i class="fas fa-times"></i></button>
  <img id="uyeh-cw-lb-img" src="" alt="Full size image"/>
  <iframe id="uyeh-cw-lb-pdf" src="" style="display:none;width:90vw;height:90vh;border:none;border-radius:10px;background:#fff;"></iframe>
  <a id="uyeh-cw-lb-download" href="" target="_blank" rel="noopener" class="cw-lb-download" style="display:none;">
    <i class="fas fa-download"></i> Download
  </a>
</div>
<div id="uyeh-cw-toasts"></div>
`;

  const _cwMount = document.createElement('div');
  _cwMount.innerHTML = _cwHTML;
  document.body.appendChild(_cwMount);

  /* ═══════════════════════════════════════════════════════════
     STEP 4 — STATE
     ═══════════════════════════════════════════════════════════ */
  let _chatId       = null;
  let _custId       = null;
  let _custName     = null;
  let _custEmail    = null;
  let _socket       = null;
  let _pingTimer    = null;
  let _reconnects   = 0;
  let _unread       = 0;
  let _starVal      = 0;
  let _replyTo      = null;
  let _ctxTarget    = null;
  let _pendingFiles = [];
  let _renderedIds  = new Set();
  let _tempMap      = new Map();
  let _lastSender   = null;
  let _lastTime     = null;
  let _typingTimer  = null;
  let _isGuest      = true;
  const MAX_RECONNECTS = 5;

  /* ═══════════════════════════════════════════════════════════
     STEP 5 — HELPERS
     ═══════════════════════════════════════════════════════════ */
  const $    = id => document.getElementById(id);
  const _esc = s  => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
  const _tok = () => localStorage.getItem('token') || localStorage.getItem('authToken') || null;
  const _authHdr = () => { const t = _tok(); return t ? { 'Authorization': 'Bearer ' + t } : {}; };

  function _getUser() {
    try {
      const raw = localStorage.getItem('user');
      if (raw) { const u = JSON.parse(raw); if (u && (u.fullName || u.name) && u.email) return u; }
      const t = _tok();
      if (!t) return null;
      const p = JSON.parse(atob(t.split('.')[1]));
      if ((p.name || p.fullName) && p.email) return p;
    } catch (_) {}
    return null;
  }

  function _toast(msg, type = 'ok') {
    const rack = $('uyeh-cw-toasts');
    const d = document.createElement('div');
    d.className = 'cw-toast ' + type;
    const icon = type === 'ok' ? 'fa-circle-check' : type === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-xmark';
    d.innerHTML = `<i class="fas ${icon}"></i>${_esc(msg)}`;
    rack.appendChild(d);
    setTimeout(() => d.remove(), 4000);
  }

  function _status(label, cls) {
    const el = $('uyeh-cw-status'); if (el) el.textContent = label;
    const r  = $('uyeh-cw-ring');  if (r)  r.className = 'cw-ring ' + (cls || '');
  }

  function _banner(msg, type) {
    const b = $('uyeh-cw-banner');
    if (!msg) { b.textContent = ''; b.style.display = 'none'; b.className = ''; return; }
    b.textContent = msg;
    b.className   = type === 'err' ? 'cw-err' : '';
    b.style.display = 'block';
  }

  function _showWelcome() {
    $('uyeh-cw-welcome').style.display = 'flex';
    $('uyeh-cw-panel').classList.remove('cw-visible');
  }

  function _showPanel() {
    $('uyeh-cw-welcome').style.display = 'none';
    $('uyeh-cw-panel').classList.add('cw-visible');
  }

  function _setUnread(n) {
    _unread = n;
    const dot = $('uyeh-cw-notif');
    if (n > 0) { dot.textContent = n > 9 ? '9+' : n; dot.classList.add('show'); }
    else        { dot.textContent = ''; dot.classList.remove('show'); }
  }

  function _saveSession() {
    localStorage.setItem('uyeh_chatId',       _chatId);
    localStorage.setItem('uyeh_customerId',   _custId);
    localStorage.setItem('uyeh_customerName', _custName);
    localStorage.setItem('uyeh_customerEmail',_custEmail || '');
  }

  function _clearSession() {
    ['uyeh_chatId','uyeh_customerId','uyeh_customerName','uyeh_customerEmail']
      .forEach(k => localStorage.removeItem(k));
    _chatId = _custId = _custName = _custEmail = null;
    if (_socket) { try { _socket.close(); } catch (_) {} _socket = null; }
    clearInterval(_pingTimer); _pingTimer = null;
    _renderedIds.clear(); _tempMap.clear();
    _lastSender = _lastTime = null;
  }

  /* ── Message rendering ── */
  function _fmtTime(d) {
    return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function _dateLabel(d) {
    const today = new Date(); d = new Date(d);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (new Date(today - 86400000).toDateString() === d.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' });
  }

  function _sysMsg(text) {
    const c  = $('uyeh-cw-msgs');
    const row = document.createElement('div'); row.className = 'cw-row';
    const bw  = document.createElement('div'); bw.className = 'cw-bubble-wrap'; bw.style.maxWidth = '100%';
    const b   = document.createElement('div'); b.className = 'cw-bubble cw-system'; b.textContent = text;
    bw.appendChild(b); row.appendChild(bw); c.appendChild(row);
    c.scrollTop = c.scrollHeight;
  }

  function _addBubble(msg) {
    const c    = $('uyeh-cw-msgs');
    const isMe = msg.sender === 'customer';
    const ts   = new Date(msg.timestamp);

    // Date divider
    const dl = _dateLabel(ts);
    if (!_lastTime || _dateLabel(_lastTime) !== dl) _sysMsg(dl);
    _lastTime = ts;

    const row = document.createElement('div');
    row.className = 'cw-row' + (isMe ? ' me' : '');
    if (msg.messageId) row.dataset.msgId  = msg.messageId;
    if (msg._tempId)   row.dataset.tempId = msg._tempId;

    // Agent avatar
    if (!isMe) {
      const av = document.createElement('div'); av.className = 'cw-avi-sm';
      const src = $('uyeh-cw-avi')?.src;
      if (src && !src.includes('name=Support')) {
        av.innerHTML = `<img src="${_esc(src)}" alt="Agent">`;
      } else {
        av.textContent = (msg.senderName || 'A')[0].toUpperCase();
      }
      row.appendChild(av);
    }

    const bw = document.createElement('div'); bw.className = 'cw-bubble-wrap';

    // Sender label (group header)
    if (!isMe && _lastSender !== msg.senderId) {
      const sn = document.createElement('div'); sn.className = 'cw-sender';
      sn.textContent = msg.senderName || 'Agent';
      bw.appendChild(sn);
    }
    _lastSender = msg.senderId;

    // Reply quote
    if (msg.replyTo?.preview) {
      const rq = document.createElement('div'); rq.className = 'cw-reply-quote';
      rq.innerHTML = `<strong>${_esc(msg.replyTo.senderName || '')}</strong><span>${_esc(msg.replyTo.preview)}</span>`;
      bw.appendChild(rq);
    }

    // Bubble
    const bbl = document.createElement('div'); bbl.className = 'cw-bubble';
    if (msg.message) {
      const p = document.createElement('p'); p.style.margin = '0'; p.textContent = msg.message;
      bbl.appendChild(p);
    }

    // Attachments
    (msg.attachments || []).forEach(a => {
      if (a.resourceType === 'image') {
        const img = document.createElement('img');
        img.className = 'cw-img-attach';
        img.src = a.thumbnailUrl || a.url;
        img.alt = a.filename || 'Image';
        img.onclick = () => _openLb(a.url, 'image');
        img.onerror = () => { img.style.display = 'none'; };
        bbl.appendChild(img);
      } else {
        const meta   = _fileMeta(a.filename);
        const size   = _fmtBytes(a.bytes || a.size);
        const isPdf  = meta.ext === 'pdf';
        const lnk = document.createElement(isPdf ? 'div' : 'a');
        lnk.className = 'cw-file-attach';
        if (!isPdf) { lnk.href = a.url; lnk.target = '_blank'; lnk.rel = 'noopener'; }
        else        { lnk.style.cursor = 'pointer'; lnk.onclick = () => _openLb(a.url, 'pdf'); }
        lnk.innerHTML = `
          <span class="cw-file-icon" style="color:${meta.color};"><i class="fas ${meta.icon}"></i></span>
          <span class="cw-file-info">
            <span class="cw-file-name">${_esc(a.filename || 'File')}</span>
            <span class="cw-file-hint">${size ? size + ' · ' : ''}${isPdf ? 'Click to preview' : 'Click to download'}</span>
          </span>`;
        bbl.appendChild(lnk);
      }
    });
    bw.appendChild(bbl);

    // Reactions
    if (msg.reactions && Object.keys(msg.reactions).length) {
      const rx = document.createElement('div'); rx.className = 'cw-reacts';
      Object.entries(msg.reactions).forEach(([emoji, users]) => {
        const chip = document.createElement('span'); chip.className = 'cw-react-chip';
        chip.dataset.emoji = emoji; chip.dataset.count = users.length;
        chip.textContent = emoji + (users.length > 1 ? ` ${users.length}` : '');
        rx.appendChild(chip);
      });
      bw.appendChild(rx);
    }

    // Meta
    const meta = document.createElement('div'); meta.className = 'cw-meta';
    const time = document.createElement('span'); time.className = 'cw-time'; time.textContent = _fmtTime(ts);
    meta.appendChild(time);
    if (isMe) {
      const tick = document.createElement('i');
      tick.className = `fas ${msg._status === 'sending' ? 'fa-clock' : 'fa-check-double'} cw-tick ${msg._status || 'delivered'}`;
      meta.appendChild(tick);
    }
    bw.appendChild(meta);
    row.appendChild(bw);
    c.appendChild(row);
    c.scrollTop = c.scrollHeight;

    // Long-press / right-click
    let pressTimer;
    row.addEventListener('contextmenu', e => { e.preventDefault(); _ctxOpen(e, row); });
    row.addEventListener('touchstart',  e => { pressTimer = setTimeout(() => _ctxOpen(e.touches[0], row), 600); }, { passive: true });
    row.addEventListener('touchend',    () => clearTimeout(pressTimer));
    row.addEventListener('touchmove',   () => clearTimeout(pressTimer));

    return row;
  }

  function _renderAll(msgs) {
    const c = $('uyeh-cw-msgs'); c.innerHTML = '';
    _lastSender = null; _lastTime = null;
    msgs.forEach(m => {
      if (_renderedIds.has(m.messageId)) return;
      _renderedIds.add(m.messageId);
      _addBubble(m);
    });
  }

  /* ── WebSocket ── */
  function _wsSend(data) {
    if (_socket && _socket.readyState === WebSocket.OPEN)
      _socket.send(JSON.stringify(data));
  }

  function _connectWS() {
    if (_socket) { try { _socket.close(); } catch (_) {} }
    _status('Connecting…', 'connecting');
    _socket = new WebSocket(_CW_WS);

    _socket.onopen = () => {
      _status('Connected', '');
      _banner();
      _reconnects = 0;
      _wsSend({ type: 'join_customer', customerId: _custId, chatId: _chatId, customerName: _custName || 'Customer' });
      clearInterval(_pingTimer);
      _pingTimer = setInterval(() => _wsSend({ type: 'ping' }), 25000);
    };

    _socket.onmessage = e => {
      let d; try { d = JSON.parse(e.data); } catch { return; }
      if (d.type === 'pong') return;

      if (d.type === 'new_message' && d.message) {
        const m = d.message;
        if (_renderedIds.has(m.messageId)) return;

        // This may be OUR OWN message arriving back over the socket before
        // the HTTP response for our own /send request has finished — in
        // that case a temp bubble is already on screen with a 'sending'
        // clock icon. Reconcile that existing bubble instead of adding a
        // second one (this is the fix for messages appearing twice).
        if (m.sender === 'customer' && m.senderId === _custId) {
          const pending = document.querySelector('.cw-row.me[data-temp-id]:not([data-msg-id])');
          if (pending) {
            pending.dataset.msgId = m.messageId;
            _renderedIds.add(m.messageId);
            const tick = pending.querySelector('.cw-tick');
            if (tick) tick.className = 'fas fa-check-double cw-tick delivered';
            return;
          }
        }

        _renderedIds.add(m.messageId);
        _addBubble(m);
        _hideTyping();
        if (!$('uyeh-cw-root').classList.contains('cw-open')) _setUnread(_unread + 1);
        if (m.messageId) _wsSend({ type: 'message_read', chatId: _chatId, messageIds: [m.messageId] });
      }
      if (d.type === 'typing') {
        $('uyeh-cw-typing-label').textContent = (d.agentName || 'Agent') + ' is typing…';
        $('uyeh-cw-typing').classList.add('show');
        clearTimeout(_typingTimer);
        _typingTimer = setTimeout(_hideTyping, 3000);
      }
      if (d.type === 'agent_joined' && d.agent) {
        const a = d.agent;
        const avi = $('uyeh-cw-avi');
        avi.src = a.avatarUrl ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(a.fullName||'Agent')}&background=0a0a0a&color=00ff88&size=80`;
        $('uyeh-cw-aname').textContent = a.fullName || 'Support Agent';
        _sysMsg((a.fullName || 'An agent') + ' has joined the chat 👋');
      }
      if (d.type === 'chat_ended' || d.type === 'chat_closed' || d.type === 'chat_resolved') {
        _status('Chat ended', 'offline');
        // The chat record itself is untouched server-side — it stays in
        // MongoDB permanently for the agent/admin to reference. We only
        // clear what belongs to the customer: their local cache and the
        // ability for "active chat" lookups to find this conversation again.
        ['uyeh_chatId','uyeh_customerId','uyeh_customerName','uyeh_customerEmail']
          .forEach(k => localStorage.removeItem(k));
        $('uyeh-cw-rating').classList.add('show');
      }
      if (d.type === 'message_reaction' && d.messageId) {
        const row = document.querySelector(`[data-msg-id="${d.messageId}"]`);
        if (row) _applyReaction(row, d.emoji);
      }
      if (d.type === 'message_deleted' && d.messageId) {
        const row = document.querySelector(`[data-msg-id="${d.messageId}"]`);
        if (row) { const b = row.querySelector('.cw-bubble'); if (b) b.textContent = '🗑 Message deleted'; }
      }
    };

    _socket.onclose = e => {
      clearInterval(_pingTimer);
      if (e.code === 1000) { _status('Disconnected', 'offline'); return; }
      _status('Reconnecting…', 'connecting');
      _banner('Connection lost — reconnecting…', 'warn');
      if (_reconnects < MAX_RECONNECTS && _chatId) {
        _reconnects++;
        setTimeout(_connectWS, Math.min(1000 * Math.pow(2, _reconnects), 30000));
      } else {
        _banner('Unable to reconnect. Please refresh.', 'err');
      }
    };

    _socket.onerror = () => _status('Error', 'offline');
  }

  function _hideTyping() {
    $('uyeh-cw-typing').classList.remove('show');
    clearTimeout(_typingTimer);
  }

  /* ── Reactions ── */
  function _applyReaction(row, emoji) {
    let bar = row.querySelector('.cw-reacts');
    if (!bar) { bar = document.createElement('div'); bar.className = 'cw-reacts'; row.querySelector('.cw-bubble-wrap').appendChild(bar); }
    let chip = bar.querySelector(`[data-emoji="${emoji}"]`);
    if (chip) {
      const n = parseInt(chip.dataset.count || '1') + 1;
      chip.dataset.count = n; chip.textContent = emoji + (n > 1 ? ` ${n}` : '');
    } else {
      chip = document.createElement('span'); chip.className = 'cw-react-chip';
      chip.dataset.emoji = emoji; chip.dataset.count = 1; chip.textContent = emoji;
      bar.appendChild(chip);
    }
  }

  /* ── Context menu ── */
  function _ctxOpen(e, row) {
    _ctxTarget = row;
    const ctx = $('uyeh-cw-ctx');
    $('uyeh-cw-ctx-del').style.display = row.classList.contains('me') ? 'flex' : 'none';
    ctx.classList.add('show');
    const x = e.clientX || e.pageX; const y = e.clientY || e.pageY;
    ctx.style.left = Math.min(x, window.innerWidth  - 180) + 'px';
    ctx.style.top  = Math.min(y, window.innerHeight - 160) + 'px';
  }

  /* ── File tray ── */
  function _showTray() {
    const tray = $('uyeh-cw-filetray');
    tray.innerHTML = '';
    if (!_pendingFiles.length) { tray.classList.remove('show'); return; }
    tray.classList.add('show');
    _pendingFiles.forEach((f, i) => {
      const chip = document.createElement('div'); chip.className = 'cw-fchip';
      const isImg = f.type.startsWith('image/');
      if (isImg) {
        const obj = URL.createObjectURL(f);
        chip.innerHTML = `<img src="${obj}" onload="URL.revokeObjectURL(this.src)">
          <span class="cw-fchip-name" title="${_esc(f.name)}">${_esc(f.name)}</span>
          <span class="cw-fchip-x" data-idx="${i}">&times;</span>`;
      } else {
        chip.innerHTML = `<i class="fas fa-file" style="color:var(--cw-g);font-size:.9rem;flex-shrink:0"></i>
          <span class="cw-fchip-name" title="${_esc(f.name)}">${_esc(f.name)}</span>
          <span class="cw-fchip-x" data-idx="${i}">&times;</span>`;
      }
      tray.appendChild(chip);
    });
  }

  async function _uploadFiles() {
    const form = new FormData();
    _pendingFiles.forEach(f => form.append('files', f));
    const r = await fetch(`${_CW_API}/api/chat/upload-file`, {
      method: 'POST',
      headers: _authHdr(),
      body: form
    });
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(d.message || 'Upload failed');
    return d.files || [];
  }

  function _openLb(url, type) {
    const img = $('uyeh-cw-lb-img'), pdf = $('uyeh-cw-lb-pdf'), dl = $('uyeh-cw-lb-download');
    if (type === 'pdf') {
      img.style.display = 'none';
      pdf.src = url; pdf.style.display = 'block';
    } else {
      pdf.style.display = 'none'; pdf.src = '';
      img.src = url; img.style.display = 'block';
    }
    dl.href = url; dl.style.display = 'inline-flex';
    $('uyeh-cw-lb').classList.add('show');
  }

  // File-type icon + label, guessed from the filename extension — the server
  // doesn't tell us the exact kind, only that it isn't an image.
  function _fileMeta(filename) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    const map = {
      pdf:  { icon: 'fa-file-pdf',       color: '#ef4444' },
      doc:  { icon: 'fa-file-word',      color: '#3b82f6' }, docx: { icon: 'fa-file-word', color: '#3b82f6' },
      xls:  { icon: 'fa-file-excel',     color: '#22c55e' }, xlsx: { icon: 'fa-file-excel', color: '#22c55e' },
      ppt:  { icon: 'fa-file-powerpoint', color: '#f97316' }, pptx: { icon: 'fa-file-powerpoint', color: '#f97316' },
      zip:  { icon: 'fa-file-zipper',    color: '#a855f7' }, rar: { icon: 'fa-file-zipper', color: '#a855f7' },
      mp3:  { icon: 'fa-file-audio',     color: '#eab308' }, wav: { icon: 'fa-file-audio', color: '#eab308' },
      mp4:  { icon: 'fa-file-video',     color: '#ec4899' }, mov: { icon: 'fa-file-video', color: '#ec4899' },
      txt:  { icon: 'fa-file-lines',     color: '#9ca3af' },
    };
    return { ext, ...(map[ext] || { icon: 'fa-file', color: 'var(--cw-g)' }) };
  }

  function _fmtBytes(bytes) {
    if (!bytes || isNaN(bytes)) return '';
    const units = ['B','KB','MB','GB'];
    let i = 0, n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)}${units[i]}`;
  }

  /* ── Reset to welcome ── */
  function _resetToWelcome() {
    _clearSession();
    _showWelcome();
    _setupWelcomeForm();
    $('uyeh-cw-msgs').innerHTML = '';
    $('uyeh-cw-rating').classList.remove('show');
  }

  /* ── Welcome form population ── */
  function _setupWelcomeForm() {
    const u = _getUser();
    if (u) {
      _isGuest = false;
      const name  = u.fullName || u.name || '';
      const email = u.email || '';
      _custName  = name;
      _custEmail = email;
      $('uyeh-cw-authstrip').style.display = 'flex';
      $('uyeh-cw-authname').textContent    = name;
      $('uyeh-cw-authemail').textContent   = email;
      const avi = $('uyeh-cw-authavi');
      if (u.avatarUrl) avi.innerHTML = `<img src="${_esc(u.avatarUrl)}" alt="avatar">`;
      else             avi.textContent = name[0]?.toUpperCase() || 'U';
      $('uyeh-cw-guestfields').style.display = 'none';
    } else {
      _isGuest = true;
      $('uyeh-cw-authstrip').style.display   = 'none';
      $('uyeh-cw-guestfields').style.display = 'block';
      // Try JWT prefill for partially-logged-in states
      try {
        const t = _tok();
        if (t) {
          const p = JSON.parse(atob(t.split('.')[1]));
          if (p.name || p.fullName) $('uyeh-cw-fName').value  = p.name || p.fullName || '';
          if (p.email)              $('uyeh-cw-fEmail').value = p.email;
        }
      } catch (_) {}
    }
  }

  /* ═══════════════════════════════════════════════════════════
     STEP 6 — EVENT BINDINGS (all inline onclick replaced with JS)
     ═══════════════════════════════════════════════════════════ */
  function _bindEvents() {

    /* Toggle button */
    $('uyeh-cw-btn').addEventListener('click', () => {
      const root = $('uyeh-cw-root');
      const open = root.classList.toggle('cw-open');
      if (open && _chatId) {
        _setUnread(0);
        setTimeout(() => $('uyeh-cw-input')?.focus(), 300);
      }
    });

    /* Header minimise */
    $('uyeh-cw-minbtn').addEventListener('click', () => {
      $('uyeh-cw-root').classList.remove('cw-open');
    });

    /* Header close / end chat */
    $('uyeh-cw-closebtn').addEventListener('click', () => {
      if (_chatId) {
        if (!confirm('End this chat session?')) return;
        _endChat();
      } else {
        $('uyeh-cw-root').classList.remove('cw-open');
      }
    });

    /* Start chat button */
    $('uyeh-cw-startbtn').addEventListener('click', _startChat);

    /* Enter in subject / name / email fires startChat */
    ['uyeh-cw-fSubject','uyeh-cw-fName','uyeh-cw-fEmail'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); _startChat(); } });
    });

    /* Send button */
    $('uyeh-cw-sendbtn').addEventListener('click', _sendMessage);

    /* Textarea — auto-resize + Enter to send */
    $('uyeh-cw-input').addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 110) + 'px';
    });
    $('uyeh-cw-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendMessage(); }
    });

    /* Attach button + file input */
    $('uyeh-cw-attachbtn').addEventListener('click', () => $('uyeh-cw-fileinput').click());
    $('uyeh-cw-fileinput').addEventListener('change', e => {
      Array.from(e.target.files).forEach(f => _pendingFiles.push(f));
      _showTray();
      e.target.value = '';
    });

    /* File tray — remove chip */
    $('uyeh-cw-filetray').addEventListener('click', e => {
      const x = e.target.closest('.cw-fchip-x');
      if (x) { _pendingFiles.splice(parseInt(x.dataset.idx), 1); _showTray(); }
    });

    /* Reply bar close */
    $('uyeh-cw-rb-close').addEventListener('click', () => {
      _replyTo = null;
      $('uyeh-cw-replybar').classList.remove('show');
    });

    /* Lightbox close */
    $('uyeh-cw-lb').addEventListener('click', e => { if (e.target === $('uyeh-cw-lb') || e.target === $('uyeh-cw-lb-close') || $('uyeh-cw-lb-close').contains(e.target)) $('uyeh-cw-lb').classList.remove('show'); });

    /* Context menu actions */
    $('uyeh-cw-ctx-reply').addEventListener('click', () => {
      $('uyeh-cw-ctx').classList.remove('show');
      if (!_ctxTarget) return;
      const msgId = _ctxTarget.dataset.msgId;
      const sn    = _ctxTarget.querySelector('.cw-sender')?.textContent || (_ctxTarget.classList.contains('me') ? _custName : 'Agent');
      const txt   = _ctxTarget.querySelector('.cw-bubble p')?.textContent || '';
      _replyTo = { messageId: msgId, senderName: sn, preview: txt.slice(0, 80) };
      $('uyeh-cw-rbname').textContent = sn;
      $('uyeh-cw-rbtext').textContent = txt.slice(0, 80);
      $('uyeh-cw-replybar').classList.add('show');
      $('uyeh-cw-input').focus();
    });

    $('uyeh-cw-ctx-copy').addEventListener('click', () => {
      $('uyeh-cw-ctx').classList.remove('show');
      const txt = _ctxTarget?.querySelector('.cw-bubble p')?.textContent || '';
      navigator.clipboard.writeText(txt).then(() => _toast('Copied', 'ok'));
    });

    $('uyeh-cw-ctx-react').addEventListener('click', () => {
      const ctx = $('uyeh-cw-ctx'); ctx.classList.remove('show');
      const ep  = $('uyeh-cw-emoji'); ep.classList.add('show');
      const r   = ctx.getBoundingClientRect();
      ep.style.left = r.left + 'px';
      ep.style.top  = (r.top - 54) + 'px';
    });

    $('uyeh-cw-ctx-del').addEventListener('click', () => {
      $('uyeh-cw-ctx').classList.remove('show');
      if (!_ctxTarget) return;
      const msgId = _ctxTarget.dataset.msgId; if (!msgId) return;
      _wsSend({ type: 'delete_message', chatId: _chatId, messageId: msgId });
      const b = _ctxTarget.querySelector('.cw-bubble');
      if (b) b.textContent = '🗑 Message deleted';
    });

    /* Emoji quick picker */
    $('uyeh-cw-emoji').addEventListener('click', e => {
      const btn = e.target.closest('button[data-emoji]');
      if (!btn) return;
      const emoji = btn.dataset.emoji;
      $('uyeh-cw-emoji').classList.remove('show');
      $('uyeh-cw-ctx').classList.remove('show');
      if (!_ctxTarget || !_chatId) return;
      const msgId = _ctxTarget.dataset.msgId; if (!msgId) return;
      _wsSend({ type: 'react', chatId: _chatId, messageId: msgId, emoji });
      _applyReaction(_ctxTarget, emoji);
    });

    /* Rating stars */
    $('uyeh-cw-stars').addEventListener('click', e => {
      const btn = e.target.closest('button[data-v]');
      if (!btn) return;
      _starVal = parseInt(btn.dataset.v);
      $('uyeh-cw-stars').querySelectorAll('button').forEach((b, i) => {
        b.classList.toggle('cw-active', i < _starVal);
      });
    });

    $('uyeh-cw-rating-submit').addEventListener('click', _submitRating);
    $('uyeh-cw-rating-skip').addEventListener('click',   _skipRating);

    /* Close context / emoji on outside click */
    document.addEventListener('click', e => {
      if (!$('uyeh-cw-ctx').contains(e.target))   $('uyeh-cw-ctx').classList.remove('show');
      if (!$('uyeh-cw-emoji').contains(e.target)) $('uyeh-cw-emoji').classList.remove('show');
    });
  }

  /* ═══════════════════════════════════════════════════════════
     STEP 7 — CORE ACTIONS
     ═══════════════════════════════════════════════════════════ */
  async function _startChat() {
    const subject = $('uyeh-cw-fSubject').value.trim();
    if (!subject) return _toast('Please describe what you need help with.', 'warn');

    let name  = _custName;
    let email = _custEmail;

    if (_isGuest) {
      name  = $('uyeh-cw-fName').value.trim();
      email = $('uyeh-cw-fEmail').value.trim();
      if (!name || !email) return _toast('Please fill in all required fields.', 'warn');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return _toast('Please enter a valid email.', 'err');
    }

    const btn = $('uyeh-cw-startbtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting…';

    try {
      const r = await fetch(`${_CW_API}/api/chat/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ..._authHdr() },
        body: JSON.stringify({ customerName: name, customerEmail: email, subject, department: 'General', priority: 'medium' })
      });
      const d = await r.json();
      if (d.success && d.chat) {
        _chatId    = d.chat.chatId;
        _custId    = d.chat.customerId;
        _custName  = name;
        _custEmail = email;
        _saveSession();
        _showPanel();
        _connectWS();
        _sysMsg('Connected! An agent will join you shortly. 👋');
        setTimeout(() => $('uyeh-cw-input')?.focus(), 300);
      } else {
        _toast(d.message || 'Failed to start chat.', 'err');
      }
    } catch (_) {
      _toast('Network error — please check your connection.', 'err');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-comment-dots"></i> Start Chat';
    }
  }

  async function _sendMessage() {
    const input    = $('uyeh-cw-input');
    const text     = input.value.trim();
    const hasFiles = _pendingFiles.length > 0;
    if (!_chatId || (!text && !hasFiles)) return;

    const sendBtn = $('uyeh-cw-sendbtn');
    sendBtn.disabled = true;

    // Upload files first
    let uploaded = [];
    if (hasFiles) {
      try { uploaded = await _uploadFiles(); }
      catch (e) { _toast('Upload failed: ' + e.message, 'err'); sendBtn.disabled = false; return; }
      _pendingFiles = [];
      _showTray();
    }

    // Optimistic bubble
    const tempId  = 'temp-' + Date.now();
    const tempEl  = _addBubble({
      _tempId:     tempId,
      sender:      'customer',
      senderId:    _custId,
      senderName:  _custName,
      message:     text,
      timestamp:   new Date(),
      attachments: uploaded,
      replyTo:     _replyTo ? { ..._replyTo } : null,
      _status:     'sending',
    });

    input.value = '';
    input.style.height = 'auto';
    _replyTo = null;
    $('uyeh-cw-replybar').classList.remove('show');

    try {
      const r = await fetch(`${_CW_API}/api/chat/${_chatId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ..._authHdr() },
        body: JSON.stringify({
          sender:      'customer',
          senderId:    _custId,
          senderName:  _custName || 'Customer',
          message:     text,
          attachments: uploaded,
          messageType: uploaded.length ? 'file' : 'text',
          replyTo:     _replyTo || null,
        })
      });
      const d = await r.json();
      if (r.ok && d.success) {
        const realId = d.messageData?.messageId || d.messageId;
        if (realId) { _renderedIds.add(realId); _tempMap.set(tempId, realId); }
        const tick = tempEl?.querySelector('.cw-tick');
        if (tick) tick.className = 'fas fa-check-double cw-tick delivered';
        _wsSend({ type: 'message_delivered', chatId: _chatId, messageIds: realId ? [realId] : [] });
      } else {
        throw new Error(d.message || 'Send failed');
      }
    } catch (err) {
      _toast('Failed to send — please try again.', 'err');
      const tick = tempEl?.querySelector('.cw-tick');
      if (tick) { tick.className = 'fas fa-exclamation-circle cw-tick'; tick.style.color = 'var(--cw-danger)'; }
      if (text) input.value = text;
    } finally {
      sendBtn.disabled = false;
    }
  }

  async function _endChat() {
    try {
      await fetch(`${_CW_API}/api/chat/${_chatId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ..._authHdr() },
        body: '{}'
      });
    } catch (_) {
        }
    _resetToWelcome();
    $('uyeh-cw-rating').classList.add('show');
  }

  async function _submitRating() {
    if (!_starVal) return _toast('Please select a star rating.', 'warn');
    const comment = $('uyeh-cw-rating-comment').value.trim();
    try {
      await fetch(`${_CW_API}/api/chat/${_chatId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: _starVal, comment, customerEmail: _custEmail || '' })
      });
    } catch (_) {}
    $('uyeh-cw-rating').classList.remove('show');
    _sysMsg('Thank you for your feedback! 🙏');
    _resetToWelcome();
  }

  function _skipRating() {
    $('uyeh-cw-rating').classList.remove('show');
    _resetToWelcome();
  }

  /* ═══════════════════════════════════════════════════════════
     STEP 8 — BOOT
     ═══════════════════════════════════════════════════════════ */
  function _boot() {
    _bindEvents();

    const loggedInUser = _getUser();

    if (loggedInUser) {
      // ── Account-bound restore — works across every device ──────────────
      // Server is the source of truth. We don't trust localStorage here,
      // because the user may be opening this chat on a brand-new device
      // that has never had a chatId saved locally.
      _restoreAccountChat();
    } else {
      // ── Guest restore — device-bound via localStorage only ─────────────
      // A guest has no account for the chat to "belong" to, so the chat
      // can only follow the browser it was started in. This is correct
      // and unchanged behaviour.
      _chatId    = localStorage.getItem('uyeh_chatId');
      _custId    = localStorage.getItem('uyeh_customerId');
      _custName  = localStorage.getItem('uyeh_customerName');
      _custEmail = localStorage.getItem('uyeh_customerEmail');

      if (_chatId && _custId) {
        _restoreGuestChat();
      } else {
        _showWelcome();
        _setupWelcomeForm();
      }
    }
  }

  /* ── Account-bound restore (logged-in users) ──────────────────────────── */
  function _restoreAccountChat() {
    fetch(`${_CW_API}/api/chat/my-active`, { headers: _authHdr() })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.chat) {
          // Found an active chat tied to this account — could be from
          // this device or any other device the user has used.
          _chatId    = d.chat.chatId;
          _custId    = d.chat.customerId;
          _custName  = d.chat.customerName;
          _custEmail = d.chat.customerEmail;
          _saveSession(); // cache locally too, for fast-path on next load
          _showPanel();
          _renderAll(d.chat.messages || []);
          if (d.chat.assignedAgent) {
            const a = d.chat.assignedAgent;
            $('uyeh-cw-aname').textContent = a.fullName || 'Support Agent';
            $('uyeh-cw-avi').src = a.avatarUrl ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(a.fullName||'Agent')}&background=0a0a0a&color=00ff88&size=80`;
          }
          _connectWS();
        } else {
          // No active chat on this account anywhere — fresh welcome form.
          // Also clear any stale local cache from a previous (now-deleted) chat.
          _clearSession();
          _showWelcome();
          _setupWelcomeForm();
        }
      })
      .catch(() => {
        // Network error — fall back to local cache if we have one, so the
        // user isn't dropped into a blank form just because of a blip.
        const cachedId = localStorage.getItem('uyeh_chatId');
        if (cachedId) {
          _chatId    = cachedId;
          _custId    = localStorage.getItem('uyeh_customerId');
          _custName  = localStorage.getItem('uyeh_customerName');
          _custEmail = localStorage.getItem('uyeh_customerEmail');
          _showPanel();
          _banner('Reconnecting to your chat…', 'warn');
          setTimeout(_boot, 5000);
        } else {
          _showWelcome();
          _setupWelcomeForm();
        }
      });
  }

  /* ── Guest restore (device-bound, localStorage only) ──────────────────── */
  function _restoreGuestChat() {
    fetch(`${_CW_API}/api/chat/${_chatId}`, { headers: _authHdr() })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.chat && !['closed','resolved'].includes(d.chat.status)) {
          _showPanel();
          _renderAll(d.chat.messages || []);
          if (d.chat.assignedAgent) {
            const a = d.chat.assignedAgent;
            $('uyeh-cw-aname').textContent = a.fullName || 'Support Agent';
            $('uyeh-cw-avi').src = a.avatarUrl ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(a.fullName||'Agent')}&background=0a0a0a&color=00ff88&size=80`;
          }
          _connectWS();
        } else {
          if (d.success === false && !d.message?.includes('not found')) {
            _showPanel();
          } else {
            // Chat was closed/resolved (and now auto-deleted server-side) — fresh start
            _clearSession();
            _showWelcome();
            _setupWelcomeForm();
          }
        }
      })
      .catch(() => {
        _showPanel();
        _banner('Reconnecting to your chat…', 'warn');
        setTimeout(_boot, 5000);
      });
  }

  // Boot when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }

  // Expose minimal public API (for any page that needs to call CW.xxx directly)
  window.CW = { openLb: _openLb };

})();