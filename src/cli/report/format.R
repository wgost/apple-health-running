# Formatting helpers shared by the report sections: number and text formats, US / metric units, month-over-month
# change notes, HTML tables and the chart theme. Needs cli/metrics.R sourced first.

esc <- function(s) {                                # HTML-escape + typographic apostrophes
  s <- gsub("&", "&amp;", s, fixed = TRUE); s <- gsub("<", "&lt;", s, fixed = TRUE)
  s <- gsub(">", "&gt;", s, fixed = TRUE); gsub("(?<=\\w)'", "\u2019", s, perl = TRUE)
}
slug <- function(s) gsub("^-|-$", "", gsub("[^a-z0-9]+", "-", tolower(sub("^[0-9]+\\.\\s*", "", s))))

md <- function(d) sub(" 0", " ", format(as.Date(d), "%b %d"))
f1 <- function(v) ifelse(is.finite(v), formatC(v, format = "f", digits = 1), "N/A")
f2 <- function(v) ifelse(is.finite(v), formatC(v, format = "f", digits = 2), "N/A")
r0 <- function(v) formatC(round(v), format = "d", big.mark = ",")
hm <- function(minutes) sub("^<", "&lt;", fmt_hm(minutes))   # fmt_hm for HTML ("<1 m" must be escaped)

# ---- units: US (default) and metric. Text is written twice (u-us / u-si spans) and each chart
# is drawn twice; the page switch (see shared/report.css) shows one of them. ----
dual <- function(us, si) ifelse(us == si, us, paste0('<span class="u-us">', us, '</span><span class="u-si">', si, '</span>'))
UN <- list(
  us = list(cls = "u-us", dist = 1, pace = 1, dlab = "miles", dunit = "mi", punit = "min/mi", tunit = "\u00b0F", near = "0.6 mi", temp = identity),
  si = list(cls = "u-si", dist = KM_PER_MI, pace = 1 / KM_PER_MI, dlab = "kilometres", dunit = "km", punit = "min/km", tunit = "\u00b0C", near = "1 km", temp = f_to_c))
dist_u <- function(mi, f = f2, suffix = "") dual(paste0(f(mi), " mi", suffix), paste0(f(mi * KM_PER_MI), " km", suffix))
pace_u <- function(p) dual(paste0(fmt_pace(p), " /mi"), paste0(fmt_pace(p / KM_PER_MI), " /km"))
kcal_u <- function(per_mi, per = "") dual(paste0(r0(per_mi), " kcal", if (nzchar(per)) " per mi"), paste0(r0(per_mi / KM_PER_MI), " kcal", if (nzchar(per)) " per km"))
temp_u <- function(f) ifelse(is.finite(f), dual(paste0(r0(f), "\u00b0F"), paste0(r0(f_to_c(f)), "\u00b0C")), "N/A")

# change from the previous month, as a small "up/down" note after the value
no_delta <- '<span class="d"></span>'
delta <- function(new, old, kind = "pct", digits = 0, scale = 1, suffix = "", vs = "previous month") {
  if (!all(is.finite(c(new, old)))) return(no_delta)
  d <- round(if (kind == "pct") 100 * (new / old - 1) else (new - old) * scale, digits)
  if (d == 0) return(no_delta)
  sprintf('<span class="d" title="vs %s">%s %s%s</span>', vs, if (d > 0) "\u25b2" else "\u25bc",
          formatC(abs(d), format = "f", digits = digits), if (kind == "pct") "%" else suffix)
}

html_table <- function(df, align, class = "") {
  align <- c(l = "left", r = "right", c = "center")[align]
  th <- paste0('<th style="text-align:', align, '">', names(df), "</th>", collapse = "")
  body <- vapply(seq_len(nrow(df)), function(i)
    paste0("<tr>", paste0('<td style="text-align:', align, '">', unlist(lapply(df[i, ], as.character)), "</td>", collapse = ""), "</tr>"), "")
  paste0('<table class="', class, '"><thead><tr>', th, "</tr></thead><tbody>", paste(body, collapse = ""), "</tbody></table>")
}

by_metric <- function(d, make) lapply(split(d, factor(d$metric, levels = unique(d$metric))), make)   # one plot per metric

PAL <- c("#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6")
RAMP <- c("#d7301f", "#f28e2b", "#d4b000", "#1baf7a", "#2a78d6", "#6250d6")   # ordered, high-contrast
MID <- "#818994"
# Charts are drawn on a transparent background with mid-grey text and faint grid lines, so the same chart
# reads on the light and the dark page. Chart titles are HTML (see fig() in page.R), not part of the chart.
run_theme <- function() {
  theme_minimal(base_size = 11) +
    theme(panel.grid.minor = element_blank(), panel.grid.major.x = element_blank(),
          panel.grid.major.y = element_line(colour = "#8a929c33", linewidth = 0.4),
          text = element_text(colour = MID), axis.title = element_text(size = 10), axis.text = element_text(colour = MID),
          legend.position = "top", legend.justification = "left", legend.title = element_blank(),
          plot.background = element_rect(fill = NA, colour = NA), panel.background = element_rect(fill = NA, colour = NA))
}
