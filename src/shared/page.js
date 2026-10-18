// Scripts of the generated report page, inlined at the end of <body> by both report builders (cli/ and web/).
// Four independent parts: header buttons and section tabs, All / Outdoor / Indoor switches, full-screen charts.

// ---- Header: dark/light and units buttons, translucent bar once scrolled, underline of the section being read ----
(function () {
  var r = document.documentElement;
  // each button flips an attribute on <html> and remembers the choice
  function wire(id, attr, a, b, key, labelA, labelB) {
    var btn = document.getElementById(id);
    function show() { btn.innerHTML = r.getAttribute(attr) === a ? labelA : labelB; }
    btn.addEventListener('click', function () {
      var v = r.getAttribute(attr) === a ? b : a;
      r.setAttribute(attr, v);
      try { localStorage.setItem(key, v); } catch (e) {}
      show();
    });
    show();
  }
  wire('theme-toggle', 'data-theme', 'light', 'dark', 'theme', '\u263E', '\u2600');
  wire('units-toggle', 'data-units', 'si', 'us', 'units', '<i>km \u00b7 </i>\u00b0C', '<i>mi \u00b7 </i>\u00b0F');

  var bar = document.getElementById('topbar');
  function onscroll() { bar.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onscroll, { passive: true });
  onscroll();

  // The current section is the last one whose heading has reached the reading line; the first until the second
  // heading is reached, so the title and KPI cards count as it. Uses link.hash, not the raw href, because
  // htmlpreview.github.io rewrites links to absolute URLs.
  var links = document.querySelectorAll('#topbar nav a');
  function spy() {
    var cur = links[0], line = Math.max(140, window.innerHeight * 0.3);
    for (var i = 0; i < links.length; i++) {
      var el = document.getElementById(links[i].hash.slice(1));
      if (el && el.getBoundingClientRect().top <= line) cur = links[i];
    }
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) cur = links[links.length - 1];
    for (var j = 0; j < links.length; j++) links[j].classList.toggle('on', links[j] === cur);
  }
  // keep checking every frame until scrolling has stopped (phone browsers can skip scroll events while a swipe coasts)
  var busy = false;
  function follow() {
    if (busy) return;
    busy = true;
    var last = -1, still = 0;
    (function tick() {
      spy();
      var y = window.scrollY;
      still = y === last ? still + 1 : 0;
      last = y;
      if (still < 20) requestAnimationFrame(tick); else busy = false;
    })();
  }
  ['scroll', 'touchmove', 'touchend', 'scrollend', 'resize', 'load'].forEach(function (n) {
    window.addEventListener(n, follow, { passive: true });
  });
  spy();
})();

// ---- All / Outdoor / Indoor switches, one per group ----
(function () {
  var segs = document.querySelectorAll('.seg');
  function wire(seg) {
    var g = seg.getAttribute('data-group'), btns = seg.querySelectorAll('button'),
      panes = document.querySelectorAll('.pane[data-group="' + g + '"]');
    function pick(id) {
      for (var i = 0; i < btns.length; i++) {
        var on = btns[i].getAttribute('data-pane') === id;
        btns[i].classList.toggle('on', on);
        btns[i].setAttribute('aria-pressed', on);
      }
      for (var j = 0; j < panes.length; j++) panes[j].hidden = panes[j].getAttribute('data-pane') !== id;
    }
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) pick(b.getAttribute('data-pane'));
    });
    pick('all');
  }
  for (var k = 0; k < segs.length; k++) wire(segs[k]);
})();

// ---- Tap a chart on a phone to see it full screen, with its title and subtitle ----
// Title and chart are one block; in portrait the block is turned sideways to use the screen's length and scaled to
// fit. Tap anywhere, the close button or press Escape to go back.
(function () {
  var mq = window.matchMedia('(max-width:760px)');
  var box = document.createElement('div');
  box.id = 'lightbox';
  box.hidden = true;
  box.innerHTML = '<div class="lbstage"><button type="button" aria-label="Close">\u2715</button><p class="lbt"></p><p class="lbs"></p><div class="lbfig"></div></div>';
  document.body.appendChild(box);
  var st = box.querySelector('.lbstage'), lt = box.querySelector('.lbt'), ls = box.querySelector('.lbs'), fg = box.querySelector('.lbfig');

  function fit() {
    var sv = fg.firstChild;
    if (box.hidden || !sv) return;
    var vb = sv.viewBox.baseVal, W = window.innerWidth, H = window.innerHeight, rot = H > W && vb.width > vb.height, pad = 12,
      aw = (rot ? H : W) - 2 * pad, ah = (rot ? W : H) - 2 * pad, tf = 'translate(-50%,-50%)' + (rot ? ' rotate(90deg)' : '');
    st.style.width = aw + 'px';
    st.style.transform = tf;
    st.style.transform = tf + ' scale(' + Math.min(1, ah / st.offsetHeight) + ')';
  }
  function text(el, src) {
    var n = src && src.textContent.trim();
    el.textContent = n || '';
    el.hidden = !n;
  }
  function open(sv) {
    var c = sv.closest('.chart');
    text(lt, c && c.querySelector('.ctitle'));
    text(ls, c && c.querySelector('.csub'));
    var cp = sv.cloneNode(true), vb = sv.viewBox.baseVal;
    cp.removeAttribute('width');
    cp.removeAttribute('height');
    cp.style.aspectRatio = vb.width + ' / ' + vb.height;
    fg.replaceChildren(cp);
    box.hidden = false;
    document.documentElement.classList.add('lb-open');
    fit();
  }
  function close() {
    box.hidden = true;
    fg.replaceChildren();
    document.documentElement.classList.remove('lb-open');
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;
    if (t.closest('#lightbox')) { close(); return; }
    var sv = t.closest('.chart .fig svg');
    if (mq.matches && sv) open(sv);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) close(); });
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);
})();
