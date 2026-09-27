/**
 * "Adiviná la canción": rondas de cuatro opciones sacadas de la fuente abierta.
 *
 * Puro a propósito, con el azar inyectado: así se prueba sin audio ni React.
 */

export const QUIZ_ROUNDS = 10;
export const QUIZ_OPTIONS = 4;

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* Dos pistas con el mismo título (una versión en vivo, una repetida en la
   playlist) no pueden ser opciones de la misma ronda: la respuesta sería
   ambigua. */
function titleKey(track) {
  return String(track.title || '')
    .toLowerCase()
    .replace(/\s*[([].*$/, '')
    .trim();
}

/**
 * Arma las rondas. `pool` son las pistas que se pueden oír. Cada respuesta
 * sale una sola vez; los distractores pueden repetirse entre rondas.
 * Devuelve [] si no alcanzan para una ronda con cuatro opciones distintas.
 */
export function buildRounds(pool, { rounds = QUIZ_ROUNDS, random = Math.random } = {}) {
  const unique = [];
  const seen = new Set();
  for (const track of pool) {
    const key = titleKey(track);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(track);
  }
  if (unique.length < QUIZ_OPTIONS) return [];

  const answers = shuffle(unique, random).slice(0, Math.min(rounds, unique.length));
  return answers.map((answer) => {
    const others = shuffle(
      unique.filter((track) => track !== answer),
      random,
    ).slice(0, QUIZ_OPTIONS - 1);
    return { answer, options: shuffle([answer, ...others], random) };
  });
}

/** Una frase para el final según la proporción de aciertos. */
export function verdict(score, total) {
  const ratio = total ? score / total : 0;
  if (ratio === 1) return 'Perfecto. ¿Seguro que no son tus playlists?';
  if (ratio >= 0.7) return 'Muy bien. Tenemos oídos parecidos.';
  if (ratio >= 0.4) return 'Nada mal. Te quedan unas cuantas por descubrir.';
  return 'Mejor así: tenés un montón de canciones nuevas para escuchar.';
}
