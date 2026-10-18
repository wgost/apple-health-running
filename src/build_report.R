# Build the running report as a single self-contained HTML file
# Expects src/parse_export.R and src/metrics.R to be sourced already (src/run_report.R does this).

# ---- tiny helpers ----
FIG_DPI <- 200                                      # every chart image uses the same resolution
b64_encode <- function(raw) {                       # pure-R base64
  tbl <- c(LETTERS, letters, 0:9, "+", "/")
  n <- length(raw); pad <- (3 - n %% 3) %% 3
  r <- as.integer(c(raw, as.raw(rep(0, pad))))
  m <- matrix(r, nrow = 3)
  v <- m[1, ] * 65536L + m[2, ] * 256L + m[3, ]
  idx <- rbind(v %/% 262144L, (v %/% 4096L) %% 64L, (v %/% 64L) %% 64L, v %% 64L) + 1L
  out <- tbl[idx]
  if (pad) out[(length(out) - pad + 1):length(out)] <- "="
  paste(out, collapse = "")
}
esc <- function(s) {                                # HTML-escape + typographic apostrophes
  s <- gsub("&", "&amp;", s, fixed = TRUE); s <- gsub("<", "&lt;", s, fixed = TRUE)
  s <- gsub(">", "&gt;", s, fixed = TRUE); gsub("(?<=\\w)'", "\u2019", s, perl = TRUE)
}
slug <- function(s) gsub("^-|-$", "", gsub("[^a-z0-9]+", "-", tolower(sub("^[0-9]+\\.\\s*", "", s))))

