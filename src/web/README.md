# Running report in the browser

Open the page, choose `export.zip` from the Health app, and get the same report as the command-line tool.
**The file is processed in your browser and never uploaded**, so the app is just static files.

It is separate from the R tool in `src/cli/`. The two share the report page (`src/shared/`), and
`test/compare.mjs` checks that both give the same numbers.

## Run it

Any static file server works. From the repository root:

```sh
python3 -m http.server 8000
# open http://localhost:8000/src/web/
```

To publish it, put `src/web/` and `src/shared/` side by side on a static host. It needs a recent browser:
Chrome or Edge 103+, Safari 16.4+, Firefox 113+.

## Files

| File | What it does |
|---|---|
| `index.html`, `style.css`, `js/app.js` | Upload page: file picker, period, progress, report view, download |
| `js/worker.js` | Runs the job off the main thread so the page stays responsive |
| `js/zip.js` | Reads the zip and streams only the health data XML, so a multi-GB export is never held in memory |
| `js/parse.js` | Reads the XML line by line and keeps running workouts and a few record types |
| `js/metrics.js` | Run table, zones, monthly and weekly summaries, performance analysis |
| `js/charts.js` | Small SVG chart engine, no libraries |
| `js/report.js`, `js/report/` | Builds the report: the numbers, then the sections and page |
| `js/shared.js` | Loads the report page files from `src/shared/` |

`parse.js`, `metrics.js` and `js/report/` follow `src/cli/parse_export.R`, `src/cli/metrics.R` and `src/cli/report/`.
The report matches the R version, except that the period is chosen on the page instead of `--duration`, and
charts are drawn by different code so they look alike but are not pixel-identical.

## Tests

```sh
node --test test/*.test.mjs
```

To compare every number with the R version:

```sh
Rscript src/cli/run_report.R example/export.zip --duration 24 --out /tmp/out
Rscript test/dump_r.R /tmp/out/parsed_export.rds /tmp/r_dump 2026-08-01 2026-10-18
node test/compare.mjs example/export.zip /tmp/r_dump 2026-08-01 2026-10-18   # expect 0 differences
```

To build a report in Node without a browser:

```sh
node test/build.mjs example/export.zip /tmp/report.html 24 2026-10-18
```

## Limits

- A multi-GB export takes a minute or two to read. Keep the tab open.
- Phones have much less memory than computers. If a very large export stalls on an older phone, use a computer.
