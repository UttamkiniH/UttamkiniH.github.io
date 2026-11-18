# Uttam Kini H · portfolio

Live at **https://uttamkinih.github.io**

A portfolio you explore as a miniature toy city, with a plain one-page resume for recruiters, and two interactive case studies of client work:

- **CoreSports:** follow one point from a wall hit to the reward, play a 30-second game, and see how rewards are kept from paying twice.
- **Family tree app:** a playground running the app's own layout and relationship engines, ported to JavaScript.

Both clients approved showing these internals; identifiers, hosts and IDs in the case studies are illustrative.

## Layout

- `toy-city/`: the source pages. `index.html` is a page body; the other pages are complete documents.
- `build.sh`: builds `docs/` (what GitHub Pages serves), adding the document head, link-preview tags and the icon.
- `docs/`: the built site. Don't edit it by hand; run `./build.sh`.

Built with three.js, plain HTML, CSS and JavaScript, and Claude Code.
