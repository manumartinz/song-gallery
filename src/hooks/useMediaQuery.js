import { useEffect, useState } from 'react';

/**
 * true mientras la media query coincida, reaccionando a los cambios.
 *
 * Existe para lo que el CSS no puede resolver solo: cuando en movil hace falta
 * un ARBOL distinto (un desplegable en vez de una tira de pestañas) y no basta
 * con repintar el mismo marcado de otra manera.
 */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof matchMedia === 'function' && matchMedia(query).matches,
  );

  useEffect(() => {
    const list = matchMedia(query);
    // Por si el ancho cambio entre el primer render y este efecto.
    setMatches(list.matches);

    const onChange = (event) => setMatches(event.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
