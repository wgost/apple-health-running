# apple-health-running (v0.3)

Turns the Apple Health export from your iPhone into one self-contained HTML running report.
There are two versions that produce the same report: a [browser app](#web-app) (`src/web/`)
and an R [command-line tool](#command-line-r) (`src/cli/`). The report includes:

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

1. Open the page and choose `export.zip` (or drop it on the page). Use "Try it with the sample export" to see a report first.
2. Pick the period and press **Create report**.
3. Read the report on the page, or press **Download HTML** to keep it.

The file is read in your browser tab and is never uploaded. A large export takes a minute or two, so keep the tab open.
It needs a recent browser (Chrome or Edge 103+, Safari 16.4+, Firefox 113+). Running it locally and the code
are described in [`src/web/README.md`](src/web/README.md).

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
  cli/        R command-line tool
  web/        browser app
  shared/     report page used by both
test/         tests
example/      sample export and sample report
```

The two versions share the report page in `src/shared/`. Each has its own code for the numbers,
tables and charts, and a test checks that they agree.

## What's new in v0.3

- Add a browser version of the report (`src/web/`): choose `export.zip` on a page and get the report
- Draw charts as inline SVG instead of PNG images
- Restructure the project for the web and CLI tools, which now share the same report page

## License

Released under the [GNU General Public License v3.0](LICENSE).
