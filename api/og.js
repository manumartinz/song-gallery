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
          alignItems: 'center',
          justifyContent: 'center',
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
      /* Solo el nombre. La tarjeta llevaba las dos frases del saludo, y eran
         dos sitios donde mantener la misma copia: al cambiar una quedaba
         diciendo lo que la web ya no dice. El titulo y la descripcion de
         `index.html` cuentan de que va esto; la imagen solo firma. */
      h(
        'div',
        { style: { display: 'flex', fontSize: 96, letterSpacing: '-0.03em' } },
        'Manu A. Martínez',
      ),
    ),
    {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    },
  );
}
