import useMediaQuery from './useMediaQuery.js';

/** true si el usuario pidio reducir el movimiento en su sistema. */
export default function useReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
