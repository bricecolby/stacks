# Stacks — clickable demo

A click-through demo of the Stacks site, built from the mockups on the design
canvas (https://claude.ai/artifact/JSoxV4kqXoPGGknqtfAHP3), exported Nov 5, 2026.
It uses the v0.3 design language and covers all 28 screens in the screen
inventory (R1–R12, C1–C9, A1–A7).

It's a design reference, not app code. The real front end will be React
(per the architecture decisions), built against the API contract.

## Viewing

Open `index.html` (the Home screen) and click around as you would on the real
site. Every screen can be reached from Home through the drawer menus, links,
and the Ask the desk button. You're signed in as R. Alvarez, a researcher who
is also a steward. To see the visitor view, use **My Stacks › Sign out**, which
returns you to Home with a Sign in button.

Or serve the folder:

```sh
cd demo && python3 -m http.server 8000   # then open http://localhost:8000
```

Fonts (Public Sans, Courier Prime, Libre Caslon Text) load from Google Fonts,
so offline viewing falls back to system fonts.

## Variants

Some screens have variants that the site never navigates to. On the canvas
they're Tweaks; here, add them to the URL:

| Screen | Parameter | Values |
| --- | --- | --- |
| R1 Home (`index.html`) | `view` | `Signed in`, `Visitor` |
| R2 Ask | `result` | `Matches a question`, `New question drafted`, `Declined` |
| R5 Reading path | `source` | `Curated`, `Generated` |
| R6 Record | `state` | `Current`, `Corrected`, `Retracted` |

Example: `R06-Record.dc.html?state=Retracted`.

## Files

- `index.html`: R1 Home.
- `R*.dc.html`, `C*.dc.html`, `A*.dc.html`: the other 27 screens.
- `explorations/`: earlier style rounds (v1–v3), kept for reference and not
  linked from the site. Open `explorations/Main.dc.html` for the v1 concept.
- `support.js`: a small standalone renderer for the canvas's `.dc.html` format
  (`{{holes}}`, `<sc-if>`, `<sc-for>`, event handlers, `setState`, URL variants).
  The canvas uses its own runtime under this name; this stand-in lets the pages
  run on their own.

## Differences from the canvas

The canvas is still the source of truth. When you re-export a screen from it,
apply these changes again:

1. Home is `index.html`, not `R01-Home.dc.html`. Every link to
   `R01-Home.dc.html` becomes `index.html`:
   `sed -i 's/R01-Home\.dc\.html/index.html/g' *.html`
2. C8 My Stacks has a "Sign out" link (`index.html?view=Visitor`) next to
   "Public profile".
3. Files in `explorations/` load `../support.js` instead of `./support.js`.
4. Every page has `<meta name="viewport" content="width=device-width, initial-scale=1">`
   after `<meta charset="utf-8">`, so phones use the mobile layout. (The canvas
   viewer supplies this itself, so exported files don't have it.)

## Phone menu (demo only)

Below 720px, `support.js` collapses the drawer row into a small filing-cabinet
button whose three drawer fronts double as hamburger lines. It opens a
full-screen "card catalog" overlay: Home on top, then one tabbed file folder
per drawer (Explore, My Stacks, Curation), with each page shown as an index
card. The current section's folder starts open, and the current page is marked
"You are here". Ask the desk stays in the header. The overlay is built from
each page's own menu, so the page files didn't change. It isn't on the canvas
yet; if it's kept, it should go there as a proper mobile header.
