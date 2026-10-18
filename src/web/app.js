// Upload page: pick export.zip, choose the period, build the report in a worker, show it and offer a download.
const $ = (id) => document.getElementById(id);
const form = $('form'), fileInput = $('file'), drop = $('drop'), months = $('months'), go = $('go'), sample = $('sample');
const progress = $('progress'), bar = $('bar'), status = $('status'), error = $('error');
const viewer = $('viewer'), frame = $('frame'), dl = $('download');
let file = null, worker = null, objectUrl = null;

const fmtBytes = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n >= 1e6 ? (n / 1e6).toFixed(0) + ' MB' : (n / 1e3).toFixed(0) + ' kB');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function setFile(f) {
  file = f;
  error.hidden = true; progress.hidden = true;
  drop.classList.toggle('has-file', !!f);
  $('drop-text').textContent = f ? `${f.name} (${fmtBytes(f.size)})` : 'Choose export.zip';
  go.disabled = !f;
}

fileInput.addEventListener('change', () => setFile(fileInput.files[0] || null));
['dragenter', 'dragover'].forEach((n) => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((n) => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });

sample.addEventListener('click', async (e) => {
  e.preventDefault();
  error.hidden = true; progress.hidden = false; go.disabled = true; bar.hidden = true; status.textContent = 'Loading the sample export';
  try {
    const res = await fetch('../../example/export.zip');
    if (!res.ok) throw new Error();
    setFile(new File([await res.blob()], 'export.zip'));
    months.value = '24';
    progress.hidden = false; bar.hidden = true; status.textContent = 'Sample loaded. Press Create report.';
  } catch { showError('The sample is only available when the whole repository is served.'); }
});

function showError(msg) { error.textContent = msg; error.hidden = false; progress.hidden = true; go.disabled = !file; }

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!file) return;
  error.hidden = true; progress.hidden = false; go.disabled = true; bar.hidden = false; bar.value = 0; status.textContent = 'Opening the zip';
  if (worker) worker.terminate();
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      bar.value = data.fraction;
      status.textContent = `Reading the export: ${fmtBytes(data.bytes)} of ${fmtBytes(file.size)}${data.workouts ? ` \u00b7 ${data.workouts} running workouts found` : ''}`;
    } else if (data.type === 'status') { status.textContent = data.text; bar.removeAttribute('value'); }
    else if (data.type === 'done') show(data);
    else if (data.type === 'error') showError(data.message);
  };
  worker.onerror = (ev) => showError(ev.message || 'Something went wrong while reading the file.');
  worker.postMessage({ file, months: Number(months.value), today: today() });
});

function show({ html, name }) {
  progress.hidden = true; go.disabled = false;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  const blob = new Blob([html], { type: 'text/html' });
  objectUrl = URL.createObjectURL(blob);
  dl.href = objectUrl; dl.download = name;
  frame.srcdoc = html;
  viewer.hidden = false;
  document.documentElement.classList.add('viewing');
}
$('back').addEventListener('click', () => { viewer.hidden = true; frame.srcdoc = ''; document.documentElement.classList.remove('viewing'); });
