# Run-level metrics and monthly/weekly summaries built from the
# parsed export (see parse_export.R).

MI_PER_KM <- 1 / 1.609344

# First day of the month two months before the current one, so the range covers
# the current month and the two before it (October -> August 1).
default_start <- function(today = Sys.Date())
  seq(as.Date(format(today, "%Y-%m-01")), by = "-1 month", length.out = 3)[3]

# ---- small utilities -------------------------------------------------------

fmt_pace <- function(min_per_unit) {
  out <- rep(NA_character_, length(min_per_unit))
  ok <- is.finite(min_per_unit)
  tot <- round(min_per_unit[ok] * 60)
  out[ok] <- sprintf("%d:%02d", tot %/% 60, tot %% 60)
  out
}
fmt_dur <- function(minutes) {
  tot <- round(minutes * 60)
  h <- tot %/% 3600; m <- (tot %% 3600) %/% 60; s <- tot %% 60
  ifelse(h > 0, sprintf("%d:%02d:%02d", h, m, s), sprintf("%d:%02d", m, s))
}
fmt_hm <- function(minutes) { t <- round(minutes); sprintf("%d h %02d m", t %/% 60, t %% 60) }

to_minutes <- function(v, unit) ifelse(unit == "s", v / 60, ifelse(unit %in% c("hr", "h"), v * 60, v))
to_miles <- function(v, unit) ifelse(unit == "km", v * MI_PER_KM, ifelse(unit == "m", v / 1609.344, v))

# Time-weighted mean: each sample counts for the time between the midpoints to
# its neighbours, clipped to [t0, t1].
time_weighted_mean <- function(t, v, t0, t1) {
  n <- length(t)
  if (n == 0) return(NA_real_)
  if (n == 1) return(v)
  b <- c(t0, (t[-1] + t[-n]) / 2, t1)
  w <- pmax(diff(b), 0)
  if (sum(w) == 0) return(mean(v))
  sum(v * w) / sum(w)
}

# Implausible HR samples: outside [40, 220] or an isolated spike more than
# `jump` bpm away from both neighbours.
hr_suspect <- function(v, jump = 25) {
  n <- length(v); bad <- v < 40 | v > 220
  if (n >= 3) {
    i <- 2:(n - 1)
    bad[i] <- bad[i] | (abs(v[i] - v[i - 1]) > jump & abs(v[i] - v[i + 1]) > jump)
  }
  bad
}

# ---- workout lookups ---------------------------------------------------------

# Workout distance in miles: the DistanceWalkingRunning statistic, else the
# workout's own totalDistance.
workout_miles <- function(x, w) {
  st <- x$workout_stats[x$workout_stats$type == "DistanceWalkingRunning", ]
  vapply(seq_len(nrow(w)), function(k) {
    s <- st[st$workout_id == w$workout_id[k], ]
    if (nrow(s) && !is.na(s$sum[1])) to_miles(s$sum[1], s$unit[1])
    else to_miles(w$total_distance[k], w$total_distance_unit[k])
  }, numeric(1))
}

# TRUE for workouts flagged HKIndoorWorkout.
workout_indoor <- function(x, ids) {
  me <- x$workout_meta[x$workout_meta$key == "HKIndoorWorkout", ]
  ids %in% me$workout_id[me$value == "1"]
}

# ---- run table ---------------------------------------------------------------

