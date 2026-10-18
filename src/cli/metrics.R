# Run-level metrics and monthly/weekly summaries built from the
# parsed export (see parse_export.R).

KM_PER_MI <- 1.609344
MI_PER_KM <- 1 / KM_PER_MI
DRIFT_MIN_MIN <- 20      # cardiac drift is only computed for runs of at least this many minutes

# First day of the earliest month in a report of `months` calendar months ending with
# the current one (3 months in October -> August 1).
report_start <- function(months = 3, today = Sys.Date())
  seq(as.Date(format(today, "%Y-%m-01")), by = "-1 month", length.out = months)[months]

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
fmt_hm <- function(minutes) {                       # "5 h 37 m", "31 m", or "<1 m" for a few seconds
  t <- round(minutes)
  ifelse(t == 0 & minutes > 0, "<1 m", ifelse(t < 60, sprintf("%d m", t), sprintf("%d h %02d m", t %/% 60, t %% 60)))
}

to_minutes <- function(v, unit) ifelse(unit == "s", v / 60, ifelse(unit %in% c("hr", "h"), v * 60, v))
to_kcal <- function(v, unit) ifelse(unit == "kJ", v / 4.184, v)   # Apple's "Cal" is kcal
to_miles <- function(v, unit) ifelse(unit == "km", v * MI_PER_KM, ifelse(unit == "m", v / 1609.344, v))

# Seconds each sample represents: the time between the midpoints to its
# neighbours, clipped to [t0, t1]. `t` must be sorted and non-empty.
hr_weights <- function(t, t0, t1) {
  n <- length(t)
  pmax(diff(c(t0, (t[-1] + t[-n]) / 2, t1)), 0)
}

