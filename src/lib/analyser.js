/**
 * Grafo de Web Audio: el ecualizador responde al sonido de verdad, y cada deck
 * lleva su propia ganancia.
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
 *
 * La cadena de un deck enrutado es fuente -> ganancia -> analizador -> salida.
 * La ganancia existe para Safari de iOS, donde `volume` del elemento es de solo
 * lectura: sin ella no habria ni mando de volumen ni fundido. Al enrutar, el
 * elemento se pone a 1 y deja de atenuar; desde ese momento el nivel de ese
 * deck lo lleva su ganancia y NADIE debe volver a tocar su `volume`, o las dos
 * atenuaciones se multiplicarian.
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

    graph = {
      context,
      analyser,
      bins: new Uint8Array(analyser.frequencyBinCount),
      gains: new Map(), // deck -> su GainNode
    };
    return graph;
  } catch {
    broken = true; // navegador sin Web Audio utilizable: se sigue sin visualizador
    return null;
  }
}

/**
 * Enruta un deck por su ganancia y el analizador. Idempotente y silencioso si
 * no se puede. Sale MUDO a proposito: quien enruta es el reproductor justo
 * antes de empezar un fundido, y el nivel lo pone el fundido en su primer
 * frame. Enrutar a otro valor daria un chasquido en cada cambio de tema.
 */
export function routeDeck(deck) {
  const current = ensureGraph();
  if (!current || current.gains.has(deck)) return;

  try {
    const source = current.context.createMediaElementSource(deck);
    const gain = current.context.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(current.analyser);
    current.gains.set(deck, gain);
    deck.volume = 1; // a partir de aqui atenua la ganancia, no el elemento
  } catch {
    /* Ya estaba enrutado, o este navegador no lo permite: sin visualizador. */
  }
}

/**
 * Pone el nivel de un deck enrutado. Devuelve false si no lo esta, que es la
 * senal de que quien llama debe atenuar por el elemento <audio>.
 */
export function setDeckLevel(deck, level) {
  const gain = graph?.gains.get(deck);
  if (!gain) return false;
  gain.gain.value = level;
  return true;
}

/** Nivel actual de un deck enrutado, o null si no lo esta. */
export function getDeckLevel(deck) {
  const gain = graph?.gains.get(deck);
  return gain ? gain.gain.value : null;
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
 * y quien llama vuelve a la animacion por CSS. Que el analizador vaya despues
 * de la ganancia significa que las barras siguen al volumen: bajarlo del todo
 * las apaga y devuelve la animacion por CSS, igual que antes hacia el silencio.
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
