import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    __STUDIO_API_TOKEN__?: string;
  }
}

const injectedToken = window.__STUDIO_API_TOKEN__;
if (injectedToken) {
  sessionStorage.setItem('studio_session_token', injectedToken);
}

// Override fetch globally before rendering the app
const originalFetch = window.fetch;
window.fetch = function(input, init) {
  const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
  if (url.includes('/api/')) {
    const token = sessionStorage.getItem('studio_session_token');
    if (token) {
      init = init || {};
      init.headers = init.headers || {};
      if (init.headers instanceof Headers) {
        init.headers.set('Authorization', `Bearer ${token}`);
      } else if (Array.isArray(init.headers)) {
        const authIdx = init.headers.findIndex(([k]) => k.toLowerCase() === 'authorization');
        if (authIdx !== -1) {
          init.headers[authIdx] = ['Authorization', `Bearer ${token}`];
        } else {
          init.headers.push(['Authorization', `Bearer ${token}`]);
        }
      } else {
        (init.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
      }
    }
  }
  return originalFetch.call(this, input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
