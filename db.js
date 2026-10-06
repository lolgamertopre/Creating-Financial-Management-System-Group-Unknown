import Dexie from 'dexie';

export const db = new Dexie('FinancialManagementDB');

// Define database schema matching SRS Section 2.5 and ERD
db.version(2).stores({
    clients: 'client_id, username',
    categories: 'category_id, category_name',
    incomes: 'income_id, client_id, source, date, isDeleted, syncStatus',
    expenses: 'expense_id, client_id, category_id, date, isDeleted, syncStatus',
    budgets: 'budget_id, client_id, category_id, month',
    savings: 'savings_id, owner_id, date, isDeleted, syncStatus',
    transactions: 'id, date, kind, name, syncStatus, isDeleted',
    auditLogs: 'logId, timestamp, action, syncStatus',
    meta: 'key',
});

// Default SRS categories
export const SRS_CATEGORIES = [
    {
        category_id: 'food',
        category_name: 'Food',
        emoji: '🛒',
        color: '#F97316',
        bg: '#FFF7ED',
        arrowBg: '#FFEDD5',
        arrowColor: '#EA580C',
        defaultBudget: 5000,
    },
    {
        category_id: 'transport',
        category_name: 'Transportation',
        shortName: 'Transport',
        emoji: '🚌',
        color: '#06B6D4',
        bg: '#ECFEFF',
        arrowBg: '#CFFAFE',
        arrowColor: '#0891B2',
        defaultBudget: 2000,
    },
    {
        category_id: 'bills',
        category_name: 'Bills',
        emoji: '⚡',
        color: '#EF4444',
        bg: '#FEF2F2',
        arrowBg: '#FEE2E2',
        arrowColor: '#DC2626',
        defaultBudget: 3000,
    },
    {
        category_id: 'medicine',
        category_name: 'Medicine',
        emoji: '💊',
        color: '#10B981',
        bg: '#ECFDF5',
        arrowBg: '#D1FAE5',
        arrowColor: '#059669',
        defaultBudget: 1500,
    },
    {
        category_id: 'shopping',
        category_name: 'Shopping',
        emoji: '🛍️',
        color: '#8B5CF6',
        bg: '#F5F3FF',
        arrowBg: '#EDE9FE',
        arrowColor: '#7C3AED',
        defaultBudget: 1500,
    },
    {
        category_id: 'personal',
        category_name: 'Personal Needs',
        shortName: 'Personal',
        emoji: '🧴',
        color: '#EC4899',
        bg: '#FDF2F8',
        arrowBg: '#FCE7F3',
        arrowColor: '#DB2777',
        defaultBudget: 2000,
    },
    {
        category_id: 'others',
        category_name: 'Others',
        emoji: '🏷️',
        color: '#64748B',
        bg: '#F8FAFC',
        arrowBg: '#F1F5F9',
        arrowColor: '#475569',
        defaultBudget: 1000,
    },
];

export const INCOME_SOURCES = [
    { id: 'salary', name: 'Salary', emoji: '💼' },
    { id: 'business', name: 'Business income', emoji: '📈' },
    { id: 'allowance', name: 'Allowance', emoji: '💵' },
    { id: 'other_income', name: 'Other income', emoji: '✨' },
];

