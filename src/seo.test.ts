import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');
const meta = (sel: string) => doc.querySelector(sel)?.getAttribute('content') ?? null;

/** Width and height from a PNG header. */
function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('SEO and social sharing', () => {
  it('has a title, description and canonical URL', () => {
    expect(doc.title).toMatch(/tatami\.ninja/);
    expect(meta('meta[name="description"]')!.length).toBeGreaterThan(80);
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://tatami.ninja/');
  });

  it('has Open Graph and Twitter card tags with an absolute 1200×630 image', () => {
    for (const p of ['og:title', 'og:description', 'og:url', 'og:type', 'og:site_name', 'og:image', 'og:image:alt']) {
      expect(meta(`meta[property="${p}"]`), p).toBeTruthy();
    }
    expect(meta('meta[name="twitter:card"]')).toBe('summary_large_image');
    const img = meta('meta[property="og:image"]')!;
    expect(img).toMatch(/^https:\/\/tatami\.ninja\//);
    const file = resolve(root, 'public', img.replace('https://tatami.ninja/', ''));
    expect(existsSync(file)).toBe(true);
    expect(pngSize(file)).toEqual([1200, 630]);
  });

  it('has valid structured data', () => {
    const ld = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(ld['@type']).toBe('WebApplication');
    expect(ld.url).toBe('https://tatami.ninja/');
  });

  it('ships icons, a web manifest, robots.txt and a sitemap', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'public/site.webmanifest'), 'utf8'));
    for (const icon of manifest.icons) expect(existsSync(resolve(root, 'public', icon.src)), icon.src).toBe(true);
    expect(pngSize(resolve(root, 'public/apple-touch-icon.png'))).toEqual([180, 180]);
    expect(readFileSync(resolve(root, 'public/robots.txt'), 'utf8')).toContain('Sitemap: https://tatami.ninja/sitemap.xml');
    expect(readFileSync(resolve(root, 'public/sitemap.xml'), 'utf8')).toContain('<loc>https://tatami.ninja/</loc>');
    expect(readFileSync(resolve(root, 'public/CNAME'), 'utf8').trim()).toBe('tatami.ninja');
  });

  it('keeps Google Analytics out of the source (it is added only to the Pages build)', () => {
    expect(html).not.toMatch(/googletagmanager|gtag\(/);
  });
});
