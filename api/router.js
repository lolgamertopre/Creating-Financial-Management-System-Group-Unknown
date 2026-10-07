import { serverStore } from './store.js';
import { getLiveExchangeRates, convertCurrency } from './ratesService.js';
import { analyzeFinancialHealth, smartCategorize } from './aiService.js';

// Helper to parse JSON body from request
async function parseBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                resolve({});
            }
        });
    });
}

// Helper to send JSON response
function sendJson(res, statusCode, data) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.end(JSON.stringify(data));
}

export async function handleApiRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost:5173'}`);
    const pathname = url.pathname;
    const method = req.method.toUpperCase();

    // Handle preflight CORS
    if (method === 'OPTIONS') {
        res.statusCode = 204;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.end();
        return true;
    }

    // Only process /api routes
    if (!pathname.startsWith('/api')) {
        return false;
    }

    try {
        // 1. HEALTH CHECK: GET /api/health
        if (pathname === '/api/health' && method === 'GET') {
            const expenses = serverStore.getExpenses();
            const incomes = serverStore.getIncomes();
            const savings = serverStore.getSavings();

            return sendJson(res, 200, {
                status: 'healthy',
                version: '2.0.0',
                appName: 'Pocketwise Financial Management API',
                serverTime: new Date().toISOString(),
                uptimeSeconds: Math.floor(process.uptime()),
                database: {
                    type: 'JSON Persistent Store',
                    expensesCount: expenses.length,
                    incomesCount: incomes.length,
                    savingsCount: savings.length,
                },
                endpoints: [
                    'GET /api/health',
                    'POST /api/sync',
                    'GET /api/summary',
                    'GET,POST,PUT,DELETE /api/expenses',
                    'GET,POST,PUT,DELETE /api/incomes',
                    'GET,POST,PUT,DELETE /api/savings',
                    'GET,POST /api/budgets',
                    'POST /api/auth/login',
                    'GET /api/rates',
                    'POST /api/ai/advisor',
                    'POST /api/ai/categorize',
                ],
            });
        }

        // 2. BATCH 2-WAY SYNC: POST /api/sync
        if (pathname === '/api/sync' && method === 'POST') {
            const body = await parseBody(req);
            const syncResult = serverStore.syncBatch(body);
            return sendJson(res, 200, syncResult);
        }

        // 3. FINANCIAL SUMMARY: GET /api/summary
        if (pathname === '/api/summary' && method === 'GET') {
            const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
            const expenses = serverStore.getExpenses();
            const incomes = serverStore.getIncomes();
            const savings = serverStore.getSavings();
            const budgets = serverStore.getBudgets(month);

            const totalIncome = incomes.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
            const totalExpenses = expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
            const totalSavings = savings.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
            const remainingBalance = totalIncome - totalExpenses;

            return sendJson(res, 200, {
                month,
                totalIncome,
                totalExpenses,
                totalSavings,
                remainingBalance,
                expensesCount: expenses.length,
                incomesCount: incomes.length,
                savingsCount: savings.length,
                budgetsCount: budgets.length,
                updatedAt: new Date().toISOString(),
            });
        }

        // 4. LIVE CURRENCY EXCHANGE RATES: GET /api/rates
        if (pathname === '/api/rates' && method === 'GET') {
            const base = url.searchParams.get('base') || 'PHP';
            const ratesData = await getLiveExchangeRates(base);
            return sendJson(res, 200, ratesData);
        }

        // 5. CURRENCY CONVERT: GET /api/rates/convert?amount=100&from=USD&to=PHP
        if (pathname === '/api/rates/convert' && method === 'GET') {
            const amount = parseFloat(url.searchParams.get('amount') || '0');
            const from = (url.searchParams.get('from') || 'USD').toUpperCase();
            const to = (url.searchParams.get('to') || 'PHP').toUpperCase();
            const ratesData = await getLiveExchangeRates('PHP');
            const converted = convertCurrency(amount, from, to, ratesData);
            return sendJson(res, 200, {
                amount,
                from,
                to,
                convertedAmount: converted,
                rate: converted / (amount || 1),
            });
        }

        // 6. AI FINANCIAL ADVISOR: POST /api/ai/advisor
        if (pathname === '/api/ai/advisor' && (method === 'POST' || method === 'GET')) {
            const body = method === 'POST' ? await parseBody(req) : {};
            const expenses = body.expenses || serverStore.getExpenses();
            const incomes = body.incomes || serverStore.getIncomes();
            const savings = body.savings || serverStore.getSavings();
            const budgets = body.budgets || serverStore.getBudgets();
            const client = body.client || serverStore.getClient();

            const analysis = analyzeFinancialHealth({
                expenses,
                incomes,
                savings,
                budgets,
                client,
                month: body.month,
            });

            return sendJson(res, 200, {
                status: 'success',
                analysis,
            });
        }

        // 7. AI SMART CATEGORIZE & RECEIPT PARSER: POST /api/ai/categorize
        if (pathname === '/api/ai/categorize' && method === 'POST') {
            const body = await parseBody(req);
            const text = body.text || body.query || body.receiptText || '';
            const result = smartCategorize(text);
            return sendJson(res, 200, result);
        }

        // 8. EXPENSES REST CRUD: /api/expenses
        if (pathname === '/api/expenses') {
            if (method === 'GET') {
                return sendJson(res, 200, { expenses: serverStore.getExpenses() });
            }
            if (method === 'POST') {
                const body = await parseBody(req);
                const created = serverStore.addExpense(body);
                return sendJson(res, 201, created);
            }
        }
        if (pathname.startsWith('/api/expenses/')) {
            const id = pathname.replace('/api/expenses/', '');
            if (method === 'PUT') {
                const body = await parseBody(req);
                const updated = serverStore.updateExpense(id, body);
                if (!updated) return sendJson(res, 404, { error: 'Expense not found' });
                return sendJson(res, 200, updated);
            }
            if (method === 'DELETE') {
                const deleted = serverStore.deleteExpense(id);
                if (!deleted) return sendJson(res, 404, { error: 'Expense not found' });
                return sendJson(res, 200, { success: true, deletedId: id });
            }
        }

        // 9. INCOMES REST CRUD: /api/incomes
        if (pathname === '/api/incomes') {
            if (method === 'GET') {
                return sendJson(res, 200, { incomes: serverStore.getIncomes() });
            }
            if (method === 'POST') {
                const body = await parseBody(req);
                const created = serverStore.addIncome(body);
                return sendJson(res, 201, created);
            }
        }
        if (pathname.startsWith('/api/incomes/')) {
            const id = pathname.replace('/api/incomes/', '');
            if (method === 'PUT') {
                const body = await parseBody(req);
                const updated = serverStore.updateIncome(id, body);
                if (!updated) return sendJson(res, 404, { error: 'Income not found' });
                return sendJson(res, 200, updated);
            }
            if (method === 'DELETE') {
                const deleted = serverStore.deleteIncome(id);
                if (!deleted) return sendJson(res, 404, { error: 'Income not found' });
                return sendJson(res, 200, { success: true, deletedId: id });
            }
        }

        // 10. SAVINGS REST CRUD: /api/savings
        if (pathname === '/api/savings') {
            if (method === 'GET') {
                return sendJson(res, 200, { savings: serverStore.getSavings() });
            }
            if (method === 'POST') {
                const body = await parseBody(req);
                const created = serverStore.addSavings(body);
                return sendJson(res, 201, created);
            }
        }
        if (pathname.startsWith('/api/savings/')) {
            const id = pathname.replace('/api/savings/', '');
            if (method === 'PUT') {
                const body = await parseBody(req);
                const updated = serverStore.updateSavings(id, body);
                if (!updated) return sendJson(res, 404, { error: 'Savings not found' });
                return sendJson(res, 200, updated);
            }
            if (method === 'DELETE') {
                const deleted = serverStore.deleteSavings(id);
                if (!deleted) return sendJson(res, 404, { error: 'Savings not found' });
                return sendJson(res, 200, { success: true, deletedId: id });
            }
        }

        // 11. BUDGETS: /api/budgets
        if (pathname === '/api/budgets') {
            if (method === 'GET') {
                const month = url.searchParams.get('month');
                return sendJson(res, 200, { budgets: serverStore.getBudgets(month) });
            }
            if (method === 'POST') {
                const body = await parseBody(req);
                const updated = serverStore.setBudget(body.category_id, body.budget_amount, body.month);
                return sendJson(res, 200, updated);
            }
        }

        // 12. CLIENT PROFILE & AUTH: /api/auth
        if (pathname === '/api/auth/login' && method === 'POST') {
            const body = await parseBody(req);
            const authResult = serverStore.verifyAuth(body.username, body.password);
            return sendJson(res, authResult.authenticated ? 200 : 401, authResult);
        }
        if (pathname === '/api/auth/profile') {
            if (method === 'GET') {
                return sendJson(res, 200, { client: serverStore.getClient() });
            }
            if (method === 'PUT') {
                const body = await parseBody(req);
                const updated = serverStore.updateClient(body);
                return sendJson(res, 200, { client: updated });
            }
        }

        // 13. AUDIT LOGS: /api/audit-logs
        if (pathname === '/api/audit-logs' && method === 'GET') {
            return sendJson(res, 200, { auditLogs: serverStore.getAuditLogs() });
        }

        // 14. RESET DATABASE: POST /api/reset
        if (pathname === '/api/reset' && method === 'POST') {
            const fresh = serverStore.reset();
            return sendJson(res, 200, { success: true, message: 'Database reset to demo defaults', fresh });
        }

        // Unknown /api route
        sendJson(res, 404, { error: 'API route not found', requestedPath: pathname });
        return true;
    } catch (err) {
        console.error('API Router Error:', err);
        sendJson(res, 500, { error: 'Internal Server Error', message: err.message });
        return true;
    }
}
