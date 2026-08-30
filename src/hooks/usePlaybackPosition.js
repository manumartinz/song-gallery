import { useEffect, useState } from 'react';

/**
 * Posicion de reproduccion en segundos, por suscripcion.
 *
 * A proposito NO baja como prop desde App. Se refresca 20 veces por segundo, y
 * hacerla pasar por el estado de App re-renderizaba el arbol entero a esa
 * frecuencia: App -> la vista -> las N filas. Aunque las filas esten memoizadas
 * y no toquen el DOM, reconstruir doscientos elementos y comparar sus props
 * veinte veces por segundo se come el hilo principal, y los hovers (110 ms)
 * empiezan a llegar tarde.
 *
 * Suscribiendose aqui, lo unico que se repinta es quien de verdad la enseña.
 */
export default function usePlaybackPosition(subscribe) {
  const [position, setPosition] = useState(0);

  useEffect(() => {
    if (!subscribe) return undefined;
    return subscribe(setPosition);
  }, [subscribe]);

  return position;
}
