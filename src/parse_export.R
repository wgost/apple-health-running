# Parse an Apple Health export (.zip) into tidy data frames.
#
# The export.xml inside the zip is usually several GB, too large to load as a
# DOM. It is streamed line by line in chunks instead. Apple writes one element
# per line, so each <Record>, <Workout> and child element is matched with
# regular expressions.

# ---- helpers ---------------------------------------------------------------

# Extract the value of XML attribute `name` from each line (NA when absent).
xml_attr <- function(x, name) {
  m <- regexpr(paste0(" ", name, '="[^"]*"'), x, perl = TRUE)
  out <- rep(NA_character_, length(x))
  hit <- m > 0
  out[hit] <- substring(x[hit], m[hit] + nchar(name) + 3, m[hit] + attr(m, "match.length")[hit] - 2)
  out
}

# Apple timestamps look like "2026-10-16 06:38:41 -0400".
parse_hk_time <- function(x) as.POSIXct(x, format = "%Y-%m-%d %H:%M:%S %z", tz = "UTC")

# Open a text connection to export.xml without extracting the whole archive
# when possible. Falls back to extracting export.xml to a temp folder.
open_export_xml <- function(zip_path) {
  stopifnot(file.exists(zip_path))
  listing <- utils::unzip(zip_path, list = TRUE)
  member <- listing$Name[grepl("(^|/)export\\.xml$", listing$Name)]
  if (length(member) == 0) stop("No export.xml found inside ", zip_path)
  member <- member[1]
  if (nzchar(Sys.which("unzip"))) {
    con <- pipe(paste("unzip -p", shQuote(normalizePath(zip_path)), shQuote(member)), open = "r")
  } else {
    message("`unzip` not found on PATH; extracting export.xml to a temp folder...")
    tmp <- tempfile("ahexport")
    utils::unzip(zip_path, files = member, exdir = tmp)
    con <- file(file.path(tmp, member), open = "r")
  }
  con
}

# ---- main parser -----------------------------------------------------------

