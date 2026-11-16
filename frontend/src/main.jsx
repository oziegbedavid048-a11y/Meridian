import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import './styles/base.css';
import './styles/layout.css';
import './styles/sections.css';
import './styles/pages.css';
import './styles/terminal.css';
import './styles/mt.css';
import './styles/mx.css';
import './styles/trade.css';
import './styles/funding.css';
import './styles/verify.css';
import './styles/mock.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
