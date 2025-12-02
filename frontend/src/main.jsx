import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';

if (typeof window !== 'undefined') {
  const { hash } = window.location;
  const isRecoveryFlow = hash.includes('type=recovery');
  const alreadyOnReset = hash.includes('/reset-password');

  if (isRecoveryFlow && !alreadyOnReset) {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const tokenFragment = hash.startsWith('#') ? hash.slice(1) : hash;
    window.location.replace(`${baseUrl}#/reset-password#${tokenFragment}`);
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </HashRouter>
  </React.StrictMode>
);