#' Read an Apple Health export zip.
#'
#' @param zip_path   path to export.zip as produced by the Health app.
#' @param start,end  Date range of interest; samples outside it are dropped.
#'                   Running workouts are kept for all dates (they are few) so
#'                   `prior_runs()` can use the weeks before the range.
#' @param chunk_lines lines read per chunk; larger is faster but uses more RAM.
#' @return a list of data frames, see bottom of function.
read_health_export <- function(zip_path, start, end = Sys.Date(), chunk_lines = 250000L) {
  start <- as.Date(start); end <- as.Date(end)
  keep_from <- format(start, "%Y-%m-%d")
  keep_to   <- format(end + 1, "%Y-%m-%d")      # exclusive upper bound on date string

  rec_types <- c(
    HeartRate = "HKQuantityTypeIdentifierHeartRate",
    DistanceWalkingRunning = "HKQuantityTypeIdentifierDistanceWalkingRunning",
    RestingHeartRate = "HKQuantityTypeIdentifierRestingHeartRate",
    HeartRateVariabilitySDNN = "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
    VO2Max = "HKQuantityTypeIdentifierVO2Max",
    HeartRateRecoveryOneMinute = "HKQuantityTypeIdentifierHeartRateRecoveryOneMinute"
  )
  stat_types <- c("DistanceWalkingRunning", "StepCount", "RunningVerticalOscillation", "RunningGroundContactTime")
  rec_pat <- paste0('^ <Record type="(', paste(rec_types, collapse = "|"), ')"')

  con <- open_export_xml(zip_path)
  on.exit(close(con), add = TRUE)

  export_date <- NA_character_
  rec_chunks <- list(); wk_rows <- list(); wk_stats <- list(); wk_meta <- list()
  carry <- character(0); n_read <- 0
  wid <- 0L

  repeat {
    chunk <- readLines(con, n = chunk_lines, warn = FALSE)
    # Exports can contain stray invalid UTF-8 bytes (e.g. in device names); drop them.
    chunk <- iconv(chunk, "UTF-8", "UTF-8", sub = "")
    if (length(chunk) == 0 && length(carry) == 0) break
    eof <- length(chunk) < chunk_lines
    n_read <- n_read + length(chunk)
    lines <- c(carry, chunk); carry <- character(0)

    # If the last <Workout> in this chunk is not closed yet, hold it (and
    # everything after it) back for the next chunk so nothing is read twice.
    if (!eof) {
      lo <- which(startsWith(lines, " <Workout "))
      lc <- which(startsWith(lines, " </Workout>"))
      if (length(lo) && (length(lc) == 0 || max(lo) > max(lc))) {
        cut <- max(lo)
        carry <- lines[cut:length(lines)]
        lines <- if (cut > 1) lines[1:(cut - 1)] else character(0)
      }
    }

    if (is.na(export_date)) {
      j <- grep("<ExportDate ", lines, fixed = TRUE)
      if (length(j)) export_date <- xml_attr(lines[j[1]], "value")
    }

    # -- records
    r <- lines[grepl(rec_pat, lines, perl = TRUE)]
    if (length(r)) {
      typ <- sub(rec_pat, "\\1", regmatches(r, regexpr(rec_pat, r, perl = TRUE)), perl = TRUE)
      sd <- xml_attr(r, "startDate")
      keep <- substr(sd, 1, 10) >= keep_from & substr(sd, 1, 10) < keep_to
      if (any(keep)) {
        r <- r[keep]
        rec_chunks[[length(rec_chunks) + 1]] <- data.frame(
          type = names(rec_types)[match(typ[keep], rec_types)],
          source = xml_attr(r, "sourceName"),
          start = sd[keep], end = xml_attr(r, "endDate"),
          value = as.numeric(xml_attr(r, "value")),
          unit = xml_attr(r, "unit"), stringsAsFactors = FALSE)
      }
    }

    # -- running workouts (multi-line blocks)
    opens <- which(startsWith(lines, " <Workout "))
    closes <- which(startsWith(lines, " </Workout>"))
    for (o in opens) {
      cl <- closes[closes > o][1]
      if (is.na(cl)) cl <- length(lines)    # only possible at end of file
      head <- lines[o]
      if (!grepl('workoutActivityType="HKWorkoutActivityTypeRunning"', head, fixed = TRUE)) next
      wid <- wid + 1L
      wk_rows[[wid]] <- data.frame(
        workout_id = wid,
        source = xml_attr(head, "sourceName"),
        start = xml_attr(head, "startDate"), end = xml_attr(head, "endDate"),
        duration = as.numeric(xml_attr(head, "duration")), duration_unit = xml_attr(head, "durationUnit"),
        total_distance = as.numeric(xml_attr(head, "totalDistance")),
        total_distance_unit = xml_attr(head, "totalDistanceUnit"),
        stringsAsFactors = FALSE)
      body <- if (cl > o) lines[(o + 1):cl] else character(0)
      s <- body[startsWith(body, "  <WorkoutStatistics ")]
      s <- s[sub("^HKQuantityTypeIdentifier", "", xml_attr(s, "type")) %in% stat_types]
      if (length(s)) wk_stats[[wid]] <- data.frame(
        workout_id = wid, type = sub("^HKQuantityTypeIdentifier", "", xml_attr(s, "type")),
        sum = as.numeric(xml_attr(s, "sum")), average = as.numeric(xml_attr(s, "average")),
        unit = xml_attr(s, "unit"), stringsAsFactors = FALSE)
      m <- body[startsWith(body, "  <MetadataEntry ") & grepl('key="HKIndoorWorkout"', body, fixed = TRUE)]
      if (length(m)) wk_meta[[wid]] <- data.frame(
        workout_id = wid, key = xml_attr(m, "key"), value = xml_attr(m, "value"), stringsAsFactors = FALSE)
    }
    message(sprintf("  read %s lines, %d running workouts so far", format(n_read, big.mark = ",", scientific = FALSE), wid))
    if (eof) break
  }

  bind <- function(x) if (length(x)) do.call(rbind, x[!vapply(x, is.null, logical(1))]) else NULL
  records <- bind(rec_chunks)
  if (is.null(records)) records <- data.frame(type = character(), source = character(), start = character(),
                                              end = character(), value = numeric(), unit = character())
  list(
    workouts = bind(wk_rows),
    workout_stats = bind(wk_stats),
    workout_meta = bind(wk_meta),
    records = records,
    export_date = export_date,
    zip_path = normalizePath(zip_path)
  )
}
