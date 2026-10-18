# The meta line and the KPI cards at the top of the report. Takes the context built by build_report().
report_overview <- function(ctx) with(ctx, {
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
})
