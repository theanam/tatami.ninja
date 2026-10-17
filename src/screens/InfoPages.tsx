import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { GithubMark, Icon } from '../components/Icon';
import { PageFooter, PageHeader } from '../components/PageChrome';
import { openTour } from '../components/tour/tourState';
import { CONTACT_EMAIL, ISSUES_URL, NEW_ISSUE_URL, REPO_URL } from '../links';

declare const __APP_VERSION__: string;
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';

function InfoLayout({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} — tatami.ninja`;
  }, [title]);
  return (
    <div className="page-shell">
      <PageHeader />
      <main className="page-main info">
        <div>
          <Link to="/" className="back-link">
            <Icon name="arrow-left" small />
            Your designs
          </Link>
          <h1>{title}</h1>
          <p className="lead">{lead}</p>
        </div>
        {children}
        <ContactCard />
      </main>
      <PageFooter />
    </div>
  );
}

function ContactCard() {
  return (
    <section className="contact-card" aria-labelledby="contact">
      <h2 id="contact">Get in touch</h2>
      <div className="contact-grid">
        <a className="contact-item" href={NEW_ISSUE_URL} target="_blank" rel="noreferrer">
          <GithubMark size={20} />
          <span>
            <b>Found a bug or have an idea?</b>
            <span className="meta">Open an issue on the GitHub issue tracker.</span>
          </span>
        </a>
        <a className="contact-item" href={`mailto:${CONTACT_EMAIL}`}>
          <Icon name="mail" />
          <span>
            <b>Everything else</b>
            <span className="meta">{CONTACT_EMAIL}</span>
          </span>
        </a>
      </div>
    </section>
  );
}

const SHORTCUTS: [string, string][] = [
  ['V', 'Select'],
  ['A', 'Node edit (drag points of the selected shape)'],
  ['P', 'Pen — click points; click the first point or press Enter to close a fill, double-click to finish a line'],
  ['R', 'Run stitch line'],
  ['S', 'Satin column — click left and right rail points, Enter to finish'],
  ['F', 'Fill shape — click points, Enter to close'],
  ['U', 'Shapes — drag a rectangle; hold Shift for a circle'],
  ['T', 'Lettering — click where the text goes, then type'],
  ['Enter / double-click', 'Edit the selected lettering in place'],
  ['M', 'Measure — drag to measure a distance'],
  ['I', 'Import: SVG artwork directly, or an image to trace (or use as a backdrop)'],
  ['⌘/Ctrl Z · ⇧⌘/Ctrl Z', 'Undo · Redo'],
  ['Delete / Backspace', 'Delete the selected objects'],
  ['⌘/Ctrl D', 'Duplicate the selection'],
  ['⌘/Ctrl G', 'Group the selection (⇧ to ungroup)'],
  ['⌘/Ctrl S / O', 'Save / open a .xtatami file (⇧⌘S: save as)'],
  ['Arrow keys', 'Nudge 0.1 mm (Shift: 1 mm)'],
  ['Space + drag, or middle mouse', 'Pan the canvas'],
  ['⌘/Ctrl + scroll, + / −', 'Zoom'],
  ['0', 'Fit the hoop to the screen'],
  ['G', 'Show or hide the grid (snap and smart snap are next to the zoom controls)'],
  ['Hold ⌘/Ctrl while dragging', 'Move or resize without snapping'],
  ['1 · 2 · 3 · 4', 'Artwork · Objects · Stitches · Realistic view'],
  ['Escape', 'Cancel the current drawing / clear selection'],
];

export function HelpPage() {
  return (
    <InfoLayout title="Help" lead="Everything you need to go from artwork to a stitch file your machine can sew.">
      <section className="info-section">
        <button className="btn page" onClick={openTour}>
          <Icon name="play" small /> Take the tour
        </button>
      </section>
      <section className="info-section">
        <h2>Quick start: logo to stitch file</h2>
        <ol>
          <li>
            On <Link to="/">Your designs</Link>, choose <b>New design</b>. Pick your machine, hoop and fabric — the fabric preset sets density, underlay and
            pull compensation for you.
          </li>
          <li>
            Choose <b>Import artwork…</b> and pick an SVG. Each filled shape becomes a tatami fill, each line becomes a run stitch, and thick strokes become satin
            columns. Colors come from the SVG.
          </li>
          <li>Select an object to change its stitch type (Run, Satin, Tatami, Contour), angle, density and stitch length in the Properties panel.</li>
          <li>Drag rows in the Sequence panel to change the sewing order, or press <b>Auto-order by color</b> to reduce color changes.</li>
          <li>
            Switch to <b>Realistic</b> to preview the thread, then press <b>Simulate</b> to watch it sew.
          </li>
          <li>
            Press <b>Export</b>, pick your format (your machine's format is marked) and download. Copy the file to a USB stick and open it from your machine's USB
            menu.
          </li>
        </ol>
      </section>

      <section className="info-section">
        <h2>Tracing a photo or drawing</h2>
        <p>
          Import a PNG or JPG (Import → Image) and it opens in the tracer. Trace it into stitches, or choose <b>Use as backdrop</b> to draw over it by hand; the
          Backdrop section on the right sets its opacity, visibility and lock. Use the Pen, Fill and Satin tools to
          draw on top, then hide the backdrop. Or use <b>Trace image</b>: in Colors mode it reduces the image to the colors it really contains; in Threshold mode it makes black-and-white line art with an adjustable contrast cut-off. It traces at high resolution, then turns wide areas into fills and
          narrow ones into satin, dropping tiny specks. <b>Cross stitch</b> mode turns the image into a grid of crosses, and <b>Photo</b> mode shades it with
          rows of zigzag (in color, or mono with one thread).
        </p>
      </section>

      <section className="info-section">
        <h2>Stitch types</h2>
        <dl className="info-dl">
          <dt>Run</dt>
          <dd>A line of stitches along a path. Styles: single, triple (bean), stem, chain, candlewick, E and V (appliqué edges) and motif.</dd>
          <dt>Satin</dt>
          <dd>Smooth zigzag between two rails — best for borders and lettering 1–10 mm wide. Very wide satin is split automatically. On a filled shape, <b>Follow strokes</b> sews it as columns along its strokes (best for small lettering).</dd>
          <dt>Tatami</dt>
          <dd>Rows of staggered stitches for large areas. Drag the round knob on the canvas to set the fill angle. <b>Pattern</b> swaps the rows for radial, spiral, concentric circles, net, zigzag net, cross-hatch, lines, motifs, stipple, echo or cross stitch; <b>Random shift</b> hides the brick lines of plain rows.</dd>
          <dt>Contour</dt>
          <dd>Rows that follow the outline inward, for an organic, textured look.</dd>
          <dt>Appliqué</dt>
          <dd>Placement line, stop to place fabric, tack-down (run or zigzag), stop to trim, then a cover edge (satin, zigzag, E, V or none). <b>Cut file</b> downloads the fabric piece as a true-size SVG.</dd>
        </dl>
        <p>
          <b>Arrange</b> (right panel) flips, aligns, distributes and groups objects, copies them around a circle or in a grid, adds echo lines, and fills the
          hoop around them with a quilting background. <b>Region to line</b> (Advanced) turns a fill into one spiral run. The Design section can <b>remove hidden
          stitches</b> under later objects. Import → <b>Design library</b> adds ready-made shapes and frames.
        </p>
      </section>

      <section className="info-section">
        <h2>Lettering</h2>
        <p>
          Pick the Lettering tool (T) and click on the canvas, then type straight onto the design. Press Enter or click away when you are done; Escape
          undoes your typing. Double-click any lettering (or select it and press Enter) to edit it again.
        </p>
        <p>
          The Lettering settings in the right panel set the font, weight, height and spacing, the baseline (straight, arc, circle or spiral) and a warp.
          With the Lettering tool active, <b>Monogram</b> adds three grouped initials. Add your own font file from the font picker. The font list includes every Google Font,
          each shown in its own typeface. Search by name or filter by style. Google Fonts load when you pick them; the built-in fonts also work offline. Keep
          letters at least 5 mm tall; smaller text loses detail and shows a warning.
        </p>
      </section>

      <section className="info-section">
        <h2>Warnings</h2>
        <p>The badge in the status bar checks your design as you work:</p>
        <ul>
          <li>
            <b>Outside the hoop</b> — the machine will refuse the file. Use <b>Scale to fit</b> or choose a larger hoop.
          </li>
          <li>
            <b>Density hotspot</b> — layered stitching that can pucker the fabric. Remove overlap or lower the density.
          </li>
          <li>
            <b>Needle break risk</b> — the needle keeps hitting the same spot, or goes through many layers of stitching. Space knots apart, remove hidden
            stitches, lower the density, or use a larger sharp needle and sew slower.
          </li>
          <li>
            <b>Lace not connected</b> — on the free-standing lace fabric, parts that touch nothing else fall away when the stabilizer washes out.
          </li>
          <li>
            <b>Short stitches</b> — stitches under 1 mm that can break thread. Increase the stitch length or simplify the shape.
          </li>
          <li>
            <b>Lettering too small</b> — text under 5 mm tall.
          </li>
        </ul>
      </section>

      <section className="info-section">
        <h2>File formats</h2>
        <dl className="info-dl">
          <dt>PES</dt>
          <dd>Brother, Baby Lock</dd>
          <dt>DST</dt>
          <dd>Tajima and most commercial machines. Does not store colors — print the color sheet.</dd>
          <dt>JEF</dt>
          <dd>Janome</dd>
          <dt>EXP</dt>
          <dd>Bernina (no colors stored)</dd>
          <dt>VP3</dt>
          <dd>Husqvarna Viking, Pfaff</dd>
          <dt>XXX</dt>
          <dd>Singer</dd>
          <dt>HUS</dt>
          <dd>Older Husqvarna Viking</dd>
        </dl>
        <p>
          You can also open DST, PES, JEF and EXP files to view and recolor them. They open as stitches only, so shapes cannot be edited.
        </p>
      </section>

      <section className="info-section">
        <h2>Big designs, names and lace</h2>
        <p>
          At export, <b>Hooping</b> splits a design that is bigger than your hoop into several hoopings with alignment marks (one file each, in a zip).{' '}
          <b>Batch names</b> makes one file per name from a list. The <b>Free-standing lace</b> fabric adds a lattice underlay and warns about parts that do
          not touch the rest. Opened stitch files can be turned into editable objects with <b>Make editable</b>.
        </p>
      </section>

      <section className="info-section">
        <h2>Keyboard shortcuts</h2>
        <table className="shortcuts">
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">
                  <kbd>{k}</kbd>
                </th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="info-section">
        <h2>Where are my designs?</h2>
        <p>
          Designs are saved automatically in this browser (IndexedDB) — nothing is uploaded. Clearing site data or using a private window removes them. To back
          up or move a design, <b>Save</b> it (<kbd>⌘S</kbd>) as a <b>.xtatami</b> file. Open it again with <b>Open file</b> (<kbd>⌘O</kbd>) and carry on where you
          left off; in Chrome and Edge, later saves go straight back to the same file.
        </p>
      </section>

      <section className="info-section">
        <h2>Tips for clean sewing</h2>
        <ul>
          <li>Always test-sew on a scrap of the same fabric with the same stabilizer.</li>
          <li>Use a cut-away stabilizer on knits and a tear-away on stable wovens.</li>
          <li>Sew background fills first and details on top; the sequence list is the sewing order.</li>
          <li>Satin wider than about 8 mm snags — it is split automatically, or use a fill.</li>
        </ul>
      </section>
    </InfoLayout>
  );
}

export function AboutPage() {
  return (
    <InfoLayout title="About tatami.ninja" lead="A free, open-source embroidery digitizer that runs entirely in your browser.">
      <section className="info-section">
        <h2>What it is</h2>
        <p>
          tatami.ninja turns artwork into machine-ready stitch files (PES, DST, JEF, EXP, VP3, XXX and HUS) with nothing to install. You edit shapes and their
          properties; stitches regenerate live. Fabric presets give beginners clean results, and advanced settings are there when you need them.
        </p>
      </section>
      <section className="info-section">
        <h2>Private by design</h2>
        <p>
          Everything runs on your device. Your artwork and designs never leave your browser — there are no accounts and no uploads. The stitch engine runs in a
          background worker so the editor stays responsive.
        </p>
      </section>
      <section className="info-section">
        <h2>Open source</h2>
        <p>
          The source code lives on GitHub. Contributions, bug reports and ideas are welcome.
        </p>
        <p className="link-row">
          <a className="btn page" href={REPO_URL} target="_blank" rel="noreferrer">
            <GithubMark size={16} />
            theanam/tatami.ninja
          </a>
          <a className="btn page" href={ISSUES_URL} target="_blank" rel="noreferrer">
            <Icon name="warning" small />
            Issue tracker
          </a>
        </p>
      </section>
      <section className="info-section">
        <h2>Credits</h2>
        <ul>
          <li>Geist and Geist Mono fonts by Vercel — SIL Open Font License 1.1.</li>
          <li>Lettering fonts: Google Fonts (served by Google Fonts and Fontsource; each under its own open license). Built-in: Oswald and Pacifico (SIL Open Font License 1.1), Roboto Slab (Apache License 2.0), Geist Bold.</li>
          <li>Stitch-file writers and readers follow pyembroidery by Tatarize (MIT License).</li>
          <li>Polygon offsetting and boolean operations by Clipper (Angus Johnson, Boost Software License).</li>
          <li>opentype.js (MIT), jsPDF (MIT), React (MIT), Zustand (MIT), idb (ISC).</li>
        </ul>
      </section>
      <section className="info-section">
        <h2>Version</h2>
        <p className="mono">tatami.ninja {VERSION}</p>
      </section>
    </InfoLayout>
  );
}
