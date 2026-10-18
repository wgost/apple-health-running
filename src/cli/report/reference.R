# Section 3: how the numbers are calculated, and data checks.
report_reference <- function(ctx) with(ctx, {
  # ---- 3. Reference: how it's calculated, data checks ----
  h1("3. Reference")
  h2("How it's calculated")
  calc <- rbind(
    c("Distance and pace", "Distance, duration", "Workout totals"),
    c("", "Avg pace", "\u03a3 duration \u00f7 \u03a3 distance"),
    c("Heart rate", "Avg HR", "\u03a3(run HR \u00d7 duration) \u00f7 \u03a3 duration"),
    c("", "Max HR", "Highest HR sample"),
    c("", "Zone max HR", if (max_hr_from_age) "208 \u2212 0.7 \u00d7 age" else "Highest valid HR sample"),
    c("", "Resting HR", "Median of resting-HR readings, last 30 days"),
    c("", "HR zone limit", "resting HR + % \u00d7 (max HR \u2212 resting HR)"),
    c("", "Time in zone", "Time-weighted HR samples"),
    c("Energy and form", "Active energy", "Watch workout total (kcal)"),
    c("", "Avg cadence", "Steps \u00f7 duration"),
    c("", "Vertical oscillation, ground contact", "Duration-weighted mean"),
    c("Performance (outdoor runs)", "Efficiency", "Speed (m/min) \u00f7 avg HR"),
    c("", "Power, stride length", "Mean of the watch\u2019s samples"),
    c("", "Cardiac drift", "100 \u00d7 (1 \u2212 (speed \u00f7 HR, 2nd half) \u00f7 (speed \u00f7 HR, 1st half))"),
    c("", "Weather", "Temperature and humidity at the start")
  )
  add('<div class="tablebox">', html_table(setNames(as.data.frame(calc), c("Area", "Metric", "Formula")), align = rep("l", 3), class = "formulas"), "</div>")
  close_div()

  h2("Data checks")
  n_out <- nrow(outv); cov <- function(v) sprintf("%d of %d", sum(is.finite(v)), n_out)
  checks <- rbind(
    c("Workouts", "Type and source", paste0("Running workouts only; ", esc(paste(unique(runs$source), collapse = ", ")))),
    c("", "Duplicate or overlapping workouts", sum(runs$duplicate)),
    c("", "Pace range", dual(paste0(fmt_pace(min(runs$pace_mi)), "\u2013", fmt_pace(max(runs$pace_mi)), " /mi; no runs excluded"),
         paste0(fmt_pace(min(runs$pace_mi) / KM_PER_MI), "\u2013", fmt_pace(max(runs$pace_mi) / KM_PER_MI), " /km; no runs excluded"))),
    c("Distance and time", "Workout total vs sum of distance samples", dual(paste("Largest difference", f2(max(abs(runs$dist_samples_mi - runs$mi))), "mi"),
         paste("Largest difference", f2(max(abs(runs$dist_samples_mi - runs$mi)) * KM_PER_MI), "km"))),
    c("", "End \u2212 start vs recorded duration", paste("Largest difference", f2(max(runs$elapsed_min - runs$duration_min)), "min")),
    c("Heart rate", "Samples inside workouts", sprintf("%s (%d\u2013%d per run)", r0(sum(runs$hr_n)), min(runs$hr_n), max(runs$hr_n))),
    c("", "Runs with HR samples", sprintf("%d of %d", sum(runs$hr_n > 0), nrow(runs))),
    c("", "Longest stretch without an HR sample", paste(round(max(runs$hr_max_gap_s, na.rm = TRUE)), "s")),
    c("", "Samples excluded (outside 40\u2013220 bpm, or spikes over 25 bpm from both neighbours)", sum(runs$hr_suspect_n)),
    c("HR zone inputs", "Date of birth (for max HR)",
      if (max_hr_from_age) sprintf("Found; max HR %d bpm", round(max_hr)) else sprintf("Missing; max HR is the highest recorded HR (%d bpm)", round(max_hr))),
    c("", "Resting HR, last 30 days",
      if (rest_hr_found) sprintf("%d readings to %s; median %d bpm", length(recent_resting_hr(x$records, end_actual)), format(end_actual, "%b %d"), round(rest_hr))
      else "No readings; zones are a plain share of max HR"),
    c("Performance inputs (outdoor runs)", "Power", cov(outv$power_w)),
    c("", "Stride length", cov(outv$stride_m)),
    c("", "Weather", cov(outv$temp_f)),
    c("", sprintf("Cardiac drift (runs of %d min or more, HR and distance in both halves)", DRIFT_MIN_MIN), cov(outv$drift_pct))
  )
  add('<div class="tablebox">', html_table(setNames(as.data.frame(checks), c("Area", "Check", "Result")), align = c("l", "l", "l"), class = "formulas"), "</div>")
  add(sprintf('<p class="caption">%s. Runs are dated by local start time. Generated %s from %s by src/cli/run_report.R.</p>', dual("Distance in miles, temperature in \u00b0F", "Distance in kilometres, temperature in \u00b0C"),
              format(Sys.time(), "%Y-%m-%d %H:%M"), esc(basename(x$zip_path))))
  close_div()
  close_div()
})