#' One row per running workout in [start, end] (local start date).
#'
#' Every running workout is kept and counted.
build_runs <- function(x, start, end) {
  w <- x$workouts
  if (is.null(w) || !nrow(w)) stop("No running workouts found in the export.")
  w$date <- as.Date(substr(w$start, 1, 10))
  w <- w[w$date >= as.Date(start) & w$date <= as.Date(end), , drop = FALSE]
  if (!nrow(w)) stop("No running workouts between ", start, " and ", end, ".")
  w <- w[order(w$start), ]
  w$mi <- workout_miles(x, w)
  w$indoor <- workout_indoor(x, w$workout_id)

  st <- x$workout_stats; rec <- x$records
  stat <- function(id, type, field = "sum") {
    v <- st[[field]][st$workout_id == id & st$type == type]
    if (length(v)) v[1] else NA_real_
  }

  hr <- rec[rec$type == "HeartRate", ]; hr$t <- as.numeric(parse_hk_time(hr$start))
  dist <- rec[rec$type == "DistanceWalkingRunning", ]
  dist$t0 <- as.numeric(parse_hk_time(dist$start)); dist$t1 <- as.numeric(parse_hk_time(dist$end))
  hrr <- rec[rec$type == "HeartRateRecoveryOneMinute", ]; hrr$t <- as.numeric(parse_hk_time(hrr$start))

  rows <- lapply(seq_len(nrow(w)), function(k) {
    r <- w[k, ]; id <- r$workout_id
    t0 <- as.numeric(parse_hk_time(r$start)); t1 <- as.numeric(parse_hk_time(r$end))
    dur <- to_minutes(r$duration, r$duration_unit)
    # watch HR samples within the workout, same source as the workout
    h <- hr[hr$source == r$source & hr$t >= t0 & hr$t <= t1, ]; h <- h[order(h$t), ]
    sus <- if (nrow(h)) hr_suspect(h$value) else logical(0)
    hk <- h[!sus, ]
    gaps <- if (nrow(h)) diff(c(t0, h$t, t1)) else NA
    # distance samples overlapping the workout (prorated), same source
    ds <- dist[dist$source == r$source & dist$t1 > t0 & dist$t0 < t1, ]
    frac <- ifelse(ds$t1 > ds$t0, (pmin(ds$t1, t1) - pmax(ds$t0, t0)) / (ds$t1 - ds$t0), 1)
    dist_samples <- sum(to_miles(ds$value * frac, ds$unit))
    steps <- stat(id, "StepCount")
    rr <- hrr[hrr$t >= t1 - 300 & hrr$t <= t1 + 2400, ]
    data.frame(
      date = r$date, start = r$start, end = r$end, source = r$source,
      indoor = r$indoor,
      mi = r$mi, duration_min = dur, elapsed_min = (t1 - t0) / 60, pace_mi = dur / r$mi,
      hr_avg = if (nrow(hk)) time_weighted_mean(hk$t, hk$value, t0, t1) else NA_real_,
      hr_max = if (nrow(hk)) max(hk$value) else NA_real_,
      hr_n = nrow(h), hr_suspect_n = sum(sus), hr_max_gap_s = if (nrow(h)) max(gaps) else NA_real_,
      cadence_spm = steps / dur,
      vert_osc_cm = stat(id, "RunningVerticalOscillation", "average"),
      gct_ms = stat(id, "RunningGroundContactTime", "average"),
      hrr_1min = if (nrow(rr)) rr$value[1] else NA_real_,
      dist_samples_mi = dist_samples,
      stringsAsFactors = FALSE)
  })
  runs <- do.call(rbind, rows)
  runs$month <- format(runs$date, "%Y-%m")

  # duplicates: same start, or overlapping intervals
  s <- parse_hk_time(runs$start); e <- parse_hk_time(runs$end)
  runs$duplicate <- duplicated(runs$start) | c(FALSE, s[-1] < e[-length(e)])

  runs
}

# Running workouts before `start` (for load context), from the workout table only.
prior_runs <- function(x, start, weeks = 5) {
  w <- x$workouts; w$date <- as.Date(substr(w$start, 1, 10))
  w <- w[w$date < as.Date(start) & w$date >= as.Date(start) - 7 * weeks, ]
  if (!nrow(w)) return(data.frame(date = as.Date(character()), mi = numeric(), indoor = logical()))
  data.frame(date = w$date, mi = workout_miles(x, w), indoor = workout_indoor(x, w$workout_id))
}

