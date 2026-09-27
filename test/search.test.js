import { describe, expect, it } from 'vitest';
import { makeFilter, SORTS } from '../src/lib/search.js';

const track = (fields) => ({ title: '', artistLine: '', ...fields });

describe('makeFilter', () => {
  it('devuelve null sin nada que filtrar', () => {
    expect(makeFilter('')).toBeNull();
    expect(makeFilter('  !? ')).toBeNull();
  });

  it('exige todos los terminos, sin acentos ni mayusculas', () => {
    const filter = makeFilter('DAFT 2013');
    expect(filter(track({ artistLine: 'Daft Punk', year: 2013 }))).toBe(true);
    expect(filter(track({ artistLine: 'Daft Punk', year: 2001 }))).toBe(false);
    expect(makeFilter('cancion')(track({ title: 'Canción' }))).toBe(true);
  });

  it('busca tambien en album y genero', () => {
    const t = track({ album: 'Currents', genre: 'psychedelic rock' });
    expect(makeFilter('psych')(t)).toBe(true);
    expect(makeFilter('currents')(t)).toBe(true);
  });
});

describe('SORTS', () => {
  it('añadidas manda las fechas invalidas al principio en bloque', () => {
    const list = [{ addedAt: '2024-01-02' }, { addedAt: null }, { addedAt: '2023-05-01' }];
    const sorted = [...list].sort(SORTS.added.compare);
    expect(sorted.map((t) => t.addedAt)).toEqual([null, '2023-05-01', '2024-01-02']);
  });

  it('artista ordena sin tener en cuenta acentos', () => {
    const list = [{ artistLine: 'Zoe' }, { artistLine: 'Álvaro' }, { artistLine: 'bad' }];
    const sorted = [...list].sort(SORTS.artist.compare);
    expect(sorted.map((t) => t.artistLine)).toEqual(['Álvaro', 'bad', 'Zoe']);
  });
});
