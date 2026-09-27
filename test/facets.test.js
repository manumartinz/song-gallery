import { describe, expect, it } from 'vitest';
import { decadeLabel, facetOptions, makeFacetFilter, NO_FACETS } from '../src/lib/facets.js';

const t = (id, genre, year) => ({ id, genre, year });

describe('facetOptions', () => {
  it('ofrece generos y decadas con al menos dos canciones, los generos por frecuencia', () => {
    const { genres, decades } = facetOptions([
      t('1', 'rap', 2021),
      t('2', 'rap', 2022),
      t('3', 'rap', 1995),
      t('4', 'indie', 1998),
      t('5', 'indie', 2015),
      t('6', 'jazz', 2016),
    ]);
    expect(genres.map((g) => g.value)).toEqual(['rap', 'indie']);
    expect(genres[0].label).toBe('Rap');
    expect(decades.map((d) => d.value)).toEqual([1990, 2010, 2020]);
  });

  it('no ofrece una dimension con una sola opcion', () => {
    const { genres, decades } = facetOptions([t('1', 'rap', 2021), t('2', 'rap', 2022)]);
    expect(genres).toEqual([]);
    expect(decades).toEqual([]);
  });
});

describe('decadeLabel', () => {
  it('dice las decadas como se dicen', () => {
    expect(decadeLabel(1990)).toBe('Años 90');
    expect(decadeLabel(2010)).toBe('Años 2010');
  });
});

describe('makeFacetFilter', () => {
  it('sin filtros devuelve null', () => {
    expect(makeFacetFilter(NO_FACETS, new Set())).toBeNull();
  });

  it('combina genero, decada y sin escuchar', () => {
    const filter = makeFacetFilter({ genre: 'rap', decade: 2020, unheard: true }, new Set(['2']));
    expect(filter(t('1', 'rap', 2021))).toBe(true);
    expect(filter(t('2', 'rap', 2022))).toBe(false); // ya escuchada
    expect(filter(t('3', 'rap', 1995))).toBe(false);
    expect(filter(t('4', 'indie', 2021))).toBe(false);
  });

  it('la decada 0 no existe pero la de 2000 si', () => {
    const filter = makeFacetFilter({ ...NO_FACETS, decade: 2000 }, null);
    expect(filter(t('1', null, 2004))).toBe(true);
    expect(filter(t('2', null, null))).toBe(false);
  });
});
