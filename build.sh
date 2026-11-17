#!/bin/sh
# Rebuild the single-file game from src/ parts (no build tools needed).
cd "$(dirname "$0")"
{ cat src/part1.html src/part2.html; echo '<script id="main">'; cat src/part3.js src/part4.js src/part5.js; echo '</script>'; echo '</body></html>'; } > index.html
