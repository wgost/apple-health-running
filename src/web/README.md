# Running report in the browser (JavaScript only)

A web app version of the running report. Open the page, choose `export.zip` from the Health app, and get the same
report as the command-line tool. **The file is processed in your browser and is never uploaded**, so it can be hosted
as plain static files.

This folder is independent of the R command-line tool in `src/cli/`. The two are separate code bases that produce the
same numbers (`../../test/compare.mjs` checks that); they share only the report page itself (CSS, page template and page
scripts) through `../shared/` (`src/shared/`).

## Run it

Any static file server works. From the repository root (so the "sample export" link can find `example/export.zip`):

```sh
python3 -m http.server 8000
# open http://localhost:8000/src/web/
```

To publish, put the `src/web/` and `src/shared/` folders side by side on any static host (GitHub Pages, Netlify, an S3 bucket);
the simplest is to publish the repository root. The page needs a
modern browser (`DecompressionStream`, module workers): Chrome/Edge 103+, Safari 16.4+, Firefox 113+.

## How it works

| File | What it does |
|---|---|
| `index.html`, `style.css`, `js/app.js` | The upload page: file picker, period, progress, the report in a frame, download button |
| `js/worker.js` | Runs the job off the main thread so the page stays responsive |
| `js/zip.js` | Reads the zip's central directory (zip64 aware) and streams only `export.xml` through the browser's decompressor, so a multi-GB export is never held in memory |
| `js/parse.js` | Streams `export.xml` line by line and keeps running workouts plus a few record types (port of `src/cli/parse_export.R`) |
| `js/metrics.js` | Run table, zones, monthly and weekly summaries, performance analysis (port of `src/cli/metrics.R`) |
| `js/charts.js` | A small SVG chart engine (no libraries) |
| `js/report.js`, `js/report/` | Builds the report page (port of `src/cli/report/`): `report.js` computes the numbers and calls the sections (`overview.js`, `summary.js`, `performance.js`, `reference.js`); `format.js` has the number and unit formats, `page.js` the page and chart boxes |
| `js/shared.js` | Loads the files in `../shared/` that the page is made of |
| `../shared/` | Used by this app and by the R tool: `report.css`, `page.tmpl` (page shell), `theme_init.js` and `page.js` (header, tabs, units switch, full-screen charts) |

The report is the same as the R tool's (sections, numbers, dark/light, US/metric, tap a chart for full screen, inline
SVG charts). The only difference is that the period is chosen on the page instead of `--duration`. Charts come out of
different code (ggplot2 in R, `js/charts.js` here), so they look alike but are not pixel-identical.

## Tests

```sh
node --test test/*.test.mjs                      # zip reader (deflate, stored, zip64), sample-export counts, report page

# Compare every number with the R implementation (needs R and ggplot2 only for the cached parse):
Rscript src/cli/run_report.R example/export.zip --duration 24 --out /tmp/out      # creates /tmp/out/parsed_export.rds
Rscript test/dump_r.R /tmp/out/parsed_export.rds /tmp/r_dump 2026-08-01 2026-10-18
node test/compare.mjs example/export.zip /tmp/r_dump 2026-08-01 2026-10-18   # expect: 0 differences

node test/build.mjs example/export.zip /tmp/report.html 24 2026-10-18         # build a report without a browser
```

## Limits

- Reading a multi-GB export takes a minute or two (a 4.6 GB `export.xml` took about 15 s in Node). Keep the tab open.
- Phones have much less memory than computers. The parser keeps only a small slice of the export, but a very large
  export on an older phone may still be slow; use a computer if it stalls.