# Time-weighted mean of the samples `v` taken at times `t`.
time_weighted_mean <- function(t, v, t0, t1) {
  if (!length(t)) return(NA_real_)
  w <- hr_weights(t, t0, t1)
  if (sum(w) == 0) mean(v) else sum(v * w) / sum(w)
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

# ---- heart-rate zones --------------------------------------------------------

# Estimated max HR from the date of birth in the export (Tanaka: 208 - 0.7 x age),
# with age in whole years on `on`. NA when the export has no birth date.
estimate_max_hr <- function(birth_date, on) {
  b <- as.Date(birth_date)
  if (is.na(b)) return(NA_real_)
  age <- as.integer(format(on, "%Y")) - as.integer(format(b, "%Y")) -
    (format(on, "%m%d") < format(b, "%m%d"))
  round(208 - 0.7 * age)
}

# The watch's resting-HR readings in the `days` up to `on`.
recent_resting_hr <- function(records, on, days = 30) {
  r <- records[records$type == "RestingHeartRate", ]
  d <- as.Date(substr(r$start, 1, 10))
  r$value[d > on - days & d <= on]
}

# Resting HR for the zones: the median of those readings, NA when there are none.
estimate_rest_hr <- function(records, on, days = 30) {
  v <- recent_resting_hr(records, on, days)
  if (length(v)) round(median(v)) else NA_real_
}

# Five zones by heart-rate reserve (the Karvonen method, which Apple Watch zones use):
# limit = rest + pct x (max - rest), with pct 60 / 70 / 80 / 90%. Z1 is up to the 60%
# limit and Z5 is above the 90% limit; a sample equal to a limit belongs to the lower zone.
# With rest = 0 this is a plain share of max HR.
ZONE_LO <- c(0.6, 0.7, 0.8, 0.9)
ZONE_NAMES <- c("Z1", "Z2", "Z3", "Z4", "Z5")
zone_breaks <- function(max_hr, rest_hr = 0) round(rest_hr + ZONE_LO * (max_hr - rest_hr), 6)

# Zone labels with their bpm ranges, e.g. "Z2 133\u2013145".
zone_labels <- function(max_hr, rest_hr = 0) {
  b <- floor(zone_breaks(max_hr, rest_hr))
  paste(ZONE_NAMES, c(sprintf("\u2264%d", b[1]), sprintf("%d\u2013%d", b[-4] + 1, b[-1]), sprintf(">%d", b[4])))
}

# Seconds each run spent in each zone (runs x 5 matrix), from its time-weighted HR curve.
zone_seconds <- function(runs, max_hr, rest_hr = 0) {
  b <- zone_breaks(max_hr, rest_hr)
  out <- t(vapply(runs$hr_curve, function(h) {
    z <- findInterval(h$bpm, b, left.open = TRUE) + 1L
    vapply(seq_along(ZONE_NAMES), function(k) sum(h$sec[z == k]), numeric(1))
  }, numeric(length(ZONE_NAMES))))
  colnames(out) <- ZONE_NAMES
  out
}

# Miles covered between times a and b by the distance samples `ds` (prorated).
dist_between <- function(ds, a, b) {
  len <- ds$t1 - ds$t0
  frac <- ifelse(len > 0, pmax(pmin(ds$t1, b) - pmax(ds$t0, a), 0) / len, as.numeric(ds$t0 >= a & ds$t0 < b))
  sum(to_miles(ds$value * frac, ds$unit))
}

# Mean of the samples `s` (columns t0, t1, value, source) overlapping [t0, t1] from `source`,
# weighted by overlap seconds (point samples count as 1 s).
overlap_mean <- function(s, t0, t1, source) {
  s <- s[s$source == source & s$t1 >= t0 & s$t0 <= t1, ]
  if (!nrow(s)) return(NA_real_)
  w <- pmax(pmin(s$t1, t1) - pmax(s$t0, t0), 1)
  sum(s$value * w) / sum(w)
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

# Weather the watch recorded at the start of each workout: temperature in
# degrees F and relative humidity in % (Apple stores it as percent x 100).
workout_weather <- function(x, ids) {
  me <- x$workout_meta
  val <- function(key) me$value[me$key == key][match(ids, me$workout_id[me$key == key])]
  tv <- val("HKWeatherTemperature")
  temp <- as.numeric(sub(" .*", "", tv))
  data.frame(temp_f = ifelse(grepl("degC", tv), temp * 9 / 5 + 32, temp),
             humidity = as.numeric(sub(" .*", "", val("HKWeatherHumidity"))) / 100)
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
  w <- cbind(w, workout_weather(x, w$workout_id))

  st <- x$workout_stats; rec <- x$records
  stat <- function(id, type, field = "sum") {
    v <- st[[field]][st$workout_id == id & st$type == type]
    if (length(v)) v[1] else NA_real_
  }

  hr <- rec[rec$type == "HeartRate", ]; hr$t <- as.numeric(parse_hk_time(hr$start))
  dist <- rec[rec$type == "DistanceWalkingRunning", ]
  dist$t0 <- as.numeric(parse_hk_time(dist$start)); dist$t1 <- as.numeric(parse_hk_time(dist$end))
  hrr <- rec[rec$type == "HeartRateRecoveryOneMinute", ]; hrr$t <- as.numeric(parse_hk_time(hrr$start))
  timed <- function(type) {
    s <- rec[rec$type == type, ]
    s$t0 <- as.numeric(parse_hk_time(s$start)); s$t1 <- as.numeric(parse_hk_time(s$end)); s
  }
  power <- timed("RunningPower"); stride <- timed("RunningStrideLength")

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
    # cardiac drift: how much speed per heartbeat falls from the first to the second half
    mid <- (t0 + t1) / 2
    h1 <- hk[hk$t <= mid, ]; h2 <- hk[hk$t > mid, ]
    hr1 <- time_weighted_mean(h1$t, h1$value, t0, mid); hr2 <- time_weighted_mean(h2$t, h2$value, mid, t1)
    sp1 <- dist_between(ds, t0, mid) / (mid - t0); sp2 <- dist_between(ds, mid, t1) / (t1 - mid)
    drift <- if (dur >= DRIFT_MIN_MIN && all(is.finite(c(hr1, hr2, sp1, sp2))) && sp1 > 0 && sp2 > 0)
      100 * (1 - (sp2 / hr2) / (sp1 / hr1)) else NA_real_
    steps <- stat(id, "StepCount")
    e <- st[st$workout_id == id & st$type == "ActiveEnergyBurned", ]
    energy <- if (nrow(e)) to_kcal(e$sum[1], e$unit[1]) else NA_real_
    rr <- hrr[hrr$t >= t1 - 300 & hrr$t <= t1 + 2400, ]
    data.frame(
      date = r$date, start = r$start, end = r$end, source = r$source,
      indoor = r$indoor,
      mi = r$mi, energy_kcal = energy, duration_min = dur, elapsed_min = (t1 - t0) / 60, pace_mi = dur / r$mi,
      hr_avg = if (nrow(hk)) time_weighted_mean(hk$t, hk$value, t0, t1) else NA_real_,
      hr_max = if (nrow(hk)) max(hk$value) else NA_real_,
      hr_curve = I(list(data.frame(bpm = hk$value, sec = if (nrow(hk)) hr_weights(hk$t, t0, t1) else numeric()))),
      hr_n = nrow(h), hr_suspect_n = sum(sus), hr_max_gap_s = if (nrow(h)) max(gaps) else NA_real_,
      cadence_spm = steps / dur,
      vert_osc_cm = stat(id, "RunningVerticalOscillation", "average"),
      gct_ms = stat(id, "RunningGroundContactTime", "average"),
      hrr_1min = if (nrow(rr)) rr$value[1] else NA_real_,
      power_w = overlap_mean(power, t0, t1, r$source), stride_m = overlap_mean(stride, t0, t1, r$source),
      drift_pct = drift, temp_f = r$temp_f, humidity = r$humidity,
      dist_samples_mi = dist_between(ds, t0, t1),
      stringsAsFactors = FALSE)
  })
  runs <- do.call(rbind, rows)
  runs$month <- format(runs$date, "%Y-%m")
  runs$ef <- runs$mi * 1609.344 / runs$duration_min / runs$hr_avg   # efficiency: metres per heartbeat

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
  en <- m[!is.na(m$energy_kcal) & !is.na(m$mi), ]   # energy is summed over the runs that have it
  dd <- m[!is.na(m$mi), ]   # runs with a recorded distance (a run without one must not turn the month's totals into NA)
  data.frame(
    month = m$month[1], runs = nrow(m), mi = sum(m$mi, na.rm = TRUE), minutes = sum(m$duration_min),
    kcal = if (nrow(en)) sum(en$energy_kcal) else NA_real_,
    kcal_per_mi = if (nrow(en)) sum(en$energy_kcal) / sum(en$mi) else NA_real_,
    pace_mi = sum(dd$duration_min) / sum(dd$mi),
    hr_weighted = sum(m$hr_avg * m$duration_min, na.rm = TRUE) / sum(m$duration_min[!is.na(m$hr_avg)]),
    hr_max = if (any(!is.na(m$hr_max))) max(m$hr_max, na.rm = TRUE) else NA_real_,
    longest_mi = max(m$mi, na.rm = TRUE), fastest_pace = fast$pace_mi, fastest_mi = fast$mi,
    cadence = sum(m$cadence_spm * m$duration_min) / sum(m$duration_min),
    vert_osc = if (W > 0) sum(mech$vert_osc_cm * mech$duration_min) / W else NA_real_,
    gct = if (W > 0) sum(mech$gct_ms * mech$duration_min) / W else NA_real_,
    mech_runs = nrow(mech))
}

