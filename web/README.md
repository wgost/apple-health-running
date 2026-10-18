# Running report in the browser (JavaScript only)

A web app version of the running report. Open the page, choose `export.zip` from the Health app, and get the same
report as the command-line tool. **The file is processed in your browser and is never uploaded**, so it can be hosted
as plain static files.

This folder is independent of the R command-line tool in `src/` (which is unchanged). The two are separate code
bases that produce the same numbers; `test/compare.mjs` checks that.

## Run it

Any static file server works. From the repository root (so the "sample export" link can find `example/export.zip`):

```sh
python3 -m http.server 8000
# open http://localhost:8000/web/
```

To publish, copy the `web/` folder to any static host (GitHub Pages, Netlify, an S3 bucket). The page needs a
modern browser (`DecompressionStream`, module workers): Chrome/Edge 103+, Safari 16.4+, Firefox 113+.

## How it works

| File | What it does |
|---|---|
| `index.html`, `style.css`, `js/app.js` | The upload page: file picker, period, progress, the report in a frame, download button |
| `js/worker.js` | Runs the job off the main thread so the page stays responsive |
| `js/zip.js` | Reads the zip's central directory (zip64 aware) and streams only `export.xml` through the browser's decompressor, so a multi-GB export is never held in memory |
| `js/parse.js` | Streams `export.xml` line by line and keeps running workouts plus a few record types (port of `src/parse_export.R`) |
| `js/metrics.js` | Run table, zones, monthly and weekly summaries, performance analysis (port of `src/metrics.R`) |
| `js/charts.js` | A small SVG chart engine (no libraries) |
| `js/report.js`, `js/page_scripts.js` | Builds the self-contained report page: tables, charts, header, units switch, full-screen charts (port of `src/build_report.R`) |
| `report.css` | Copy of `src/report.css` with the `img` rules also applied to `svg` (charts are SVG here, not PNG). Keep the two in step by hand |

Differences from the R report: charts are inline SVG (sharp at any size, about 10x smaller files), and the period
is chosen on the page instead of `--duration`. Everything else (sections, numbers, dark/light, US/metric, tap a
chart for full screen) is the same.

## Tests

```sh
node --test web/test/zip.test.mjs          # zip reader (deflate, stored, zip64) and sample-export counts

# Compare every number with the R implementation (needs R and ggplot2 only for the cached parse):
Rscript src/run_report.R example/export.zip --duration 24 --out /tmp/out      # creates /tmp/out/parsed_export.rds
Rscript web/test/dump_r.R /tmp/out/parsed_export.rds /tmp/r_dump 2026-08-01 2026-10-18
node web/test/compare.mjs example/export.zip /tmp/r_dump 2026-08-01 2026-10-18   # expect: 0 differences

node web/test/build.mjs example/export.zip /tmp/report.html 24 2026-10-18         # build a report without a browser
```

## Limits

- Reading a multi-GB export takes a minute or two (a 4.6 GB `export.xml` took about 15 s in Node). Keep the tab open.
- Phones have much less memory than computers. The parser keeps only a small slice of the export, but a very large
  export on an older phone may still be slow; use a computer if it stalls.
