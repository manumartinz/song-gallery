import { afterEach, describe, expect, it } from 'vitest';
import {
  catalogText,
  checkPicks,
  cleanQuery,
  LIMITS,
  mergeCatalog,
  newMoodId,
  parseMoodId,
  queryKey,
} from '../api/_mood.js';
import handler from '../api/mood.js';
import { cleanMoodQuery, parseMoodRef, readInitialSource } from '../src/lib/sources.js';

const A = 'a'.repeat(22);
const B = 'b'.repeat(22);
const C = 'c'.repeat(22);

const catalog = [
  { id: A, title: 'Uno', artist: 'X', genre: 'indie', year: 2019 },
  { id: B, title: 'Dos | tres', artist: 'Y', genre: null, year: null },
];

describe('cleanQuery', () => {
  it('limpia espacios y corta lo largo', () => {
    expect(cleanQuery('  para   manejar\nde noche ')).toBe('para manejar de noche');
    expect(cleanQuery('musica lenta '.repeat(20))).toHaveLength(LIMITS.q);
  });

  it('rechaza lo muy corto, links y teclado aporreado', () => {
    expect(cleanQuery('ok')).toBeNull();
    expect(cleanQuery(null)).toBeNull();
    expect(cleanQuery('mirá https://spam.com')).toBeNull();
    expect(cleanQuery('aaaaaaaaaaaaaaa')).toBeNull();
  });

  it('saca los < > para que no viaje HTML', () => {
    expect(cleanQuery('<b>algo triste</b>')).toBe('balgo triste/b');
  });
});

describe('queryKey', () => {
  it('la misma frase escrita distinto da la misma clave', () => {
    expect(queryKey('Para CORRER!')).toBe(queryKey('para correr'));
    expect(queryKey('canción rápida')).toBe(queryKey('cancion rapida'));
    expect(queryKey('domingo lluvioso')).toBe('domingo lluvioso');
  });
});

describe('ids de selección', () => {
  it('se generan distintos y con la forma que acepta la URL', () => {
    const ids = new Set(Array.from({ length: 50 }, newMoodId));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(parseMoodId(id)).toBe(id);
      expect(parseMoodRef(id)).toBe(id);
    }
  });

  it('una frase o basura no es un id', () => {
    expect(parseMoodId('para correr')).toBeNull();
    expect(parseMoodId('ABCDEFGHIJ')).toBeNull();
    expect(parseMoodId(null)).toBeNull();
  });
});

describe('catálogo', () => {
  it('una línea por canción, con su id y sin pipes que rompan las columnas', () => {
    expect(catalogText(catalog)).toBe(`${A} | Uno | X | indie | 2019\n${B} | Dos / tres | Y | - | -`);
  });

  it('sin ids, para cuando es solo el gusto de fondo', () => {
    expect(catalogText(catalog, { ids: false })).toBe('Uno | X | indie | 2019\nDos / tres | Y | - | -');
  });

  it('junta varias playlists sin repetir canciones', () => {
    const merged = mergeCatalog([[catalog[0], catalog[1]], [catalog[0], { id: C }]]);
    expect(merged.map((entry) => entry.id)).toEqual([A, B, C]);
  });
});

describe('checkPicks', () => {
  it('descarta ids inventados y repetidos, y recorta el porqué', () => {
    const result = checkPicks(
      {
        intro: 'Para la ruta.',
        picks: [
          { id: A, why: 'Bajo que empuja.' },
          { id: C, why: 'No existe en el catálogo.' },
          { id: A, why: 'Repetida.' },
          { id: B, why: 'x'.repeat(300) },
        ],
      },
      catalog,
    );
    expect(result.intro).toBe('Para la ruta.');
    expect(result.picks.map((pick) => pick.id)).toEqual([A, B]);
    expect(result.picks[1].why).toHaveLength(LIMITS.why);
  });

  it('sin nada válido devuelve null', () => {
    expect(checkPicks({ picks: [{ id: C }] }, catalog)).toBeNull();
    expect(checkPicks(null, catalog)).toBeNull();
    expect(checkPicks({ picks: 'no' }, catalog)).toBeNull();
  });

  it('no pasa del máximo de canciones', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: String(i).padStart(22, '0') }));
    expect(checkPicks({ picks: many }, many).picks).toHaveLength(LIMITS.picks);
  });
});

describe('la frase y ?mood= en la URL', () => {
  const config = { playlists: [{ id: A }], custom: [], albums: [] };
  const ID = 'abc123xyz9';

  it('la frase llega entera, con sus eses', () => {
    expect(cleanMoodQuery('  domingo   lluvioso ')).toBe('domingo lluvioso');
    expect(cleanMoodQuery('a')).toBeNull();
  });

  it('?mood= abre la selección por su id', () => {
    expect(readInitialSource(`?mood=${ID}`, config)).toEqual({ kind: 'mood', id: ID });
  });

  it('una frase en ?mood= no es una selección: cae en la primera playlist', () => {
    expect(readInitialSource('?mood=para%20correr', config)).toEqual({ kind: 'playlist', id: A });
  });

  it('una playlist gana a la selección', () => {
    expect(readInitialSource(`?mood=${ID}&p=${B}`, config)).toEqual({ kind: 'playlist', id: B });
  });
});

describe('/api/mood sin configurar', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  function fakeRes() {
    const res = { statusCode: 200, headers: {}, body: undefined, ended: false };
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body) => {
      res.body = body;
      return res;
    };
    res.end = () => {
      res.ended = true;
      return res;
    };
    res.setHeader = (key, value) => {
      res.headers[key] = value;
    };
    return res;
  }

  it('sin key de la IA responde 204 y la web no enseña el campo', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = fakeRes();
    await handler({ method: 'GET', query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(204);
  });

  it('sin key, pedir una selección da 404 en vez de llamar a nadie', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = fakeRes();
    await handler({ method: 'POST', query: {}, headers: {}, body: { q: 'para correr' } }, res);
    expect(res.statusCode).toBe(404);
  });
});
