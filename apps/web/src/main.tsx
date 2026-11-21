import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { DialogProvider } from './components/ui/Dialog';
import { initTheme } from './lib/theme';
import './styles.css';

initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DialogProvider>
      <App />
    </DialogProvider>
  </React.StrictMode>
);
