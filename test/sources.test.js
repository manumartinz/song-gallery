import { describe, expect, it } from 'vitest';
import {
  MAX_CUSTOM,
  mergePreviews,
  readInitialSource,
  toAlbumEntries,
  toCustomEntries,
  toEntries,
} from '../src/lib/sources.js';

const A = 'a'.repeat(22);
const B = 'b'.repeat(22);
const C = 'c'.repeat(22);

describe('mergePreviews', () => {
  const playlist = {
    id: 'p',
    tracks: [{ id: 't1' }, { id: 't2', previewUrl: 'ya' }, { id: 't3' }],
  };

  it('cruza por id y no por posicion', () => {
    const merged = mergePreviews(playlist, [
      { id: 't3', previewUrl: 'u3', previewSource: 'deezer' },
      { id: 't1', previewUrl: null, previewSource: null },
    ]);
    expect(merged.tracks[0].previewUrl).toBeNull();
    expect(merged.tracks[2]).toMatchObject({ previewUrl: 'u3', previewSource: 'deezer' });
  });

  it('no pisa lo que ya estaba resuelto', () => {
    const merged = mergePreviews(playlist, [{ id: 't2', previewUrl: 'otro' }]);
    expect(merged.tracks[1].previewUrl).toBe('ya');
  });

  it('devuelve el mismo objeto si nada cambia', () => {
    expect(mergePreviews(playlist, [])).toBe(playlist);
    expect(mergePreviews(playlist, [{ id: 'nadie', previewUrl: 'x' }])).toBe(playlist);
  });
});

describe('toEntries / toCustomEntries / toAlbumEntries', () => {
  it('descarta links invalidos y conserva el orden', () => {
    const entries = toEntries([
      { label: 'uno', ref: `https://open.spotify.com/playlist/${A}` },
      { label: 'roto', ref: 'https://example.com' },
      { ref: `spotify:playlist:${B}`, sort: 'added' },
    ]);
    expect(entries.map((e) => e.id)).toEqual([A, B]);
    expect(entries[1]).toMatchObject({ label: 'Playlist', sort: 'added' });
  });

  it('trata la etiqueta vieja "Pegada" como sin nombre', () => {
    const [entry] = toCustomEntries([{ ref: A, label: 'Pegada' }]);
    expect(entry).toEqual({ id: A, label: null, ref: A, custom: true });
  });

  it('recorta las pegadas al tope al leer', () => {
    const many = Array.from({ length: MAX_CUSTOM + 3 }, (_, i) => ({
      ref: String(i).padStart(22, 'x'),
    }));
    expect(toCustomEntries(many)).toHaveLength(MAX_CUSTOM);
    expect(toCustomEntries('basura')).toEqual([]);
  });

  it('empareja cada album con su rotulo aunque haya links rotos en medio', () => {
    const albums = toAlbumEntries([
      { label: 'Uno', ref: `https://open.spotify.com/album/${A}` },
      { label: 'Roto', ref: 'nada' },
      { label: 'Dos', ref: `https://open.spotify.com/intl-es/album/${B}` },
    ]);
    expect(albums).toEqual([
      { id: A, label: 'Uno' },
      { id: B, label: 'Dos' },
    ]);
  });
});

describe('readInitialSource', () => {
  const config = {
    playlists: [{ id: A }],
    custom: [{ id: B }],
    albums: [{ id: C }],
  };

  it('?a= gana a ?p=', () => {
    expect(readInitialSource(`?p=${A}&a=${C}`, config)).toEqual({ kind: 'album', id: C });
  });

  it('?p= abre esa playlist aunque no este en la config', () => {
    expect(readInitialSource(`?p=${B}`, config)).toEqual({ kind: 'playlist', id: B });
  });

  it('sin parametros abre la primera playlist', () => {
    expect(readInitialSource('', config)).toEqual({ kind: 'playlist', id: A });
  });

  it('sin playlists abre el primer album', () => {
    expect(readInitialSource('', { playlists: [], custom: [], albums: [{ id: C }] })).toEqual({
      kind: 'album',
      id: C,
    });
  });
});
