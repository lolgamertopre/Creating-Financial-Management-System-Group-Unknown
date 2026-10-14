import React from 'react';
import ReactDOM from 'react-dom/client';
import BudgetApp from './Main.jsx';
import './index.css';
import { syncPendingData, ensureDbOpen } from './db.js';

// Pre-initialize database schema safely
ensureDbOpen().catch((err) => console.warn('Dexie early init notice:', err));

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

// Service Worker Management:
// In DEV mode, aggressively purge any active Service Worker to prevent caching/intercepting Vite HMR modules
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().then(() => {
          console.log('[Dev] Unregistered stale service worker:', registration.scope);
        });
      }
    });
    if (typeof caches !== 'undefined') {
      caches.keys().then((keys) => {
        keys.forEach((key) => caches.delete(key));
      });
    }
  } else {
    // In production, register standard Service Worker
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered with scope:', registration.scope);
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
  }

  // Auto-sync whenever internet connectivity is restored
  window.addEventListener('online', () => {
    console.log('Network online. Triggering pending sync...');
    syncPendingData();
  });
}

// High-visibility Error Boundary to prevent blank white screens
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by React ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      if (typeof indexedDB !== 'undefined') {
        indexedDB.deleteDatabase('FinancialManagementDB');
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      }
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        for (const k of keys) await caches.delete(k);
      }
    } finally {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          <div style={{ maxWidth: '600px', width: '100%', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', padding: '32px', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
                ⚠️
              </div>
              <div>
                <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0F172A', margin: 0 }}>Application Startup Notice</h1>
                <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>An unexpected error occurred during rendering.</p>
              </div>
            </div>
            <pre style={{ backgroundColor: '#F1F5F9', padding: '14px', borderRadius: '10px', fontSize: '12px', color: '#DC2626', overflowX: 'auto', maxHeight: '180px', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
              {this.state.error?.toString()}
              {'\n'}
              {this.state.error?.stack}
            </pre>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button
                onClick={() => window.location.reload()}
                style={{ flex: 1, padding: '10px 16px', backgroundColor: '#4F46E5', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
              >
                Reload Page
              </button>
              <button
                onClick={this.handleReset}
                style={{ flex: 1, padding: '10px 16px', backgroundColor: '#EF4444', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
              >
                Reset App & Clear Cache
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BudgetApp />
    </ErrorBoundary>
  </React.StrictMode>
);
