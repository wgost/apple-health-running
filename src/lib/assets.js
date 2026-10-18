// The files in assets/ that the report page is made of (page template, CSS, scripts).
// `read(name)` returns a file's text: fetch() in the browser, fs in Node.
const FILES = { template: 'page.tmpl', themeInit: 'theme_init.js', css: 'report.css', pageJs: 'page.js' };

export async function loadAssets(read) {
  const entries = await Promise.all(Object.entries(FILES).map(async ([key, name]) => [key, await read(name)]));
  return Object.fromEntries(entries);
}

export const fetchAssets = () => loadAssets(async (name) => {
  const res = await fetch(new URL(`./assets/${name}`, import.meta.url));
  if (!res.ok) throw new Error(`Could not load assets/${name} (${res.status}). Serve src/ with web/ and lib/ side by side.`);
  return res.text();
});
