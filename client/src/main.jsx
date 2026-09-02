import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/index.css';

// Matches vite.config.js's production base path so routing works under
// GitHub Pages' /approvals/ subpath; local dev serves from the root instead.
const basename = import.meta.env.PROD ? '/approvals' : '/';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
