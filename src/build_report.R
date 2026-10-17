# Build the running report as a single self-contained HTML file, in plain R.
# Only dependency: ggplot2 (no rmarkdown / knitr / pandoc / markdown).
# Expects src/parse_export.R and src/metrics.R to be sourced already (src/run_report.R does this).

# ---- tiny helpers (replace pandoc / knitr) ----
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

build_report <- function(data_rds, start_chr, end_chr, out_file, css_file) {
  suppressPackageStartupMessages(library(ggplot2))

  x <- readRDS(data_rds)
  start <- if (nzchar(start_chr)) as.Date(start_chr) else default_start()
  end   <- if (nzchar(end_chr)) as.Date(end_chr) else Sys.Date()
  runs  <- build_runs(x, start, end)
  outv  <- runs[!runs$indoor, ]
  ms    <- monthly_summary(runs)
  prior <- prior_runs(x, start)
  wk    <- weekly_load(runs, prior)
  rg    <- route_groups(runs)
  end_actual <- max(runs$date)

  md   <- function(d) sub(" 0", " ", format(as.Date(d), "%b %d"))
  mon_label <- function(m) {
    d1 <- as.Date(paste0(m, "-01")); last_day <- seq(d1, by = "month", length.out = 2)[2] - 1
    lo <- max(d1, start); hi <- min(last_day, end_actual)
    if (lo == d1 && hi == last_day) format(d1, "%B") else paste0(md(lo), "\u2013", as.integer(format(hi, "%d")))
  }
  f1 <- function(v) ifelse(is.finite(v), formatC(v, format = "f", digits = 1), "N/A")
  f2 <- function(v) ifelse(is.finite(v), formatC(v, format = "f", digits = 2), "N/A")
  r0 <- function(v) formatC(round(v), format = "d", big.mark = ",")

  html_table <- function(df, align, class = "") {
    align <- c(l = "left", r = "right", c = "center")[align]
    th <- paste0('<th style="text-align:', align, '">', names(df), "</th>", collapse = "")
    body <- vapply(seq_len(nrow(df)), function(i)
      paste0("<tr>", paste0('<td style="text-align:', align, '">', unlist(lapply(df[i, ], as.character)), "</td>", collapse = ""), "</tr>"), "")
    paste0('<table class="', class, '"><thead><tr>', th, "</tr></thead><tbody>", paste(body, collapse = ""), "</tbody></table>")
  }
  PAL <- c("#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6")
  month_names <- vapply(ms$month, mon_label, "")
  theme_run <- theme_minimal(base_size = 11) +
    theme(panel.grid.minor = element_blank(), panel.grid.major.x = element_blank(),
          panel.grid.major.y = element_line(colour = "#e8ebee", linewidth = 0.4),
          axis.title = element_text(colour = "#4a525c", size = 10), axis.text = element_text(colour = "#6f7781"),
          plot.title = element_text(face = "bold", size = 13), plot.subtitle = element_text(colour = "#4a525c", size = 10),
          legend.position = "top", legend.justification = "left", legend.title = element_blank(),
          plot.title.position = "plot")

  # ---- output accumulators ----
  parts <- character(); toc <- list()
  add <- function(...) parts <<- c(parts, paste0(...))
  h1 <- function(t) { id <- slug(t); toc[[length(toc) + 1]] <<- list(level = 1, id = id, text = t)
    add('<div id="', id, '" class="section level1"><h1>', esc(t), "</h1>") }
  h2 <- function(t) { id <- slug(t); toc[[length(toc) + 1]] <<- list(level = 2, id = id, text = t)
    add('<div id="', id, '" class="section level2"><h2>', esc(t), "</h2>") }
  close_div <- function() add("</div>")
  bullets <- function(items) add("<ul>", paste0("<li>", items, "</li>", collapse = "\n"), "</ul>")
  fig <- function(p, height) {                      # ggplot -> base64 PNG <img> (same device/size/dpi as knitr)
    if (is.null(p)) return(invisible())
    f <- tempfile(fileext = ".png")
    grDevices::png(f, width = 7.2, height = height, units = "in", res = 400)  # knitr: dpi 200 x fig.retina 2
    print(p); grDevices::dev.off()
    raw <- readBin(f, "raw", file.size(f)); unlink(f)
    add('<p><img src="data:image/png;base64,', b64_encode(raw), '" alt="" width="100%" /></p>')
  }

  # ---- meta + KPIs ----
  add('<div class="meta">',
      sprintf('<span>Range <b>%s \u2013 %s</b> (local start dates)</span>', paste0(md(start), format(start, ", %Y")), paste0(md(end_actual), format(end_actual, ", %Y"))),
      sprintf('<span>Runs <b>%d</b> (%d outdoor, %d indoor)</span>', nrow(runs), sum(!runs$indoor), sum(runs$indoor)),
      sprintf('<span>Export generated <b>%s</b></span>', paste0(md(substr(x$export_date, 1, 10)), format(as.Date(substr(x$export_date, 1, 10)), ", %Y"))),
      sprintf('<span>Source: %s</span>', esc(paste(unique(runs$source), collapse = ", "))), "</div>")

  cm <- runs[runs$month == max(runs$month), ]
  D <- sum(cm$mi); M <- sum(cm$duration_min)
  H <- sum(cm$hr_avg * cm$duration_min, na.rm = TRUE) / sum(cm$duration_min[!is.na(cm$hr_avg)])
  L <- cm[which.max(cm$mi), ]
  kp <- list(c("Distance", paste(f1(D), "mi"), paste(f1(D / nrow(cm)), "mi per run")),
             c("Running time", fmt_hm(M), paste(nrow(cm), "runs")),
             c("Avg pace", paste(fmt_pace(M / D), "/mi"), "distance-weighted"),
             c("Avg heart rate", paste(round(H), "bpm"), "duration-weighted"),
             c("Longest run", paste(f2(L$mi), "mi"), paste(md(L$date), "\u00b7", fmt_dur(L$duration_min))))
  add(sprintf('<p class="caption">%s</p>', tail(month_names, 1)))
  add('<div class="kpis">', paste0('<div class="kpi"><span class="l">', sapply(kp, `[`, 1), '</span><span class="v">',
      sapply(kp, `[`, 2), '</span><span class="s">', sapply(kp, `[`, 3), "</span></div>", collapse = ""), "</div>")

  # ---- 1. Monthly summary ----
  h1("1. Monthly summary")
  bullets(c(
    "Avg pace = \u03a3 duration \u00f7 \u03a3 distance for the month, which differs from the mean of the runs\u2019 paces.",
    "Avg HR = \u03a3(run avg HR \u00d7 run duration) \u00f7 \u03a3 duration. Run avg HR = \u03a3(hr\u1d62 \u00d7 w\u1d62) \u00f7 \u03a3w\u1d62 over the watch\u2019s HR samples, where w\u1d62 runs from the midpoint with the previous sample to the midpoint with the next, clipped to the workout.",
    "Avg cadence = workout step count \u00f7 duration (total steps/min, both feet), duration-weighted over the month.",
    "Running dynamics (vertical oscillation, ground contact time) are duration-weighted over the runs where they were recorded."))

  month_table <- function(msx, label, mech = TRUE) {
    h2(label)
    mt <- data.frame(Measure = c("Runs", "Total distance", "Total running time", "Avg pace",
                                 "Avg HR", "Max HR", "Longest run", "Fastest run by pace",
                                 "Avg cadence", "Avg vertical oscillation", "Avg ground contact time"))
    if (!mech) mt <- mt[1:9, , drop = FALSE]
    for (i in seq_len(nrow(msx))) {
      m <- msx[i, ]
      mt[[month_names[i]]] <- if (m$runs == 0) c(0, rep("\u2014", if (mech) 10 else 8)) else {
        fast <- paste0(fmt_pace(m$fastest_pace), " /mi, ", f2(m$fastest_mi), " mi")
        c(m$runs, paste0(f2(m$mi), " mi"), fmt_hm(m$minutes),
          paste0(fmt_pace(m$pace_mi), " /mi"),
          paste0(f1(m$hr_weighted), " bpm"), if (is.na(m$hr_max)) "N/A" else paste0(round(m$hr_max), " bpm"),
          paste0(f2(m$longest_mi), " mi"), fast, f1(m$cadence),
          if (m$mech_runs) paste0(f1(m$vert_osc), " cm") else "Not recorded",
          if (m$mech_runs) paste0(round(m$gct), " ms") else "Not recorded")[seq_len(if (mech) 11 else 9)]
      }
    }
    add('<div class="tablebox">', html_table(mt, align = c("l", rep("r", nrow(msx))), class = "months"), "</div>")
    close_div()
  }
  month_table(monthly_summary(runs, "outdoor"), "Outdoor runs")
  month_table(monthly_summary(runs, "indoor"), "Indoor runs", mech = FALSE)
  month_table(ms, "All runs combined", mech = FALSE)
  close_div()

  # ---- 2. Figures ----
  h1("2. Figures")
  wk$label <- format(wk$week, "%b %d")
  wk$partial <- wk$week < start | wk$week + 6 > end_actual
  wkl <- rbind(data.frame(week = wk$week, Type = "Outdoor", mi = wk$mi_outdoor, partial = wk$partial),
               data.frame(week = wk$week, Type = "Indoor", mi = wk$mi_indoor, partial = wk$partial))
  wkl$Type <- factor(wkl$Type, levels = c("Indoor", "Outdoor"))
  fig(ggplot(wkl, aes(week, mi, fill = Type)) +
    geom_col(aes(alpha = partial), width = 4.2, colour = "white", linewidth = 0.4) +
    geom_text(data = wk, aes(week, mi, label = f1(mi)), inherit.aes = FALSE, vjust = -0.5, size = 3, colour = "#4a525c") +
    scale_fill_manual(values = c(Outdoor = PAL[1], Indoor = PAL[2]), breaks = c("Outdoor", "Indoor")) +
    scale_alpha_manual(values = c(`FALSE` = 1, `TRUE` = 0.45), guide = "none") +
    scale_x_date(breaks = wk$week, labels = wk$label) +
    scale_y_continuous(expand = expansion(mult = c(0, 0.12))) +
    labs(title = "Weekly distance, outdoor and indoor", subtitle = "Faded bars are weeks only partly inside the range.", x = NULL, y = "miles") +
    theme_run + theme(axis.text.x = element_text(angle = 45, hjust = 1)), 3.6)

  if (nrow(outv)) { sc <- outv; sc$Month <- factor(month_names[match(sc$month, ms$month)], levels = month_names)
    fig(ggplot(sc, aes(pace_mi, hr_avg, colour = Month)) +
      geom_point(size = 2.8, stroke = 0) +
      scale_x_continuous(labels = fmt_pace) +
      scale_colour_manual(values = PAL) +
      labs(title = "Pace vs heart rate (outdoor runs)", x = "pace (min/mi)", y = "avg HR (bpm)") + theme_run, 4.2) }

  rr <- rg[!is.na(rg$route), ]
  if (nrow(rr)) {
    fig(ggplot(rr, aes(date, pace_mi, colour = route)) +
      geom_line(linewidth = 0.7) + geom_point(size = 2.4) +
      scale_y_continuous(labels = fmt_pace) + scale_colour_manual(values = PAL) +
      labs(title = "Same routes over time", subtitle = "Pace on recurring outdoor distances (5+ runs within ~0.6 mi of each other).",
           x = NULL, y = "pace (min/mi)") + theme_run, 4)
  }

  if (nrow(outv) >= 3) fig(ggplot(outv, aes(date, cadence_spm)) + geom_point(colour = PAL[1], size = 2.4) +
    geom_smooth(method = "lm", se = FALSE, colour = "#9aa3ad", linewidth = 0.6, linetype = "solid", formula = y ~ x) +
    labs(title = "Cadence", subtitle = "Total steps per minute, outdoor runs, with a straight-line trend.", x = NULL, y = "steps/min") + theme_run, 3.4)

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
    fig(ggplot(panel, aes(date, value)) + geom_line(colour = PAL[1], linewidth = 0.6) + geom_point(colour = PAL[1], size = 1.2) +
      facet_wrap(~metric, scales = "free_y", ncol = 2) +
      labs(title = "Recovery and fitness markers", x = NULL, y = NULL) + theme_run +
      theme(strip.text = element_text(hjust = 0, face = "bold", colour = "#14181d")), 4.6)
  }
  close_div()

  # ---- 3. Data quality ----
  h1("3. Data quality and calculations")
  add("<p><strong>Checks performed</strong></p>")
  bullets(c(
    paste0("Workout type: only <code>HKWorkoutActivityTypeRunning</code>. Sources: ", esc(paste(unique(runs$source), collapse = ", ")), "."),
    paste0("Duplicates or overlapping workouts: ", sum(runs$duplicate), "."),
    paste0("Distance: workout totals vs the sum of the watch\u2019s distance samples, largest difference ", f2(max(abs(runs$dist_samples_mi - runs$mi))),
           " mi. Duration: end \u2212 start vs recorded duration, largest difference ", f2(max(runs$elapsed_min - runs$duration_min)), " min."),
    paste0("Heart rate: ", r0(sum(runs$hr_n)), " samples inside the workouts (", min(runs$hr_n), "\u2013", max(runs$hr_n),
           " per run). Largest gap ", round(max(runs$hr_max_gap_s, na.rm = TRUE)), " s. Samples outside 40\u2013220 bpm, or isolated spikes more than 25 bpm away from both neighbours, are excluded: ",
           sum(runs$hr_suspect_n), " found."),
    paste0("Pace range: ", fmt_pace(min(runs$pace_mi)), "\u2013", fmt_pace(max(runs$pace_mi)), " /mi. No runs are excluded."),
    "Units: distance in miles."))
  add(sprintf('<p class="caption">Generated %s from %s by src/run_report.R.</p>', format(Sys.time(), "%Y-%m-%d %H:%M"), esc(basename(x$zip_path))))
  close_div()

  # ---- TOC (levels 1-2, nested like pandoc's) ----
  toc_html <- "<ul>"; open_sub <- FALSE
  for (i in seq_along(toc)) {
    t <- toc[[i]]; a <- sprintf('<a href="#%s">%s</a>', t$id, esc(t$text))
    if (t$level == 1) {
      if (open_sub) { toc_html <- paste0(toc_html, "</ul>"); open_sub <- FALSE }
      if (i > 1) toc_html <- paste0(toc_html, "</li>")
      toc_html <- paste0(toc_html, "<li>", a)
    } else {
      if (!open_sub) { toc_html <- paste0(toc_html, "<ul>"); open_sub <- TRUE }
      toc_html <- paste0(toc_html, "<li>", a, "</li>")
    }
  }
  toc_html <- paste0(toc_html, if (open_sub) "</ul>", "</li></ul>")

  css <- paste(readLines(css_file, encoding = "UTF-8", warn = FALSE), collapse = "\n")
  html <- paste0('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n',
                 '<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Running Log</title>\n',
                 "<style>\n", css, "\n</style>\n</head>\n<body>\n<h1 class=\"title\">Running Log</h1>\n",
                 '<div id="TOC">', toc_html, "</div>\n", paste(parts, collapse = "\n"), "\n</body>\n</html>\n")
  writeLines(html, out_file, useBytes = TRUE)
  invisible(out_file)
}
