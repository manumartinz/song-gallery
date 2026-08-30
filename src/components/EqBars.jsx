import { useEffect, useRef } from 'react';
import { readLevels } from '../lib/analyser.js';

/**
 * Barras que indican que hay audio sonando.
 *
 * Si Web Audio esta disponible responden al sonido de verdad; si no (Safari en
 * iOS tiene rarezas, o la fuente no admitio CORS) se quedan con la animacion
 * por CSS, que da el pego.
 *
 * Las alturas se escriben directamente en el DOM y no por estado de React: son
 * sesenta cambios por segundo y no deben provocar ni un render.
 */
export default function EqBars({ playing = true }) {
  const rootRef = useRef(null);
  const barsRef = useRef([]);

  useEffect(() => {
    if (!playing) return undefined;

    let raf = 0;
    let live = false; // hubo datos reales al menos una vez

    const tick = () => {
      raf = requestAnimationFrame(tick);

      const levels = readLevels();
      if (!levels) {
        // Sin datos: se devuelve el control a la animacion CSS.
        if (live) {
          live = false;
          rootRef.current?.classList.remove('eq--live');
          barsRef.current.forEach((bar) => bar && (bar.style.transform = ''));
        }
        return;
      }

      if (!live) {
        live = true;
        /* Aparta la animacion enlatada. Una animacion CSS en curso gana en la
           cascada a los estilos en linea, asi que sin esta clase las alturas
           que escribimos aqui abajo no se verian NUNCA: se veia el rebote de
           siempre y este bucle era trabajo tirado, sesenta veces por segundo. */
        rootRef.current?.classList.add('eq--live');
      }

      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        const level = Math.max(0.18, levels[i] ?? 0);
        bar.style.transform = `scaleY(${level})`;
      });
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      rootRef.current?.classList.remove('eq--live');
      barsRef.current.forEach((bar) => bar && (bar.style.transform = ''));
    };
  }, [playing]);

  return (
    <span ref={rootRef} className={`eq${playing ? '' : ' eq--idle'}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          ref={(node) => {
            barsRef.current[i] = node;
          }}
        />
      ))}
    </span>
  );
}
