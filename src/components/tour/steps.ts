export interface TourStep {
  id: string;
  /** Small label above the title. */
  kicker: string;
  title: string;
  body: string;
  /** Feature chips. */
  chips: string[];
  /** Screenshot in /tour (null = the closing card). */
  image: string | null;
  alt: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    kicker: 'Welcome',
    title: 'Embroidery digitizing, right in your browser',
    body: 'tatami.ninja turns artwork into machine embroidery files. It is free and open source, and nothing is uploaded: your designs stay on this device.',
    chips: ['Free & open source', 'No account', 'Works offline', 'Autosaves'],
    image: 'welcome.jpg',
    alt: 'A badge design shown as realistic thread on fabric',
  },
  {
    id: 'artwork',
    kicker: 'Bring your artwork',
    title: 'From logo to stitches in one step',
    body: 'Import an SVG and every shape becomes stitches in its own colors. Drop in a PNG or JPG to trace it, or keep it as a backdrop and draw over it.',
    chips: ['SVG import', 'Image tracing', 'Backdrop', 'Design library', 'Templates'],
    image: 'artwork.jpg',
    alt: 'The editor with an imported design, the tool rail and the sequence list',
  },
  {
    id: 'trace',
    kicker: 'Pictures',
    title: 'Trace images four ways',
    body: 'Colors mode keeps only colors that really occur in the picture. Threshold makes clean line art. Cross stitch puts the picture on a grid of crosses, and Photo shades it with layered thread.',
    chips: ['Colors', 'Threshold', 'Cross stitch', 'Photo stitch'],
    image: 'trace.jpg',
    alt: 'The trace dialog turning a photo into shaded photo stitch',
  },
  {
    id: 'stitches',
    kicker: 'Stitch types',
    title: 'Fills, outlines and patterns',
    body: 'Switch any shape between run, satin, tatami, contour and appliqué. Fills come as radial, spiral, motifs, stipple, echo or cross stitch; outlines as stem, chain, candlewick or E/V.',
    chips: ['12 fill patterns', '10 motifs', 'Decorative outlines', 'Appliqué with cut file'],
    image: 'stitches.jpg',
    alt: 'Six squares filled with different patterns: radial, spiral, motif, stipple, cross stitch and net',
  },
  {
    id: 'lettering',
    kicker: 'Lettering',
    title: 'Type on the canvas in any font',
    body: 'Every Google Font, each previewed in its own face, plus your own font files. Set text on an arc, a circle or a spiral, warp it, or build a monogram. Small text can follow its strokes as satin.',
    chips: ['1,500+ Google Fonts', 'Your fonts', 'Circle & spiral', 'Warp', 'Monograms'],
    image: 'lettering.jpg',
    alt: 'Lettering set around a circle with a monogram in the middle',
  },
  {
    id: 'arrange',
    kicker: 'Arrange & quilt',
    title: 'Lay out, repeat and quilt',
    body: 'Flip, align, distribute and group. Copy around a circle or in a grid. Add echo lines, or fill the hoop around your design with stipple quilting.',
    chips: ['Align & distribute', 'Circle & grid copies', 'Echo quilting', 'Stipple backgrounds'],
    image: 'arrange.jpg',
    alt: 'A badge with echo lines and a stipple background filling the hoop',
  },
  {
    id: 'preview',
    kicker: 'Before you sew',
    title: 'See every stitch first',
    body: 'Preview real thread on your fabric and watch the machine sew it, color by color. Warnings flag designs outside the hoop, dense spots, gaps, short stitches and needle-break risk.',
    chips: ['Realistic preview', 'Stitch simulator', 'Warnings with fixes', 'Remove hidden stitches'],
    image: 'preview.jpg',
    alt: 'The stitch simulator part way through sewing a design',
  },
  {
    id: 'export',
    kicker: 'Export',
    title: 'Ready for your machine',
    body: 'Download PES, DST, JEF, EXP, VP3, XXX or HUS with a printable color sheet. Split big designs across hoopings, make one file per name, and save .xtatami files to keep editing later.',
    chips: ['7 machine formats', 'Hooping split', 'Batch names', '.xtatami files'],
    image: 'export.jpg',
    alt: 'The export dialog with file formats and the thread order',
  },
  {
    id: 'ready',
    kicker: "You're set",
    title: 'Start stitching',
    body: 'Open the sample to look around, or start a new design. You can replay this tour any time from Help.',
    chips: [],
    image: null,
    alt: '',
  },
];
