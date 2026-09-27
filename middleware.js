import {
  describeShare,
  injectMeta,
  isCrawler,
  readShareParams,
  shareJsonLd,
} from './api/_share.js';

/**
 * Tarjetas al compartir un enlace concreto, y lo mismo para los buscadores.
 *
 * La web es una SPA: el HTML que se sirve es siempre el mismo, y los
 * rastreadores de WhatsApp, Twitter, Slack y compañía no ejecutan JavaScript.
 * Sin esto, cualquier enlace (a una playlist, a un disco, a una canción)
 * enseñaba la misma tarjeta con la firma.
 *
 * Solo actúa con un rastreador y con ?p=, ?a= o ?t= en la URL. A una persona
 * no la toca: el HTML le llega igual que siempre, sin el viaje de más. Al
 * rastreador le devuelve el mismo index.html con el título, la descripción y
 * la imagen de lo que se comparte.
 */
export const config = { matcher: '/' };

const TIMEOUT_MS = 3500;

export default async function middleware(request) {
  const url = new URL(request.url);
  const params = readShareParams(url.searchParams);
  if (!params.id && !params.trackId) return undefined;
  if (!isCrawler(request.headers.get('user-agent'))) return undefined;

  try {
    const [page, meta] = await Promise.all([
      fetch(new URL('/index.html', url)).then((response) => response.text()),
      /* Un rastreador que espera demasiado se va sin tarjeta: pasado el plazo,
         mejor la genérica que ninguna. */
      Promise.race([
        describeShare(params),
        new Promise((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
      ]),
    ]);
    if (!meta || meta.kind === 'site') return undefined;

    const image = new URL('/api/og', url);
    for (const key of ['p', 'a', 't']) {
      const value = url.searchParams.get(key);
      if (value) image.searchParams.set(key, value);
    }

    // La URL limpia: solo los parametros que la web entiende, en orden fijo.
    const canonical = new URL('/', url);
    for (const key of ['p', 'a', 't']) {
      const value = url.searchParams.get(key);
      if (value) canonical.searchParams.set(key, value);
    }

    const html = injectMeta(page, {
      title: meta.title,
      description: meta.description,
      url: canonical.toString(),
      image: image.toString(),
      jsonLd: shareJsonLd(meta, canonical.toString()),
    });

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        /* Privada a proposito: la URL es la misma para personas y rastreadores,
           y una copia en el CDN le serviria esta version a todo el mundo. */
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return undefined; // ante cualquier duda, la pagina de siempre
  }
}
