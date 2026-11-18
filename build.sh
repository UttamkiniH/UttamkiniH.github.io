#!/bin/sh
# Builds the GitHub Pages site in docs/ from the pages in toy-city/.
# toy-city/index.html is a page body (the Claude artifact adds the document shell when it publishes),
# so here it gets a full <head>: language, viewport, link-preview tags and an icon.
set -eu
cd "$(dirname "$0")"
SRC=toy-city
OUT=docs
URL="https://uttamkinih.github.io"
TITLE="Uttam Kini H · Senior Software Engineer"
DESC="Flutter apps and the NestJS backends behind them. Explore my work as a toy city, or read the one-page resume."

mkdir -p "$OUT"
for f in coresports.html coresports-data.js family-tree.html tree-engine.js tree-data.js kinship.js icon.svg og.png; do
  cp "$SRC/$f" "$OUT/$f"
done
touch "$OUT/.nojekyll"

# Everything above the first <div id="city"> is head material: title, meta, theme script, fonts, styles.
split=$(grep -n -m1 '^<div id="city">' "$SRC/index.html" | cut -d: -f1)
{
  cat <<EOF
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:url" content="$URL/">
<meta property="og:title" content="$TITLE">
<meta property="og:description" content="$DESC">
<meta property="og:image" content="$URL/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="$TITLE">
<meta name="twitter:description" content="$DESC">
<meta name="twitter:image" content="$URL/og.png">
<style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}[hidden]{display:none!important}</style>
EOF
  head -n $((split - 1)) "$SRC/index.html" | sed 's|<title>[^<]*</title>|<title>'"$TITLE"'</title>|'
  echo '</head>'
  echo '<body>'
  tail -n +"$split" "$SRC/index.html"
  echo '</body>'
  echo '</html>'
} > "$OUT/index.html"

echo "built $OUT/"
