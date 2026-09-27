import { useEffect, useRef } from 'react';

/**
 * Escucha el teclado de toda la pagina con el manejador mas reciente.
 *
 * El listener se registra UNA vez y llama siempre a la ultima version de
 * `onKeyDown` a traves de una ref. Antes el efecto dependia de todo lo que el
 * manejador leia —el foco, lo visible, el reproductor— y se desmontaba y
 * volvia a montar con cada uno de esos cambios.
 */
export default function useKeyboard(onKeyDown) {
  const handlerRef = useRef(onKeyDown);
  handlerRef.current = onKeyDown;

  useEffect(() => {
    const listener = (event) => handlerRef.current(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
