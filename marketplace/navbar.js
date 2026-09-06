(function () {
  'use strict';

  /* ═══════════════════════════════════════════
     PART 1: Mobile menu + dropdown toggles
     ═══════════════════════════════════════════ */
  var menuToggle = document.getElementById('menuToggle');
  var navLinks   = document.getElementById('navLinks');
  var dropItems  = document.querySelectorAll('.nav-item--dropdown');

  function closeAllDropdowns() {
    dropItems.forEach(function (item) {
      item.classList.remove('open');
      var btn = item.querySelector('.nav-link--dropdown');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function toggleDropdown(item) {
    var isOpen = item.classList.contains('open');
    var btn    = item.querySelector('.nav-link--dropdown');
    closeAllDropdowns();
    if (!isOpen) {
      item.classList.add('open');
      if (btn) btn.setAttribute('aria-expanded', 'true');
    }
  }

  dropItems.forEach(function (item) {
    var btn = item.querySelector('.nav-link--dropdown');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleDropdown(item);
    });
  });

  document.addEventListener('click', function (e) {
    var insideNav = navLinks && navLinks.contains(e.target);
    if (!insideNav) closeAllDropdowns();

    if (navLinks && menuToggle) {
      if (!navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
        menuToggle.classList.remove('active');
        navLinks.classList.remove('active');
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeAllDropdowns();
      if (menuToggle) menuToggle.classList.remove('active');
      if (navLinks)   navLinks.classList.remove('active');
    }
  });

  document.querySelectorAll('.nav-dropdown__item').forEach(function (link) {
    link.addEventListener('click', function () {
      closeAllDropdowns();
      if (menuToggle) menuToggle.classList.remove('active');
      if (navLinks)   navLinks.classList.remove('active');
    });
  });

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      this.classList.toggle('active');
      navLinks.classList.toggle('active');
      if (!navLinks.classList.contains('active')) closeAllDropdowns();
    });
  }

  document.querySelectorAll('.nav-links .nav-link:not(.nav-link--dropdown)').forEach(function (link) {
    link.addEventListener('click', function () {
      if (menuToggle) menuToggle.classList.remove('active');
      if (navLinks)   navLinks.classList.remove('active');
      closeAllDropdowns();
    });
  });

  /* ═══════════════════════════════════════════
     PART 2: Auth state — guest buttons vs user dropdown

     currentUser lives on `window` — a real global, not scoped to this
     IIFE — so every page can read `window.currentUser` directly instead
     of each page maintaining its own separate copy that never gets set.
     This is the fix for two bugs: pages whose own currentUser never got
     assigned (login redirect loops), and this function's name previously
     being declared again by page-level scripts and silently overwriting
     one or the other depending on script load order.
     ═══════════════════════════════════════════ */
  var API_URL = window.API_URL || 'https://uyehtechbackend.onrender.com';
  window.currentUser = window.currentUser || null;

  function checkAuthentication() {
    var token = localStorage.getItem('token');
    var user  = localStorage.getItem('user');
    if (!token || !user) { showGuestButtons(); _announceAuthReady(); return; }

    try {
      window.currentUser = JSON.parse(user);
      showUserDropdown(window.currentUser);
      _announceAuthReady();

      // Background validation — route is /api/profile (no "/user" segment).
      fetch(API_URL + '/api/profile', {
        headers: { 'Authorization': 'Bearer ' + token }
      })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.currentUser = null;
          showGuestButtons();
          return null;
        }
        // Any other non-OK status (404, 500, rate limit, offline) is a
        // server-side problem, not proof the token is bad. Don't log out.
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (data && data.success && data.user) {
          window.currentUser = data.user;
          localStorage.setItem('user', JSON.stringify(data.user));
          showUserDropdown(data.user);
        }
      })
      .catch(function () {}); // network error — keep showing cached state
    } catch (e) {
      // Stored 'user' was corrupted/unparseable — self-heal instead of
      // getting silently stuck showing "guest" forever on every future load.
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.currentUser = null;
      showGuestButtons();
      _announceAuthReady();
    }
  }

  // Lets any page know the initial auth check has resolved, without having
  // to guess script load order or duplicate this logic themselves.
  function _announceAuthReady() {
    window.dispatchEvent(new CustomEvent('uyeh-auth-ready', { detail: window.currentUser }));
  }

  function showUserDropdown(user) {
    var guestEl = document.getElementById('guestButtons');
    var userEl  = document.getElementById('userDropdown');
    if (!guestEl || !userEl) return; // page has no auth widget — skip silently

    guestEl.style.display = 'none';
    userEl.style.display  = 'block';

    var name   = user.name || user.fullName || 'User';
    var email  = user.email || '';
    var avatar = user.profilePic || user.profileImage || user.avatar ||
      ('https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=00ff88&color=0a0a0a');

    function set(id, val, attr) {
      var el = document.getElementById(id);
      if (!el) return;
      if (attr) { el[attr] = val; } else { el.textContent = val; }
    }
    set('userAvatar', avatar, 'src');
    set('userName', name.split(' ')[0]);
    set('menuAvatar', avatar, 'src');
    set('menuUserName', name);
    set('menuUserEmail', email);
  }

  function showGuestButtons() {
    var guestEl = document.getElementById('guestButtons');
    var userEl  = document.getElementById('userDropdown');
    if (!guestEl || !userEl) return;
    guestEl.style.display = 'flex';
    userEl.style.display  = 'none';
  }

  function toggleUserMenu() {
    var menu = document.getElementById('userMenu');
    var drop = document.getElementById('userDropdown');
    if (menu) menu.classList.toggle('active');
    if (drop) drop.classList.toggle('active');
  }

  function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.currentUser = null;
      showGuestButtons();
      if (typeof showNotification === 'function') {
        showNotification('👋 Logged out successfully');
      }
      setTimeout(function () { window.location.reload(); }, 1000);
    }
  }

  // Close the user menu when clicking outside it
  document.addEventListener('click', function (e) {
    var dropdown = document.getElementById('userDropdown');
    if (dropdown && !dropdown.contains(e.target)) {
      var menu = document.getElementById('userMenu');
      if (menu) menu.classList.remove('active');
      dropdown.classList.remove('active');
    }
  });

  // Expose functions the navbar's inline onclick="" handlers call
  window.toggleUserMenu      = toggleUserMenu;
  window.handleLogout        = handleLogout;
  window.checkAuthentication = checkAuthentication;

  // Run auth check automatically — no per-page call needed
  checkAuthentication();

}());