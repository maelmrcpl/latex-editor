import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { DialogProvider } from './components/ui/Dialog';
import { initEditorPrefs } from './lib/editorPrefs';
import { initTheme } from './lib/theme';
import './styles.css';

initTheme();
initEditorPrefs();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DialogProvider>
      <App />
    </DialogProvider>
  </React.StrictMode>
);