week_start <- function(d) d - (as.integer(format(d, "%u")) - 1)

# Weekly distance from all recorded runs (a run with no distance adds nothing); weeks that include a pre-range run
# (from `prior`) count those miles too.
weekly_load <- function(runs, prior = NULL) {
  all <- rbind(data.frame(date = runs$date, mi = runs$mi, indoor = runs$indoor, in_range = TRUE),
               if (!is.null(prior) && nrow(prior)) data.frame(date = prior$date, mi = prior$mi, indoor = prior$indoor, in_range = FALSE))
  all$week <- week_start(all$date)
  weeks <- seq(min(all$week), max(all$week), by = 7)
  wk <- data.frame(week = weeks,
                   mi = vapply(weeks, function(k) sum(all$mi[all$week == k], na.rm = TRUE), numeric(1)),
                   mi_outdoor = vapply(weeks, function(k) sum(all$mi[all$week == k & !all$indoor], na.rm = TRUE), numeric(1)),
                   mi_indoor = vapply(weeks, function(k) sum(all$mi[all$week == k & all$indoor], na.rm = TRUE), numeric(1)),
                   in_range = vapply(weeks, function(k) any(all$in_range[all$week == k]), logical(1)))
  wk[wk$in_range, ]
}

# Groups of outdoor runs with a similar distance (recurring routes); runs with no distance are left out.
route_groups <- function(runs, h = 0.6, min_runs = 5) {
  o <- runs[!runs$indoor & is.finite(runs$mi), ]
  o$route_mi <- rep(NA_real_, nrow(o))              # median distance of the run's group, NA if none
  if (nrow(o) < min_runs) return(o)
  cl <- stats::cutree(stats::hclust(stats::dist(o$mi), "complete"), h = h)
  for (g in unique(cl)) {
    idx <- cl == g
    if (sum(idx) >= min_runs) o$route_mi[idx] <- stats::median(o$mi[idx])
  }
  o
}

