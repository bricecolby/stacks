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

  // Hide the raw template until it is rendered.
  var hide = document.createElement('style');
  hide.textContent = 'x-dc{display:none !important}';
  document.head.appendChild(hide);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