build_report <- function(data_rds, start, end, out_file, css_file) {
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

  md   <- function(d) sub(" 0", " ", format(as.Date(d), "%b %d"))
  mon_label <- function(m) {
    d1 <- as.Date(paste0(m, "-01")); last_day <- seq(d1, by = "month", length.out = 2)[2] - 1
    lo <- max(d1, start); hi <- min(last_day, end_actual)
    if (lo == d1 && hi == last_day) format(d1, "%B") else paste0(md(lo), "\u2013", as.integer(format(hi, "%d")))
  }
  month_partial <- vapply(ms$month, function(m) {   # month only partly covered by the range (the current month)
    d1 <- as.Date(paste0(m, "-01")); last_day <- seq(d1, by = "month", length.out = 2)[2] - 1
    d1 < start || end_actual < last_day
  }, NA)
  f1 <- function(v) ifelse(is.finite(v), formatC(v, format = "f", digits = 1), "N/A")
  f2 <- function(v) ifelse(is.finite(v), formatC(v, format = "f", digits = 2), "N/A")
  r0 <- function(v) formatC(round(v), format = "d", big.mark = ",")
  hm <- function(minutes) sub("^<", "&lt;", fmt_hm(minutes))   # fmt_hm for HTML ("<1 m" must be escaped)

  # ---- units: US (default) and metric. Text is written twice (u-us / u-si spans) and each chart
  # is drawn twice; the page switch (see report.css) shows one of them. ----
  dual <- function(us, si) ifelse(us == si, us, paste0('<span class="u-us">', us, '</span><span class="u-si">', si, '</span>'))
  UN <- list(
    us = list(cls = "u-us", dist = 1, pace = 1, dlab = "miles", dunit = "mi", punit = "min/mi", tunit = "\u00b0F", near = "0.6 mi", temp = identity),
    si = list(cls = "u-si", dist = KM_PER_MI, pace = 1 / KM_PER_MI, dlab = "kilometres", dunit = "km", punit = "min/km", tunit = "\u00b0C", near = "1 km", temp = f_to_c))
  dist_u <- function(mi, f = f2, suffix = "") dual(paste0(f(mi), " mi", suffix), paste0(f(mi * KM_PER_MI), " km", suffix))
  pace_u <- function(p) dual(paste0(fmt_pace(p), " /mi"), paste0(fmt_pace(p / KM_PER_MI), " /km"))
  kcal_u <- function(per_mi, per = "") dual(paste0(r0(per_mi), " kcal", if (nzchar(per)) " per mi"), paste0(r0(per_mi / KM_PER_MI), " kcal", if (nzchar(per)) " per km"))
  temp_u <- function(f) ifelse(is.finite(f), dual(paste0(r0(f), "\u00b0F"), paste0(r0(f_to_c(f)), "\u00b0C")), "N/A")

  html_table <- function(df, align, class = "") {
    align <- c(l = "left", r = "right", c = "center")[align]
    th <- paste0('<th style="text-align:', align, '">', names(df), "</th>", collapse = "")
    body <- vapply(seq_len(nrow(df)), function(i)
      paste0("<tr>", paste0('<td style="text-align:', align, '">', unlist(lapply(df[i, ], as.character)), "</td>", collapse = ""), "</tr>"), "")
    paste0('<table class="', class, '"><thead><tr>', th, "</tr></thead><tbody>", paste(body, collapse = ""), "</tbody></table>")
  }
  PAL <- c("#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6")
  RAMP <- c("#d7301f", "#f28e2b", "#d4b000", "#1baf7a", "#2a78d6", "#6250d6")   # ordered, high-contrast
  month_names <- vapply(ms$month, mon_label, "")
  # Charts are drawn once on a transparent background with mid-grey text and faint grid lines, so the same image
  # reads on the light and the dark page. Chart titles are HTML (see fig()), not part of the image.
  MID <- "#818994"
  theme_run <- theme_minimal(base_size = 11) +
    theme(panel.grid.minor = element_blank(), panel.grid.major.x = element_blank(),
          panel.grid.major.y = element_line(colour = "#8a929c33", linewidth = 0.4),
          text = element_text(colour = MID), axis.title = element_text(size = 10), axis.text = element_text(colour = MID),
          legend.position = "top", legend.justification = "left", legend.title = element_blank(),
          plot.background = element_rect(fill = NA, colour = NA), panel.background = element_rect(fill = NA, colour = NA))

  # ---- output accumulators ----
  parts <- character(); toc <- list()
  add <- function(...) parts <<- c(parts, paste0(...))
  h1 <- function(t) { id <- slug(t); toc[[length(toc) + 1]] <<- list(id = id, text = t)
    add('<div id="', id, '" class="section level1"><h1>', esc(t), "</h1>") }
  h2 <- function(t) { id <- slug(t)
    add('<div id="', id, '" class="section level2"><h2>', esc(t), "</h2>") }
  close_div <- function() add("</div>")
  bullets <- function(items) add("<ul>", paste0("<li>", items, "</li>", collapse = "\n"), "</ul>")
  # A phone-sized copy of a chart: the legend in a few columns (a 7.2 in image shrunk to a phone is unreadable)
  narrow_plot <- function(p) p + guides(colour = guide_legend(ncol = 3), fill = guide_legend(ncol = 3)) + theme(legend.text = element_text(size = 8))
  # ggplot -> a chart box: HTML title and subtitle (taken from the plot) above a base64 PNG. A full-width chart also
  # gets a phone-sized copy; the CSS shows the one that fits.
  fig <- function(p, height, cls = NULL, width = 7.2) {
    if (is.null(p)) return(invisible())
    png_img <- function(plot, class, w, h) {
      f <- tempfile(fileext = ".png")
      if (requireNamespace("ragg", quietly = TRUE))        # ragg (optional) gives smaller files
        ragg::agg_png(f, width = w, height = h, units = "in", res = FIG_DPI, background = "transparent")
      else grDevices::png(f, width = w, height = h, units = "in", res = FIG_DPI, bg = "transparent")
      print(plot); grDevices::dev.off()
      raw <- readBin(f, "raw", file.size(f)); unlink(f)
      paste0('<img', if (nzchar(class)) paste0(' class="', class, '"'), ' src="data:image/png;base64,', b64_encode(raw), '" alt="', alt, '" />')
    }
    lb <- get_labs(p); title <- lb$title; sub <- lb$subtitle
    alt <- if (is.null(title)) "" else esc(title)
    p <- p + labs(title = NULL, subtitle = NULL)
    phone <- width > 5; nh <- max(4, height * 1.2)
    add('<div class="chart', if (width < 5) " panel", if (!is.null(cls)) paste0(" ", cls), '">',
        if (!is.null(title)) paste0('<p class="ctitle">', esc(title), "</p>"),
        if (!is.null(sub)) paste0('<p class="csub">', esc(sub), "</p>"),
        '<p class="fig">', png_img(p, if (phone) "wide" else "", width, height),
        if (phone) png_img(narrow_plot(p), "narrow", 3.6, nh), "</p></div>")
  }

  fig_u <- function(build, height) for (u in UN) fig(build(u), height, u$cls)   # one figure per unit system

  # Several small charts under one title. Each is its own image in a CSS grid, so they sit side by side
  # when there is room and stack vertically when the window is narrow (a facetted image could not).
  fig_grid <- function(title, subtitle, plots, height, cls = NULL) {
    add('<div class="figgrid', if (!is.null(cls)) paste0(" ", cls), '"><p class="figtitle"><b>', esc(title), "</b>",
        if (nzchar(subtitle)) paste0("<br><span>", esc(subtitle), "</span>"), "</p>")
    for (p in plots) fig(p, height, width = 3.6)
    close_div()
  }
  fig_grid_u <- function(build, title, subtitle, height) for (u in UN) fig_grid(title, subtitle, build(u), height, u$cls)
  by_metric <- function(d, make) lapply(split(d, factor(d$metric, levels = unique(d$metric))), make)   # one plot per metric

  # ---- meta + KPIs ----
  add('<div class="meta">',
      sprintf('<span>Range <b>%s \u2013 %s</b></span>', paste0(md(start_actual), if (format(start_actual, "%Y") != format(end_actual, "%Y")) format(start_actual, ", %Y")), paste0(md(end_actual), format(end_actual, ", %Y"))),
      sprintf('<span>Runs <b>%d</b> (%d outdoor, %d indoor)</span>', nrow(runs), sum(!runs$indoor), sum(runs$indoor)),
      sprintf('<span>Export generated <b>%s</b></span>', paste0(md(substr(x$export_date, 1, 10)), format(as.Date(substr(x$export_date, 1, 10)), ", %Y"))),
      sprintf('<span>Source: %s</span>', esc(paste(unique(runs$source), collapse = ", "))), "</div>")

  cm <- runs[runs$month == max(runs$month), ]
  D <- sum(cm$mi); M <- sum(cm$duration_min)
  H <- sum(cm$hr_avg * cm$duration_min, na.rm = TRUE) / sum(cm$duration_min[!is.na(cm$hr_avg)])
  L <- cm[which.max(cm$mi), ]
  kp <- list(c("Distance", dist_u(D, f1), dist_u(D / nrow(cm), f1, " per run")),
             c("Running time", hm(M), paste(nrow(cm), "runs")),
             c("Avg pace", pace_u(M / D), "distance-weighted"),
             c("Active energy", if (all(is.na(cm$energy_kcal))) "N/A" else paste(r0(sum(cm$energy_kcal, na.rm = TRUE)), "kcal"),
               if (all(is.na(cm$energy_kcal))) "" else kcal_u(sum(cm$energy_kcal, na.rm = TRUE) / sum(cm$mi[!is.na(cm$energy_kcal)]), per = "per")),
             c("Avg heart rate", paste(round(H), "bpm"), "duration-weighted"),
             c("Longest run", dist_u(L$mi), paste(md(L$date), "\u00b7", fmt_dur(L$duration_min))))
  add(sprintf('<p class="caption">Latest month (%s), all runs. Earlier months are in the tables below.</p>', tail(month_names, 1)))
  add('<div class="kpis">', paste0('<div class="kpi"><span class="l">', sapply(kp, `[`, 1), '</span><span class="v">',
      sapply(kp, `[`, 2), '</span><span class="s">', sapply(kp, `[`, 3), "</span></div>", collapse = ""), "</div>")

  # ---- 1. Summary ----
  h1("1. Summary")

  seg_buttons <- function(group) add('<div class="seg" role="group" aria-label="Run type" data-group="', group, '">',
      '<button type="button" data-pane="all">All runs</button><button type="button" data-pane="outdoor">Outdoor</button>',
      '<button type="button" data-pane="indoor">Indoor</button></div>')

  # change from the previous month, as a small "up/down" note after the value
  no_delta <- '<span class="d"></span>'
  delta <- function(new, old, kind = "pct", digits = 0, scale = 1, suffix = "", vs = "previous month") {
    if (!all(is.finite(c(new, old)))) return(no_delta)
    d <- round(if (kind == "pct") 100 * (new / old - 1) else (new - old) * scale, digits)
    if (d == 0) return(no_delta)
    sprintf('<span class="d" title="vs %s">%s %s%s</span>', vs, if (d > 0) "\u25b2" else "\u25bc",
            formatC(abs(d), format = "f", digits = digits), if (kind == "pct") "%" else suffix)
  }

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

  # ---- 2. Performance (outdoor runs) ----
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
  for (i in seq_len(nrow(pf))) {
    m <- pf[i, ]; pr <- if (i > 1) pf[i - 1, ]
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
  add('<div class="tablebox">', html_table(pdf, align = c("l", rep("r", nrow(pf))), class = "months deltas"), "</div>")

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

  # ---- 3. Reference: how it's calculated, data checks ----
  h1("3. Reference")
  h2("How it's calculated")
  calc <- rbind(
    c("Distance and pace", "Distance, duration", "Workout totals", dual("Distance in miles; duration excludes paused time.", "Distance in kilometres; duration excludes paused time.")),
    c("", "Avg pace", "\u03a3 duration \u00f7 \u03a3 distance", "Per month."),
    c("Heart rate", "Avg HR", "\u03a3(run HR \u00d7 duration) \u00f7 \u03a3 duration", "Run HR is the time-weighted mean of its HR samples: each sample counts for the time it covers."),
    c("", "Max HR", "Highest HR sample", "Samples outside 40\u2013220 bpm, or spikes over 25 bpm from both neighbours, are excluded."),
    c("", "Zone max HR", if (max_hr_from_age) "208 \u2212 0.7 \u00d7 age" else "Highest valid HR sample",
      if (max_hr_from_age) "Age from the export\u2019s date of birth." else "No birth date in the export."),
    c("", "Resting HR", "Median of resting-HR readings, last 30 days",
      if (rest_hr_found) "Floor of the zones." else "No readings; zones use a share of max HR."),
    c("", "HR zone limit", "resting HR + % \u00d7 (max HR \u2212 resting HR)", "Same method as Apple Watch. % = 60, 70, 80, 90 for the top of Z1\u2013Z4."),
    c("", "Time in zone", "Time-weighted HR samples", "Same weighting as avg HR, so each run adds up to its elapsed time."),
    c("Energy and form", "Active energy", "Watch workout total (kcal)", "Runs without it are skipped."),
    c("", "Avg cadence", "Steps \u00f7 duration", "Steps/min, both feet."),
    c("", "Vertical oscillation, ground contact", "Duration-weighted mean", "Runs without it are skipped."),
    c("Performance (outdoor runs)", "Efficiency", "Speed (m/min) \u00f7 avg HR", "Metres per heartbeat; higher is better."),
    c("", "Power, stride length", "Mean of the watch\u2019s samples", "Runs without samples are skipped."),
    c("", "Cardiac drift", "100 \u00d7 (1 \u2212 (speed \u00f7 HR, 2nd half) \u00f7 (speed \u00f7 HR, 1st half))",
      sprintf("Positive = HR rose faster than speed. Runs of %d min or more only.", DRIFT_MIN_MIN)),
    c("", "Weather", "Temperature and humidity at the start", "Compared with efficiency and with HR at the same speed.")
  )
  add('<div class="tablebox">', html_table(setNames(as.data.frame(calc), c("Area", "Metric", "Formula", "Notes")), align = rep("l", 4), class = "formulas"), "</div>")
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
  add(sprintf('<p class="caption">%s. Runs are dated by local start time. Generated %s from %s by src/run_report.R.</p>', dual("Distance in miles, temperature in \u00b0F", "Distance in kilometres, temperature in \u00b0C"),
              format(Sys.time(), "%Y-%m-%d %H:%M"), esc(basename(x$zip_path))))
  close_div()
  close_div()

  # ---- page: header (section tabs, dark/light and units buttons), scripts, assembly ----
  toc_html <- paste0("<ul>", paste0(vapply(toc, function(t) sprintf('<li><a href="#%s">%s</a></li>', t$id, esc(sub("^[0-9]+\\.\\s*", "", t$text))), ""), collapse = ""), "</ul>")

  css <- paste(readLines(css_file, encoding = "UTF-8", warn = FALSE), collapse = "\n")
  # dark is the default; the choice is remembered in localStorage
  theme_init <- paste0("<script>(function(){var t='dark',u='us';try{t=localStorage.getItem('theme')==='light'?'light':'dark';u=localStorage.getItem('units')==='si'?'si':'us';}catch(e){}",
    "document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-units',u);})();</script>")
  toggle_js <- paste0("<script>(function(){var r=document.documentElement;",       # each button flips an attribute on <html> and remembers it
    "function wire(id,attr,a,b,key,labelA,labelB){var btn=document.getElementById(id);",
    "function show(){btn.innerHTML=r.getAttribute(attr)===a?labelA:labelB;}",
    "btn.addEventListener('click',function(){var v=r.getAttribute(attr)===a?b:a;r.setAttribute(attr,v);",
    "try{localStorage.setItem(key,v);}catch(e){}show();});show();}",
    "wire('theme-toggle','data-theme','light','dark','theme','\u263E','\u2600');",
    "wire('units-toggle','data-units','si','us','units','<i>km \u00b7 </i>\u00b0C','<i>mi \u00b7 </i>\u00b0F');",
    "var bar=document.getElementById('topbar');function onscroll(){bar.classList.toggle('scrolled',window.scrollY>8);}",   # semi-transparent bar once scrolled
    "window.addEventListener('scroll',onscroll,{passive:true});onscroll();",
    "var links=document.querySelectorAll('#topbar nav a');",                          # underline the section being read
    "function spy(){var cur=null;for(var i=0;i<links.length;i++){var el=document.getElementById(links[i].getAttribute('href').slice(1));",
    "if(el&&el.getBoundingClientRect().top<=140)cur=links[i];}",
    "if(window.innerHeight+window.scrollY>=document.body.scrollHeight-4)cur=links[links.length-1];",
    "for(var j=0;j<links.length;j++)links[j].classList.toggle('on',links[j]===cur);}",
    "window.addEventListener('scroll',spy,{passive:true});window.addEventListener('resize',spy);window.addEventListener('load',spy);spy();})();</script>")
  tabs_js <- paste0("<script>(function(){var segs=document.querySelectorAll('.seg');",     # All / Outdoor / Indoor switches, one per group
    "function wire(seg){var g=seg.getAttribute('data-group'),btns=seg.querySelectorAll('button'),",
    "panes=document.querySelectorAll('.pane[data-group=\"'+g+'\"]');",
    "function pick(id){for(var i=0;i<btns.length;i++){var on=btns[i].getAttribute('data-pane')===id;btns[i].classList.toggle('on',on);btns[i].setAttribute('aria-pressed',on);}",
    "for(var j=0;j<panes.length;j++)panes[j].hidden=panes[j].getAttribute('data-pane')!==id;}",
    "seg.addEventListener('click',function(e){var b=e.target.closest('button');if(b)pick(b.getAttribute('data-pane'));});pick('all');}",
    "for(var k=0;k<segs.length;k++)wire(segs[k]);})();</script>")
  html <- paste0('<!DOCTYPE html>\n<html lang="en" data-theme="dark">\n<head>\n<meta charset="utf-8" />\n',
                 '<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Running Log</title>\n', theme_init, "\n",
                 "<style>\n", css, "\n</style>\n</head>\n<body>\n",
                 '<header id="topbar"><nav>', toc_html, '</nav><div class="tools"><button id="theme-toggle" type="button" aria-label="Switch between dark and light mode" title="Dark / light"></button>',
                 '<button id="units-toggle" type="button" aria-label="Switch between US units (miles, \u00b0F) and metric units (km, \u00b0C)" title="US / metric units"></button></div></header>\n', toggle_js,
                 '\n<main>\n<h1 class="title">Running Log</h1>\n', paste(parts, collapse = "\n"), "\n</main>\n", tabs_js, "\n</body>\n</html>\n")
  writeLines(html, out_file, useBytes = TRUE)
  invisible(out_file)
}
