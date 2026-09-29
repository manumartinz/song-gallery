/**
 * La IA de la galería: Gemini, por su API REST y sin SDK.
 *
 * Todo lo que sabe del proveedor vive acá. Cambiar de IA es reescribir
 * `generate` y nada más. Dos pedidos:
 *  - `askMood`: elige de mis canciones las que van con una frase
 *    -> `{ intro, picks: [{ id, why }] }` (lo filtra _mood.js);
 *  - `askSimilar`: propone canciones NUEVAS parecidas a una mía
 *    -> `{ picks: [{ title, artist, why }] }` (lo filtra _similar.js).
 * Quien llama nunca se fía de la respuesta.
 *
 * GEMINI_API_KEY sale gratis de aistudio.google.com. El plan gratuito tiene un
 * cupo por minuto y por día: por eso los endpoints limitan por IP y por día, y
 * un 429 de acá se le cuenta a la persona como "probá en un rato".
 * GEMINI_MODEL es opcional, para fijar un modelo concreto. Si está saturado se
 * prueba una vez con FALLBACK_MODEL.
 */
import { catalogSections, catalogText, LIMITS } from './_mood.js';
import { SIMILAR } from './_similar.js';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-flash-latest';
const FALLBACK_MODEL = 'gemini-flash-lite-latest';
/* Dos intentos tienen que entrar en los 30 s de la función (vercel.json), con
   margen para Spotify. */
const TIMEOUT_MS = 12_000;

export class AiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'AiError';
    this.status = status;
  }
}

export function aiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

const WHY = { type: 'STRING' };

const MOOD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    intro: { type: 'STRING' },
    lists: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          list: { type: 'STRING' },
          picks: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { id: { type: 'STRING' }, why: WHY },
              required: ['id', 'why'],
            },
          },
        },
        required: ['list', 'picks'],
      },
    },
  },
  required: ['intro', 'lists'],
};

function moodInstructions(catalog, avoid) {
  const already = avoid.length
    ? `\n\nPara este mismo pedido ya elegiste estos ids. Si hay otras canciones que encajen igual de bien, preferí esas; si no, podés repetir:\n${avoid.join(', ')}`
    : '';

  return `Sos el DJ de una galería de música personal. Alguien describe lo que tiene ganas de escuchar (un ánimo, un momento, una actividad) y vos elegís canciones SOLO de este catálogo, que son las de mis playlists.

El catálogo va en una sección por playlist. Cada línea es: id | canción | artista | género | año

${catalogSections(catalog)}${already}

Reglas:
- Recorré CADA playlist por separado y, en "lists", devolvé una entrada por playlist con su nombre en "list" y en "picks" hasta ${LIMITS.perList} canciones de ESA playlist que encajen de verdad con el pedido, de la que mejor encaja a la que menos.
- Buscá en todas: una playlist chica o de otro estilo igual puede tener dos o tres que encajen. Solo dejá "picks" vacío si de verdad ninguna de esa playlist va con el pedido.
- Usá lo que sabés de cada canción y artista (sonido, letra, energía), no solo el género.
- Devolvé el id EXACTO de la línea. Nunca inventes canciones ni ids.
- No más de dos canciones del mismo artista en total.
- "why": por qué encaja, en 12 palabras como mucho, castellano rioplatense, tono cálido y concreto. Sin repetir el nombre de la canción.
- "intro": una frase corta (máximo 20 palabras) que presente la selección, en el mismo tono.
- Si el pedido no tiene nada que ver con música o con un ánimo, devolvé todas las "picks" vacías y explicalo en "intro".`;
}

const SIMILAR_SCHEMA = {
  type: 'OBJECT',
  properties: {
    picks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { title: { type: 'STRING' }, artist: { type: 'STRING' }, why: WHY },
        required: ['title', 'artist', 'why'],
      },
    },
  },
  required: ['picks'],
};

