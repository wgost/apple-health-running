#!/usr/bin/env Rscript
# Generate the running report from an Apple Health export.
#
# Usage:
#   Rscript src/run_report.R path/to/export.zip [--duration 3] [--out output] [--reparse]
#
#   --duration number of calendar months to report, ending today (default 3: this month
#              and the two before it)
#   --out      output folder (default ./output)
#   --reparse  ignore the cached parse of this zip and read it again
#
# Parsing a multi-GB export takes a minute or two; the parsed data is cached in
# the output folder and reused while the zip and the report start date are unchanged.

suppressPackageStartupMessages({
  if (!requireNamespace("ggplot2", quietly = TRUE) || packageVersion("ggplot2") < "4.0.0")
    stop("Needs package 'ggplot2' 4.0 or newer. Install with: install.packages('ggplot2')")
})

# The report text uses non-ASCII characters (°, –, →); make sure the session is UTF-8.
if (!isTRUE(l10n_info()$`UTF-8`)) for (loc in c("en_US.UTF-8", "C.UTF-8", "English_United States.utf8"))
  if (nzchar(suppressWarnings(Sys.setlocale("LC_CTYPE", loc)))) break

args <- commandArgs(trailingOnly = TRUE)
usage <- "Usage: Rscript src/run_report.R path/to/export.zip [--duration MONTHS] [--out DIR] [--reparse]"
opt <- list(duration = "3", out = "output", reparse = FALSE, zip = NA)
i <- 1
while (i <= length(args)) {
  a <- args[i]
  if (a %in% c("--duration", "--out")) { opt[[sub("--", "", a)]] <- args[i + 1]; i <- i + 2; next }
  if (a == "--reparse") opt$reparse <- TRUE
  else if (a %in% c("-h", "--help")) {
    cat(usage, "\n")
    quit(status = 0)
  }
  else opt$zip <- a
  i <- i + 1
}
if (is.na(opt$zip)) stop(usage)
months <- suppressWarnings(as.integer(opt$duration))
if (is.na(months) || months < 1) stop("--duration must be a whole number of months (1 or more)\n", usage)

# locate the project root (parent of this script's src/ folder) so it can be run from anywhere
file_arg <- grep("^--file=", commandArgs(FALSE), value = TRUE)
root <- if (length(file_arg)) dirname(dirname(normalizePath(sub("^--file=", "", file_arg)))) else getwd()
source(file.path(root, "src", "parse_export.R"))
source(file.path(root, "src", "metrics.R"))
source(file.path(root, "src", "build_report.R"))

dir.create(opt$out, showWarnings = FALSE, recursive = TRUE)
out_dir <- normalizePath(opt$out)
end <- Sys.Date()
start <- report_start(months, end)

# ---- parse (cached) ----
info <- file.info(opt$zip)
key <- paste(normalizePath(opt$zip), info$size, as.numeric(info$mtime), start, PARSER_VERSION, sep = "|")
cache <- file.path(out_dir, "parsed_export.rds")
x <- NULL
if (!opt$reparse && file.exists(cache)) {
  x <- readRDS(cache)
  if (!identical(attr(x, "cache_key"), key)) x <- NULL
}
if (is.null(x)) {
  message("Reading ", opt$zip, " (this can take a few minutes)...")
  t0 <- Sys.time()
  x <- read_health_export(opt$zip, start = start, end = end)
  attr(x, "cache_key") <- key
  saveRDS(x, cache)
  message(sprintf("Parsed in %.0f s: %d running workouts, %s samples.", as.numeric(difftime(Sys.time(), t0, units = "secs")),
                  nrow(x$workouts), format(nrow(x$records), big.mark = ",")))
} else message("Using cached parse: ", cache)

all_dates <- as.Date(substr(x$workouts$start, 1, 10))
if (!any(all_dates >= start & all_dates <= end)) stop("No running workouts between ", start, " and ", end)
message("Report range: ", start, " to ", end)

# ---- render ----
out_file <- sprintf("running_report_%s_%s.html", start, end)
build_report(cache, start, end, file.path(out_dir, out_file),
             css_file = file.path(root, "src", "report.css"))
message("Report: ", file.path(out_dir, out_file))
