import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StoreProvider } from './store';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Application root element is missing');
}

rootElement.dataset.build = '2026.08.08.3';

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </ErrorBoundary>
  </StrictMode>,
);
