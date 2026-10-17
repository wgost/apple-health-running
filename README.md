# apple-health-running

An R program that turns the Apple Health export (`export.zip`) from your iPhone
into a running report: a monthly summary, figures, and data-quality checks.

## Getting the input

On iPhone: **Health app → profile picture → Export All Health Data**. AirDrop or
save the resulting `export.zip` to your computer. Don't unzip it; the program reads the zip directly.

## Requirements

- R ≥ 4.1
- Package: `ggplot2`

## Usage

```sh
Rscript src/run_report.R ~/Downloads/export.zip
Rscript src/run_report.R ~/Downloads/export.zip --start 2026-08-01 --end 2026-10-16
Rscript src/run_report.R ~/Downloads/export.zip --start 2026-09-01 --out reports
```

| Option | Default | Meaning |
|---|---|---|
| `--start` | 1st of the month two months back (Oct → Aug 1) | First local date to include |
| `--end` | today | Last local date to include |
| `--out` | `output` | Output folder |
| `--reparse` | off | Ignore the cached parse and read the zip again |

The first run on a multi-GB export takes about 1–3 minutes. The parsed data is
cached in `output/parsed_export.rds` and reused while the zip and the start
date are unchanged, so trying different `--end` dates is quick.

From an R session instead of the shell:

```r
source("src/parse_export.R"); source("src/metrics.R")
x    <- read_health_export("export.zip", start = "2026-08-01")
runs <- build_runs(x, "2026-08-01", "2026-10-16")
monthly_summary(runs)
```

## What it computes

| Metric | How |
|---|---|
| Distance | Workout `DistanceWalkingRunning` total, in miles |
| Duration | Apple's workout duration (excludes manual pauses); a separate moving time is not in the export |
| Pace | duration ÷ distance; monthly pace is Σ duration ÷ Σ distance |
| Avg HR | Time-weighted mean of the watch's raw HR samples inside the workout |
| Max HR | Highest sample after excluding values outside 40–220 bpm and isolated spikes >25 bpm from both neighbours |
| Cadence | Workout step count ÷ duration (total steps/min, both feet) |
| Vertical oscillation, ground contact | Apple's recorded workout averages (not recorded indoors) |
| Monthly HR | Σ(run avg HR × duration) ÷ Σ duration |

## Layout

```
src/run_report.R           command-line entry point
src/parse_export.R         streams export.xml out of the zip
src/metrics.R              per-run metrics, monthly and weekly summaries
src/build_report.R         builds the HTML report (tables, figures, data checks)
src/report.css             report styling
```