function similarInstructions(catalog, avoid) {
  const already = avoid.length
    ? `\n\nPara esta canción ya recomendaste estas; NO las repitas:\n${avoid.join('\n')}`
    : '';

  return `Sos un curador de música. Te paso una canción y recomendás canciones NUEVAS parecidas, para descubrir.

Estas son las canciones de mis playlists: NO las recomiendes. Están para que entiendas mi gusto. Cada línea es: canción | artista | género | año

${catalogText(catalog, { ids: false })}${already}

Reglas:
- "picks": exactamente ${SIMILAR.ask} canciones parecidas de verdad a la que te paso: mismo estilo, energía y época parecida. Que NO estén en mis playlists.
- Una sola canción por artista, y ninguna del mismo artista que la canción que te paso.
- Tienen que ser canciones reales y publicadas que estén en Spotify: "title" con el título exacto (sin "feat." ni versiones) y "artist" con el artista principal. Si no estás seguro de que una canción existe, elegí otra.
- Ordenalas de la más parecida a la menos.
- "why": qué tiene en común con la canción que te paso, en 12 palabras como mucho, castellano rioplatense, concreto (el sonido, el ritmo, la voz). Sin repetir el nombre de ninguna de las dos.`;
}

async function callModel(model, { system, prompt, schema, temperature }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${API}/${model}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature,
        },
      }),
    });
  } catch (error) {
    throw new AiError(
      error.name === 'AbortError' ? 'La IA tardó demasiado.' : 'La IA no contestó.',
      503,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) throw new AiError('Cupo de la IA agotado.', 429);
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // 5xx es la IA saturada o caída: vale la pena probar con otro modelo.
    throw new AiError(
      `Gemini (${model}) respondió ${response.status}: ${detail.slice(0, 200)}`,
      response.status >= 500 ? 503 : 502,
    );
  }

  const body = await response.json();
  const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
  try {
    // Con responseMimeType ya viene JSON pelado; lo de las comillas es por las dudas.
    return JSON.parse(String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new AiError('La IA devolvió algo que no es JSON.');
  }
}

/**
 * Una respuesta JSON con la forma de `schema`. Si el modelo está saturado
 * (pasa seguido en el plan gratis) o sin cupo, prueba una vez con el liviano,
 * que tiene su propio cupo.
 */
async function generate(request) {
  const models = [...new Set([process.env.GEMINI_MODEL || DEFAULT_MODEL, FALLBACK_MODEL])];
  let last;
  for (const model of models) {
    try {
      return await callModel(model, request);
    } catch (error) {
      last = error;
      if (error.status !== 503 && error.status !== 429) throw error;
    }
  }
  throw last;
}

/**
 * Elige de mis canciones las que van con la frase `q`. `avoid` son los ids que
 * ya eligió para esa frase, para que «Otra tanda» traiga otras si puede.
 */
export function askMood(catalog, q, avoid = []) {
  return generate({
    system: moodInstructions(catalog, avoid),
    prompt: q,
    schema: MOOD_SCHEMA,
    // Alta a propósito: la misma frase tiene que poder dar cosas distintas.
    temperature: 1.0,
  });
}

/**
 * Canciones nuevas parecidas a `seed` ({ title, artists, album, year, genre }).
 * `avoid` son las que ya recomendó para esa canción, como «canción — artista».
 */
export function askSimilar(seed, catalog, avoid = []) {
  const facts = [
    `Canción: ${seed.title}`,
    `Artista: ${seed.artists}`,
    seed.album ? `Disco: ${seed.album}` : '',
    seed.year ? `Año: ${seed.year}` : '',
    seed.genre ? `Género: ${seed.genre}` : '',
  ].filter(Boolean);

  return generate({
    system: similarInstructions(catalog, avoid),
    prompt: facts.join('\n'),
    schema: SIMILAR_SCHEMA,
    temperature: 0.9,
  });
}
