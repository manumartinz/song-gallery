import { useCallback, useEffect, useState } from 'react';

const MINE_KEY = 'song-gallery:reactions';
const CHUNK = 100; // lo que acepta /api/reactions por peticion

function readMine() {
  try {
    const list = JSON.parse(localStorage.getItem(MINE_KEY) || '[]');
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

/**
 * Conteos de reacciones de las canciones abiertas y las de este navegador.
 *
 * `enabled` arranca en null (sin saber) y pasa a false si el servidor dice 204:
 * reacciones apagadas, no se enseña nada. Las propias se guardan como
 * "id:tipo" en el navegador, que es lo que permite deshacerlas.
 */
export default function useReactions(trackIds) {
  const [enabled, setEnabled] = useState(null);
  const [counts, setCounts] = useState({});
  const [mine, setMine] = useState(readMine);

  const idsKey = trackIds.join(',');

  useEffect(() => {
    if (enabled === false || !idsKey) return undefined;
    const controller = new AbortController();
    const ids = idsKey.split(',');

    (async () => {
      for (let i = 0; i < ids.length; i += CHUNK) {
        try {
          const response = await fetch(`/api/reactions?ids=${ids.slice(i, i + CHUNK).join(',')}`, {
            signal: controller.signal,
          });
          if (response.status === 204 || response.status === 503) {
            setEnabled(false);
            return;
          }
          if (!response.ok) return;
          const chunk = await response.json();
          setEnabled(true);
          setCounts((prev) => ({ ...prev, ...chunk }));
        } catch {
          return; // abortado o sin red
        }
      }
    })();

    return () => controller.abort();
  }, [idsKey, enabled]);

  useEffect(() => {
    try {
      localStorage.setItem(MINE_KEY, JSON.stringify([...mine]));
    } catch {
      /* sin persistencia, sigue funcionando en esta sesion */
    }
  }, [mine]);

  /** Marca o desmarca, con el cambio a la vista antes de que conteste. */
  const toggle = useCallback(
    async (id, kind) => {
      const tag = `${id}:${kind}`;
      const undo = mine.has(tag);
      const delta = undo ? -1 : 1;

      setMine((prev) => {
        const next = new Set(prev);
        if (undo) next.delete(tag);
        else next.add(tag);
        return next;
      });
      setCounts((prev) => ({
        ...prev,
        [id]: { ...prev[id], [kind]: Math.max(0, (prev[id]?.[kind] || 0) + delta) },
      }));

      try {
        const response = await fetch('/api/reactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, kind, undo }),
        });
        if (!response.ok) throw new Error(String(response.status));
        const { count } = await response.json();
        setCounts((prev) => ({ ...prev, [id]: { ...prev[id], [kind]: count } }));
      } catch {
        // No entro: se deshace lo que se habia adelantado.
        setMine((prev) => {
          const next = new Set(prev);
          if (undo) next.add(tag);
          else next.delete(tag);
          return next;
        });
        setCounts((prev) => ({
          ...prev,
          [id]: { ...prev[id], [kind]: Math.max(0, (prev[id]?.[kind] || 0) - delta) },
        }));
      }
    },
    [mine],
  );

  return { enabled: enabled === true, counts, mine, toggle };
}
