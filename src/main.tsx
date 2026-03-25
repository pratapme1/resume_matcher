import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Feature flag: VITE_LEGACY_UI=true reverts to old violet/zinc design
if (import.meta.env.VITE_LEGACY_UI === 'true') {
  document.documentElement.classList.add('legacy-ui');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
