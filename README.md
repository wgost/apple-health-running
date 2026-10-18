# apple-health-running (v0.4)

Turns the Apple Health export from your iPhone into one self-contained HTML running report.
You can use it as a [browser app](#web-app) or from the [command line](#command-line); both produce the same report.
The report includes:

- **Summary**: how you have been running lately. The latest month at a glance, month-by-month tables that show
  whether you did more or less than last month, time spent in each heart-rate zone, and weekly charts.
- **Performance**: whether you are getting fitter. Outdoor-run trends in efficiency, power, stride and cardiac
  drift, and how heat and humidity affect your runs.
- **Reference**: whether you can trust the numbers. How each figure is calculated, and how many runs had each reading.

The report also features a dark / light display and a
unit switch between US (miles, °F) and metric (km, °C) that changes every table and chart at once.
See the [example report](https://htmlpreview.github.io/?https://github.com/wgost/apple-health-running/blob/main/example/running_report_2024-11-01_2026-10-18.html) for what it looks like.

## Web app

**Live app: https://wgost.github.io/apple-health-running/**

1. Open the page and choose `export.zip` (or drop it on the page). "Try it with the sample export" loads a sample so you can see a report first.
2. Pick the period and press **Create report**.
3. Read the report on the page, or press **Download HTML** to keep it.

The file is read in your browser tab and is never uploaded, so the app is just static files. A large export takes a
minute or two, so keep the tab open. On a phone, a very large export can stall for lack of memory; use a computer.
It needs a recent browser (Chrome or Edge 103+, Safari 16.4+, Firefox 113+).

### Run it locally

Any static file server works. From the project folder:

```sh
python3 -m http.server 8000
# open http://localhost:8000/src/web/
```

To publish it, put `src/web/` and `src/lib/` side by side on a static host.

## Command line

Needs [Node.js](https://nodejs.org/) 20 or newer.

### Try the example

`example/export.zip` is a small, anonymised sample export. From the project folder:

```sh
node src/cli.mjs example/export.zip --duration 24 --end 2026-10-18 --out example   # 24 months reaches back to the sample's data
```

Then open the new `example/running_report_*.html` in a browser; a copy already
generated this way is included: **[click to open the example report](https://htmlpreview.github.io/?https://github.com/wgost/apple-health-running/blob/main/example/running_report_2024-11-01_2026-10-18.html)**.

### Run it on your own data

Export your data on iPhone: **Health app → profile picture → Export All Health Data**.
AirDrop or save the resulting `export.zip` into the project folder. Don't unzip it; the
program reads the zip directly. Then, from the shell in the project folder:

```sh
node src/cli.mjs export.zip
node src/cli.mjs export.zip --duration 6
node src/cli.mjs export.zip --out reports
```

### Options

| Option | Default | Meaning |
|---|---|---|
| `--duration` | `3` | Calendar months to report, ending on `--end` |
| `--end` | today | Last day of the report, as `YYYY-MM-DD` |
| `--out` | `output` | Output folder |

A multi-GB export takes a few seconds to a minute to read.

## What it computes

The report takes each running workout in the export, measures it (distance, duration, pace, heart
rate, energy, cadence), adds the watch's extra readings when present (power, stride length, vertical
oscillation, ground contact, weather), and then groups the runs by month and by week to show totals, averages
and trends. Heart-rate zones are set from your resting and maximum HR. For the full detail and the data checks, open the
[example report](https://htmlpreview.github.io/?https://github.com/wgost/apple-health-running/blob/main/example/running_report_2024-11-01_2026-10-18.html) and see its **Reference** section, under "How it's calculated".

## Layout

```
src/
  cli.mjs            command-line tool
  web/               browser app
  lib/               code shared by both
    zip.js           zip reader
    parse.js         XML parser
    metrics.js       run metrics and summaries
    charts.js        SVG charts
    build-report.js  report builder
    report/          report sections
    assets.js        asset loader
    assets/          page template, CSS, scripts
test/                tests
example/             sample export and report
```

The browser app and the command-line tool run the same code in `src/lib/`, so they give the same report.

## Tests

```sh
npm test    # or: node --test test/*.test.mjs
```

## What's new in v0.4

- One code base: the command-line tool now runs the same JavaScript as the browser app, so there is a single
  implementation of the parser, the numbers and the report
- The R version is removed; the command is now `node src/cli.mjs export.zip` (needs Node.js 20 or newer)
- New `--end` option to set the last day of the report (default: today)
- Fix: a run with no recorded distance no longer turns the month's distance, pace and energy per mile into N/A
- Fix: a run with no step count no longer makes the month's average cadence N/A

## License

Released under the [GNU General Public License v3.0](LICENSE).
