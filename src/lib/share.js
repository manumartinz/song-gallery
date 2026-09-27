/**
 * Compartir una cancion: el enlace de esta web, no el de Spotify. Abre la
 * misma fuente con la ficha de esa cancion desplegada (el `?t=` que ya
 * entendia la pagina), que es lo que uno quiere mandar: "escucha esta, aqui".
 */

/** Enlace canonico a una cancion dentro de su playlist o album. */
export function trackUrl({ kind, id }, trackId) {
  const url = new URL(location.origin);
  url.searchParams.set(kind === 'album' ? 'a' : 'p', id);
  if (trackId) url.searchParams.set('t', trackId);
  return url.toString();
}

/**
 * La hoja de compartir del sistema solo donde es la costumbre: en tactil. En
 * un escritorio con Windows abre un dialogo que nadie espera, y ahi lo natural
 * es copiar el enlace.
 */
function prefersNativeShare() {
  return (
    typeof navigator.share === 'function' &&
    typeof matchMedia === 'function' &&
    matchMedia('(hover: none)').matches
  );
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* Sin permiso de portapapeles (iframe, http): el truco de siempre. */
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

/**
 * Comparte y devuelve lo que paso, para que quien llama avise:
 * 'shared' | 'copied' | 'cancelled' | 'failed'.
 */
export async function shareLink({ title, text, url }) {
  if (prefersNativeShare()) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
      /* Cualquier otro fallo: se cae al portapapeles. */
    }
  }
  return (await copy(url)) ? 'copied' : 'failed';
}
