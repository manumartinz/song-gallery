import { useEffect, useState } from 'react';

/**
 * Devuelve [ref, visible]: `visible` pasa a true la primera vez que el
 * elemento asoma en pantalla, y ya no vuelve atras.
 *
 * Hace falta porque el footer existe en el DOM desde el primer render: una
 * animacion CSS a secas se dispararia nada mas cargar, mucho antes de que el
 * usuario llegue abajo.
 *
 * `ref` es una ref de callback (estado, no useRef) para que el observer se
 * enganche en cuanto el nodo aparece.
 */
export default function useInView({ rootMargin = '0px 0px -12% 0px' } = {}) {
  const [node, setNode] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!node || visible) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { rootMargin, threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [node, visible, rootMargin]);

  return [setNode, visible];
}
