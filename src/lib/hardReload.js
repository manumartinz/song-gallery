/**
 * ¿Se ha entrado con una recarga FORZADA (Ctrl+Shift+R)?
 *
 * El navegador no lo cuenta: `navigation.type` dice "reload" tanto para F5
 * como para Ctrl+Shift+R. La unica diferencia observable es la cache, y hay
 * que mirarla con cuidado, porque Vercel sirve los bundles con
 * `max-age=0, must-revalidate`: en F5 tampoco salen de cache a secas, se
 * revalidan. Los tres casos se distinguen comparando los dos tamaños:
 *
 *   cache pura   transferSize 0
 *   304          0 < transferSize < encodedBodySize   (solo viajan cabeceras)
 *   200 de red   transferSize > encodedBodySize       (cabeceras + cuerpo)
 *
 * O sea: hubo recarga forzada si el CUERPO de todo lo propio viajo de verdad.
 *
 * Se filtra por origen porque `transferSize` de un tercero sin
 * Timing-Allow-Origin (las fuentes de Google, las portadas de Spotify) es
 * siempre 0, y por tamaño porque en un fichero de 200 bytes las cabeceras de
 * un 304 ya pesan mas que el cuerpo y darian un falso positivo.
 *
 * Es un heuristico, no una medida: sirve para volver a ver el saludo y el
 * aviso sin ir a borrar las claves a mano, no para nada de lo que dependa la
 * pagina. Cuando falla, falla hacia "no": lo peor que pasa es que no se repita
 * algo que ya se vio una vez.
 */

/* La respuesta se calcula UNA vez y se guarda. Sin esto cada consumidor mira
   una lista de recursos distinta segun cuando pregunte: el saludo se decide en
   el primer render (bundle y hoja de estilos ya cargados, poco mas) y el aviso
   del nav bastante despues, con las llamadas a /api dentro. Que dos partes de
   la misma carga contesten cosas distintas a la misma pregunta seria un error
   dificil de ver. */
let answer = null;

export default function isHardReload() {
  if (answer !== null) return answer;

  try {
    const [nav] = performance.getEntriesByType('navigation');
    if (nav?.type !== 'reload') {
      answer = false;
      return answer;
    }

    const own = performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.startsWith(location.origin) && entry.encodedBodySize > 1024);

    answer = own.length > 0 && own.every((entry) => entry.transferSize > entry.encodedBodySize);
  } catch {
    answer = false; // navegador sin Resource Timing: cada cosa se ve una vez y ya
  }

  return answer;
}
