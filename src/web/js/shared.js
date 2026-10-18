// The files in shared/ that the report page is made of (page template, CSS, scripts); the R tool uses the same ones.
// `read(name)` returns a file's text: fetch() in the browser, fs in Node.
const FILES = { template: 'page.tmpl', themeInit: 'theme_init.js', css: 'report.css', pageJs: 'page.js' };

export async function loadShared(read) {
  const entries = await Promise.all(Object.entries(FILES).map(async ([key, name]) => [key, await read(name)]));
  return Object.fromEntries(entries);
}

export const fetchShared = () => loadShared(async (name) => {
  const res = await fetch(new URL(`../../shared/${name}`, import.meta.url));
  if (!res.ok) throw new Error(`Could not load shared/${name} (${res.status}). Serve src/ with web/ and shared/ side by side.`);
  return res.text();
});
