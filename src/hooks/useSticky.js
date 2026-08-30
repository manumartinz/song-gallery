import { useEffect, useState } from 'react';

/**
 * Detecta cuando un centinela sale de pantalla por arriba.
 *
 * Devuelve [ref, stuck]: se coloca `ref` en un div justo debajo del titulo y
 * `stuck` pasa a true cuando ese punto queda por encima del viewport, momento
 * en que la barra superior muestra el titulo de la playlist.
 *
 * `ref` es una ref de callback (estado, no useRef) para que el observer se
 * enganche cuando el centinela aparece, que ocurre despues del primer render.
 */
export default function useSticky() {
  const [node, setNode] = useState(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setNode, stuck];
}
