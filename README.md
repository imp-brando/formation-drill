# Formation Drill (HTML / browser version)

Voice-controlled Drill & Ceremony practice game. Call drill commands with proper inflection to march a
four-file formation: Fall in, Cover, Recover, Forward MARCH, column movements, flanks, rear march,
counter column and more, timed to PICAA.

**Play in Chrome (phone or computer):** https://imp-brando.github.io/formation-drill-html/

This is the browser version: one HTML file, no install. It uses Chrome's built-in speech recognition and
works offline after the first visit (service worker).

**Android app:** https://github.com/imp-brando/formation-drill-android, a separate repo. The app loads this
same game from the Pages site above, with an on-device drill-word recogniser instead of Chrome's.

## Develop

- Source is in `src/`; `./build.sh` concatenates it into `index.html` (what Pages serves).
- `sw.js`: offline cache (network first, cached copy with no signal).
- `src/part6.js`: detects the Android app's native voice bridge (`window.FGAndroid`); in a normal browser
  it does nothing.
- Tests: `node tests/<name>.js` (puppeteer-core + Chrome).
