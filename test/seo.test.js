import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { jsonLd, robots, sitemap, SITE } from '../seo.js';
import { injectMeta, shareJsonLd } from '../api/_share.js';

describe('seo del build', () => {
  it('el JSON-LD es JSON valido y lista cada playlist y disco con su URL', () => {
    const data = JSON.parse(jsonLd());
    const list = data['@graph'].find((node) => node['@type'] === 'ItemList');
    expect(list.itemListElement.length).toBeGreaterThan(0);
    for (const { item } of list.itemListElement) {
      expect(item.url.startsWith(`${SITE}/?`)).toBe(true);
      expect(item.url).toMatch(/\?[pa]=[A-Za-z0-9]{22}$/);
    }
  });

  it('el sitemap tiene la portada y una URL por fuente', () => {
    const xml = sitemap('2026-01-01');
    const locs = xml.match(/<loc>/g).length;
    const items = JSON.parse(jsonLd())['@graph'].find((n) => n['@type'] === 'ItemList');
    expect(locs).toBe(items.itemListElement.length + 1);
    expect(xml).toContain(`<loc>${SITE}/</loc>`);
  });

  it('robots deja pasar las imagenes de las tarjetas y apunta al sitemap', () => {
    const text = robots();
    expect(text).toContain('Allow: /api/og');
    expect(text).toContain('Disallow: /api/');
    expect(text).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  it('robots deja fuera el panel', () => {
    expect(robots()).toContain('Disallow: /admin');
  });
});

describe('meta para rastreadores', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  it('reescribe la canonica y agrega los datos de la cancion', () => {
    const url = `${SITE}/?p=a&t=b`;
    const meta = { kind: 'track', trackTitle: 'Basquiat', artist: 'Black Hibiscus', art: {} };
    const out = injectMeta(html, {
      title: 't',
      description: 'd',
      url,
      jsonLd: shareJsonLd(meta, url),
    });
    expect(out).toContain(`<link rel="canonical" href="${SITE}/?p=a&amp;t=b"`);
    const ld = JSON.parse(
      out.match(/<script type="application\/ld\+json">(.*?)<\/script><\/head>/)[1],
    );
    expect(ld).toMatchObject({ '@type': 'MusicRecording', name: 'Basquiat', url });
  });
});
