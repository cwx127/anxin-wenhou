import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearDemoStorage } from '../storage';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  failed: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The public MVP deliberately avoids transmitting error or user data.
  }

  private reset = () => {
    clearDemoStorage();
    window.location.reload();
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="error-page">
        <section className="error-panel" aria-labelledby="error-title">
          <span className="error-mark"><ShieldCheck aria-hidden="true" /></span>
          <AlertTriangle className="error-icon" aria-hidden="true" />
          <h1 id="error-title">演示数据暂时无法读取</h1>
          <p>页面没有上传任何内容。恢复初始演示数据后即可继续体验。</p>
          <button className="button button-primary button-large" onClick={this.reset}>
            <RefreshCw aria-hidden="true" />恢复演示
          </button>
        </section>
      </main>
    );
  }
}
