import { useEffect } from 'react';
import { dominantColor } from '../lib/color.js';

/**
 * Tiñe los acentos de la pagina con el color dominante de una portada.
 *
 * Recibe la URL como cadena y no el objeto de la pista: la pista se rehace con
 * cada tramo de previews que llega, y la URL de la portada no cambia.
 */
export default function useAccentColor(source) {
  useEffect(() => {
    if (!source) return undefined;

    let cancelled = false;
    dominantColor(source).then((color) => {
      if (cancelled) return;
      // Solo hay version translucida si salio un rgb(); el fallback es hex.
      const soft = color.startsWith('rgb(')
        ? color.replace('rgb(', 'rgba(').replace(')', ', 0.2)')
        : 'rgba(244, 241, 234, 0.16)';
      document.documentElement.style.setProperty('--accent', color);
      document.documentElement.style.setProperty('--accent-soft', soft);
    });

    return () => {
      cancelled = true;
    };
  }, [source]);
}
