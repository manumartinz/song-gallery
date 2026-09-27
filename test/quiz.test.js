import { describe, expect, it } from 'vitest';
import { buildRounds, verdict } from '../src/lib/quiz.js';

const track = (id, title) => ({ id, title });

/** Generador determinista para que las pruebas no dependan del azar. */
function seeded(seed = 1) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

describe('buildRounds', () => {
  const pool = Array.from({ length: 12 }, (_, i) => track(String(i), `Canción ${i}`));

  it('arma diez rondas con cuatro opciones distintas que incluyen la respuesta', () => {
    const rounds = buildRounds(pool, { random: seeded() });
    expect(rounds).toHaveLength(10);
    for (const { answer, options } of rounds) {
      expect(options).toHaveLength(4);
      expect(options).toContain(answer);
      expect(new Set(options).size).toBe(4);
    }
  });

  it('no repite respuestas', () => {
    const answers = buildRounds(pool, { random: seeded(7) }).map((r) => r.answer.id);
    expect(new Set(answers).size).toBe(answers.length);
  });

  it('con pocas canciones hace tantas rondas como canciones haya', () => {
    expect(buildRounds(pool.slice(0, 5), { random: seeded() })).toHaveLength(5);
  });

  it('no alcanza con menos de cuatro titulos distintos', () => {
    const dupes = [track('1', 'A'), track('2', 'A (Live)'), track('3', 'B'), track('4', 'C')];
    expect(buildRounds(dupes, { random: seeded() })).toEqual([]);
  });
});

describe('verdict', () => {
  it('tiene una frase para cada tramo', () => {
    expect(verdict(10, 10)).toMatch(/Perfecto/);
    expect(verdict(0, 10)).toMatch(/nuevas/);
  });
});
