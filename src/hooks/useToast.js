import { useCallback, useEffect, useRef, useState } from 'react';

const TOAST_MS = 2600;

/**
 * Un aviso breve abajo de la pantalla ("Link copiado"). Uno a la vez: el nuevo
 * reemplaza al anterior y reinicia su cuenta atras.
 *
 * `id` cambia con cada aviso aunque el texto se repita, para que el componente
 * vuelva a animar la entrada al copiar dos veces seguidas.
 */
export default function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(0);

  const notify = useCallback((text) => {
    clearTimeout(timerRef.current);
    setToast({ text, id: Date.now() });
    timerRef.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return [toast, notify];
}
