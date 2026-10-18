# apple-health-running (v0.3)

Turns the Apple Health export (`export.zip`) from your iPhone into one self-contained HTML running report.
There are two versions that produce the same report: a [browser app](#web-app) (`src/web/`) that needs no install,
and an R [command-line tool](#command-line-r) (`src/cli/`). The report includes:

- **Summary**: how you have been running lately. The latest month at a glance, month-by-month tables that show
  whether you did more or less than last month, time spent in each heart-rate zone, and weekly charts.
- **Performance**: whether you are getting fitter. Outdoor-run trends in efficiency, power, stride and cardiac
  drift, and how heat and humidity affect your runs.
- **Reference**: whether you can trust the numbers. How each figure is calculated, and how many runs had each reading.

The report also features a dark / light display (it opens in dark mode, and your choice is remembered) and a
unit switch between US (miles, °F) and metric (km, °C) that changes every table and chart at once.
See the [example report](https://htmlpreview.github.io/?https://github.com/wgost/apple-health-running/blob/main/example/running_report_2024-11-01_2026-10-18.html) for what it looks like.

## Web app

> **Placeholder: to be completed after the web app is deployed.**
>
> Live app: _URL to be added_
>
> Planned content: open the page, choose `export.zip`, pick the period, and get the report in the browser. The file is
> read in the browser tab and never uploaded. Browser requirements are in [`src/web/README.md`](src/web/README.md),
> which also covers running it locally and publishing it.

## Command line (R)

Needs R ≥ 4.1 and the `ggplot2` (4.0 or newer) and `svglite` packages:

```r
install.packages(c("ggplot2", "svglite"))
```

### Try the example

`example/export.zip` is a small, anonymised sample export. From the project folder:

```sh
Rscript src/cli/run_report.R example/export.zip --duration 24 --out example   # 24 months reaches back to the sample's data
```

Then open the new `example/running_report_*.html` in a browser; a copy already
generated this way is included: **[click to open the example report](https://htmlpreview.github.io/?https://github.com/wgost/apple-health-running/blob/main/example/running_report_2024-11-01_2026-10-18.html)**.

### Run it on your own data

Export your data on iPhone: **Health app → profile picture → Export All Health Data**.
AirDrop or save the resulting `export.zip` to your computer. Don't unzip it; the
program reads the zip directly. Then, from the shell in the project folder:

```sh
Rscript src/cli/run_report.R ~/Downloads/export.zip
Rscript src/cli/run_report.R ~/Downloads/export.zip --duration 6
Rscript src/cli/run_report.R ~/Downloads/export.zip --out reports
```

### Options

| Option | Default | Meaning |
|---|---|---|
| `--duration` | `3` | Calendar months to report, ending today |
| `--out` | `output` | Output folder |
| `--reparse` | off | Ignore the cached parse and read the zip again |

The first run on a multi-GB export takes about 1–3 minutes. The parsed data is
cached in `output/parsed_export.rds` and reused while the zip and the report
start date are unchanged, so re-running the report is quick.

### From an R session

```r
source("src/cli/parse_export.R"); source("src/cli/metrics.R")
start <- report_start(3)                      # same as --duration 3
x     <- read_health_export("export.zip", start = start)
runs  <- build_runs(x, start, Sys.Date())
monthly_summary(runs)
```

## What it computes

The report takes each running workout in the export, measures it (distance, duration, pace, heart
rate, energy, cadence), adds the watch's extra readings when present (power, stride length, vertical
oscillation, ground contact, weather), and then groups the runs by month and by week to show totals, averages
and trends. Heart-rate zones are set from your resting and maximum HR. For the full detail and the data checks, open the
[example report](https://htmlpreview.github.io/?https://github.com/wgost/apple-health-running/blob/main/example/running_report_2024-11-01_2026-10-18.html) and see its **Reference** section, under "How it's calculated".

## Layout

```
src/
  cli/                     the R command-line tool
    run_report.R           entry point
    parse_export.R         streams export.xml out of the zip
    metrics.R              per-run metrics, monthly and weekly summaries
    report/                builds the HTML report: build.R puts it together; format.R (number and unit
                           formats), page.R (page and chart boxes), overview.R, summary.R, performance.R
                           and reference.R (the sections)
  web/                     the same report as a browser app (JavaScript only; see src/web/README.md)
  shared/                  used by both: report.css, page.tmpl (page shell), theme_init.js and page.js
                           (the scripts in the report page: header, tabs, units, full-screen charts)
test/                      tests: zip reader and report page (node --test test/*.test.mjs), R vs JavaScript numbers
example/                   anonymised sample export.zip and a sample report
LICENSE                    GNU General Public License v3.0
```

Charts are inline SVG in both versions (sharp at any size; the sample report is about 300 kB).
Changing how the report page looks or behaves usually means editing `src/shared/` once; the numbers, tables and charts
are written twice (R and JavaScript), and `test/compare.mjs` checks that the two give the same numbers.

## What's new in v0.3

- Add a browser version of the report (`src/web/`): choose `export.zip` on a page and get the report, with nothing
  uploaded. It is plain JavaScript, so it needs no R and no install
- Draw charts as inline SVG instead of PNG images (needs the `svglite` package; the report is about 5x smaller)
- Move the code under `src/` (`src/cli` for the R tool, `src/web`, `src/shared`) and the tests to `test/`
- Share the report CSS, page template and page scripts between the R tool and the web app (`src/shared/`), and split
  the report builder by section

## What's new in v0.2

- Add performance analysis: efficiency, running power, stride length, cardiac drift, weather
- Add heart-rate zones and active energy
- Add dark/light mode (dark by default)
- Add an All / Outdoor / Indoor switch to the monthly tables and charts, with the change from the previous month
- Add a US / metric switch (miles and °F by default; km and °C on request)
- Replace `--start` and `--end` with `--duration`
- Add a header with section tabs and dark/light and units buttons
- Make tables and charts fit phone screens, and keep the content a readable width on wide screens
- Add `example/` with a sample export and report
- Add the GNU GPL v3 license

## License

Released under the [GNU General Public License v3.0](LICENSE).
