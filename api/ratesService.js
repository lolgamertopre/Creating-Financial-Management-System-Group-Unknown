// Live Currency Exchange Rate & Multi-Currency Conversion Engine
let ratesCache = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes cache

// Highly accurate baseline rates against Philippine Peso (PHP)
const FALLBACK_PHP_RATES = {
    PHP: 1.0,
    USD: 0.0171, // 1 USD ≈ 58.48 PHP
    EUR: 0.0157, // 1 EUR ≈ 63.69 PHP
    GBP: 0.0131, // 1 GBP ≈ 76.33 PHP
    JPY: 2.58,   // 1 JPY ≈ 0.388 PHP (100 JPY ≈ 38.8 PHP)
    SGD: 0.0225, // 1 SGD ≈ 44.44 PHP
    AUD: 0.0256, // 1 AUD ≈ 39.06 PHP
    CAD: 0.0233, // 1 CAD ≈ 42.92 PHP
    HKD: 0.133,  // 1 HKD ≈ 7.52 PHP
    CNY: 0.124,  // 1 CNY ≈ 8.06 PHP
    KRW: 23.6,   // 1 KRW ≈ 0.042 PHP
    THB: 0.58,   // 1 THB ≈ 1.72 PHP
    MYR: 0.076,  // 1 MYR ≈ 13.15 PHP
    AED: 0.0628, // 1 AED ≈ 15.92 PHP
    SAR: 0.0641, // 1 SAR ≈ 15.60 PHP
};

export async function getLiveExchangeRates(baseCurrency = 'PHP') {
    const now = Date.now();
    const base = baseCurrency.toUpperCase();

    // Return cache if fresh and matching base
    if (ratesCache && ratesCache.base === base && now - lastFetchTime < CACHE_TTL_MS) {
        return ratesCache;
    }

    let fetchedRates = null;
    let provider = 'live-exchange-api';

    // Try primary public free rate API (open.er-api.com - no key required, very high uptime)
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Pocketwise-BudgetApp/2.0' },
        });
        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            if (data && data.rates) {
                fetchedRates = data.rates;
                provider = 'open-er-api';
            }
        }
    } catch (err) {
        // Try secondary provider (Frankfurter)
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const res2 = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}`, {
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (res2.ok) {
                const data2 = await res2.json();
                if (data2 && data2.rates) {
                    fetchedRates = { ...data2.rates, [base]: 1.0 };
                    provider = 'frankfurter-api';
                }
            }
        } catch {
            // Both remote providers failed or offline, fall back to built-in rates
            provider = 'fallback-cached';
        }
    }

    // Merge with fallback rates if missing or failed
    const rates = fetchedRates ? { ...FALLBACK_PHP_RATES, ...fetchedRates } : FALLBACK_PHP_RATES;

    // Calculate reverse rates (how much 1 foreign unit costs in PHP)
    const phpEquivalents = {};
    const phpRate = rates['PHP'] || 1.0;
    for (const [curr, r] of Object.entries(rates)) {
        if (curr === 'PHP') {
            phpEquivalents['PHP'] = 1.0;
        } else if (r > 0) {
            phpEquivalents[curr] = Number((phpRate / r).toFixed(4));
        }
    }

    ratesCache = {
        base,
        status: 'success',
        provider,
        timestamp: new Date().toISOString(),
        rates,
        phpEquivalents,
        popularCurrencies: [
            { code: 'USD', name: 'US Dollar', symbol: '$', rateToPhp: phpEquivalents['USD'] || 58.48, flag: '🇺🇸' },
            { code: 'EUR', name: 'Euro', symbol: '€', rateToPhp: phpEquivalents['EUR'] || 63.69, flag: '🇪🇺' },
            { code: 'JPY', name: 'Japanese Yen', symbol: '¥', rateToPhp: phpEquivalents['JPY'] || 0.388, flag: '🇯🇵' },
            { code: 'GBP', name: 'British Pound', symbol: '£', rateToPhp: phpEquivalents['GBP'] || 76.33, flag: '🇬🇧' },
            { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', rateToPhp: phpEquivalents['SGD'] || 44.44, flag: '🇸🇬' },
            { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', rateToPhp: phpEquivalents['AUD'] || 39.06, flag: '🇦🇺' },
            { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', rateToPhp: phpEquivalents['CAD'] || 42.92, flag: '🇨🇦' },
            { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', rateToPhp: phpEquivalents['HKD'] || 7.52, flag: '🇭🇰' },
            { code: 'AED', name: 'UAE Dirham', symbol: 'AED', rateToPhp: phpEquivalents['AED'] || 15.92, flag: '🇦🇪' },
            { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR', rateToPhp: phpEquivalents['SAR'] || 15.60, flag: '🇸🇦' },
        ],
    };

    lastFetchTime = now;
    return ratesCache;
}

export function convertCurrency(amount, fromCurrency, toCurrency, ratesData) {
    const val = Number(amount) || 0;
    if (fromCurrency === toCurrency) return val;

    const rates = ratesData?.rates || FALLBACK_PHP_RATES;
    const fromRate = rates[fromCurrency.toUpperCase()] || 1;
    const toRate = rates[toCurrency.toUpperCase()] || 1;

    // Convert from source to base, then to target
    const inBase = val / fromRate;
    return Number((inBase * toRate).toFixed(2));
}
