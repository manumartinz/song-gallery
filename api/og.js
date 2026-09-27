import { ImageResponse } from '@vercel/og';
import { createElement as h } from 'react';
import { describeShare, readShareParams, SITE } from './_share.js';
import { loadInter } from './_fonts.js';

/**
 * Imagen de previsualizacion al compartir el enlace (1200x630).
 *
 * Va como funcion y no como PNG estatico porque los rastreadores no ejecutan
 * JavaScript: la tarjeta tiene que salir ya montada del servidor.
 *
 * Sin parametros es la de siempre, solo la firma, y se cachea un año. Con
 * ?p=, ?a= o ?t= (los de la web) dibuja la portada y el nombre de lo que se
 * comparte: un link a una cancion en WhatsApp enseña esa cancion. Esas se
 * cachean una semana en el edge; lo que cuentan cambia poco, pero cambia.
 *
 * Ojo con el estilo: esto no es un navegador. `@vercel/og` compone con Satori,
 * que solo entiende un subconjunto de flexbox, y todo elemento con mas de un
 * hijo necesita `display: flex` explicito.
 */
export const config = { runtime: 'edge' };

const INK = '#07070a';
const BONE = '#f4f1ea';
const MUTED = 'rgba(244, 241, 234, 0.62)';
const FAINT = 'rgba(244, 241, 234, 0.4)';

/* Lavado calido que recuerda al fondo de la galeria. Lineal y no radial a
   proposito: Satori solo entiende un subconjunto de la sintaxis de degradados
   y rechaza `radial-gradient(... at x y, ...)`. */
const WASH = 'linear-gradient(140deg, #2b2418 0%, #07070a 58%)';

const base = {
  width: '100%',
  height: '100%',
  display: 'flex',
  background: INK,
  backgroundImage: WASH,
  color: BONE,
  fontFamily: 'Inter, sans-serif',
};

/* Solo el nombre. La tarjeta llevaba las dos frases del saludo, y eran dos
   sitios donde mantener la misma copia: al cambiar una quedaba diciendo lo que
   la web ya no dice. El titulo y la descripcion de `index.html` cuentan de que
   va esto; la imagen solo firma. */
function signatureCard() {
  return h(
    'div',
    { style: { ...base, alignItems: 'center', justifyContent: 'center', padding: '80px' } },
    h('div', { style: { display: 'flex', fontSize: 96, letterSpacing: '-0.03em' } }, SITE),
  );
}

/** El titulo encoge con el largo: uno de cuarenta letras a 80 px no cabe. */
function titleSize(text) {
  const length = text.length;
  if (length <= 18) return 76;
  if (length <= 30) return 62;
  if (length <= 48) return 50;
  return 42;
}

function shareCard(meta) {
  const eyebrow =
    meta.kind === 'track'
      ? 'Una canción que recomiendo'
      : meta.kind === 'album'
        ? 'Uno de mis discos favoritos'
        : 'Una playlist mía';
  const title = meta.kind === 'track' ? meta.trackTitle : meta.sourceName;
  /* En una playlist el dueño soy yo, y ya firmo abajo; en un disco es el
     artista, que si hace falta. */
  const sub = meta.kind === 'track' ? meta.artist : meta.kind === 'album' ? meta.owner : null;
  const cover = meta.art?.lg || meta.art?.md;

  return h(
    'div',
    { style: { ...base, alignItems: 'center', padding: '70px', gap: '64px' } },
    cover
      ? h('img', {
          src: cover,
          width: 490,
          height: 490,
          style: { borderRadius: 10, boxShadow: '0 30px 60px rgba(0,0,0,0.55)' },
        })
      : null,
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 } },
      h(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: FAINT,
          },
        },
        eyebrow,
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            marginTop: 22,
            fontSize: titleSize(title || ''),
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
          },
        },
        title || SITE,
      ),
      sub
        ? h('div', { style: { display: 'flex', marginTop: 18, fontSize: 34, color: MUTED } }, sub)
        : null,
      h(
        'div',
        { style: { display: 'flex', marginTop: 56, fontSize: 26, fontWeight: 600, color: MUTED } },
        SITE,
      ),
    ),
  );
}

export default async function handler(request) {
  const params = readShareParams(new URL(request.url).searchParams);
  const fonts = await loadInter();

  if (!params.id && !params.trackId) {
    return new ImageResponse(signatureCard(), {
      width: 1200,
      height: 630,
      fonts,
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  }

  const meta = await describeShare(params);
  return new ImageResponse(meta.kind === 'site' ? signatureCard() : shareCard(meta), {
    width: 1200,
    height: 630,
    fonts,
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400',
    },
  });
}
