import { useCallback, useRef } from 'react';

const THRESHOLD = 56; // px para que un deslizamiento cuente como gesto
const FOLLOW = 0.45; // cuanto sigue el contenido al dedo mientras se arrastra

/** Un toque de vibracion en Android. iOS no la tiene y los demas la ignoran. */
export function buzz(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* algunos navegadores la bloquean dentro de iframes */
  }
}

/**
 * Gestos de un dedo sobre una superficie: izquierda, derecha y arriba.
 *
 * Mientras se arrastra en horizontal, `followRef` se desplaza un poco con el
 * dedo para que se note que el gesto se esta leyendo. Se escribe el transform
 * a mano, no por estado: son eventos a la frecuencia del tactil.
 *
 * `swiped()` dice si el ultimo toque fue un gesto, para que el click que el
 * navegador dispara despues no cuente ademas como toque.
 */
export default function useSwipe({ onLeft, onRight, onUp }) {
  const start = useRef(null);
  const didSwipe = useRef(false);
  const followRef = useRef(null);

  const reset = () => {
    const node = followRef.current;
    if (!node) return;
    node.style.transition = '';
    node.style.transform = '';
  };

  const onTouchStart = useCallback((event) => {
    /* Arrastrar la barra de progreso tambien es un deslizamiento horizontal, y
       no debe cambiar de tema. */
    if (event.touches.length !== 1 || event.target.closest?.('[role="slider"]')) return;
    const { clientX, clientY } = event.touches[0];
    start.current = { x: clientX, y: clientY };
    didSwipe.current = false;
    if (followRef.current) followRef.current.style.transition = 'none';
  }, []);

  const onTouchMove = useCallback((event) => {
    const from = start.current;
    const node = followRef.current;
    if (!from || !node) return;
    const dx = event.touches[0].clientX - from.x;
    const dy = event.touches[0].clientY - from.y;
    if (Math.abs(dx) > Math.abs(dy)) node.style.transform = `translateX(${dx * FOLLOW}px)`;
  }, []);

  const onTouchEnd = useCallback(
    (event) => {
      const from = start.current;
      start.current = null;
      reset();
      if (!from) return;

      const dx = event.changedTouches[0].clientX - from.x;
      const dy = event.changedTouches[0].clientY - from.y;

      if (Math.abs(dx) > THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.2) {
        didSwipe.current = true;
        buzz();
        (dx < 0 ? onLeft : onRight)?.();
      } else if (-dy > THRESHOLD && Math.abs(dy) > Math.abs(dx) * 1.2 && onUp) {
        didSwipe.current = true;
        buzz();
        onUp();
      }
    },
    [onLeft, onRight, onUp],
  );

  const swiped = useCallback(() => {
    const value = didSwipe.current;
    didSwipe.current = false;
    return value;
  }, []);

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
    followRef,
    swiped,
  };
}
