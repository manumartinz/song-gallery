/**
 * Grafo de Web Audio para que el ecualizador responda al sonido de verdad.
 *
 * Es posible porque las dos fuentes de preview (Deezer e iTunes) responden con
 * `Access-Control-Allow-Origin: *`. Aun asi hay dos reglas que no se pueden
 * saltar:
 *
 *  - `createMediaElementSource` solo admite UNA llamada por elemento, y a
 *    partir de ella ese audio sale SIEMPRE por el grafo. Si la fuente estuviera
 *    contaminada por falta de CORS, saldria mudo.
 *  - Por eso un deck se enruta solo DESPUES de que haya sonado bien: asi nunca
 *    se enruta algo que no se ha podido cargar limpio.
 */

const BANDS = 3; // graves, medios y agudos: una barra por banda

let graph = null;
let broken = false;

/** Crea el contexto la primera vez. Debe llamarse tras un gesto del usuario. */
function ensureGraph() {
  if (graph || broken) return graph;

  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) {
    broken = true;
    return null;
  }

  try {
    const context = new Ctx();
    const analyser = context.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.72;
    analyser.connect(context.destination);

    graph = { context, analyser, bins: new Uint8Array(analyser.frequencyBinCount), routed: new Set() };
    return graph;
  } catch {
    broken = true; // navegador sin Web Audio utilizable: se sigue sin visualizador
    return null;
  }
}

/** Enruta un deck por el analizador. Idempotente y silencioso si no se puede. */
export function routeDeck(deck) {
  const current = ensureGraph();
  if (!current || current.routed.has(deck)) return;

  try {
    const source = current.context.createMediaElementSource(deck);
    source.connect(current.analyser);
    current.routed.add(deck);
  } catch {
    /* Ya estaba enrutado, o este navegador no lo permite: sin visualizador. */
  }
}

/** El contexto arranca suspendido si se creo antes del primer gesto. */
export function resumeGraph() {
  if (graph?.context.state === 'suspended') graph.context.resume().catch(() => {});
}

/** Desactiva el grafo para toda la sesion (por ejemplo si CORS fallo). */
export function disableGraph() {
  broken = true;
}

export function isGraphEnabled() {
  return !broken;
}

/**
 * Devuelve `BANDS` niveles entre 0 y 1, o null si no hay nada que analizar.
 * Un resultado todo a cero (Safari en iOS lo hace) equivale a no tener datos,
 * y quien llama vuelve a la animacion por CSS.
 */
export function readLevels() {
  if (!graph) return null;

  const { analyser, bins } = graph;
  analyser.getByteFrequencyData(bins);

  const levels = new Array(BANDS).fill(0);
  const width = Math.floor(bins.length / BANDS);
  let total = 0;

  for (let band = 0; band < BANDS; band += 1) {
    let sum = 0;
    for (let i = band * width; i < (band + 1) * width; i += 1) sum += bins[i];
    const average = sum / width / 255;
    levels[band] = Math.min(1, average * 1.6); // las bandas altas siempre van flojas
    total += average;
  }

  return total > 0.002 ? levels : null;
}
