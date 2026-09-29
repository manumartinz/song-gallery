import { afterEach, describe, expect, it } from 'vitest';
import { bestMatch, checkCandidates, SIMILAR, songKey } from '../api/_similar.js';
import { LIMITS } from '../api/_mood.js';
import handler from '../api/similar.js';

const A = 'a'.repeat(22);
const B = 'b'.repeat(22);

const catalog = [{ id: A, title: 'Uno', artist: 'X', genre: 'indie', year: 2019 }];

describe('checkCandidates', () => {
  it('descarta lo que ya está en mis playlists, lo repetido y lo incompleto', () => {
    const result = checkCandidates(
      {
        picks: [
          { title: 'UNO', artist: 'X feat. Z', why: 'Ya la tengo.' },
          { title: 'Opus', artist: 'Eric Prydz', why: 'Larga y hipnótica.' },
          { title: 'opus', artist: 'eric prydz', why: 'Repetida.' },
          { title: '', artist: 'Nadie', why: 'Sin título.' },
          { title: 'Cuatro', artist: 'W', why: 'x'.repeat(300) },
        ],
      },
      catalog,
    );
    expect(result.map((item) => item.title)).toEqual(['Opus', 'Cuatro']);
    expect(result[1].why).toHaveLength(LIMITS.why);
  });

  it('no repite lo que ya sugirió para esa canción', () => {
    const result = checkCandidates(
      { picks: [{ title: 'Opus', artist: 'Eric Prydz' }, { title: 'Strobe', artist: 'deadmau5' }] },
      catalog,
      [songKey('Opus', 'Eric Prydz')],
    );
    expect(result.map((item) => item.title)).toEqual(['Strobe']);
  });

  it('no pasa de lo que se le pide a la IA, y sin nada válido queda vacío', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `T${i}`, artist: `A${i}` }));
    expect(checkCandidates({ picks: many }, catalog)).toHaveLength(SIMILAR.ask);
    expect(checkCandidates(null, catalog)).toEqual([]);
  });

  it('songKey compara por título y artista principal', () => {
    expect(songKey('Uno', 'X, Y')).toBe(songKey('uno', 'X & Z'));
    expect(songKey('Uno', 'X')).not.toBe(songKey('Uno', 'Y'));
  });
});

describe('bestMatch', () => {
  const item = { title: 'Opus', artist: 'Eric Prydz' };
  const track = (id, name, ...artists) => ({ id, name, artists: artists.map((n) => ({ name: n })) });

  it('acepta el mismo tema con otra versión en el título', () => {
    const found = bestMatch(
      [track(A, 'Otra', 'Eric Prydz'), track(B, 'Opus - Radio Edit', 'Eric Prydz')],
      item,
    );
    expect(found.id).toBe(B);
  });

  it('no acepta el mismo título de otro artista ni otro tema del mismo artista', () => {
    expect(bestMatch([track(A, 'Opus', 'Otro Artista')], item)).toBeNull();
    expect(bestMatch([track(A, 'Opus Dei', 'Eric Prydz')], item)).toBeNull();
    expect(bestMatch([track(A, 'Pjanoo', 'Eric Prydz')], item)).toBeNull();
  });

  it('no acepta un artista corto metido dentro de otro nombre', () => {
    expect(bestMatch([track(A, 'Opus', 'Eric')], item)).toBeNull();
    expect(bestMatch([track(A, 'Opus', 'Eric Prydz & Friends')], item).id).toBe(A);
  });

  it('salta lo excluido: mis playlists y lo ya elegido', () => {
    const items = [track(A, 'Opus', 'Eric Prydz'), track(B, 'Opus', 'Eric Prydz')];
    expect(bestMatch(items, item, new Set([A])).id).toBe(B);
  });
});

describe('/api/similar', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  function fakeRes() {
    const res = { statusCode: 200, headers: {}, body: undefined };
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body) => {
      res.body = body;
      return res;
    };
    res.end = () => res;
    res.setHeader = (key, value) => {
      res.headers[key] = value;
    };
    return res;
  }

  it('sin key de la IA responde 204 y la web no enseña el botón', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = fakeRes();
    await handler({ method: 'GET', query: { id: A }, headers: {} }, res);
    expect(res.statusCode).toBe(204);
  });

  it('un id que no es de Spotify es un 400', async () => {
    process.env.GEMINI_API_KEY = 'x';
    process.env.KV_REST_API_URL = 'https://kv.example';
    process.env.KV_REST_API_TOKEN = 'x';
    const res = fakeRes();
    await handler({ method: 'GET', query: { id: '../etc' }, headers: {} }, res);
    expect(res.statusCode).toBe(400);
  });
});