// Initialize default seed data matching SRS requirements and Screenshot demo
export async function initDatabaseDefaults() {
    // 1. Check client
    const clientCount = await db.clients.count();
    if (clientCount === 0) {
        await db.clients.put({
            client_id: 'client_1',
            name: 'Maria (Client / Mother)',
            username: 'mother',
            password: 'password123',
        });
    }

    // 2. Check categories
    for (const cat of SRS_CATEGORIES) {
        const existing = await db.categories.get(cat.category_id);
        if (!existing) {
            await db.categories.put(cat);
        }
    }

    // 3. Check Budgets
    const budgetCount = await db.budgets.count();
    if (budgetCount === 0) {
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        for (const cat of SRS_CATEGORIES) {
            await db.budgets.put({
                budget_id: `budget_${cat.category_id}_${currentMonth}`,
                client_id: 'client_1',
                category_id: cat.category_id,
                budget_amount: cat.defaultBudget,
                month: currentMonth,
            });
        }
    }

    // 4. Seed default sample data if completely empty (matches screenshot and SRS Example)
    const expenseCount = await db.expenses.count();
    const incomeCount = await db.incomes.count();
    const savingsCount = await db.savings.count();

    if (expenseCount === 0 && incomeCount === 0) {
        // Screenshots exact 4 expenses:
        // Electric bill (-₱2,450.00, Bills, Oct 4)
        // Weekly groceries (-₱860.00, Food, Oct 3)
        // Fuel (-₱320.00, Transport, Oct 2)
        // Household items (-₱550.00, Shopping, Oct 1)
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        const seedExpenses = [
            {
                expense_id: 101,
                client_id: 'client_1',
                category_id: 'bills',
                name: 'Electric bill',
                amount: 2450,
                date: new Date(year, month, 4, 14, 30).toISOString(),
                description: 'Meralco electricity bill payment',
                isDeleted: 0,
                syncStatus: 'synced',
            },
            {
                expense_id: 102,
                client_id: 'client_1',
                category_id: 'food',
                name: 'Weekly groceries',
                amount: 860,
                date: new Date(year, month, 3, 11, 15).toISOString(),
                description: 'Supermarket vegetables and rice',
                isDeleted: 0,
                syncStatus: 'synced',
            },
            {
                expense_id: 103,
                client_id: 'client_1',
                category_id: 'transport',
                name: 'Fuel',
                amount: 320,
                date: new Date(year, month, 2, 8, 45).toISOString(),
                description: 'Gasoline for family vehicle',
                isDeleted: 0,
                syncStatus: 'synced',
            },
            {
                expense_id: 104,
                client_id: 'client_1',
                category_id: 'shopping',
                name: 'Household items',
                amount: 550,
                date: new Date(year, month, 1, 16, 20).toISOString(),
                description: 'Cleaning supplies and toiletries',
                isDeleted: 0,
                syncStatus: 'synced',
            },
        ];

        for (const exp of seedExpenses) {
            await db.expenses.put(exp);
            // also keep unified transactions updated
            await db.transactions.put({
                id: exp.expense_id,
                kind: 'out',
                name: exp.name,
                amount: exp.amount,
                categoryId: exp.category_id,
                date: exp.date,
                description: exp.description,
                isDeleted: 0,
                syncStatus: 'synced',
            });
        }

        // Seed default Income matching SRS
        const seedIncomes = [
            {
                income_id: 201,
                client_id: 'client_1',
                source: 'Salary',
                amount: 15000,
                date: new Date(year, month, 1, 9, 0).toISOString(),
                description: 'Primary monthly salary payout',
                isDeleted: 0,
                syncStatus: 'synced',
            },
            {
                income_id: 202,
                client_id: 'client_1',
                source: 'Business income',
                amount: 5000,
                date: new Date(year, month, 3, 15, 0).toISOString(),
                description: 'Online store earnings',
                isDeleted: 0,
                syncStatus: 'synced',
            },
        ];

        for (const inc of seedIncomes) {
            await db.incomes.put(inc);
            await db.transactions.put({
                id: inc.income_id,
                kind: 'in',
                name: inc.source,
                amount: inc.amount,
                date: inc.date,
                description: inc.description,
                isDeleted: 0,
                syncStatus: 'synced',
            });
        }

        // Seed default Savings matching SRS
        if (savingsCount === 0) {
            await db.savings.put({
                savings_id: 301,
                owner_id: 'client_1',
                amount: 3000,
                date: new Date(year, month, 2, 10, 0).toISOString(),
                description: 'Emergency emergency fund allocation',
                isDeleted: 0,
                syncStatus: 'synced',
            });
        }
    }
}

