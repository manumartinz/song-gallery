/**
 * Microsoft Clarity: heatmaps, grabaciones y eventos propios.
 *
 * Solo arranca en produccion y con `VITE_CLARITY_ID` definido, asi que ni
 * `npm run dev` ni un build sin ID graban nada. El modo sin cookies se decide en
 * el panel de Clarity (Settings > Setup > Advanced), no aqui.
 *
 * Clarity no oye el audio ni ve el <canvas> del fondo: por eso los eventos. Todo
 * va en try/catch porque un bloqueador de anuncios nunca debe tumbar la app.
 */
import Clarity from '@microsoft/clarity';

let ready = false;

export function initClarity() {
  const id = import.meta.env.VITE_CLARITY_ID;
  if (!import.meta.env.PROD || !id) return;
  try {
    Clarity.init(id);
    ready = true;
  } catch {
    /* bloqueado: la app sigue igual */
  }
}

export function track(name) {
  if (!ready) return;
  try {
    Clarity.event(name);
  } catch {
    /* idem */
  }
}

export function tag(key, value) {
  if (!ready) return;
  try {
    Clarity.setTag(key, String(value));
  } catch {
    /* idem */
  }
}

/** Pide a Clarity que conserve esta grabacion aunque muestree. */
export function flagSession(reason) {
  if (!ready) return;
  try {
    Clarity.upgrade(reason);
  } catch {
    /* idem */
  }
}
