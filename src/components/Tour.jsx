import { useCallback, useEffect, useRef, useState } from 'react';
import useSwipe from '../hooks/useSwipe.js';
import TourArt from './TourArt.jsx';

/**
 * «Cómo funciona»: lo que se puede hacer en la web, en unas pocas tarjetas.
 *
 * Mismo lenguaje que el splash y el panel de atajos: la pagina se retira detras
 * de un velo casi opaco y queda el texto solo, centrado, sin caja. Las tarjetas
 * no señalan nada de la pagina a proposito: los controles cambian de sitio
 * segun el ancho y algunos no siempre estan, asi que se cuentan en vez de
 * apuntarlos. Que tarjetas hay lo decide App, que sabe que esta encendido.
 *
 * Se cierra con Escape, con «Saltar» o con «Listo».
 */
export default function Tour({ steps, onClose }) {
  const [at, setAt] = useState(0);
  const primaryRef = useRef(null);
  const last = at === steps.length - 1;

  const next = useCallback(() => {
    if (last) onClose();
    else setAt((value) => value + 1);
  }, [last, onClose]);

  const prev = useCallback(() => setAt((value) => Math.max(0, value - 1)), []);

  const { handlers, followRef } = useSwipe({ onLeft: next, onRight: prev });

  /* El teclado es del tour mientras esta abierto: `is-modal` hace que App no
     reaccione, y estas van en captura para llegar antes que nadie. */
  useEffect(() => {
    document.body.classList.add('is-modal');
    return () => document.body.classList.remove('is-modal');
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') next();
      else if (event.key === 'ArrowLeft') prev();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [next, prev, onClose]);

  // El foco sigue al boton principal, que cambia de rotulo en la ultima.
  useEffect(() => {
    primaryRef.current?.focus();
  }, [at]);

  const step = steps[at];
  if (!step) return null;

  return (
    /* Sin cierre al tocar fuera, a diferencia del panel de atajos: el velo
       ocupa casi toda la pantalla y un click al lado de los botones lo cerraba
       a mitad de recorrido. Para irse estan «Saltar», «Listo» y Escape. */
    <div className="keys tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="keys__inner tour__inner" {...handlers}>
        <div ref={followRef} className="tour__card">
          {/* La key reinicia el fundido en cada tarjeta. */}
          <div key={at} className="tour__step" aria-live="polite">
            <TourArt name={step.art} {...step.artProps} />
            <p className="tour__eyebrow">
              {at + 1} de {steps.length}
            </p>
            <p id="tour-title" className="tour__title">
              {step.title}
            </p>
            <p className="tour__text">{step.text}</p>
          </div>
        </div>

        <div className="tour__dots" aria-hidden="true">
          {steps.map((item, index) => (
            <span
              key={item.title}
              className={`tour__dot${index === at ? ' tour__dot--on' : ''}`}
            />
          ))}
        </div>

        <div className="tour__nav">
          {last ? (
            <span />
          ) : (
            <button type="button" className="tour__skip" onClick={onClose}>
              Saltar
            </button>
          )}
          <div className="tour__moves">
            {at > 0 ? (
              <button type="button" className="keys__close keys__close--quiet tour__back" onClick={prev}>
                ← Atrás
              </button>
            ) : null}
            <button ref={primaryRef} type="button" className="keys__close tour__next" onClick={next}>
              {last ? 'Listo' : 'Siguiente →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
