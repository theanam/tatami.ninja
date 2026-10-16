import { importSvg } from '../importers/svg';
import { layoutText, loadFont, makeTextObject } from '../importers/lettering';
import { HOOPS } from '../presets';
import { createProject, ensureThread, newId } from './project';
import type { Project, StitchObject, TextSpec } from './types';

import type { TemplateInfo } from './templateInfo';
export { TEMPLATES, type TemplateInfo } from './templateInfo';

const ADV = { underlay: 'inherit' as const, pullComp: 'inherit' as const, tieIn: true, tieOff: true, trimBefore: false, trimAfter: true };

function obj(partial: Partial<StitchObject> & Pick<StitchObject, 'name' | 'type' | 'thread' | 'geometry'>): StitchObject {
  return { id: newId('o'), visible: true, locked: false, params: {}, advanced: { ...ADV }, ...partial };
}

async function addText(p: Project, spec: TextSpec, hex: string, name: string): Promise<Project> {
  const res = ensureThread(p.threads, hex, name);
  const font = await loadFont(spec.font);
  return { ...p, threads: res.threads, objects: [...p.objects, makeTextObject(spec, layoutText(font, spec), res.id)] };
}

function fromSvg(p: Project, svg: string): Project {
  const res = importSvg(svg, { hoop: p.hoop, threads: p.threads });
  return { ...p, threads: res.threads, objects: [...p.objects, ...res.objects] };
}

/** Build a new project from a template. Lettering templates load fonts. */
export async function createFromTemplate(id: TemplateInfo['id']): Promise<Project> {
  const medium = HOOPS[1];
  switch (id) {
    case 'round-patch': {
      let p = createProject({ name: 'Round patch', machine: 'brother', hoop: HOOPS[0], fabric: 'cotton-twill' });
      const navy = ensureThread(p.threads, '#3D56B8', 'Royal blue');
      const gold = ensureThread(navy.threads, '#D4A43A', 'Gold');
      p = {
        ...p,
        threads: gold.threads,
        objects: [
          obj({ name: 'Patch fill', type: 'tatami', thread: navy.id, geometry: { kind: 'circle', cx: 0, cy: 0, r: 395 }, params: { angleDeg: 45 } }),
          obj({
            name: 'Satin edge',
            type: 'satin',
            thread: gold.id,
            geometry: { kind: 'satin', railA: { kind: 'circle', cx: 0, cy: 0, r: 390 }, railB: { kind: 'circle', cx: 0, cy: 0, r: 440 }, rungs: 'auto' },
            params: { shortStitches: true, splitAbove: 80 },
          }),
        ],
      };
      return p;
    }
    case 'left-chest': {
      let p = createProject({ name: 'Left-chest logo', machine: 'brother', hoop: medium, fabric: 'cotton-twill' });
      p = fromSvg(
        p,
        `<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="40mm" viewBox="0 0 90 40"><rect id="logo-background" width="90" height="40" rx="6" fill="#E07A5F"/></svg>`,
      );
      return addText(p, { content: 'YOUR LOGO', font: 'oswald', height: 140, spacing: 10, arc: 0, x: 0, y: 70 }, '#FFFFFF', 'White');
    }
    case 'name-tape': {
      let p = createProject({ name: 'Name tape', machine: 'brother', hoop: medium, fabric: 'cotton-twill' });
      p = fromSvg(
        p,
        `<svg xmlns="http://www.w3.org/2000/svg" width="110mm" height="34mm" viewBox="0 0 110 34">
          <rect id="tape" width="110" height="34" rx="17" fill="#2F7D5B"/>
          <rect id="tape-border" x="1.5" y="1.5" width="107" height="31" rx="15.5" fill="none" stroke="#F2EFE6" stroke-width="3"/></svg>`,
      );
      return addText(p, { content: 'Your Name', font: 'geist', height: 120, spacing: 4, arc: 0, x: 0, y: 60 }, '#F2EFE6', 'Ivory');
    }
    case 'shield-crest': {
      let p = createProject({ name: 'Shield crest', machine: 'brother', hoop: medium, fabric: 'cotton-twill' });
      p = fromSvg(
        p,
        `<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="94mm" viewBox="0 0 44 50">
          <path id="shield" d="M22 2L42 9V25C42 36 33 44 22 48 11 44 2 36 2 25V9Z" fill="#B3262E"/>
          <path id="chevron" d="M10 30L22 20 34 30" fill="none" stroke="#F2EFE6" stroke-width="4"/>
          <path id="shield-border" d="M22 2L42 9V25C42 36 33 44 22 48 11 44 2 36 2 25V9Z" fill="none" stroke="#F2EFE6" stroke-width="2.4"/></svg>`,
      );
      return p;
    }
  }
}
