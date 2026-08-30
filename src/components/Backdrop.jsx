import { useEffect, useRef, useState } from 'react';
import { blurredArt } from '../lib/blurArt.js';

/**
 * Fondo difuminado que adopta la portada de la cancion que suena.
 *
 * Mantiene dos capas y alterna cual esta al frente, de modo que la entrante
 * sube su opacidad sobre la saliente en vez de aparecer de golpe.
 *
 * El desenfoque NO se hace aqui con `filter` de CSS sino una sola vez en un
 * canvas (ver lib/blurArt.js): en CSS lo pagabamos en cada frame, y era lo que
 * atascaba la interfaz mientras sonaba algo.
 */
export default function Backdrop({ src, playing }) {
  /* Cada hueco guarda { url, raw }. `raw` marca la portada sin pre-difuminar,
     que es el plan B cuando el canvas no esta disponible. */
  const [slots, setSlots] = useState([null, null]);
  const [front, setFront] = useState(0);
  const shownRef = useRef('');
  /* Que capa esta al frente se lleva tambien en una ref para que el efecto
     NO dependa de `front`. Si dependiera, cada intercambio lo re-ejecutaria y
     su limpieza cancelaria el cambio de imagen que estuviera en vuelo, dejando
     el fondo congelado en la cancion anterior. */
  const frontRef = useRef(0);

  useEffect(() => {
    if (!src || src === shownRef.current) return undefined;

    let cancelled = false;

    /* `blurredArt` ya espera al onload de la portada, asi que sustituye tambien
       a la precarga que habia aqui: cuando resuelve, la textura esta lista y el
       cambio no deja hueco. Nunca rechaza; devuelve null si no pudo. */
    blurredArt(src).then((url) => {
      if (cancelled) return;

      shownRef.current = src;
      const back = 1 - frontRef.current;
      frontRef.current = back;

      setSlots((prev) => {
        const next = [...prev];
        next[back] = url ? { url, raw: false } : { url: src, raw: true };
        return next;
      });
      setFront(back);
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div className={`backdrop${playing ? ' backdrop--playing' : ''}`} aria-hidden="true">
      {slots.map((slot, index) => (
        <div
          key={index}
          className={`backdrop__layer${index === front && slot ? ' backdrop__layer--on' : ''}`}
        >
          {/* La imagen va en un hijo: la deriva necesita su propio transform y
              asi la capa conserva el suyo para la transicion de opacidad. */}
          <div
            className={`backdrop__drift${slot?.raw ? ' backdrop__drift--raw' : ''}`}
            style={slot ? { backgroundImage: `url("${slot.url}")` } : undefined}
          />
        </div>
      ))}
      <div className="backdrop__vignette" />
      <div className="backdrop__grain" />
    </div>
  );
}
