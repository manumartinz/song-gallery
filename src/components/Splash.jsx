import { useEffect } from 'react';
import useReducedMotion from '../hooks/useReducedMotion.js';

const SEEN_KEY = 'song-gallery:intro-seen';

/**
 * Saludo de la primera visita: fija la expectativa (esto no es un reproductor)
 * antes de que aparezca la galeria.
 *
 * La coreografia entera vive en el CSS (`.splash` en app.css). Aqui solo se
 * marca la visita y se avisa cuando el fundido termina, para que la duracion
 * exista en UN solo sitio y no se desincronice.
 */
export default function Splash({ onDone }) {
  const reducedMotion = useReducedMotion();

  /* Se marca al montar y no al terminar: quien cierre a mitad ya lo ha visto,
     y no queremos que le vuelva a salir. */
  useEffect(() => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* sin persistencia, sigue funcionando en esta sesion */
    }
  }, []);

  /* Con movimiento reducido no hay nada que enseñar: tokens.css recorta toda
     animacion a 1ms y esto seria un parpadeo. La visita ya quedo marcada. */
  useEffect(() => {
    if (reducedMotion) onDone();
  }, [reducedMotion, onDone]);

  /* Red de seguridad por si `animationend` no llega nunca: una pestaña que
     carga en segundo plano puede no animar hasta que se mira. Va justo por
     encima de los 3.6s que dura la coreografia entera (las cifras estan en
     `.splash` en app.css); si se alarga alli, hay que subirlo aqui. */
  useEffect(() => {
    const timer = setTimeout(onDone, 5000);
    return () => clearTimeout(timer);
  }, [onDone]);

  if (reducedMotion) return null;

  return (
    <div
      className="splash"
      onAnimationEnd={(event) => {
        // Las animaciones de las lineas tambien burbujean hasta aqui.
        if (event.target === event.currentTarget && event.animationName === 'splash-out') onDone();
      }}
    >
      <p className="splash__line splash__line--1">Esto no es un reproductor,</p>
      <p className="splash__line splash__line--2">
        son canciones que me gustaría que también conozcas.
      </p>
      <p className="splash__sign">Manu A. Martínez</p>
    </div>
  );
}
