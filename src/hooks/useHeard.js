import { useCallback, useEffect, useState } from 'react';

const HEARD_KEY = 'song-gallery:heard';
/* Tope de ids guardados. De sobra para todo lo que hay en la web; con él, la
   lista no crece sin fin en el navegador de quien pegue muchas playlists. Se
   quedan los más recientes. */
const MAX_HEARD = 3000;

function readHeard() {
  try {
    const list = JSON.parse(localStorage.getItem(HEARD_KEY) || '[]');
    return new Set(Array.isArray(list) ? list.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Las canciones que este visitante ya escuchó, por id de pista.
 *
 * Es para él, no para mí: sirve para ver de un vistazo qué le falta descubrir.
 * Vive en su navegador y no viaja a ninguna parte.
 */
export default function useHeard() {
  const [heard, setHeard] = useState(readHeard);

  const markHeard = useCallback((id) => {
    if (!id) return;
    setHeard((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  /* Se guarda aquí y no en el updater, por lo de siempre: React puede
     invocarlo dos veces. */
  useEffect(() => {
    try {
      const list = [...heard];
      localStorage.setItem(HEARD_KEY, JSON.stringify(list.slice(-MAX_HEARD)));
    } catch {
      /* sin persistencia, sigue funcionando en esta sesion */
    }
  }, [heard]);

  return [heard, markHeard];
}
