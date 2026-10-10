import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { CampusZoneProvider } from './context/CampusZoneContext.jsx';
import { MembershipProvider } from './context/MembershipContext.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <MembershipProvider>
        <CampusZoneProvider>
          <App />
        </CampusZoneProvider>
      </MembershipProvider>
    </AuthProvider>
  </React.StrictMode>
);
