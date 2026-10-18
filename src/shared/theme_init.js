// Runs in <head>, before the page is painted: apply the remembered theme (dark by default) and units (US by default).
(function () {
  var t = 'dark', u = 'us';
  try {
    t = localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
    u = localStorage.getItem('units') === 'si' ? 'si' : 'us';
  } catch {}
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.setAttribute('data-units', u);
})();
