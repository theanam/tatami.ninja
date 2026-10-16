# tatami.ninja

tatami.ninja is a free, open-source embroidery digitizer that runs entirely in your browser. It turns artwork into machine-ready stitch files (PES, DST, JEF, EXP, VP3, XXX and HUS) with nothing to install. Your designs never leave your device.

**Live app:** https://tatami.ninja/

## Features

- **Objects, not stitches.** Draw or import shapes and set their stitch type: run, satin, tatami fill, contour fill or appliqué. Stitches regenerate live in a background worker.
- **Import:**
  - SVG artwork: filled shapes become fills, lines become run stitches and thick strokes become satin columns. Colors come from the SVG.
  - PNG or JPG as a tracing backdrop.
  - Auto-digitize: color reduction and region tracing, with satin for narrow regions and fills for wide ones.
- **Drawing tools:** pen, run, satin column (click left and right rails), fill, shapes, lettering, appliqué, node editing and a measure tool.
- **Lettering:** four built-in fonts, with height, spacing and text on an arc.
- **Fabric presets** set density, underlay and pull compensation. Per-object overrides for underlay, pull compensation, ties and trims are under Advanced.
- **Sequencing:**
  - The object list is the sewing order, grouped into color blocks.
  - Drag to reorder, auto-order by color, hide and lock.
  - Union, subtract and intersect shapes, add an offset outline, and convert runs to satin.
- **Previews:** Objects, Stitches and a Realistic thread render on the fabric. The stitch-out simulator has play, scrub, 1–20× speed and sewing-order progress.
- **Warnings:**
  - The design is outside the hoop, with one-click scale to fit.
  - Density hotspots.
  - Short stitches.
  - Lettering that is too small.
- **Export:** PES, DST, JEF, EXP, VP3, XXX and HUS, a printable PDF color sheet, and the editable `.tatami.json` project file.
- **Open stitch files:** DST, PES, JEF and EXP files open recolor-only.
- **Autosave:** designs are saved in the browser (IndexedDB). There are no accounts and nothing is uploaded.

## Run it locally

You need Node 24 (see `.nvmrc`).

```sh
npm install
npm run dev          # http://localhost:5182
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 5182 |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build on port 5182 |
| `npm test` | Unit tests (Vitest): engine, file formats, importers, store, components |
| `npm run test:e2e` | End-to-end tests (Playwright) for the main flows |
| `npm run typecheck` | TypeScript, strict |

The first time you run the e2e tests, install the browser with `npx playwright install chromium`.

## Deploying to GitHub Pages

The `CI and deploy` workflow (`.github/workflows/ci.yml`) runs on every push to `main`. It type-checks, runs the unit and e2e tests, builds the app and publishes `dist/` to GitHub Pages. To turn it on, open the repository settings, go to **Pages**, and set **Source** to **GitHub Actions**.

Google Analytics is added only to the deployed Pages site, never to the source or local builds. The workflow inserts the tag after building when the repository variable `GA_MEASUREMENT_ID` is set (Settings → Secrets and variables → Actions → Variables). If the variable is not set, the site deploys without analytics.

The build uses a relative base path and hash routing, so it works from any path, including `https://theanam.github.io/tatami.ninja/` or a custom domain such as `tatami.ninja`. It needs no server rewrites.

## How it is built

```
src/
  engine/      geometry → stitch commands (pure TS, runs in a Web Worker): run, tatami, satin, contour,
               appliqué, underlay, ties, jumps/trims/color changes, warnings
  formats/     stitch-file writers (PES, DST, JEF, EXP, VP3, XXX, HUS) and readers (DST, PES, JEF, EXP)
  importers/   SVG import, auto-digitize, lettering (opentype.js), stitch-file projects
  model/       project format, transforms, node editing, templates, units
  presets/     machines, hoops, fabric presets, thread charts
  render/      Canvas2D realistic and stitch rendering, fabric textures, thumbnails
  store/       Zustand editor store with undo/redo
  storage/     IndexedDB autosave
  screens/     Home, New design wizard, Editor, Help, About
tests/e2e/     Playwright flows
```

Geometry is stored as integers in 0.1 mm units, which is the native DST unit. Origin is the hoop center and +y points down. The engine is deterministic: the same project always produces the same stitches.

The stack is Vite, React and TypeScript (strict), with Zustand and idb. It uses no component library. The project uses a single package rather than separate workspace packages to keep the GitHub Pages build simple. The engine, formats and presets folders stay free of DOM code so they can run in the worker.

## Help, issues and contact

- In-app help: the **Help** page (`#/help`) covers workflows, stitch types, file formats and keyboard shortcuts.
- Bugs and feature requests: [GitHub issues](https://github.com/theanam/tatami.ninja/issues)
- Everything else: anam.ahmed.a@gmail.com

## Credits

- Geist and Geist Mono by Vercel (SIL Open Font License 1.1). They are bundled for offline use.
- Lettering fonts:
  - Oswald and Pacifico (SIL OFL 1.1)
  - Roboto Slab (Apache License 2.0)
  - Geist Bold (SIL OFL 1.1)

  Their licenses are in `public/lettering/`.
- The format writers and readers follow [pyembroidery](https://github.com/EmbroidePy/pyembroidery) (MIT, © 2018 Tatarize).
- [Clipper](https://www.npmjs.com/package/clipper-lib) (Boost Software License), [opentype.js](https://opentype.js.org/) (MIT) and [jsPDF](https://github.com/parallax/jsPDF) (MIT).

## License

The project license has not been chosen yet.
