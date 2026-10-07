/**
 * Client-side API Service for Pocketwise Financial Management System
 * Handles communication with backend REST endpoints, live rates, and AI intelligence.
 */

const API_BASE = '/api';

/**
 * Check if the backend API server is online and measure latency
 */
export async function checkApiHealth() {
    const start = performance.now();
    try {
        const res = await fetch(`${API_BASE}/health`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
        });
        const latency = Math.round(performance.now() - start);
        if (res.ok) {
            const data = await res.json();
            return {
                online: true,
                latency,
                data,
            };
        }
        return { online: false, latency, error: `HTTP ${res.status}` };
    } catch (err) {
        return { online: false, latency: Math.round(performance.now() - start), error: err.message };
    }
}

/**
 * Fetch live currency exchange rates with Philippine Peso (PHP) base
 */
export async function fetchLiveExchangeRates(base = 'PHP') {
    try {
        const res = await fetch(`${API_BASE}/rates?base=${encodeURIComponent(base)}`, {
            headers: { 'Accept': 'application/json' },
        });
        if (res.ok) {
            return await res.json();
        }
    } catch (err) {
        console.warn('API rates fetch failed, using cached fallbacks:', err.message);
    }
    // Fallback baseline rates if server offline
    return {
        base: 'PHP',
        status: 'fallback',
        popularCurrencies: [
            { code: 'USD', name: 'US Dollar', symbol: '$', rateToPhp: 58.48, flag: '🇺🇸' },
            { code: 'EUR', name: 'Euro', symbol: '€', rateToPhp: 63.69, flag: '🇪🇺' },
            { code: 'JPY', name: 'Japanese Yen', symbol: '¥', rateToPhp: 0.388, flag: '🇯🇵' },
            { code: 'GBP', name: 'British Pound', symbol: '£', rateToPhp: 76.33, flag: '🇬🇧' },
            { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', rateToPhp: 44.44, flag: '🇸🇬' },
            { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', rateToPhp: 39.06, flag: '🇦🇺' },
        ],
    };
}

/**
 * Request AI Financial Health Diagnosis & Insights
 */
export async function getAIFinancialAnalysis(financialState) {
    try {
        const res = await fetch(`${API_BASE}/ai/advisor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(financialState),
        });
        if (res.ok) {
            const data = await res.json();
            return data.analysis;
        }
    } catch (err) {
        console.warn('AI Advisor API call failed, generating local fallback:', err.message);
    }
    return null;
}

/**
 * Parse natural language text, receipt OCR, or SMS into structured transaction data
 */
export async function smartParseExpenseWithAI(text) {
    if (!text || !text.trim()) return null;
    try {
        const res = await fetch(`${API_BASE}/ai/categorize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        if (res.ok) {
            return await res.json();
        }
    } catch (err) {
        console.warn('Smart Categorize API failed:', err.message);
    }
    return null;
}

/**
 * Perform bidirectional batch synchronization with backend server
 */
export async function syncBatchWithServer(payload) {
    try {
        const res = await fetch(`${API_BASE}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (res.ok) {
            return await res.json();
        }
        return { success: false, status: res.status };
    } catch (err) {
        return { success: false, error: err.message };
    }
}