// ==========================================
// CRUD OPERATIONS: EXPENSES (SRS 2.2.3, 2.2.5, 2.2.6)
// ==========================================
export async function getExpenses() {
    return await db.expenses
        .filter((e) => !e.isDeleted)
        .reverse()
        .sortBy('date');
}

export async function addExpense(entry) {
    const expense = {
        expense_id: entry.expense_id || Date.now(),
        client_id: entry.client_id || 'client_1',
        category_id: entry.category_id || 'food',
        name: entry.name || 'Expense',
        amount: Number(entry.amount) || 0,
        date: entry.date || new Date().toISOString(),
        description: entry.description || '',
        isDeleted: 0,
        syncStatus: 'pending',
    };
    await db.expenses.put(expense);
    // Sync unified transactions table
    await db.transactions.put({
        id: expense.expense_id,
        kind: 'out',
        name: expense.name,
        amount: expense.amount,
        categoryId: expense.category_id,
        date: expense.date,
        description: expense.description,
        isDeleted: 0,
        syncStatus: 'pending',
    });
    await logServerAudit('EXPENSE_ADDED', expense);
    triggerBackgroundSync();
    return expense;
}

export async function updateExpense(expense_id, updates) {
    const existing = await db.expenses.get(expense_id);
    if (!existing) return null;
    const updated = {
        ...existing,
        ...updates,
        amount: Number(updates.amount !== undefined ? updates.amount : existing.amount),
        syncStatus: 'pending',
    };
    await db.expenses.put(updated);
    await db.transactions.put({
        id: updated.expense_id,
        kind: 'out',
        name: updated.name,
        amount: updated.amount,
        categoryId: updated.category_id,
        date: updated.date,
        description: updated.description,
        isDeleted: updated.isDeleted ? 1 : 0,
        syncStatus: 'pending',
    });
    await logServerAudit('EXPENSE_UPDATED', updated);
    triggerBackgroundSync();
    return updated;
}

export async function deleteExpense(expense_id) {
    const existing = await db.expenses.get(expense_id);
    if (!existing) return null;
    const updated = {
        ...existing,
        isDeleted: 1,
        deletedAt: new Date().toISOString(),
        syncStatus: 'pending',
    };
    await db.expenses.put(updated);
    await db.transactions.update(expense_id, { isDeleted: 1, syncStatus: 'pending' });
    await logServerAudit('EXPENSE_DELETED', { expense_id });
    triggerBackgroundSync();
    return updated;
}

// ==========================================
// CRUD OPERATIONS: INCOME (SRS 2.2.2, 2.2.5, 2.2.6)
// ==========================================
export async function getIncomes() {
    return await db.incomes
        .filter((i) => !i.isDeleted)
        .reverse()
        .sortBy('date');
}

export async function addIncome(entry) {
    const income = {
        income_id: entry.income_id || Date.now(),
        client_id: entry.client_id || 'client_1',
        source: entry.source || 'Salary',
        amount: Number(entry.amount) || 0,
        date: entry.date || new Date().toISOString(),
        description: entry.description || '',
        isDeleted: 0,
        syncStatus: 'pending',
    };
    await db.incomes.put(income);
    await db.transactions.put({
        id: income.income_id,
        kind: 'in',
        name: income.source,
        amount: income.amount,
        date: income.date,
        description: income.description,
        isDeleted: 0,
        syncStatus: 'pending',
    });
    await logServerAudit('INCOME_ADDED', income);
    triggerBackgroundSync();
    return income;
}

export async function updateIncome(income_id, updates) {
    const existing = await db.incomes.get(income_id);
    if (!existing) return null;
    const updated = {
        ...existing,
        ...updates,
        amount: Number(updates.amount !== undefined ? updates.amount : existing.amount),
        syncStatus: 'pending',
    };
    await db.incomes.put(updated);
    await db.transactions.put({
        id: updated.income_id,
        kind: 'in',
        name: updated.source,
        amount: updated.amount,
        date: updated.date,
        description: updated.description,
        isDeleted: updated.isDeleted ? 1 : 0,
        syncStatus: 'pending',
    });
    await logServerAudit('INCOME_UPDATED', updated);
    triggerBackgroundSync();
    return updated;
}