# ---- summaries ---------------------------------------------------------------

#' @param type "all", "outdoor" or "indoor".
#' Months with no runs of that type get a row with runs = 0 and NA elsewhere.
monthly_summary <- function(runs, type = c("all", "outdoor", "indoor")) {
  type <- match.arg(type)
  months <- sort(unique(runs$month))
  v <- runs
  if (type == "outdoor") v <- v[!v$indoor, ]
  if (type == "indoor") v <- v[v$indoor, ]
  rows <- lapply(months, function(mo) { m <- v[v$month == mo, ]; if (nrow(m)) month_row(m) else NULL })
  full <- Filter(Negate(is.null), rows)
  if (!length(full)) return(data.frame(month = months, runs = 0L, row.names = months))
  blank <- full[[1]][NA_integer_, ]
  rows <- Map(function(r, mo) if (is.null(r)) { b <- blank; b$month <- mo; b$runs <- 0L; b } else r, rows, months)
  out <- do.call(rbind, rows)
  rownames(out) <- out$month
  out
}

month_row <- function(m) {
  mech <- m[!is.na(m$vert_osc_cm), ]
  fast <- m[which.min(m$pace_mi), ]
  W <- sum(mech$duration_min)
  data.frame(
    month = m$month[1], runs = nrow(m), mi = sum(m$mi), minutes = sum(m$duration_min),
    pace_mi = sum(m$duration_min) / sum(m$mi),
    hr_weighted = sum(m$hr_avg * m$duration_min, na.rm = TRUE) / sum(m$duration_min[!is.na(m$hr_avg)]),
    hr_max = if (any(!is.na(m$hr_max))) max(m$hr_max, na.rm = TRUE) else NA_real_,
    longest_mi = max(m$mi), fastest_pace = fast$pace_mi, fastest_mi = fast$mi,
    cadence = sum(m$cadence_spm * m$duration_min) / sum(m$duration_min),
    vert_osc = if (W > 0) sum(mech$vert_osc_cm * mech$duration_min) / W else NA_real_,
    gct = if (W > 0) sum(mech$gct_ms * mech$duration_min) / W else NA_real_,
    mech_runs = nrow(mech))
}

week_start <- function(d) d - (as.integer(format(d, "%u")) - 1)

# Weekly distance from all recorded runs; weeks that include a pre-range run
# (from `prior`) count those miles too.
weekly_load <- function(runs, prior = NULL) {
  all <- rbind(data.frame(date = runs$date, mi = runs$mi, indoor = runs$indoor, in_range = TRUE),
               if (!is.null(prior) && nrow(prior)) data.frame(date = prior$date, mi = prior$mi, indoor = prior$indoor, in_range = FALSE))
  all$week <- week_start(all$date)
  weeks <- seq(min(all$week), max(all$week), by = 7)
  wk <- data.frame(week = weeks,
                   mi = vapply(weeks, function(k) sum(all$mi[all$week == k]), numeric(1)),
                   mi_outdoor = vapply(weeks, function(k) sum(all$mi[all$week == k & !all$indoor]), numeric(1)),
                   mi_indoor = vapply(weeks, function(k) sum(all$mi[all$week == k & all$indoor]), numeric(1)),
                   in_range = vapply(weeks, function(k) any(all$in_range[all$week == k]), logical(1)))
  wk[wk$in_range, ]
}

# Groups of outdoor runs with a similar distance (recurring routes).
route_groups <- function(runs, h = 0.6, min_runs = 5) {
  o <- runs[!runs$indoor, ]
  o$route <- rep(NA_character_, nrow(o))
  if (nrow(o) < min_runs) return(o)
  cl <- stats::cutree(stats::hclust(stats::dist(o$mi), "complete"), h = h)
  for (g in unique(cl)) {
    idx <- cl == g
    if (sum(idx) >= min_runs) o$route[idx] <- sprintf("~%.1f mi route", stats::median(o$mi[idx]))
  }
  o
}
