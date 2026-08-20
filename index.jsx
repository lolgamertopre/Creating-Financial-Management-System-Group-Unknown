import React from 'react';
import ReactDOM from 'react-dom/client';
import BudgetApp from './Main.jsx';
import './index.css';

// Storage fallback to localStorage so data persists seamlessly in browser
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BudgetApp />
  </React.StrictMode>
);
