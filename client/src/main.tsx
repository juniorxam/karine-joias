import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";

type Props = { children: ReactNode };
type State = { hasError: boolean; message?: string };

class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Violetta: erro não tratado na interface", error, info);
    this.setState({ hasError: true, message: error.message });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand auth-brand">
            <div className="brand-mark">V</div>
            <div><strong>Violetta</strong><span>JOIAS E SEMIJOIAS</span></div>
          </div>
          <p className="eyebrow">OPS</p>
          <h1>Algo saiu do lugar.</h1>
          <p className="auth-description">
            A página encontrou um erro inesperado. Tente recarregar; seus dados salvos no servidor permanecem protegidos.
          </p>
          {this.state.message && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#8b3a3a" }}>{this.state.message}</pre>}
          <button className="primary auth-submit" onClick={() => window.location.reload()}>
            Recarregar página
          </button>
        </section>
      </main>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
    <Toaster position="bottom-right" />
  </AppErrorBoundary>,
);
