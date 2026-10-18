# apple-health-running (v0.2)

An R program that turns the Apple Health export (`export.zip`) from your iPhone
into one self-contained HTML running report (no server, works offline). The report includes:

- **Summary**: how you have been running lately. The latest month at a glance, month-by-month tables that show
  whether you did more or less than last month, time spent in each heart-rate zone, and weekly charts.
- **Performance**: whether you are getting fitter. Outdoor-run trends in efficiency, power, stride and cardiac
  drift, and how heat and humidity affect your runs.
- **Reference**: whether you can trust the numbers. How each figure is calculated, and how many runs had each reading.

The report also features a dark / light display (it opens in dark mode, and your choice is remembered) and a
unit switch between US (miles, °F) and metric (km, °C) that changes every table and chart at once.
See the [example report](https://htmlpreview.github.io/?https://github.com/wgost/apple-health-running/blob/main/example/running_report_2024-11-01_2026-10-17.html) for what it looks like.

## Usage

Needs R ≥ 4.1 and the `ggplot2` package (3.4 or newer). The `ragg` package is optional; if it is installed the report file is smaller.

### Try the example

`example/export.zip` is a small, anonymised sample export. From the project folder:

```sh
Rscript src/run_report.R example/export.zip --duration 24 --out example   # 24 months reaches back to the sample's data
```

Then open the new `example/running_report_*.html` in a browser; a copy already
generated this way is included: **[click to open the example report](https://htmlpreview.github.io/?https://github.com/wgost/apple-health-running/blob/main/example/running_report_2024-11-01_2026-10-17.html)**.

### Run it on your own data

Export your data on iPhone: **Health app → profile picture → Export All Health Data**.
AirDrop or save the resulting `export.zip` to your computer. Don't unzip it; the
program reads the zip directly. Then, from the shell in the project folder:

```sh
Rscript src/run_report.R ~/Downloads/export.zip
Rscript src/run_report.R ~/Downloads/export.zip --duration 6
Rscript src/run_report.R ~/Downloads/export.zip --out reports
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
source("src/parse_export.R"); source("src/metrics.R")
start <- report_start(3)                      # same as --duration 3
x     <- read_health_export("export.zip", start = start)
runs  <- build_runs(x, start, Sys.Date())
monthly_summary(runs)
```

## What it computes

The report takes each running workout in the export, measures it (distance, duration, pace, heart
rate, energy, cadence), adds the watch's extra readings when present (power, stride length, vertical
oscillation, ground contact, weather), and then groups the runs by month and by week to show totals, averages
and trends. Heart-rate zones are set from your resting and maximum HR, and runs missing a reading are skipped
for that metric only. For the full detail and the data checks, open the
[example report](https://htmlpreview.github.io/?https://github.com/wgost/apple-health-running/blob/main/example/running_report_2024-11-01_2026-10-17.html) and see its **Reference** section, under "How it's calculated".

## Layout

```
src/run_report.R           command-line entry point
src/parse_export.R         streams export.xml out of the zip
src/metrics.R              per-run metrics, monthly and weekly summaries
src/build_report.R         builds the HTML report (tables, figures, data checks)
src/report.css             report styling
example/                   anonymised sample export.zip and a sample report
LICENSE                    GNU General Public License v3.0
```

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
