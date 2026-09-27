import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { initClarity } from './lib/clarity.js';
/* Inter servida desde la propia web, sin Google Fonts: una conexion menos
   antes de pintar texto y ninguna peticion a terceros. Es la variable, un solo
   archivo para todos los pesos, y el navegador baja solo los alfabetos que
   use la pagina (unicode-range). */
import '@fontsource-variable/inter';
import './styles/app.css';

initClarity();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
