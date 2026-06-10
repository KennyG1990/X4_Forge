import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Perform auth handshake before rendering the App
async function initAuth() {
  try {
    const res = await fetch('/api/auth/token');
    if (res.ok) {
      const data = await res.json();
      if (data.token) {
        sessionStorage.setItem('studio_session_token', data.token);
      }
    }
  } catch (err) {
    console.error("Auth handshake failed:", err);
  }
}

// Override fetch globally before rendering the app
const originalFetch = window.fetch;
window.fetch = function(input, init) {
  const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
  if (url.includes('/api/') && !url.includes('/api/auth/token')) {
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

initAuth().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
