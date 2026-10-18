# Page assembly: an accumulator for the report body (headings, tables, chart boxes) and the final page, which is
# the shared template (shared/page.tmpl) filled with the shared CSS and scripts. Needs ggplot2 and svglite.

# Fill {{name}} placeholders in one pass, so text that is substituted is never scanned for placeholders again.
fill_template <- function(tmpl, vars) {
  m <- gregexpr("\\{\\{[a-z_]+\\}\\}", tmpl)
  keys <- gsub("[{}]", "", regmatches(tmpl, m)[[1]])
  lit <- regmatches(tmpl, m, invert = TRUE)[[1]]
  paste0(lit, c(unlist(vars[keys]), ""), collapse = "")
}

# A ggplot as inline SVG (svglite). The chart sits on a transparent background; the shared CSS supplies the line and
# text styles svglite would otherwise repeat in every chart, and the font comes from the page.
svg_chart <- function(plot, width, height, id, label) {
  f <- tempfile(fileext = ".svg")
  svglite::svglite(f, width = width, height = height, bg = "transparent", standalone = FALSE)
  print(plot); grDevices::dev.off()
  s <- paste(readLines(f, warn = FALSE, encoding = "UTF-8"), collapse = "\n"); unlink(f)
  s <- sub("<defs>\\s*<style.*?</style>\\s*</defs>", "", s, perl = TRUE)
  s <- sub("<rect width='100%' height='100%'[^>]*/>\\n?", "", s)
  s <- sub(" width='[0-9.]+pt' height='[0-9.]+pt'", paste0(" role='img' aria-label='", label, "'"), s)
  s <- gsub(" font-family: \"[^\"]*\";", "", s)
  gsub("(id='|url\\(#)(cp)", paste0("\\1f", id, "-\\2"), s)           # clip-path ids must be unique within the page
}

new_page <- function() {
  parts <- character(); toc <- list(); n_fig <- 0L
  add <- function(...) parts <<- c(parts, paste0(...))
  h1 <- function(t) { id <- slug(t); toc[[length(toc) + 1]] <<- list(id = id, text = t)
    add('<div id="', id, '" class="section level1"><h1>', esc(t), "</h1>") }
  h2 <- function(t) { id <- slug(t)
    add('<div id="', id, '" class="section level2"><h2>', esc(t), "</h2>") }
  close_div <- function() add("</div>")
  bullets <- function(items) add("<ul>", paste0("<li>", items, "</li>", collapse = "\n"), "</ul>")

  # ggplot -> a chart box: HTML title and subtitle (taken from the plot) above an inline SVG. One chart each, at
  # the same aspect ratio on every screen; the browser scales it to the box width.
  fig <- function(p, height, cls = NULL, width = 7.2) {
    if (is.null(p)) return(invisible())
    lb <- get_labs(p)
    title <- lb$title; subtitle <- lb$subtitle
    p <- p + labs(title = NULL, subtitle = NULL)
    n_fig <<- n_fig + 1L
    add('<div class="chart', if (width < 5) " panel", if (!is.null(cls)) paste0(" ", cls), '">',
        if (!is.null(title)) paste0('<p class="ctitle">', esc(title), "</p>"),
        if (!is.null(subtitle)) paste0('<p class="csub">', esc(subtitle), "</p>"),
        '<p class="fig">', svg_chart(p, width, height, n_fig, if (is.null(title)) "" else esc(title)), "</p></div>")
  }
  fig_u <- function(build, height) for (u in UN) fig(build(u), height, u$cls)   # one figure per unit system

  # Several small charts under one title. Each is its own SVG in a CSS grid, so they sit side by side
  # when there is room and stack vertically when the window is narrow (a facetted chart could not).
  fig_grid <- function(title, subtitle, plots, height, cls = NULL) {
    add('<div class="figgrid', if (!is.null(cls)) paste0(" ", cls), '"><p class="figtitle"><b>', esc(title), "</b>",
        if (nzchar(subtitle)) paste0("<br><span>", esc(subtitle), "</span>"), "</p>")
    for (p in plots) fig(p, height, width = 3.6)
    close_div()
  }
  fig_grid_u <- function(build, title, subtitle, height) for (u in UN) fig_grid(title, subtitle, build(u), height, u$cls)

  render <- function(shared_dir) {
    read <- function(f) {
      path <- file.path(shared_dir, f)
      txt <- readChar(path, file.size(path), useBytes = TRUE)
      Encoding(txt) <- "UTF-8"
      txt
    }
    toc_html <- paste0("<ul>", paste0(vapply(toc, function(t) sprintf('<li><a href="#%s">%s</a></li>', t$id, esc(sub("^[0-9]+\\.\\s*", "", t$text))), ""), collapse = ""), "</ul>")
    fill_template(read("page.tmpl"), list(theme_init = read("theme_init.js"), css = read("report.css"), toc = toc_html,
                                         body = paste(parts, collapse = "\n"), page_js = read("page.js")))
  }
  list(add = add, h1 = h1, h2 = h2, close_div = close_div, bullets = bullets, fig = fig, fig_u = fig_u,
       fig_grid = fig_grid, fig_grid_u = fig_grid_u, render = render)
}
