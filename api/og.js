import { ImageResponse } from '@vercel/og';
import { createElement as h } from 'react';

/**
 * Imagen de previsualizacion al compartir el enlace (1200x630).
 *
 * Va como funcion y no como PNG estatico porque los rastreadores no ejecutan
 * JavaScript: la tarjeta tiene que salir ya montada del servidor. Se cachea un
 * año en el edge, asi que en la practica se dibuja una vez.
 *
 * Ojo con el estilo: esto no es un navegador. `@vercel/og` compone con Satori,
 * que solo entiende un subconjunto de flexbox, y todo elemento con mas de un
 * hijo necesita `display: flex` explicito.
 */
export const config = { runtime: 'edge' };

const INK = '#07070a';
const BONE = '#f4f1ea';

export default function handler() {
  return new ImageResponse(
    h(
      'div',
      {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '80px',
          background: INK,
          /* Lavado calido que recuerda al fondo de la galeria. Lineal y no
             radial a proposito: Satori solo entiende un subconjunto de la
             sintaxis de degradados y rechaza `radial-gradient(... at x y, ...)`. */
          backgroundImage: 'linear-gradient(140deg, #2b2418 0%, #07070a 58%)',
          color: BONE,
          fontFamily: 'sans-serif',
        },
      },
      h(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: 26,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(244,241,234,0.56)',
          },
        },
        'Manu A. Martínez',
      ),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        h(
          'div',
          { style: { display: 'flex', fontSize: 76, letterSpacing: '-0.03em' } },
          'Esto no es un reproductor.',
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontSize: 76,
              letterSpacing: '-0.03em',
              color: 'rgba(244,241,234,0.56)',
            },
          },
          'Es una recomendación mía.',
        ),
      ),
      h(
        'div',
        { style: { display: 'flex', fontSize: 26, color: 'rgba(244,241,234,0.3)' } },
        'music.manuelmartinez.ar',
      ),
    ),
    {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    },
  );
}
