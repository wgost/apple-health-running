# Section 1: month tables, heart-rate zones and charts for all runs.
report_summary <- function(ctx) with(ctx, {
  # ---- 1. Summary ----
  h1("1. Summary")

  seg_buttons <- function(group) add('<div class="seg" role="group" aria-label="Run type" data-group="', group, '">',
      '<button type="button" data-pane="all">All runs</button><button type="button" data-pane="outdoor">Outdoor</button>',
      '<button type="button" data-pane="indoor">Indoor</button></div>')

  month_table <- function(msx, id, label, mech = TRUE) {
    add('<div class="pane" data-group="tables" data-pane="', id, '"><p class="pane-title">', label, "</p>")
    rows <- c("Runs", "Total distance", "Total running time", "Active energy burned", dual("Energy per mile", "Energy per km"),
              "Avg pace", "Avg HR", "Max HR", "Longest run", "Fastest run by pace", "Avg cadence",
              if (mech) c("Avg vertical oscillation", "Avg ground contact time"))
    cell <- function(m, prev, partial) {
      if (m$runs == 0) return(paste0('<span class="v">', c(0, rep("\u2014", length(rows) - 1)), "</span>", no_delta))
      vals <- c(m$runs, dist_u(m$mi), hm(m$minutes),
        if (is.na(m$kcal)) "N/A" else paste0(r0(m$kcal), " kcal"),
        if (is.na(m$kcal_per_mi)) "N/A" else kcal_u(m$kcal_per_mi),
        pace_u(m$pace_mi),
        paste0(f1(m$hr_weighted), " bpm"), if (is.na(m$hr_max)) "N/A" else paste0(round(m$hr_max), " bpm"),
        dist_u(m$longest_mi),
        dual(paste0(fmt_pace(m$fastest_pace), "\u00a0/mi, ", f2(m$fastest_mi), "\u00a0mi"),     # no-break spaces: a narrow cell wraps only after the comma
             paste0(fmt_pace(m$fastest_pace / KM_PER_MI), "\u00a0/km, ", f2(m$fastest_mi * KM_PER_MI), "\u00a0km")), paste(f1(m$cadence), "spm"),
        if (mech) c(if (m$mech_runs) paste0(f1(m$vert_osc), " cm") else "Not recorded",
                    if (m$mech_runs) paste0(round(m$gct), " ms") else "Not recorded"))
      dels <- rep(no_delta, length(rows))
      if (!is.null(prev)) {
        if (!partial) {                              # totals are not comparable for a part-month
          dels[2] <- delta(m$mi, prev$mi); dels[3] <- delta(m$minutes, prev$minutes); dels[4] <- delta(m$kcal, prev$kcal)
        }
        dels[6] <- dual(delta(m$pace_mi, prev$pace_mi, "abs", scale = 60, suffix = " s"),
                        delta(m$pace_mi, prev$pace_mi, "abs", scale = 60 / KM_PER_MI, suffix = " s"))
        dels[7] <- delta(m$hr_weighted, prev$hr_weighted, "abs", digits = 1)
        dels[11] <- delta(m$cadence, prev$cadence, "abs", digits = 1)
      }
      paste0('<span class="v">', vals, "</span>", dels)
    }
    mt <- data.frame(Measure = rows)
    for (i in seq_len(nrow(msx))) mt[[month_names[i]]] <- cell(msx[i, ], if (i > 1) msx[i - 1, ], month_partial[i])
    add('<div class="tablebox">', html_table(mt, align = c("l", rep("r", nrow(msx))), class = "months deltas"), "</div>")
    close_div()
  }
  h2("By month")
  seg_buttons("tables")
  add('<p class="caption">\u25b2 / \u25bc = change from the previous month (for pace, \u25bc means faster; pace is in seconds). Totals are not compared for a part-month.</p>')
  month_table(ms, "all", "All runs", mech = FALSE)
  month_table(monthly_summary(runs, "outdoor"), "outdoor", "Outdoor runs")
  month_table(monthly_summary(runs, "indoor"), "indoor", "Indoor runs", mech = FALSE)
  close_div()

  # heart-rate zones, all runs
  h2("Heart-rate zones")
  add(sprintf('<p class="caption">Time in each zone, all runs. Zones by %s. \u25b2 / \u25bc = change in share from the previous month, in percentage points.</p>', zone_note))
  zm <- rowsum(zsec, runs$month)[ms$month, , drop = FALSE]    # seconds per month x zone
  zt <- rowSums(zm)
  zcell <- function(sec, tot) if (sec > 0) sprintf("%s (%d%%)", hm(sec / 60), round(100 * sec / tot)) else "\u2014"
  share <- round(100 * cbind(zm, easy = zm[, 1] + zm[, 2]) / ifelse(zt > 0, zt, NA))   # % of the month's zone time, as displayed
  zdf <- data.frame(Zone = c(zlab, "Easy share (Z1\u2013Z2)"))
  for (i in seq_len(nrow(zm))) {
    vals <- c(vapply(seq_along(ZONE_NAMES), function(k) zcell(zm[i, k], zt[i]), ""),
              if (zt[i] > 0) sprintf("%d%%", share[i, "easy"]) else "\u2014")
    dels <- if (i > 1) vapply(seq_len(ncol(share)), function(k) delta(share[i, k], share[i - 1, k], "abs", suffix = " pt"), "") else rep(no_delta, ncol(share))
    zdf[[month_names[i]]] <- paste0('<span class="v">', vals, "</span>", dels)
  }
  add('<div class="tablebox">', html_table(zdf, align = c("l", rep("r", nrow(zm))), class = "months deltas"), "</div>")
  close_div()

  h2("Charts")
  wk$label <- format(wk$week, "%b %d")
  wk$partial <- wk$week < start | wk$week + 6 > end_actual
  # ---- charts that work for any run type: All / Outdoor / Indoor switch (one pane per type) ----
  seg_buttons("charts")
  add('<p class="caption">Applies to the next three charts: weekly time in heart-rate zones, pace vs heart rate, and cadence.</p>')
  month_cols <- setNames(rep_len(PAL, length(month_names)), month_names)   # one colour per month, the same in every pane
  zone_fill <- setNames(rev(c("#c9dff3", "#7fb5e8", "#eda100", "#eb6834", "#c2321f")), rev(zlab))
  chart_types <- list(all = list("All runs", rep(TRUE, nrow(runs))), outdoor = list("Outdoor runs", !runs$indoor),
                      indoor = list("Indoor runs", runs$indoor))
  for (id in names(chart_types)) {
    keep <- chart_types[[id]][[2]]; sub <- runs[keep, ]
    add('<div class="pane" data-group="charts" data-pane="', id, '"><p class="pane-title">', chart_types[[id]][[1]], "</p>")
    if (!nrow(sub)) {
      add("<p>No ", tolower(chart_types[[id]][[1]]), " in this range.</p>")
    } else {
      # weekly time in heart-rate zones
      rs <- rowsum(zsec[keep, , drop = FALSE], as.character(week_start(sub$date)))
      zw <- matrix(0, nrow(wk), ncol(zsec)); at <- match(as.character(wk$week), rownames(rs))
      zw[!is.na(at), ] <- rs[at[!is.na(at)], ]; zw <- zw / 60
      zl <- data.frame(week = rep(wk$week, ncol(zw)), Zone = factor(rep(zlab, each = nrow(zw)), levels = rev(zlab)),
                       minutes = as.vector(zw), partial = rep(wk$partial, ncol(zw)))
      fig(ggplot(zl, aes(week, minutes, fill = Zone)) +
        geom_col(aes(alpha = partial), width = 4.2, colour = NA) +
        scale_fill_manual(values = zone_fill, breaks = zlab) +
        scale_alpha_manual(values = c(`FALSE` = 1, `TRUE` = 0.45), guide = "none") +
        scale_x_date(breaks = wk$week, labels = wk$label) +
        scale_y_continuous(expand = expansion(mult = c(0, 0.05))) +
        labs(title = "Weekly time in heart-rate zones", subtitle = sprintf("Zones by %s. Faded bars are weeks only partly inside the range.", zone_note),
             x = NULL, y = "minutes") +
        theme_run + theme(axis.text.x = element_text(angle = 45, hjust = 1)), 3.8)

      # pace vs heart rate
      sc <- sub[is.finite(sub$pace_mi) & is.finite(sub$hr_avg), ]
      if (nrow(sc)) {
        sc$Month <- factor(month_names[match(sc$month, ms$month)], levels = month_names)
        fig_u(function(u) {
          sc$pace <- sc$pace_mi * u$pace
          ggplot(sc, aes(pace, hr_avg, colour = Month)) +
            geom_point(size = 2.8, stroke = 0) +
            scale_x_continuous(labels = fmt_pace) +
            scale_colour_manual(values = month_cols) +
            labs(title = "Pace vs heart rate", x = sprintf("pace (%s)", u$punit), y = "avg HR (bpm)") + theme_run
        }, 4.2)
      }

      # cadence
      cd <- sub[is.finite(sub$cadence_spm), ]
      if (nrow(cd) >= 3) fig(ggplot(cd, aes(date, cadence_spm)) + geom_point(colour = PAL[1], size = 2.4) +
        geom_smooth(method = "lm", se = FALSE, colour = "#9aa3ad", linewidth = 0.6, linetype = "solid", formula = y ~ x) +
        labs(title = "Cadence", subtitle = sprintf("Total steps per minute, %s, with a straight-line trend.", tolower(chart_types[[id]][[1]])),
             x = NULL, y = "steps/min") + theme_run, 3.4)
    }
    close_div()
  }

  # weekly distance already splits outdoor and indoor, so it sits outside the switch
  fig_u(function(u) {
    wkl <- rbind(data.frame(week = wk$week, Type = "Outdoor", dist = wk$mi_outdoor * u$dist, partial = wk$partial),
                 data.frame(week = wk$week, Type = "Indoor", dist = wk$mi_indoor * u$dist, partial = wk$partial))
    wkl$Type <- factor(wkl$Type, levels = c("Indoor", "Outdoor"))
    tot <- data.frame(week = wk$week, dist = wk$mi * u$dist)
    ggplot(wkl, aes(week, dist, fill = Type)) +
      geom_col(aes(alpha = partial), width = 4.2, colour = NA) +
      geom_text(data = tot, aes(week, dist, label = f1(dist)), inherit.aes = FALSE, vjust = -0.5, size = 3, colour = MID) +
      scale_fill_manual(values = c(Outdoor = PAL[1], Indoor = PAL[2]), breaks = c("Outdoor", "Indoor")) +
      scale_alpha_manual(values = c(`FALSE` = 1, `TRUE` = 0.45), guide = "none") +
      scale_x_date(breaks = wk$week, labels = wk$label) +
      scale_y_continuous(expand = expansion(mult = c(0, 0.12))) +
      labs(title = "Weekly distance", subtitle = "Faded bars are weeks only partly inside the range.", x = NULL, y = u$dlab) +
      theme_run + theme(axis.text.x = element_text(angle = 45, hjust = 1))
  }, 3.6)

  rr <- rg[!is.na(rg$route_mi), ]
  if (nrow(rr)) {
    fig_u(function(u) {
      rr$pace <- rr$pace_mi * u$pace
      lab <- sprintf("~%.1f %s route", rr$route_mi * u$dist, u$dunit)
      rr$route <- factor(lab, levels = unique(lab[order(rr$route_mi)]))
      ggplot(rr, aes(date, pace, colour = route)) +
        geom_line(linewidth = 0.7) + geom_point(size = 2.4) +
        scale_y_continuous(labels = fmt_pace) + scale_colour_manual(values = PAL) +
        labs(title = "Same routes over time",
             subtitle = sprintf("Pace on recurring outdoor distances (5+ runs within ~%s of each other).", u$near),
             x = NULL, y = sprintf("pace (%s)", u$punit)) + theme_run
    }, 4)
  }

  rec <- x$records; rec$date <- as.Date(substr(rec$start, 1, 10))
  rec <- rec[rec$date >= start & rec$date <= end_actual, ]
  hrv <- rec[rec$type == "HeartRateVariabilitySDNN", ]; hrv$week <- week_start(hrv$date)
  hrvw <- if (any(hrv$week >= start)) aggregate(value ~ week, hrv[hrv$week >= start, ], mean) else data.frame(week = as.Date(character()), value = numeric())
  names(hrvw) <- c("date", "value")
  mk <- function(metric, date, value) if (length(value)) data.frame(metric = metric, date = as.Date(date), value = value) else NULL
  rhr_r <- rec[rec$type == "RestingHeartRate", ]; vo2_r <- rec[rec$type == "VO2Max", ]
  panel <- rbind(
    mk("Resting HR (bpm, daily)", rhr_r$date, rhr_r$value),
    mk("HRV SDNN (ms, weekly mean)", hrvw$date, hrvw$value),
    mk("1-min HR recovery (bpm drop, per run)", runs$date[!is.na(runs$hrr_1min)], runs$hrr_1min[!is.na(runs$hrr_1min)]),
    mk("VO2max estimate (mL/kg/min)", vo2_r$date, vo2_r$value))
  if (is.null(panel)) panel <- data.frame()
  if (nrow(panel)) {
    fig_grid("Recovery and fitness markers", "", by_metric(panel, function(d)
      ggplot(d, aes(date, value)) + geom_line(colour = PAL[1], linewidth = 0.6) + geom_point(colour = PAL[1], size = 1.2) +
        labs(title = d$metric[1], x = NULL, y = NULL) + theme_run), 2.6)
  }
  close_div()
  close_div()
})
