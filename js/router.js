// BAILS — HASH ROUTER  (v20: navigation history + universal back button)
const Router = (() => {
  const routes = {};
  const _stack = [];   // breadcrumb history for the back button

  // Pages at the "tab" level — navigating to one of these clears the stack
  const ROOT_PATHS = new Set(['/', '/dashboard', '/search', '/my-matches',
                               '/tournaments', '/profile', '/login']);

  function _updateBackBar() {
    const bar   = document.getElementById('global-back-bar');
    const label = document.getElementById('global-back-label');
    if (!bar) return;
    if (_stack.length > 0) {
      bar.classList.add('visible');
      // Make the label descriptive based on what the previous path was
      const prev = _stack[_stack.length - 1];
      const friendly = prev === '/dashboard'     ? 'Dashboard'
                     : prev === '/tournaments'   ? 'Tournaments'
                     : prev === '/my-matches'    ? 'My Matches'
                     : prev === '/search'        ? 'Search'
                     : prev.startsWith('/tournament/') ? 'Tournament'
                     : prev.startsWith('/match/')      ? 'Match'
                     : prev.startsWith('/team/')       ? 'Team'
                     : 'Back';
      if (label) label.textContent = friendly;
    } else {
      bar.classList.remove('visible');
    }
  }

  function navigate(path) {
    const clean   = path.startsWith('#') ? path.slice(1) : path;
    const current = getCurrentPath();

    if (ROOT_PATHS.has(clean)) {
      // Going to a root tab — clear the breadcrumb trail
      _stack.length = 0;
    } else if (current && current !== clean) {
      // Navigating deeper — push current location onto stack
      _stack.push(current);
      if (_stack.length > 30) _stack.shift(); // cap
    }

    window.location.hash = clean;
    // _updateBackBar is also called in dispatch() after every hash change
  }

  function back() {
    if (_stack.length) {
      const prev = _stack.pop();
      _updateBackBar();
      window.location.hash = prev;
    } else {
      history.back();
    }
  }

  function canGoBack() { return _stack.length > 0; }

  function getCurrentPath() {
    return window.location.hash.replace(/^#/, '') || '/';
  }

  function dispatch() {
    const raw   = getCurrentPath();
    const parts = raw.split('/').filter(Boolean);
    const handler = routes[raw] || findDynamic(raw, parts);

    _updateBackBar();

    if (handler) {
      handler(raw, parts);
    } else if (routes['/']) {
      routes['/']('/', []);
    } else {
      const el = document.getElementById('page-root');
      if (el) el.innerHTML = '<p style="padding:40px;text-align:center;color:var(--muted)">Page not found.</p>';
    }
  }

  function findDynamic(raw, parts) {
    for (const [pattern, handler] of Object.entries(routes)) {
      const pParts = pattern.split('/').filter(Boolean);
      if (pParts.length !== parts.length) continue;
      const params = {}; let match = true;
      for (let i = 0; i < pParts.length; i++) {
        if (pParts[i].startsWith(':')) {
          try { params[pParts[i].slice(1)] = decodeURIComponent(parts[i]); }
          catch (_) { params[pParts[i].slice(1)] = parts[i]; }
        }
        else if (pParts[i] !== parts[i]) { match = false; break; }
      }
      if (match) return (path, p) => handler(path, p, params);
    }
    return null;
  }

  function register(path, handler) { routes[path] = handler; }

  function init() {
    window.addEventListener('hashchange', dispatch);
    dispatch();
  }

  return { register, navigate, getCurrentPath, dispatch, init, back, canGoBack };
})();
