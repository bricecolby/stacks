# Stacks — screen mockups (demo)

Clickable mockups of every Stacks screen, exported from the design canvas
(https://claude.ai/artifact/JSoxV4kqXoPGGknqtfAHP3) on Nov 5, 2026. These show the v0.3 design language
and the 28 screens in the screen inventory (R1–R12, C1–C9, A1–A7), plus the
earlier style explorations.

They are design references, not app code. The real front end will be
React (per the architecture decisions), built against the API contract.

## Viewing

Open `index.html` in a browser. It lists every screen, with links to
each variant. Links between screens, the drawer menus, and the "Ask the
desk" panel all work. Or serve the folder:

```sh
cd demo && python3 -m http.server 8000   # then open http://localhost:8000
```

Fonts (Public Sans, Courier Prime, Libre Caslon Text) load from Google
Fonts, so offline viewing falls back to system fonts.

## Variants (tweaks)

On the canvas, some screens have a Tweaks control. Here, pass it in the URL:

| Screen | Parameter | Values |
| --- | --- | --- |
| R1 Home | `view` | `Signed in`, `Visitor` |
| R2 Ask | `result` | `Matches a question`, `New question drafted`, `Declined` |
| R5 Reading path | `source` | `Curated`, `Generated` |
| R6 Record | `state` | `Current`, `Corrected`, `Retracted` |
| v1 Home (`Main`) | `accent` | any hex color |

Example: `R06-Record.dc.html?state=Retracted`.

## Files

- `R*.dc.html`, `C*.dc.html`, `A*.dc.html`: the 28 screens, byte-for-byte as on the canvas.
- `Main`, `Question`, `Record`, `Profile` (v1), `Style`, `RecordV2` (v2), `StyleV3`, `RecordV3` (v3): style explorations.
- `support.js`: a small standalone renderer for the canvas's `.dc.html` format
  (`{{holes}}`, `<sc-if>`, `<sc-for>`, event handlers, `setState`). The canvas
  uses its own runtime under this file name; this stand-in lets the pages run outside it.
- `index.html`: the screen list.

## Keeping in sync

The canvas is still the source of truth for the mockups. After a design change,
re-export the changed `.dc.html` files from the canvas to this folder without
editing them by hand, so they stay identical to the canvas.
