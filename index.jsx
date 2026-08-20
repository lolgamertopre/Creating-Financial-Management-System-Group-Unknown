import React from 'react';
import ReactDOM from 'react-dom/client';
import BudgetApp from './Main.jsx';
import './index.css';
import { syncPendingData } from './db.js';

// Storage fallback to localStorage so legacy fallback continues working seamlessly
if (typeof window !== 'undefined' && !window.storage) {
  window.storage = {
    get: async (key) => {
      try {
        const value = localStorage.getItem(key);
        return value !== null ? { value } : null;
      } catch (err) {
        console.error('Storage get error:', err);
        return null;
      }
    },
    set: async (key, value) => {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (err) {
        console.error('Storage set error:', err);
        throw err;
      }
    },
  };
}

// Register Service Worker for PWA and Background Sync
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered with scope:', registration.scope);

        // Listen for messages from Service Worker (e.g. background sync triggers)
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'TRIGGER_BACKGROUND_SYNC') {
            syncPendingData();
          }
        });
      })
      .catch((error) => {
        console.warn('Service Worker registration failed:', error);
      });
  });

  // Auto-sync whenever internet connectivity is restored
  window.addEventListener('online', () => {
    console.log('Network online. Triggering pending sync...');
    syncPendingData();
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BudgetApp />
  </React.StrictMode>
);
