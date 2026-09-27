/**
 * Inter para las imágenes que dibuja @vercel/og, la misma letra de la web.
 *
 * Satori no lee WOFF2, así que van los WOFF de @fontsource desde jsDelivr. Se
 * piden una vez por instancia y quedan en memoria; si fallan, la imagen sale
 * con la letra por defecto de @vercel/og en vez de no salir.
 */
const BASE = 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/inter-latin';

let pending = null;

export function loadInter() {
  if (!pending) {
    pending = Promise.all(
      [400, 600, 700].map(async (weight) => {
        const response = await fetch(`${BASE}-${weight}-normal.woff`);
        if (!response.ok) throw new Error(`Inter ${weight}: ${response.status}`);
        return { name: 'Inter', data: await response.arrayBuffer(), weight, style: 'normal' };
      }),
    ).catch(() => {
      pending = null; // que la siguiente lo vuelva a intentar
      return undefined;
    });
  }
  return pending;
}
