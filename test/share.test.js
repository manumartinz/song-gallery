import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { injectMeta, isCrawler, readShareParams } from '../api/_share.js';

const ID = '7wVdbtC5ELxWO2QNWz4RN1';
const TRACK = '52p6Vadc9zlHxihhrlfhPS';

describe('readShareParams', () => {
  it('lee playlist, album y cancion de la URL de la web', () => {
    expect(readShareParams(new URLSearchParams(`p=${ID}&t=${TRACK}`))).toEqual({
      kind: 'playlist',
      id: ID,
      trackId: TRACK,
    });
    expect(readShareParams(new URLSearchParams(`a=${ID}&p=${ID}`)).kind).toBe('album');
  });

  it('descarta ids que no lo son', () => {
    expect(readShareParams(new URLSearchParams('p=nada&t=<script>'))).toEqual({
      kind: null,
      id: null,
      trackId: null,
    });
  });
});

describe('isCrawler', () => {
  it('reconoce a los que arman vistas previas y no a un navegador', () => {
    expect(isCrawler('WhatsApp/2.23.20.0 A')).toBe(true);
    expect(isCrawler('facebookexternalhit/1.1')).toBe(true);
    expect(isCrawler('Mozilla/5.0 (Twitterbot/1.0)')).toBe(true);
    expect(isCrawler('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36')).toBe(false);
    expect(isCrawler(null)).toBe(false);
  });
});

describe('injectMeta', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  it('reescribe las etiquetas que ya hay en index.html, incluidas las de varias lineas', () => {
    const out = injectMeta(html, {
      title: 'Basquiat — Black Hibiscus',
      description: 'Una canción de «lately» que recomiendo.',
      url: 'https://music.manuelmartinez.ar/?p=x&t=y',
      image: 'https://music.manuelmartinez.ar/api/og?p=x&t=y',
    });
    expect(out).toContain('<title>Basquiat — Black Hibiscus</title>');
    expect(out).toMatch(/og:title" content="Basquiat — Black Hibiscus"/);
    expect(out).toMatch(/og:description"\s+content="Una canción de «lately» que recomiendo\."/);
    expect(out).toMatch(/name="description"\s+content="Una canción de «lately» que recomiendo\."/);
    expect(out).toContain('og:image" content="https://music.manuelmartinez.ar/api/og?p=x&amp;t=y"');
  });

  it('escapa lo que viene de Spotify', () => {
    const out = injectMeta(html, { title: 'A "b" <c>', description: 'd' });
    expect(out).toContain('<title>A &quot;b&quot; &lt;c&gt;</title>');
  });
});
