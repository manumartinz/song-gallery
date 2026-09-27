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

/** "rgb(176, 145, 90)" -> "b0915a". Lo que no sea un rgb() da null. */
export function rgbToHex(value) {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value || '');
  if (!match) return null;
  return match
    .slice(1, 4)
    .map((channel) => Number(channel).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Imagen vertical de una cancion para historias de Instagram.
 *
 * En el movil va a la hoja de compartir como archivo, que es donde aparece
 * Instagram; donde no se pueden compartir archivos (la compu, casi siempre) se
 * descarga. Devuelve 'shared' | 'downloaded' | 'retry' | 'cancelled' | 'failed'.
 *
 * 'retry' es cosa de Safari: la hoja de compartir exige un toque reciente, y
 * dibujar la imagen tarda un par de segundos. Si la rechaza por eso, la imagen
 * queda guardada y el segundo toque la comparte al instante.
 */
const storyFiles = new Map(); // url -> File, las ya dibujadas en esta visita

export async function shareStory({ kind, id }, track) {
  const url = new URL('/api/story', location.origin);
  url.searchParams.set(kind === 'album' ? 'a' : 'p', id);
  url.searchParams.set('t', track.id);
  const accent = rgbToHex(getComputedStyle(document.documentElement).getPropertyValue('--accent'));
  if (accent) url.searchParams.set('c', accent);

  let blob;
  try {
    const response = await fetch(url);
    if (!response.ok) return 'failed';
    blob = await response.blob();
  } catch {
    return 'failed';
  }

  const name = `${track.title}`.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'cancion';
  const file = new File([blob], `${name}.png`, { type: 'image/png' });

  if (prefersNativeShare() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${track.title} — ${track.artistLine}` });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
      if (error?.name === 'NotAllowedError') return 'retry';
    }
  }

  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  return 'downloaded';
}
