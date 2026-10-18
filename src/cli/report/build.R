# Build the running report as a single self-contained HTML file.
# Expects cli/parse_export.R, cli/metrics.R and the other files in cli/report/ to be sourced already
# (cli/run_report.R does this). The page template, CSS and scripts come from shared/ (also used by the web app).

build_report <- function(data_rds, start, end, out_file, shared_dir) {
  suppressPackageStartupMessages(library(ggplot2))

  x <- readRDS(data_rds)
  runs  <- build_runs(x, start, end)
  outv  <- runs[!runs$indoor, ]
  ms    <- monthly_summary(runs)
  prior <- prior_runs(x, start)
  wk    <- weekly_load(runs, prior)
  rg    <- route_groups(runs)
  start_actual <- min(runs$date); end_actual <- max(runs$date)   # first and last run in the range
  hr_seen <- max(runs$hr_max, na.rm = TRUE)                    # highest valid HR sample in the range
  max_hr <- estimate_max_hr(x$birth_date, end_actual)
  max_hr_from_age <- !is.na(max_hr)
  if (!max_hr_from_age) max_hr <- hr_seen
  rest_hr <- estimate_rest_hr(x$records, end_actual)
  rest_hr_found <- !is.na(rest_hr)
  if (!rest_hr_found) rest_hr <- 0                              # no resting HR: plain share of max HR
  zlab <- zone_labels(max_hr, rest_hr)
  zone_note <- if (rest_hr_found) sprintf("heart-rate reserve (max %d, resting %d bpm)", round(max_hr), round(rest_hr)) else sprintf("share of max HR (%d bpm)", round(max_hr))
  zsec <- zone_seconds(runs, max_hr, rest_hr)

  month_first <- as.Date(paste0(ms$month, "-01"))
  month_no <- as.integer(substr(ms$month, 1, 4)) * 12 + as.integer(substr(ms$month, 6, 7))
  month_follows <- c(FALSE, diff(month_no) == 1)   # TRUE when the previous column is the calendar-previous month, so a change can be shown
  abbr_fmt <- if (anyDuplicated(format(month_first, "%b"))) "%b %y" else "%b"   # a month name repeats after 12 months: add the year
  mon_label <- function(m, abbreviate = TRUE) {
    d1 <- as.Date(paste0(m, "-01")); last_day <- seq(d1, by = "month", length.out = 2)[2] - 1
    lo <- max(d1, start); hi <- min(last_day, end_actual)
    if (lo == d1 && hi == last_day) format(d1, if (abbreviate) abbr_fmt else "%B") else paste0(md(lo), "\u2013", as.integer(format(hi, "%d")))
  }
  month_names <- vapply(ms$month, mon_label, "")                 # table headers and chart legends: "Oct"
  latest_month_name <- mon_label(tail(ms$month, 1), abbreviate = FALSE)   # the KPI caption: "October"
  month_partial <- vapply(ms$month, function(m) {   # month only partly covered by the range (the current month)
    d1 <- as.Date(paste0(m, "-01")); last_day <- seq(d1, by = "month", length.out = 2)[2] - 1
    d1 < start || end_actual < last_day
  }, NA)

  page <- new_page()
  ctx <- c(list(x = x, start = start, runs = runs, outv = outv, ms = ms, wk = wk, rg = rg,
                start_actual = start_actual, end_actual = end_actual, max_hr = max_hr, max_hr_from_age = max_hr_from_age,
                rest_hr = rest_hr, rest_hr_found = rest_hr_found, zlab = zlab, zone_note = zone_note, zsec = zsec,
                month_names = month_names, latest_month_name = latest_month_name, month_partial = month_partial, month_follows = month_follows, theme_run = run_theme()),
           page)

  report_overview(ctx)
  report_summary(ctx)
  report_performance(ctx)
  report_reference(ctx)

  writeLines(page$render(shared_dir), out_file, useBytes = TRUE)
  invisible(out_file)
}
