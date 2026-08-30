import { useCallback, useEffect, useRef } from 'react';

const DRAG_THRESHOLD = 6; // px antes de considerar que es arrastre y no click
const FRICTION = 0.94;
const MIN_VELOCITY = 0.05;

/**
 * Permite recorrer la lista arrastrando con el raton, con inercia al soltar.
 *
 * Solo se activa con puntero de raton: en tactil el scroll nativo ya hace
 * este trabajo y mejor no competir con el.
 */
export default function useDragScroll({ enabled = true } = {}) {
  const state = useRef({ active: false, startY: 0, startScroll: 0, lastY: 0, lastAt: 0, velocity: 0, moved: false });
  const rafRef = useRef(0);

  const stopMomentum = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const onPointerDown = useCallback(
    (event) => {
      if (!enabled || event.pointerType !== 'mouse' || event.button !== 0) return;
      // No secuestrar la seleccion de texto de un enlace o un input.
      if (event.target.closest('a, input, [data-no-drag]')) return;

      stopMomentum();
      const s = state.current;
      s.active = true;
      s.moved = false;
      s.startY = event.clientY;
      s.lastY = event.clientY;
      s.lastAt = performance.now();
      s.startScroll = window.scrollY;
      s.velocity = 0;
    },
    [enabled, stopMomentum],
  );

  useEffect(() => {
    if (!enabled) return undefined;

    const onMove = (event) => {
      const s = state.current;
      if (!s.active) return;

      const delta = event.clientY - s.startY;
      if (!s.moved && Math.abs(delta) < DRAG_THRESHOLD) return;

      if (!s.moved) {
        s.moved = true;
        document.body.classList.add('is-dragging-body');
      }

      const now = performance.now();
      const elapsed = now - s.lastAt;
      if (elapsed > 0) s.velocity = (event.clientY - s.lastY) / elapsed;
      s.lastY = event.clientY;
      s.lastAt = now;

      // `instant` evita pelearse con el scroll-behavior: smooth del documento.
      window.scrollTo({ top: s.startScroll - delta, behavior: 'instant' });
      event.preventDefault();
    };

    const onUp = () => {
      const s = state.current;
      if (!s.active) return;
      s.active = false;
      document.body.classList.remove('is-dragging-body');
      if (!s.moved) return;

      // El `click` de cierre del arrastre llega justo despues de este handler,
      // asi que la bandera se limpia en el siguiente tick: la fila no se
      // dispara al soltar, pero un Enter posterior si funciona.
      setTimeout(() => {
        s.moved = false;
      }, 0);

      // Inercia: continua el desplazamiento y lo va frenando.
      let velocity = s.velocity * 16; // px por frame aprox.
      const glide = () => {
        velocity *= FRICTION;
        if (Math.abs(velocity) < MIN_VELOCITY) {
          rafRef.current = 0;
          return;
        }
        window.scrollBy({ top: -velocity, behavior: 'instant' });
        rafRef.current = requestAnimationFrame(glide);
      };
      rafRef.current = requestAnimationFrame(glide);
    };

    /* Red de seguridad: las portadas llevan draggable={false}, pero si alguna
       imagen futura se olvida, el arrastre nativo del navegador se comeria el
       gesto y la pagina no se desplazaria. */
    const onDragStart = (event) => {
      if (state.current.active) event.preventDefault();
    };

    /* Cualquier pulsacion mata la inercia, no solo las que caen sobre la lista.
       Si no, al pulsar el titulo de la barra el deslizamiento seguia corriendo
       y peleaba contra el scroll suave hacia arriba: parecia que el boton no
       hacia nada. */
    window.addEventListener('pointerdown', stopMomentum);
    window.addEventListener('dragstart', onDragStart);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('wheel', stopMomentum, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', stopMomentum);
      window.removeEventListener('dragstart', onDragStart);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('wheel', stopMomentum);
      cancelAnimationFrame(rafRef.current);
      document.body.classList.remove('is-dragging-body');
    };
  }, [enabled, stopMomentum]);

  /** El click de una fila lo consulta para no dispararse al final de un arrastre. */
  const wasDragged = useCallback(() => state.current.moved, []);

  return { onPointerDown, wasDragged };
}
