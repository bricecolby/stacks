/*
 * Stacks demo runtime: a small, standalone renderer for the mockup pages
 * exported from the design canvas (*.dc.html). It supports what the pages use:
 *   - <helmet> contents moved into <head>
 *   - {{ path }} holes in text and attributes (dotted lookups and literals)
 *   - <sc-if value="{{ x }}"> and <sc-for list="{{ xs }}" as="x"> ($index in scope)
 *   - onClick / onChange / onInput / ... handlers returned from renderVals()
 *   - class Component extends DCLogic { renderVals() } with state / setState
 *   - data-props defaults ("tweaks"), overridable from the URL: ?variant=drafted
 * It is a demo shim, not a framework: every setState re-renders the page.
 */
(function () {
  'use strict';

  var BOOL_ATTRS = { checked: 1, disabled: 1, selected: 1, open: 1, hidden: 1, readonly: 1, required: 1, multiple: 1, autofocus: 1 };
  var PROP_ATTRS = { value: 1, checked: 1, selected: 1, indeterminate: 1 };
  var HOLE = /\{\{\s*([^{}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/;

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (partial, cb) {
    var next = typeof partial === 'function' ? partial(this.state, this.props) : partial;
    var prev = this.state;
    this.state = Object.assign({}, this.state, next || {});
    schedule(this, prev, cb);
  };
  DCLogic.prototype.forceUpdate = function (cb) { schedule(this, this.state, cb); };
  DCLogic.prototype.renderVals = function () { return {}; };
  window.DCLogic = DCLogic;

  function lookup(expr, scope) {
    expr = expr.trim();
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null') return null;
    if (expr === 'undefined') return undefined;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
    var q = expr.match(/^(['"])(.*)\1$/);
    if (q) return q[2];
    var parts = expr.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }

  function interpolate(str, scope) {
    return str.replace(HOLE, function (_, e) {
      var v = lookup(e, scope);
      return v == null || v === false ? '' : String(v);
    });
  }

  function eventName(attr, el) {
    var ev = attr.slice(2).toLowerCase();
    if (ev === 'change') {
      var tag = el.localName;
      var type = (el.getAttribute('type') || '').toLowerCase();
      // React's onChange fires on every keystroke for text fields
      if ((tag === 'input' && type !== 'checkbox' && type !== 'radio' && type !== 'file') || tag === 'textarea') return 'input';
    }
    if (ev === 'doubleclick') return 'dblclick';
    return ev;
  }

  function renderNodes(nodes, scope, out) {
    for (var i = 0; i < nodes.length; i++) renderNode(nodes[i], scope, out);
  }

  function renderNode(node, scope, out) {
    if (node.nodeType === 3) {
      out.appendChild(document.createTextNode(interpolate(node.nodeValue, scope)));
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.localName;

    if (tag === 'sc-if') {
      if (lookup(holeOf(node.getAttribute('value')), scope)) renderNodes(childrenOf(node), scope, out);
      return;
    }
    if (tag === 'sc-for') {
      var list = lookup(holeOf(node.getAttribute('list')), scope) || [];
      var as = node.getAttribute('as') || 'item';
      var kids = childrenOf(node);
      for (var j = 0; j < list.length; j++) {
        var inner = Object.create(scope);
        inner[as] = list[j];
        inner.$index = j;
        renderNodes(kids, inner, out);
      }
      return;
    }
    if (tag === 'helmet' || tag === 'dc-import') return;

    var el = node.namespaceURI && node.namespaceURI !== 'http://www.w3.org/1999/xhtml'
      ? document.createElementNS(node.namespaceURI, node.localName)
      : document.createElement(tag);

    var attrs = node.attributes;
    var props = [];
    for (var a = 0; a < attrs.length; a++) {
      var name = attrs[a].name;
      var raw = attrs[a].value;
      if (name.indexOf('hint-') === 0) continue;
      var whole = raw.match(WHOLE);
      if (/^on[a-z]/.test(name)) {
        var fn = whole ? lookup(whole[1], scope) : null;
        if (typeof fn === 'function') {
          (function (f, ev) {
            el.addEventListener(ev, function (e) {
              if (ev === 'submit') e.preventDefault();
              f(e);
            });
          })(fn, eventName(name, node));
        }
        continue;
      }
      var val = whole ? lookup(whole[1], scope) : interpolate(raw, scope);
      if (BOOL_ATTRS[name]) {
        var on = whole ? !!val && val !== 'false' : true;
        if (on) el.setAttribute(name, '');
        if (PROP_ATTRS[name]) props.push([name, on]);
        continue;
      }
      if (val == null || val === false) continue;
      if (typeof val === 'object' || typeof val === 'function') continue;
      if (attrs[a].namespaceURI) el.setAttributeNS(attrs[a].namespaceURI, name, String(val));
      else el.setAttribute(name, String(val));
      if (PROP_ATTRS[name]) props.push([name, val]);
    }

    var src = tag === 'template' ? node.content.childNodes : node.childNodes;
    renderNodes(src, scope, tag === 'template' ? el.content : el);
    if (tag === 'textarea' && el.textContent) props.push(['value', el.textContent]);
    for (var p = 0; p < props.length; p++) el[props[p][0]] = props[p][1];
    out.appendChild(el);
  }

  function holeOf(v) {
    if (v == null) return 'undefined';
    var m = v.match(WHOLE);
    return m ? m[1] : JSON.stringify(v);
  }
  function childrenOf(node) {
    return node.localName === 'template' ? node.content.childNodes : node.childNodes;
  }

  // ---- focus preservation across re-renders --------------------------------
  function pathTo(el, root) {
    var path = [];
    while (el && el !== root) {
      var parent = el.parentNode;
      if (!parent) return null;
      path.unshift(Array.prototype.indexOf.call(parent.childNodes, el));
      el = parent;
    }
    return el === root ? path : null;
  }
  function follow(path, root) {
    var el = root;
    for (var i = 0; i < path.length && el; i++) el = el.childNodes[path[i]];
    return el;
  }

  // ---- mounting ------------------------------------------------------------
  var mount, template, instance, pending = false, callbacks = [], prevState = null;

  function schedule(inst, prev, cb) {
    if (cb) callbacks.push(cb);
    if (prevState === null) prevState = prev;
    if (pending) return;
    pending = true;
    Promise.resolve().then(function () {
      pending = false;
      var ps = prevState; prevState = null;
      draw();
      if (typeof inst.componentDidUpdate === 'function') inst.componentDidUpdate(inst.props, ps);
      var cbs = callbacks; callbacks = [];
      cbs.forEach(function (f) { f(); });
    });
  }

  function draw() {
    var active = document.activeElement;
    var fpath = active && mount.contains(active) ? pathTo(active, mount) : null;
    var sel = null;
    try { if (fpath && active.selectionStart != null) sel = [active.selectionStart, active.selectionEnd]; } catch (e) {}
    var openDetails = [];
    mount.querySelectorAll('details[open]').forEach(function (d) { openDetails.push(pathTo(d, mount)); });

    var vals = instance.renderVals() || {};
    var frag = document.createDocumentFragment();
    renderNodes(template, vals, frag);
    mount.textContent = '';
    mount.appendChild(frag);

    openDetails.forEach(function (p) { var d = p && follow(p, mount); if (d && d.localName === 'details') d.open = true; });
    try { enhanceNav(); } catch (e) { console.error('[stacks demo] mobile menu failed', e); }
    if (fpath) {
      var target = follow(fpath, mount);
      if (target && target.focus) {
        target.focus({ preventScroll: true });
        try { if (sel) target.setSelectionRange(sel[0], sel[1]); } catch (e) {}
      }
    }
  }

  function readProps(script) {
    var props = {};
    var decl = {};
    try { decl = JSON.parse(script.getAttribute('data-props') || '{}'); } catch (e) {}
    Object.keys(decl).forEach(function (k) {
      if (k.charAt(0) === '$') return;
      if (decl[k] && 'default' in decl[k]) props[k] = decl[k]['default'];
    });
    var q = new URLSearchParams(location.search);
    q.forEach(function (v, k) {
      try { props[k] = JSON.parse(v); } catch (e) { props[k] = v; }
    });
    return props;
  }

  function start() {
    var host = document.querySelector('x-dc');
    if (!host) return;
    var helmet = host.querySelector('helmet');
    if (helmet) {
      Array.prototype.slice.call(helmet.childNodes).forEach(function (n) {
        if (n.nodeType === 1) document.head.appendChild(n);
      });
    }
    template = Array.prototype.slice.call(host.childNodes).filter(function (n) { return n !== helmet; });
    host.remove();

    var script = document.querySelector('script[data-dc-script]');
    var Comp = DCLogic;
    if (script) {
      try {
        Comp = new Function('DCLogic', script.textContent + '\n;return typeof Component !== "undefined" ? Component : DCLogic;')(DCLogic);
      } catch (e) { console.error('[stacks demo] component script failed', e); }
    }
    instance = new Comp(readProps(script || document.createElement('script')));
    if (!instance.state) instance.state = {};

    mount = document.createElement('div');
    mount.setAttribute('data-dc-root', '');
    (script ? script.parentNode : document.body).insertBefore(mount, script || null);
    draw();
    if (typeof instance.componentDidMount === 'function') instance.componentDidMount();
  }

  // ---- phone header: the card-catalog cabinet ------------------------------
  // Below 720px the drawer row collapses into a small filing-cabinet button
  // (its three drawer fronts double as the hamburger lines). It opens an
  // overlay of tabbed file folders, one per drawer, built from the page's own
  // <nav aria-label="Main">, so every screen gets it without markup changes.
  var CAB_CSS = [
    '.stk-cab{display:none;width:44px;height:44px;box-sizing:border-box;align-items:center;justify-content:center;background:#FFFDF9;border:1px solid #CFC9BD;border-radius:4px;box-shadow:0 1px 0 #E5E0D6;color:#1E1C19;cursor:pointer;padding:0;flex:none}',
    '.stk-cab svg .mid{transition:transform 160ms ease}',
    '.stk-cab[aria-expanded="true"] svg .mid{transform:translateY(1.5px) scale(1.06);transform-origin:12px 12px}',
    '.stk-askshort{display:none}',
    '@media (max-width:719px){',
    '  header nav[aria-label="Main"]{display:none !important}',
    '  .stk-cab{display:inline-flex}',
    '  header .stk-hide-m{display:none !important}',
    '  header .stk-right{margin-left:auto;gap:8px !important}',
    '}',
    '@media (max-width:400px){header .stk-asklabel{display:none}header .stk-askshort{display:inline}}',
    '.stk-ov{position:fixed;inset:0;z-index:1000;background:#F5F2EC;overflow-y:auto;-webkit-overflow-scrolling:touch;font-family:"Public Sans",system-ui,sans-serif;color:#1E1C19}',
    '.stk-ov[hidden]{display:none}',
    '.stk-ov-in{max-width:560px;margin:0 auto;padding:16px 16px 40px;box-sizing:border-box;animation:stk-slide 200ms ease-out}',
    '@keyframes stk-slide{from{transform:translateY(-14px);opacity:0}to{transform:none;opacity:1}}',
    '@media (prefers-reduced-motion:reduce){.stk-ov-in{animation:none}.stk-cab svg .mid{transition:none}}',
    '.stk-ov-top{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;margin-bottom:18px}',
    '.stk-lbl{font-family:"Courier Prime",monospace;font-size:12px;font-weight:700;letter-spacing:0.12em;color:#4F4B43}',
    '.stk-close{min-height:44px;min-width:44px;padding:8px 14px;border:1px solid #1E1C19;border-radius:6px;background:#FFFDF9;color:#1E1C19;font:600 14px "Public Sans",sans-serif;cursor:pointer}',
    '.stk-cabinet{background:#E9E3D7;border:1px solid #CFC9BD;border-radius:8px;padding:14px 12px 16px;box-shadow:inset 0 2px 0 #FFFDF9,0 2px 0 #CFC9BD}',
    '.stk-home{display:flex;align-items:center;justify-content:space-between;min-height:48px;padding:10px 14px;margin-bottom:14px;background:#FFFDF9;border:1px solid #CFC9BD;border-top:2px solid #C0392B;border-radius:4px;text-decoration:none;color:#1E1C19;font-weight:600;font-size:16px}',
    '.stk-fold{position:relative;margin-top:-6px}',
    '.stk-fold:first-of-type{margin-top:0}',
    '.stk-tab{position:relative;z-index:1;display:inline-flex;align-items:center;gap:8px;min-height:44px;box-sizing:border-box;padding:8px 16px 10px;margin-bottom:-1px;background:#F2E9D5;border:1px solid #BFB29A;border-bottom:0;border-radius:8px 8px 0 0;font:700 15px "Public Sans",sans-serif;color:#1E1C19;cursor:pointer}',
    '.stk-tab .chev{font-size:10px;color:#5E5950;transition:transform 160ms}',
    '.stk-tab[aria-expanded="true"] .chev{transform:rotate(180deg)}',
    '.stk-tab .here{font-family:"Courier Prime",monospace;font-size:10.5px;font-weight:700;letter-spacing:0.08em;color:#2F6B3A}',
    '.stk-body{background:#F2E9D5;border:1px solid #BFB29A;border-radius:0 6px 6px 6px;box-shadow:0 2px 0 rgba(64,52,32,0.12);padding:6px 12px}',
    '.stk-fold:not(.open) .stk-body{height:10px;padding:0;overflow:hidden}',
    '.stk-fold.open .stk-body{padding:12px 12px 14px;display:flex;flex-direction:column;gap:8px}',
    '.stk-fold:not(.open) .stk-cards{display:none}',
    '.stk-card{display:flex;flex-direction:column;gap:2px;min-height:48px;box-sizing:border-box;padding:9px 12px 10px;background:#FFFDF9 repeating-linear-gradient(to bottom,transparent 0,transparent 21px,rgba(31,78,140,0.08) 21px,rgba(31,78,140,0.08) 22px);background-position:0 22px;border:1px solid #E5E0D6;border-top:2px solid #C0392B;border-radius:3px;text-decoration:none;color:#1E1C19;box-shadow:0 1px 0 #CFC9BD}',
    '.stk-card .t{font-size:15.5px;font-weight:600;line-height:1.35}',
    '.stk-card .s{font-family:"Courier Prime",monospace;font-size:11px;letter-spacing:0.08em;color:#4F4B43}',
    '.stk-card[aria-current="page"]{border-color:#4F4B43;border-top-color:#C0392B;box-shadow:0 2px 0 #CFC9BD}',
    '.stk-card[aria-current="page"] .s::after{content:" · YOU ARE HERE";color:#2F6B3A;font-weight:700}',
    '.stk-acct{margin-top:18px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;font-size:14px;color:#4F4B43}',
    '.stk-acct a{font-weight:600;min-height:44px;display:inline-flex;align-items:center}',
    '.stk-acct a.btn{padding:10px 16px;border-radius:6px;background:#1E1C19;color:#FFFDF9;text-decoration:none;box-sizing:border-box}'
  ].join('\n');

  var CAB_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="3" y="2.5" width="18" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"></rect>' +
    '<g class="mid"><rect x="3" y="9.5" width="18" height="5" rx="1" fill="#FFFDF9" stroke="currentColor" stroke-width="1.6"></rect><line x1="10" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></line></g>' +
    '<rect x="3" y="16.5" width="18" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"></rect>' +
    '<line x1="10" y1="5" x2="14" y2="5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></line>' +
    '<line x1="10" y1="19" x2="14" y2="19" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></line></svg>';

  var cabState = { overlay: null, open: false, openIdx: null, items: null, account: null };

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }

  function readNav(nav) {
    var items = [];
    Array.prototype.forEach.call(nav.children, function (c) {
      if (c.localName === 'a') {
        items.push({ kind: 'link', label: c.textContent.trim(), href: c.getAttribute('href'), current: c.getAttribute('aria-current') === 'page' });
      } else if (c.localName === 'details') {
        var sum = c.querySelector('summary');
        var label = (sum.querySelector('span') || sum).firstChild.textContent.trim();
        var links = [];
        c.querySelectorAll('.drw-menu a[href]').forEach(function (a) {
          var spans = a.querySelectorAll('span');
          links.push({
            title: spans[0] ? spans[0].textContent.trim() : a.textContent.trim(),
            sub: spans[1] ? spans[1].textContent.trim() : '',
            href: a.getAttribute('href'),
            current: a.getAttribute('aria-current') === 'page'
          });
        });
        items.push({ kind: 'drawer', label: label, links: links, current: /current/i.test(sum.getAttribute('aria-label') || '') });
      }
    });
    return items;
  }

  function enhanceNav() {
    var nav = document.querySelector('header nav[aria-label="Main"]');
    if (!nav) return;
    if (!document.getElementById('stk-cab-css')) {
      var st = el('style', { id: 'stk-cab-css' }); st.textContent = CAB_CSS; document.head.appendChild(st);
    }
    cabState.items = readNav(nav);
    var right = nav.nextElementSibling;
    if (!right) return;
    right.classList.add('stk-right');
    var acct = right.querySelector('a[aria-label^="Your account"]');
    var signIn = right.querySelector('a[href*="C01-SignIn"]');
    cabState.account = acct ? { name: (acct.getAttribute('aria-label') || '').replace(/^Your account:\s*/, ''), href: acct.getAttribute('href') }
      : signIn ? { signIn: signIn.getAttribute('href') } : null;
    if (acct) acct.classList.add('stk-hide-m');
    if (signIn) signIn.classList.add('stk-hide-m');
    var bell = right.querySelector('button.bell');
    if (bell) {
      var lab = bell.querySelector('span');
      if (lab && !bell.querySelector('.stk-askshort')) {
        lab.classList.add('stk-asklabel');
        var sh = el('span', { 'class': 'stk-askshort' }, 'Ask'); lab.parentNode.insertBefore(sh, lab.nextSibling);
      }
    }
    var btn = el('button', { type: 'button', 'class': 'stk-cab', 'aria-label': 'Open the card catalog (site menu)', 'aria-haspopup': 'dialog', 'aria-expanded': cabState.open ? 'true' : 'false' });
    btn.innerHTML = CAB_ICON;
    btn.addEventListener('click', function () { openCabinet(btn); });
    right.appendChild(btn);
  }

  function buildOverlay() {
    var ov = cabState.overlay;
    if (!ov) {
      ov = el('div', { 'class': 'stk-ov', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Site menu' });
      ov.hidden = true;
      ov.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); closeCabinet(); }
        if (e.key === 'Tab') {
          var f = ov.querySelectorAll('a[href],button');
          if (!f.length) return;
          var first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      });
      document.body.appendChild(ov);
      cabState.overlay = ov;
    }
    ov.textContent = '';
    var inner = el('div', { 'class': 'stk-ov-in' });
    var top = el('div', { 'class': 'stk-ov-top' });
    top.appendChild(el('span', { 'class': 'stk-lbl' }, 'CARD CATALOG'));
    var close = el('button', { type: 'button', 'class': 'stk-close' }, 'Close');
    close.addEventListener('click', closeCabinet);
    top.appendChild(close);
    inner.appendChild(top);

    var cab = el('nav', { 'class': 'stk-cabinet', 'aria-label': 'Main' });
    var items = cabState.items || [];
    var drawers = [];
    items.forEach(function (it) {
      if (it.kind === 'link') {
        var a = el('a', { 'class': 'stk-home', href: it.href });
        a.appendChild(el('span', null, it.label));
        if (it.current) { a.setAttribute('aria-current', 'page'); a.appendChild(el('span', { 'class': 'stk-lbl', style: 'color:#2F6B3A' }, 'YOU ARE HERE')); }
        cab.appendChild(a);
      } else drawers.push(it);
    });
    if (cabState.openIdx == null) {
      cabState.openIdx = 0;
      drawers.forEach(function (d, i) { if (d.current) cabState.openIdx = i; });
    }
    var n = drawers.length;
    drawers.forEach(function (d, i) {
      var fold = el('section', { 'class': 'stk-fold' + (i === cabState.openIdx ? ' open' : '') });
      // stagger the tabs left → right like a run of file folders
      var offset = n > 1 ? Math.round(i * (100 / n)) : 0;
      var tabWrap = el('div', { style: 'padding-left:' + offset + '%' });
      var bodyId = 'stk-fold-' + i;
      var tab = el('button', { type: 'button', 'class': 'stk-tab', 'aria-expanded': i === cabState.openIdx ? 'true' : 'false', 'aria-controls': bodyId });
      tab.appendChild(el('span', null, d.label));
      if (d.current) tab.appendChild(el('span', { 'class': 'here' }, 'HERE'));
      tab.appendChild(el('span', { 'class': 'chev', 'aria-hidden': 'true' }, '▾'));
      tab.addEventListener('click', function () {
        cabState.openIdx = cabState.openIdx === i ? -1 : i;
        buildOverlay();
        var t = cabState.overlay.querySelectorAll('.stk-tab')[i];
        if (t) t.focus();
      });
      tabWrap.appendChild(tab);
      fold.appendChild(tabWrap);
      var body = el('div', { 'class': 'stk-body', id: bodyId });
      var cards = el('div', { 'class': 'stk-cards', style: 'display:flex;flex-direction:column;gap:8px' });
      d.links.forEach(function (l) {
        var c = el('a', { 'class': 'stk-card', href: l.href });
        if (l.current) c.setAttribute('aria-current', 'page');
        c.appendChild(el('span', { 'class': 't' }, l.title));
        if (l.sub) c.appendChild(el('span', { 'class': 's' }, l.sub));
        cards.appendChild(c);
      });
      body.appendChild(cards);
      fold.appendChild(body);
      cab.appendChild(fold);
    });
    inner.appendChild(cab);

    var acct = cabState.account;
    if (acct) {
      var row = el('div', { 'class': 'stk-acct' });
      if (acct.signIn) {
        row.appendChild(el('span', null, 'Reading never needs an account.'));
        row.appendChild(el('a', { 'class': 'btn', href: acct.signIn }, 'Sign in with ORCID'));
      } else {
        row.appendChild(el('span', null, 'Signed in as ' + acct.name));
        row.appendChild(el('a', { href: acct.href }, 'Your account'));
      }
      inner.appendChild(row);
    }
    ov.appendChild(inner);
    return ov;
  }

  var lastOpener = null, savedOverflow = '';
  function openCabinet(btn) {
    lastOpener = btn;
    cabState.open = true;
    cabState.openIdx = null;
    var ov = buildOverlay();
    ov.hidden = false;
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    btn.setAttribute('aria-expanded', 'true');
    var first = ov.querySelector('.stk-tab[aria-expanded="true"]') || ov.querySelector('.stk-close');
    if (first) first.focus();
  }
  function closeCabinet() {
    if (!cabState.overlay) return;
    cabState.open = false;
    cabState.overlay.hidden = true;
    document.body.style.overflow = savedOverflow;
    var btn = document.querySelector('.stk-cab');
    if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
  }
  window.addEventListener('resize', function () {
    if (cabState.open && window.innerWidth >= 720) closeCabinet();
  });

  // Hide the raw template until it is rendered.
  var hide = document.createElement('style');
  hide.textContent = 'x-dc{display:none !important}';
  document.head.appendChild(hide);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
