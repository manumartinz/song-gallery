import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Admin from './Admin.jsx';
/* Su propia entrada de Vite: quien visita la galería no descarga nada de esto,
   y esto no carga nada de la galería más que los tokens y la fuente. */
import '@fontsource-variable/inter';
import './admin.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Admin />
  </StrictMode>,
);