export async function deleteIncome(income_id) {
    const existing = await db.incomes.get(income_id);
    if (!existing) return null;
    const updated = {
        ...existing,
        isDeleted: 1,
        deletedAt: new Date().toISOString(),
        syncStatus: 'pending',
    };
    await db.incomes.put(updated);
    await db.transactions.update(income_id, { isDeleted: 1, syncStatus: 'pending' });
    await logServerAudit('INCOME_DELETED', { income_id });
    triggerBackgroundSync();
    return updated;
}

// ==========================================
// CRUD OPERATIONS: SAVINGS (SRS 2.2.10, 2.5)
// ==========================================
export async function getSavings() {
    return await db.savings
        .filter((s) => !s.isDeleted)
        .reverse()
        .sortBy('date');
}

export async function addSavings(entry) {
    const item = {
        savings_id: entry.savings_id || Date.now(),
        owner_id: entry.owner_id || 'client_1',
        amount: Number(entry.amount) || 0,
        date: entry.date || new Date().toISOString(),
        description: entry.description || 'Personal Savings',
        isDeleted: 0,
        syncStatus: 'pending',
    };
    await db.savings.put(item);
    await logServerAudit('SAVINGS_ADDED', item);
    triggerBackgroundSync();
    return item;
}

export async function updateSavings(savings_id, updates) {
    const existing = await db.savings.get(savings_id);
    if (!existing) return null;
    const updated = {
        ...existing,
        ...updates,
        amount: Number(updates.amount !== undefined ? updates.amount : existing.amount),
        syncStatus: 'pending',
    };
    await db.savings.put(updated);
    await logServerAudit('SAVINGS_UPDATED', updated);
    triggerBackgroundSync();
    return updated;
}

export async function deleteSavings(savings_id) {
    const existing = await db.savings.get(savings_id);
    if (!existing) return null;
    const updated = {
        ...existing,
        isDeleted: 1,
        deletedAt: new Date().toISOString(),
        syncStatus: 'pending',
    };
    await db.savings.put(updated);
    await logServerAudit('SAVINGS_DELETED', { savings_id });
    triggerBackgroundSync();
    return updated;
}

// ==========================================
// CRUD OPERATIONS: BUDGETS (SRS 2.2.7, 2.2.8, 2.5)
// ==========================================
export async function getBudgets(month) {
    const m = month || new Date().toISOString().slice(0, 7);
    const list = await db.budgets.where('month').equals(m).toArray();
    if (list.length === 0) {
        // Return default budgets
        return SRS_CATEGORIES.map((c) => ({
            budget_id: `budget_${c.category_id}_${m}`,
            client_id: 'client_1',
            category_id: c.category_id,
            budget_amount: c.defaultBudget,
            month: m,
        }));
    }
    return list;
}

export async function setCategoryBudget(category_id, amount, month) {
    const m = month || new Date().toISOString().slice(0, 7);
    const budgetItem = {
        budget_id: `budget_${category_id}_${m}`,
        client_id: 'client_1',
        category_id,
        budget_amount: Number(amount) || 0,
        month: m,
    };
    await db.budgets.put(budgetItem);
    await logServerAudit('BUDGET_UPDATED', budgetItem);
    return budgetItem;
}

// ==========================================
// CLIENT AUTHENTICATION (SRS 2.2.1, 2.5)
// ==========================================
export async function getClient() {
    return await db.clients.get('client_1');
}

export async function updateClientProfile(data) {
    const current = (await getClient()) || { client_id: 'client_1' };
    const updated = { ...current, ...data };
    await db.clients.put(updated);
    return updated;
}

