import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { expect, type Page } from '@playwright/test';
import { generatePlan } from '../../src/engine/plan';
import { encodeFormat } from '../../src/export/export';
import type { FileFormat, Project } from '../../src/model/types';

export const sampleProject = JSON.parse(
  readFileSync(new URL('../../src/model/harbor-club-badge.tatami.json', import.meta.url), 'utf8'),
) as Project;

/** Open the sample badge from the empty home page. */
export async function openSample(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open the sample design' }).click();
  await page.waitForURL(/#\/design\//);
  await expect(page.locator('.statusbar')).toContainText(/[1-9][\d,]* stitches/);
}

/** Pick a file through the app's file chooser. */
export async function chooseFile(page: Page, trigger: () => Promise<void>, file: { name: string; mimeType: string; buffer: Buffer }) {
  const chooser = page.waitForEvent('filechooser');
  await trigger();
  await (await chooser).setFiles(file);
}

export function stitchFile(format: FileFormat): Buffer {
  return Buffer.from(encodeFormat(format, sampleProject, generatePlan(sampleProject)));
}

export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle id="badge" cx="50" cy="50" r="40" fill="#24357A"/>
  <path id="stripe" d="M20 50 H80" stroke="#D4A43A" stroke-width="1" fill="none"/>
</svg>`;

/** Minimal PNG encoder for test images (RGB, or RGBA when the pixel function returns 4 values). */
export function makePng(width: number, height: number, pixel: (x: number, y: number) => [number, number, number] | [number, number, number, number]): Buffer {
  const rgba = pixel(0, 0).length === 4;
  const bpp = rgba ? 4 : 3;
  const raw = Buffer.alloc((width * bpp + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * bpp + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const px = pixel(x, y);
      const o = y * (width * bpp + 1) + 1 + x * bpp;
      for (let c = 0; c < bpp; c++) raw[o + c] = px[c] ?? 255;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = rgba ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Serve Google Font requests locally so lettering tests do not depend on the network:
 * Fontsource WOFF files get a bundled font, css2 previews get an empty stylesheet.
 */
export async function mockFontNetwork(page: Page) {
  const font = readFileSync(new URL('../../public/lettering/oswald.ttf', import.meta.url));
  await page.route('https://cdn.jsdelivr.net/fontsource/**', (route) => route.fulfill({ body: font, contentType: 'font/ttf' }));
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '', contentType: 'text/css' }));
}
