import { importSvg } from '../importers/svg';
import { layoutText, loadSpecFont, makeTextObject } from '../importers/lettering';
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
  const font = await loadSpecFont(spec);
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
    case 'club-badge': {
      let p = createProject({ name: 'Club badge', machine: 'brother', hoop: HOOPS[0], fabric: 'cotton-twill' });
      const navy = ensureThread(p.threads, '#24357A', 'Navy');
      const gold = ensureThread(navy.threads, '#D4A43A', 'Gold');
      const star: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 60 : 150;
        star.push([Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)]);
      }
      p = {
        ...p,
        threads: gold.threads,
        objects: [
          obj({ name: 'Badge fill', type: 'tatami', thread: navy.id, geometry: { kind: 'circle', cx: 0, cy: 0, r: 385 }, params: { angleDeg: 45 } }),
          obj({ name: 'Star', type: 'tatami', thread: gold.id, geometry: { kind: 'polygon', points: star }, params: { angleDeg: -30 } }),
          obj({
            name: 'Satin ring',
            type: 'satin',
            thread: gold.id,
            geometry: { kind: 'satin', railA: { kind: 'circle', cx: 0, cy: 0, r: 380 }, railB: { kind: 'circle', cx: 0, cy: 0, r: 430 }, rungs: 'auto' },
            params: { shortStitches: true, splitAbove: 80 },
          }),
        ],
      };
      p = await addText(p, { content: 'YOUR CLUB', font: 'oswald', height: 70, spacing: 8, arc: 285, x: 0, y: -285 }, '#D4A43A', 'Gold');
      return addText(p, { content: 'EST. 2026', font: 'geist', height: 70, spacing: 10, arc: -335, x: 0, y: 335 }, '#D4A43A', 'Gold');
    }
    case 'monogram': {
      let p = createProject({ name: 'Monogram', machine: 'brother', hoop: HOOPS[0], fabric: 'cotton' });
      const ink = ensureThread(p.threads, '#1F3B5C', 'Navy');
      p = {
        ...p,
        threads: ink.threads,
        objects: [
          obj({
            name: 'Ring',
            type: 'satin',
            thread: ink.id,
            geometry: { kind: 'satin', railA: { kind: 'circle', cx: 0, cy: 0, r: 360 }, railB: { kind: 'circle', cx: 0, cy: 0, r: 400 }, rungs: 'auto' },
            params: { shortStitches: true, splitAbove: 80 },
          }),
        ],
      };
      return addText(p, { content: 'A', font: 'roboto-slab', height: 380, spacing: 0, arc: 0, x: 0, y: 190 }, '#1F3B5C', 'Navy');
    }
    case 'heart': {
      const p = createProject({ name: 'Heart', machine: 'brother', hoop: HOOPS[0], fabric: 'cotton-twill' });
      return fromSvg(
        p,
        `<svg xmlns="http://www.w3.org/2000/svg" width="70mm" height="62mm" viewBox="0 0 70 62">
          <path id="heart" d="M35 60C18 47 3 35 3 19 3 9 11 2 20 2c7 0 12 4 15 9 3-5 8-9 15-9 9 0 17 7 17 17 0 16-15 28-32 41z" fill="#C8282E"/>
          <path id="heart-edge" d="M35 60C18 47 3 35 3 19 3 9 11 2 20 2c7 0 12 4 15 9 3-5 8-9 15-9 9 0 17 7 17 17 0 16-15 28-32 41z" fill="none" stroke="#7A1420" stroke-width="2.4"/></svg>`,
      );
    }
    case 'mountain-patch': {
      const p = createProject({ name: 'Mountain patch', machine: 'brother', hoop: HOOPS[0], fabric: 'cotton-twill' });
      return fromSvg(
        p,
        `<svg xmlns="http://www.w3.org/2000/svg" width="86mm" height="86mm" viewBox="0 0 86 86">
          <circle id="sky" cx="43" cy="43" r="38" fill="#8EC5E8"/>
          <path id="mountains" d="M12 61 33 30 42 43 50 33 74 61Q62 76 43 81 24 76 12 61Z" fill="#6B7280"/>
          <path id="snow" d="M33 30 28.5 37 33 35.5 37.5 37.5Z" fill="#F7F7F5"/>
          <circle id="border" cx="43" cy="43" r="40" fill="none" stroke="#F2EFE6" stroke-width="4.5"/></svg>`,
      );
    }
    case 'leaf': {
      const p = createProject({ name: 'Leaf', machine: 'brother', hoop: HOOPS[0], fabric: 'cotton' });
      return fromSvg(
        p,
        `<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="62mm" viewBox="0 0 80 62">
          <path id="leaf" d="M4 58C9 22 44 6 76 4 74 32 52 58 4 58Z" fill="#3E8E4F"/>
          <path id="vein" d="M8 54C28 38 48 24 72 8" fill="none" stroke="#CFE8C8" stroke-width=".6"/></svg>`,
      );
    }
    case 'rose-line': {
      const p = createProject({ name: 'Rose line art', machine: 'brother', hoop: HOOPS[0], fabric: 'cotton' });
      const proj = fromSvg(
        p,
        `<svg xmlns="http://www.w3.org/2000/svg" width="44mm" height="80mm" viewBox="0 0 44 80">
          <g fill="none" stroke="#C2185B" stroke-width=".5">
            <circle id="petal-1" cx="22" cy="18" r="4"/><circle id="petal-2" cx="22" cy="18" r="8"/>
            <circle id="petal-3" cx="22" cy="18" r="12"/><circle id="petal-4" cx="22" cy="18" r="16"/>
          </g>
          <g fill="none" stroke="#2E7D32" stroke-width=".5">
            <path id="stem" d="M22 34V78"/>
            <path id="leaf-left" d="M22 52C15 46 7 47 3 52 8 56 15 56 22 52"/>
            <path id="leaf-right" d="M22 62C29 56 37 57 41 62 36 66 29 66 22 62"/>
          </g></svg>`,
      );
      // Bold bean stitch reads better than a single run for line art.
      return { ...proj, objects: proj.objects.map((o) => (o.type === 'run' ? { ...o, params: { ...o.params, repeats: 3 } } : o)) };
    }
    case 'paw-print': {
      const p = createProject({ name: 'Paw print', machine: 'brother', hoop: HOOPS[0], fabric: 'fleece' });
      return fromSvg(
        p,
        `<svg xmlns="http://www.w3.org/2000/svg" width="72mm" height="70mm" viewBox="0 0 72 70">
          <g fill="#5B3A29">
            <ellipse id="toe-1" cx="12" cy="26" rx="8" ry="10"/><ellipse id="toe-2" cx="26" cy="11" rx="8" ry="10"/>
            <ellipse id="toe-3" cx="46" cy="11" rx="8" ry="10"/><ellipse id="toe-4" cx="60" cy="26" rx="8" ry="10"/>
            <path id="pad" d="M36 32C47 32 58 45 58 56 58 64 51 68 44 66 40 65 38 63 36 63 34 63 32 65 28 66 21 68 14 64 14 56 14 45 25 32 36 32Z"/>
          </g></svg>`,
      );
    }
    case 'hex-patch': {
      let p = createProject({ name: 'Hexagon patch', machine: 'brother', hoop: medium, fabric: 'canvas' });
      p = fromSvg(
        p,
        `<svg xmlns="http://www.w3.org/2000/svg" width="96mm" height="84mm" viewBox="0 0 96 84">
          <path id="hexagon" d="M24 2H72L94 42 72 82H24L2 42Z" fill="#1F6F6B"/>
          <path id="hex-border" d="M24 2H72L94 42 72 82H24L2 42Z" fill="none" stroke="#F2D23C" stroke-width="3.2"/></svg>`,
      );
      return addText(p, { content: 'ADVENTURE', font: 'oswald', height: 110, spacing: 6, arc: 0, x: 0, y: 55 }, '#F2D23C', 'Yellow');
    }
    case 'cap-front': {
      const hoop = HOOPS.find((h) => h.id === 'cap-130x60')!;
      let p = createProject({ name: 'Cap front', machine: 'brother', hoop, fabric: 'cap-structured' });
      const white = ensureThread(p.threads, '#F4F4F0', 'White');
      p = {
        ...p,
        threads: white.threads,
        objects: [
          obj({
            name: 'Underline',
            type: 'satin',
            thread: white.id,
            geometry: { kind: 'polyline', points: [[-330, 175], [0, 195], [330, 175]] },
            params: { width: 30, shortStitches: true, splitAbove: 80 },
          }),
        ],
      };
      return addText(p, { content: 'TEAM', font: 'oswald', height: 250, spacing: 20, arc: 0, x: 0, y: 115 }, '#F4F4F0', 'White');
    }
    case 'wide-cap': {
      const hoop = HOOPS.find((h) => h.id === 'cap-360x70')!;
      const p = createProject({ name: 'Wide cap', machine: 'commercial', hoop, fabric: 'cap-unstructured' });
      return addText(p, { content: 'BRAND NAME', font: 'geist', height: 220, spacing: 15, arc: 0, x: 0, y: 110 }, '#1E2430', 'Black');
    }
  }
}