export async function verifyClientLogin(username, password) {
    const client = await getClient();
    if (!client) return { success: false, message: 'Client profile not found.' };
    if (client.username.toLowerCase() === username.trim().toLowerCase() && client.password === password) {
        return { success: true, client };
    }
    return { success: false, message: 'Invalid username or password. Please check your credentials.' };
}

// ==========================================
// AUDIT LOGS & SYSTEM METRICS
// ==========================================
export async function getAuditLogs() {
    return await db.auditLogs.reverse().sortBy('timestamp');
}

export async function logServerAudit(action, details) {
    const logEntry = {
        logId: 'SRV-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random() * 1000),
        action,
        details,
        timestamp: new Date().toISOString(),
        syncStatus: 'pending',
    };
    try {
        await db.auditLogs.add(logEntry);
    } catch (e) {
        console.error('Dexie audit log error:', e);
    }
    return logEntry;
}

// Metadata helpers
export async function getMeta(key, defaultValue = null) {
    const item = await db.meta.get(key);
    return item ? item.value : defaultValue;
}

export async function setMeta(key, value) {
    await db.meta.put({ key, value });
}

export async function getCurrency() {
    return await getMeta('currencySymbol', '₱');
}

export async function setCurrency(symbol) {
    return await setMeta('currencySymbol', symbol);
}

// ==========================================
// SYNC ENGINE
// ==========================================
export async function syncPendingData(apiEndpoint = '/api/sync') {
    if (!navigator.onLine) {
        return { success: false, reason: 'offline' };
    }

    try {
        const pendingExpenses = await db.expenses.where('syncStatus').equals('pending').toArray();
        const pendingIncomes = await db.incomes.where('syncStatus').equals('pending').toArray();
        const pendingSavings = await db.savings.where('syncStatus').equals('pending').toArray();
        const pendingLogs = await db.auditLogs.where('syncStatus').equals('pending').toArray();

        const totalPending = pendingExpenses.length + pendingIncomes.length + pendingSavings.length + pendingLogs.length;
        if (totalPending === 0) {
            return { success: true, count: 0 };
        }

        const payload = {
            expenses: pendingExpenses,
            incomes: pendingIncomes,
            savings: pendingSavings,
            auditLogs: pendingLogs,
            syncedAt: new Date().toISOString(),
        };

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).catch((err) => {
            console.info('Remote server offline (all data preserved in local Dexie DB):', err.message);
            return null;
        });

        if (response && response.ok) {
            await db.transaction('rw', db.expenses, db.incomes, db.savings, db.auditLogs, async () => {
                for (const item of pendingExpenses) await db.expenses.update(item.expense_id, { syncStatus: 'synced' });
                for (const item of pendingIncomes) await db.incomes.update(item.income_id, { syncStatus: 'synced' });
                for (const item of pendingSavings) await db.savings.update(item.savings_id, { syncStatus: 'synced' });
                for (const item of pendingLogs) await db.auditLogs.update(item.logId, { syncStatus: 'synced' });
            });
            await setMeta('lastSyncedAt', new Date().toISOString());
            window.dispatchEvent(new CustomEvent('sync-completed', { detail: payload }));
            return { success: true, count: totalPending };
        }

        await setMeta('lastSyncAttempt', new Date().toISOString());
        return { success: false, reason: 'server_unreachable', pendingCount: totalPending };
    } catch (error) {
        console.error('Background sync error:', error);
        return { success: false, error: error.message };
    }
}

export function triggerBackgroundSync() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready
            .then((registration) => registration.sync.register('sync-financial-data'))
            .catch(() => {
                if (navigator.onLine) syncPendingData();
            });
    } else {
        if (navigator.onLine) syncPendingData();
    }
}

// Reset Database to Fresh Defaults
export async function resetDatabaseToDemo() {
    await db.expenses.clear();
    await db.incomes.clear();
    await db.savings.clear();
    await db.budgets.clear();
    await db.transactions.clear();
    await db.auditLogs.clear();
    await initDatabaseDefaults();
}
