import { useCallback, useRef } from 'react';

/**
 * Guarda una referencia a cada fila o celda por su indice, para poder
 * centrarla en pantalla mas tarde.
 *
 * Sustituye al antiguo useCenterAnchor: ya no hace falta vigilar que cancion
 * esta en el centro del viewport, porque el fondo y la ficha los manda ahora
 * la cancion que suena, no el scroll. Solo queda el mapa y el scrollTo, que
 * usan el avance automatico, el boton de aleatorio y el teclado.
 *
 * Las dos vistas (lista y cuadricula) registran sus nodos aqui, asi que
 * centrar una cancion funciona igual en ambas.
 */
export default function useRowRegistry() {
  const nodesRef = useRef(new Map());

  const register = useCallback((index, node) => {
    if (node) nodesRef.current.set(index, node);
    else nodesRef.current.delete(index);
  }, []);

  const scrollTo = useCallback((index, behavior = 'smooth') => {
    nodesRef.current.get(index)?.scrollIntoView({ behavior, block: 'center' });
  }, []);

  /** El nodo de una fila, o undefined si no esta montada (filtrada fuera). */
  const getNode = useCallback((index) => nodesRef.current.get(index), []);

  return { register, scrollTo, getNode };
}
