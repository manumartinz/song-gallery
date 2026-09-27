import { describe, expect, it } from 'vitest';
import { parseAlbumRef, parsePlaylistRef } from '../src/lib/api.js';
import { pickArt, yearOf } from '../api/_normalize.js';

const ID = '7wVdbtC5ELxWO2QNWz4RN1';

describe('parsePlaylistRef / parseAlbumRef', () => {
  it('acepta URL, URI e id pelado', () => {
    expect(parsePlaylistRef(`https://open.spotify.com/playlist/${ID}?si=abc`)).toBe(ID);
    expect(parsePlaylistRef(`spotify:playlist:${ID}`)).toBe(ID);
    expect(parsePlaylistRef(`  ${ID} `)).toBe(ID);
    expect(parseAlbumRef(`https://open.spotify.com/intl-es/album/${ID}`)).toBe(ID);
  });

  it('no confunde un album con una playlist', () => {
    expect(parsePlaylistRef(`https://open.spotify.com/album/${ID}`)).toBeNull();
    expect(parseAlbumRef(`https://open.spotify.com/playlist/${ID}`)).toBeNull();
  });

  it('rechaza lo que no es un link', () => {
    expect(parsePlaylistRef('')).toBeNull();
    expect(parsePlaylistRef(null)).toBeNull();
    expect(parsePlaylistRef('https://example.com')).toBeNull();
  });
});

describe('pickArt / yearOf', () => {
  it('reparte los tres tamaños de Spotify', () => {
    expect(pickArt([{ url: 'lg' }, { url: 'md' }, { url: 'sm' }])).toEqual({
      lg: 'lg',
      md: 'md',
      sm: 'sm',
    });
  });

  it('con menos de tres, la mediana cae a la grande', () => {
    expect(pickArt([{ url: 'lg' }, { url: 'sm' }])).toEqual({ lg: 'lg', md: 'lg', sm: 'sm' });
    expect(pickArt(null)).toEqual({ lg: null, md: null, sm: null });
  });

  it('saca el año de fechas completas y de años sueltos', () => {
    expect(yearOf('2019-04-05')).toBe(2019);
    expect(yearOf('1975')).toBe(1975);
    expect(yearOf(null)).toBeNull();
  });
});