# ---- performance analysis ------------------------------------------------------

# Duration-weighted mean over the non-missing values, NA if there are none.
wmean <- function(v, w) { ok <- is.finite(v); if (any(ok)) sum(v[ok] * w[ok]) / sum(w[ok]) else NA_real_ }

# Outdoor-run performance per month: efficiency (m per beat), power, stride
# length, median cardiac drift and mean temperature.
perf_summary <- function(runs) {
  o <- runs[!runs$indoor, ]
  do.call(rbind, lapply(sort(unique(runs$month)), function(mo) {
    m <- o[o$month == mo, ]
    data.frame(month = mo, runs = nrow(m),
               ef = wmean(m$ef, m$duration_min), power_w = wmean(m$power_w, m$duration_min),
               stride_m = wmean(m$stride_m, m$duration_min),
               drift = if (any(!is.na(m$drift_pct))) median(m$drift_pct, na.rm = TRUE) else NA_real_,
               drift_n = sum(!is.na(m$drift_pct)),
               temp_f = if (any(!is.na(m$temp_f))) mean(m$temp_f, na.rm = TRUE) else NA_real_)
  }))
}

# Outdoor runs grouped by start temperature.
TEMP_EDGES_F <- c(60, 70, 80)                    # band edges; the metric table uses the same edges, labelled in degrees C
f_to_c <- function(f) (f - 32) * 5 / 9
TEMP_LABELS <- list(
  F = c(sprintf("Under %d\u00b0F", TEMP_EDGES_F[1]), sprintf("%d\u2013%d\u00b0F", TEMP_EDGES_F[1:2], TEMP_EDGES_F[2:3] - 1),
        sprintf("%d\u00b0F and over", TEMP_EDGES_F[3])),
  C = { e <- sprintf("%.1f", f_to_c(TEMP_EDGES_F))
        c(sprintf("Under %s\u00b0C", e[1]), sprintf("%s\u2013%s\u00b0C", e[1:2], e[2:3]), sprintf("%s\u00b0C and over", e[3])) })
weather_bins <- function(runs, unit = c("F", "C")) {
  unit <- match.arg(unit)
  o <- runs[!runs$indoor & !is.na(runs$temp_f), ]
  o$bin <- cut(o$temp_f, c(-Inf, TEMP_EDGES_F, Inf), TEMP_LABELS[[unit]], right = FALSE)
  do.call(rbind, lapply(split(o, o$bin), function(m) if (!nrow(m)) NULL else
    data.frame(bin = m$bin[1], runs = nrow(m), humidity = mean(m$humidity, na.rm = TRUE),
               pace_mi = sum(m$duration_min) / sum(m$mi), hr = wmean(m$hr_avg, m$duration_min),
               ef = wmean(m$ef, m$duration_min),
               drift = if (any(!is.na(m$drift_pct))) median(m$drift_pct, na.rm = TRUE) else NA_real_)))
}

# Outdoor runs with temperature, HR and pace, for the temperature plots. Returns
# NULL when there are too few. `hr_resid` is avg HR minus the HR expected for the
# run's speed (a straight-line fit across these runs).
weather_runs <- function(runs, min_runs = 8) {
  o <- runs[!runs$indoor & is.finite(runs$temp_f) & is.finite(runs$hr_avg) & is.finite(runs$pace_mi), ]
  if (nrow(o) < min_runs || length(unique(o$temp_f)) < 3) return(NULL)
  o$hr_resid <- resid(lm(hr_avg ~ I(60 / pace_mi), o))
  o
}
