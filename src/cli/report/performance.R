# Section 2: outdoor-run performance trends and the temperature effect.
report_performance <- function(ctx) with(ctx, {
  h1("2. Performance")
  add("<p>This section uses outdoor runs only, so treadmill distance does not blur the comparisons. Read the metrics as trends, not scores: most have no universal target, so compare runs at a similar pace and temperature.</p>")
  bullets(c(
    "<b>Efficiency</b>: metres per heartbeat; higher is better. Look for a rise at the same pace.",
    "<b>Power</b>: no universal target (it scales with body weight). The goal is the same or lower HR at the same power.",
    "<b>Stride length</b>: no target (it grows with speed and height). The goal is more of it at the same effort, with cadence around 165\u2013180 steps/min.",
    "<b>Cardiac drift</b>: under 5% on an easy run is good, 5\u201310% is common, and above 10% points to heat, fatigue or starting too fast.",
    paste0("<b>Temperature</b>: context only. Heat above roughly ", dual("70\u00b0F", "21\u00b0C"), " raises HR and lowers efficiency, so a dip on a hot day is not lost fitness.")))

  pf <- perf_summary(runs)
  pu <- function(v, fmt, unit) ifelse(is.finite(v), paste0(fmt(v), unit), "N/A")
  h2("Efficiency, power and drift")
  pdf <- data.frame(Measure = c("Outdoor runs", "Efficiency", "Avg running power", "Avg stride length", "Median cardiac drift", "Avg start temperature"))
  add('<p class="caption">\u25b2 / \u25bc = change from the previous month (drift in percentage points).</p>')
  shown <- which(pf$runs > 0)   # months without an outdoor run get no column
  for (i in shown) {
    m <- pf[i, ]; pr <- if (month_follows[i]) pf[i - 1, ]
    vals <- c(m$runs, pu(m$ef, f2, " m/beat"), pu(m$power_w, r0, " W"), pu(m$stride_m, f2, " m"),
      if (is.finite(m$drift)) sprintf("%s%% (%d runs)", f1(m$drift), m$drift_n) else "N/A", temp_u(m$temp_f))
    dels <- rep(no_delta, length(vals))
    if (!is.null(pr)) {                              # differences of the values as displayed (rounded)
      dels[2] <- delta(round(m$ef, 2), round(pr$ef, 2), "abs", digits = 2)
      dels[3] <- delta(round(m$power_w), round(pr$power_w), "abs")
      dels[4] <- delta(round(m$stride_m, 2), round(pr$stride_m, 2), "abs", digits = 2)
      dels[5] <- delta(round(m$drift, 1), round(pr$drift, 1), "abs", digits = 1)
      dels[6] <- dual(delta(round(m$temp_f), round(pr$temp_f), "abs", suffix = "\u00b0"),
                      delta(round(f_to_c(m$temp_f)), round(f_to_c(pr$temp_f)), "abs", suffix = "\u00b0"))
    }
    pdf[[month_names[i]]] <- paste0('<span class="v">', vals, "</span>", dels)
  }
  add('<div class="tablebox">', html_table(pdf, align = c("l", rep("r", length(shown))), class = "months deltas"), "</div>")

  if (sum(is.finite(outv$ef)) >= 3) fig(ggplot(outv, aes(date, ef)) + geom_point(colour = PAL[1], size = 2.4) +
    geom_smooth(method = "lm", se = FALSE, colour = "#9aa3ad", linewidth = 0.6, formula = y ~ x) +
    labs(title = "Pace efficiency", subtitle = "Metres per heartbeat (speed \u00f7 avg HR), outdoor runs, with a straight-line trend.",
         x = NULL, y = "metres per beat") + theme_run, 3.4)

  pw <- rbind(
    if (any(is.finite(outv$power_w))) data.frame(metric = "Avg running power (W)", date = outv$date, value = outv$power_w),
    if (any(is.finite(outv$stride_m))) data.frame(metric = "Avg stride length (m)", date = outv$date, value = outv$stride_m))
  if (!is.null(pw)) fig_grid("Running power and stride length", "Per outdoor run, with straight-line trends.", by_metric(pw[is.finite(pw$value), ], function(d)
    ggplot(d, aes(date, value)) + geom_point(colour = PAL[1], size = 2.2) +
      geom_smooth(method = "lm", se = FALSE, colour = "#9aa3ad", linewidth = 0.6, formula = y ~ x) +
      labs(title = d$metric[1], x = NULL, y = NULL) + theme_run), 3)
  sc2 <- outv[is.finite(outv$stride_m) & is.finite(outv$cadence_spm), ]
  if (nrow(sc2) >= 3) {
    step <- 0.5   # 30-second pace bands
    fig_u(function(u) {
      sc2$pace <- sc2$pace_mi * u$pace
      lo <- floor(min(sc2$pace) / step); hi <- floor(max(sc2$pace) / step)
      bands <- seq(lo, hi) * step
      sc2$pace_band <- factor(floor(sc2$pace / step) * step, levels = bands,
                              labels = paste0(fmt_pace(bands), "\u2013", fmt_pace(bands + step)))
      ggplot(sc2, aes(cadence_spm, stride_m, colour = pace_band)) + geom_point(size = 3, stroke = 0) +
        scale_colour_manual(values = grDevices::colorRampPalette(RAMP)(length(bands)),
                            name = sprintf("pace (%s)", u$punit), drop = FALSE) +
        guides(colour = guide_legend(nrow = 2)) +
        labs(title = "Stride length vs cadence", x = "cadence (steps/min)", y = "stride length (m)") + theme_run +
        theme(legend.title = element_text(size = 9))
    }, 3.8)
  }

  dr <- outv[is.finite(outv$drift_pct), ]
  if (nrow(dr)) {
    dlo <- floor(min(dr$duration_min) / 10) * 10; dhi <- floor(max(dr$duration_min) / 10) * 10
    dbands <- seq(dlo, dhi, 10)   # 10-minute duration bands
    dr$dur_band <- factor(floor(dr$duration_min / 10) * 10, levels = dbands, labels = paste0(dbands, "\u2013", dbands + 10))
    fig(ggplot(dr, aes(date, drift_pct, colour = dur_band)) +
      geom_hline(yintercept = c(0, 5), colour = "#9aa3ad", linewidth = 0.4, linetype = c("solid", "dashed")) +
      geom_point(size = 3, stroke = 0) +
      scale_colour_manual(values = grDevices::colorRampPalette(RAMP)(length(dbands)), name = "duration (min)", drop = FALSE) +
      labs(title = "Cardiac drift per run", subtitle = "Positive = HR rose relative to speed in the 2nd half. Dashed line at 5%.",
           x = NULL, y = "drift (%)") + theme_run +
      theme(legend.title = element_text(size = 9)), 3.4)
  } else bullets("No outdoor runs long enough with heart-rate and distance data in both halves.")

  close_div()

  h2("Temperature and performance")
  wo <- weather_runs(runs)
  for (u in UN) {                                   # the temperature bins and the pace column differ by unit system
    wb <- weather_bins(runs, if (u$dunit == "mi") "F" else "C")
    if (is.null(wb)) next
    wdf <- data.frame(Measure = c("Runs", "Avg humidity", "Avg pace", "Avg HR", "Efficiency", "Median drift"))   # bands as columns, like the month tables
    add('<p class="caption ', u$cls, '">\u25b2 / \u25bc = change from the previous (cooler) band (pace in seconds, \u25bc = faster; drift in percentage points).</p>')
    for (k in seq_len(nrow(wb))) {
      w <- wb[k, ]; pr <- if (k > 1) wb[k - 1, ]
      vals <- c(w$runs, paste0(round(w$humidity), "%"), paste0(fmt_pace(w$pace_mi * u$pace), " /", u$dunit),
        paste(f1(w$hr), "bpm"), paste(f2(w$ef), "m/beat"), if (is.finite(w$drift)) paste0(f1(w$drift), "%") else "N/A")
      dels <- rep(no_delta, length(vals))
      if (!is.null(pr)) {
        dd <- function(...) delta(..., vs = "previous band")
        dels[2] <- dd(round(w$humidity), round(pr$humidity), "abs", suffix = "%")
        dels[3] <- dd(w$pace_mi, pr$pace_mi, "abs", scale = 60 * u$pace, suffix = " s")
        dels[4] <- dd(round(w$hr, 1), round(pr$hr, 1), "abs", digits = 1)
        dels[5] <- dd(round(w$ef, 2), round(pr$ef, 2), "abs", digits = 2)
        dels[6] <- dd(round(w$drift, 1), round(pr$drift, 1), "abs", digits = 1)
      }
      wdf[[as.character(w$bin)]] <- paste0('<span class="v">', vals, "</span>", dels)
    }
    add('<div class="tablebox ', u$cls, '">', html_table(wdf, align = c("l", rep("r", nrow(wb))), class = "months deltas"), "</div>")
  }
  if (is.null(wo)) {
    bullets("Too few outdoor runs with weather data to estimate an effect.")
  } else {
    fig_grid_u(function(u) {
      wl <- rbind(data.frame(metric = "Efficiency (m per beat)", temp = u$temp(wo$temp_f), value = wo$ef),
                  data.frame(metric = "HR vs expected for the pace (bpm)", temp = u$temp(wo$temp_f), value = wo$hr_resid))
      by_metric(wl, function(d)
        ggplot(d, aes(temp, value)) + geom_point(colour = PAL[1], size = 2.4) +
          geom_smooth(method = "lm", se = FALSE, colour = "#9aa3ad", linewidth = 0.6, formula = y ~ x) +
          labs(title = d$metric[1], x = sprintf("temperature at start (%s)", u$tunit), y = NULL) + theme_run)
    }, "Temperature and performance", "Outdoor runs. HR vs expected = avg HR minus the HR a straight-line fit predicts for that speed.", 3.2)
  }
  close_div()
  close_div()
})
