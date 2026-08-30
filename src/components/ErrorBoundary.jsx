import { Component } from 'react';

/**
 * Ultima red de seguridad: hasta ahora, un fallo de render dejaba la pagina en
 * blanco sin explicar nada. Tiene que ser un componente de clase porque
 * componentDidCatch no existe en los hooks.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[song-gallery] fallo de render:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="state">
        <h2 className="state__title">Algo se rompió</h2>
        <p className="state__body">
          La galería dejó de responder. Recargar suele bastar; si vuelve a pasar, el detalle
          concreto está en la consola del navegador.
        </p>
        <div className="state__form">
          <button type="button" className="state__button" onClick={() => location.reload()}>
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
