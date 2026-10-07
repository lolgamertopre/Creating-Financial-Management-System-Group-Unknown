import fs from 'fs';
import path from 'path';

// Server-side JSON database storage engine
const DATA_DIR = path.resolve(process.cwd(), 'server_data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Ensure storage directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial seed data matching SRS requirements
function getDefaultData() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const currentMonthStr = now.toISOString().slice(0, 7);

    return {
        client: {
            client_id: 'client_1',
            name: 'Maria (Client / Mother)',
            username: 'mother',
            password: 'password123',
            email: 'maria.budget@pocketwise.ph',
            monthlyTargetSavings: 5000,
            currency: '₱',
        },
        categories: [
            { category_id: 'food', category_name: 'Food', emoji: '🛒', color: '#F97316', defaultBudget: 5000 },
            { category_id: 'transport', category_name: 'Transportation', emoji: '🚌', color: '#06B6D4', defaultBudget: 2000 },
            { category_id: 'bills', category_name: 'Bills', emoji: '⚡', color: '#EF4444', defaultBudget: 3000 },
            { category_id: 'medicine', category_name: 'Medicine', emoji: '💊', color: '#10B981', defaultBudget: 1500 },
            { category_id: 'shopping', category_name: 'Shopping', emoji: '🛍️', color: '#8B5CF6', defaultBudget: 1500 },
            { category_id: 'personal', category_name: 'Personal Needs', emoji: '🧴', color: '#EC4899', defaultBudget: 2000 },
            { category_id: 'others', category_name: 'Others', emoji: '🏷️', color: '#64748B', defaultBudget: 1000 },
        ],
        expenses: [
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
                updatedAt: new Date().toISOString(),
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
                updatedAt: new Date().toISOString(),
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
                updatedAt: new Date().toISOString(),
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
                updatedAt: new Date().toISOString(),
            },
        ],
        incomes: [
            {
                income_id: 201,
                client_id: 'client_1',
                source: 'Salary',
                amount: 15000,
                date: new Date(year, month, 1, 9, 0).toISOString(),
                description: 'Primary monthly salary payout',
                isDeleted: 0,
                syncStatus: 'synced',
                updatedAt: new Date().toISOString(),
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
                updatedAt: new Date().toISOString(),
            },
        ],
        budgets: [
            { budget_id: `budget_food_${currentMonthStr}`, client_id: 'client_1', category_id: 'food', budget_amount: 5000, month: currentMonthStr },
            { budget_id: `budget_transport_${currentMonthStr}`, client_id: 'client_1', category_id: 'transport', budget_amount: 2000, month: currentMonthStr },
            { budget_id: `budget_bills_${currentMonthStr}`, client_id: 'client_1', category_id: 'bills', budget_amount: 3000, month: currentMonthStr },
            { budget_id: `budget_medicine_${currentMonthStr}`, client_id: 'client_1', category_id: 'medicine', budget_amount: 1500, month: currentMonthStr },
            { budget_id: `budget_shopping_${currentMonthStr}`, client_id: 'client_1', category_id: 'shopping', budget_amount: 1500, month: currentMonthStr },
            { budget_id: `budget_personal_${currentMonthStr}`, client_id: 'client_1', category_id: 'personal', budget_amount: 2000, month: currentMonthStr },
            { budget_id: `budget_others_${currentMonthStr}`, client_id: 'client_1', category_id: 'others', budget_amount: 1000, month: currentMonthStr },
        ],
        savings: [
            {
                savings_id: 301,
                owner_id: 'client_1',
                amount: 3000,
                date: new Date(year, month, 2, 10, 0).toISOString(),
                description: 'Emergency fund allocation',
                isDeleted: 0,
                syncStatus: 'synced',
                updatedAt: new Date().toISOString(),
            },
        ],
        auditLogs: [
            {
                logId: 'SRV-INIT-001',
                action: 'SYSTEM_INITIALIZED',
                details: { info: 'Backend REST API Server Database Ready' },
                timestamp: new Date().toISOString(),
                syncStatus: 'synced',
            },
        ],
        metadata: {
            version: '2.0.0',
            lastUpdated: new Date().toISOString(),
            currencySymbol: '₱',
        },
    };
}

class ServerStore {
    constructor() {
        this.cache = null;
        this.init();
    }

    init() {
        if (!fs.existsSync(DB_FILE)) {
            const defaults = getDefaultData();
            this.write(defaults);
            this.cache = defaults;
        } else {
            try {
                const raw = fs.readFileSync(DB_FILE, 'utf8');
                this.cache = JSON.parse(raw);
            } catch (err) {
                console.error('Failed to parse database.json, reinitializing defaults:', err);
                const defaults = getDefaultData();
                this.write(defaults);
                this.cache = defaults;
            }
        }
    }

    read() {
        if (!this.cache) {
            this.init();
        }
        return this.cache;
    }

    write(data) {
        try {
            data.metadata = data.metadata || {};
            data.metadata.lastUpdated = new Date().toISOString();
            this.cache = data;
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
            return true;
        } catch (err) {
            console.error('Database write error:', err);
            return false;
        }
    }

    // --- EXPENSES ---
    getExpenses() {
        const data = this.read();
        return (data.expenses || []).filter((e) => !e.isDeleted);
    }

    addExpense(item) {
        const data = this.read();
        const newExpense = {
            expense_id: item.expense_id || Date.now(),
            client_id: item.client_id || 'client_1',
            category_id: item.category_id || 'food',
            name: item.name || 'Expense',
            amount: Number(item.amount) || 0,
            date: item.date || new Date().toISOString(),
            description: item.description || '',
            isDeleted: 0,
            syncStatus: 'synced',
            updatedAt: new Date().toISOString(),
        };
        data.expenses = data.expenses || [];
        const idx = data.expenses.findIndex((e) => String(e.expense_id) === String(newExpense.expense_id));
        if (idx >= 0) {
            data.expenses[idx] = newExpense;
        } else {
            data.expenses.unshift(newExpense);
        }
        this.logAudit('EXPENSE_ADDED_API', newExpense);
        this.write(data);
        return newExpense;
    }

    updateExpense(id, updates) {
        const data = this.read();
        data.expenses = data.expenses || [];
        const idx = data.expenses.findIndex((e) => String(e.expense_id) === String(id));
        if (idx === -1) return null;
        data.expenses[idx] = {
            ...data.expenses[idx],
            ...updates,
            amount: updates.amount !== undefined ? Number(updates.amount) : data.expenses[idx].amount,
            updatedAt: new Date().toISOString(),
            syncStatus: 'synced',
        };
        this.logAudit('EXPENSE_UPDATED_API', data.expenses[idx]);
        this.write(data);
        return data.expenses[idx];
    }

    deleteExpense(id) {
        const data = this.read();
        data.expenses = data.expenses || [];
        const idx = data.expenses.findIndex((e) => String(e.expense_id) === String(id));
        if (idx === -1) return null;
        data.expenses[idx].isDeleted = 1;
        data.expenses[idx].deletedAt = new Date().toISOString();
        data.expenses[idx].updatedAt = new Date().toISOString();
        this.logAudit('EXPENSE_DELETED_API', { expense_id: id });
        this.write(data);
        return data.expenses[idx];
    }

    // --- INCOMES ---
    getIncomes() {
        const data = this.read();
        return (data.incomes || []).filter((i) => !i.isDeleted);
    }

    addIncome(item) {
        const data = this.read();
        const newIncome = {
            income_id: item.income_id || Date.now(),
            client_id: item.client_id || 'client_1',
            source: item.source || 'Salary',
            amount: Number(item.amount) || 0,
            date: item.date || new Date().toISOString(),
            description: item.description || '',
            isDeleted: 0,
            syncStatus: 'synced',
            updatedAt: new Date().toISOString(),
        };
        data.incomes = data.incomes || [];
        const idx = data.incomes.findIndex((i) => String(i.income_id) === String(newIncome.income_id));
        if (idx >= 0) {
            data.incomes[idx] = newIncome;
        } else {
            data.incomes.unshift(newIncome);
        }
        this.logAudit('INCOME_ADDED_API', newIncome);
        this.write(data);
        return newIncome;
    }

    updateIncome(id, updates) {
        const data = this.read();
        data.incomes = data.incomes || [];
        const idx = data.incomes.findIndex((i) => String(i.income_id) === String(id));
        if (idx === -1) return null;
        data.incomes[idx] = {
            ...data.incomes[idx],
            ...updates,
            amount: updates.amount !== undefined ? Number(updates.amount) : data.incomes[idx].amount,
            updatedAt: new Date().toISOString(),
            syncStatus: 'synced',
        };
        this.logAudit('INCOME_UPDATED_API', data.incomes[idx]);
        this.write(data);
        return data.incomes[idx];
    }

    deleteIncome(id) {
        const data = this.read();
        data.incomes = data.incomes || [];
        const idx = data.incomes.findIndex((i) => String(i.income_id) === String(id));
        if (idx === -1) return null;
        data.incomes[idx].isDeleted = 1;
        data.incomes[idx].deletedAt = new Date().toISOString();
        data.incomes[idx].updatedAt = new Date().toISOString();
        this.logAudit('INCOME_DELETED_API', { income_id: id });
        this.write(data);
        return data.incomes[idx];
    }

    // --- SAVINGS ---
    getSavings() {
        const data = this.read();
        return (data.savings || []).filter((s) => !s.isDeleted);
    }

    addSavings(item) {
        const data = this.read();
        const newSavings = {
            savings_id: item.savings_id || Date.now(),
            owner_id: item.owner_id || 'client_1',
            amount: Number(item.amount) || 0,
            date: item.date || new Date().toISOString(),
            description: item.description || 'Personal Savings',
            isDeleted: 0,
            syncStatus: 'synced',
            updatedAt: new Date().toISOString(),
        };
        data.savings = data.savings || [];
        const idx = data.savings.findIndex((s) => String(s.savings_id) === String(newSavings.savings_id));
        if (idx >= 0) {
            data.savings[idx] = newSavings;
        } else {
            data.savings.unshift(newSavings);
        }
        this.logAudit('SAVINGS_ADDED_API', newSavings);
        this.write(data);
        return newSavings;
    }

    updateSavings(id, updates) {
        const data = this.read();
        data.savings = data.savings || [];
        const idx = data.savings.findIndex((s) => String(s.savings_id) === String(id));
        if (idx === -1) return null;
        data.savings[idx] = {
            ...data.savings[idx],
            ...updates,
            amount: updates.amount !== undefined ? Number(updates.amount) : data.savings[idx].amount,
            updatedAt: new Date().toISOString(),
            syncStatus: 'synced',
        };
        this.logAudit('SAVINGS_UPDATED_API', data.savings[idx]);
        this.write(data);
        return data.savings[idx];
    }

    deleteSavings(id) {
        const data = this.read();
        data.savings = data.savings || [];
        const idx = data.savings.findIndex((s) => String(s.savings_id) === String(id));
        if (idx === -1) return null;
        data.savings[idx].isDeleted = 1;
        data.savings[idx].deletedAt = new Date().toISOString();
        data.savings[idx].updatedAt = new Date().toISOString();
        this.logAudit('SAVINGS_DELETED_API', { savings_id: id });
        this.write(data);
        return data.savings[idx];
    }

    // --- BUDGETS ---
    getBudgets(month) {
        const data = this.read();
        const m = month || new Date().toISOString().slice(0, 7);
        const list = (data.budgets || []).filter((b) => b.month === m);
        if (list.length === 0) {
            return (data.categories || []).map((cat) => ({
                budget_id: `budget_${cat.category_id}_${m}`,
                client_id: 'client_1',
                category_id: cat.category_id,
                budget_amount: cat.defaultBudget || 1000,
                month: m,
            }));
        }
        return list;
    }

    setBudget(category_id, budget_amount, month) {
        const data = this.read();
        const m = month || new Date().toISOString().slice(0, 7);
        const budget_id = `budget_${category_id}_${m}`;
        data.budgets = data.budgets || [];
        const idx = data.budgets.findIndex((b) => b.category_id === category_id && b.month === m);
        const item = {
            budget_id,
            client_id: 'client_1',
            category_id,
            budget_amount: Number(budget_amount) || 0,
            month: m,
            updatedAt: new Date().toISOString(),
        };
        if (idx >= 0) {
            data.budgets[idx] = item;
        } else {
            data.budgets.push(item);
        }
        this.logAudit('BUDGET_UPDATED_API', item);
        this.write(data);
        return item;
    }

    // --- CLIENT & AUTH ---
    getClient() {
        const data = this.read();
        return data.client || { client_id: 'client_1', username: 'mother', name: 'Maria' };
    }

    updateClient(profileUpdates) {
        const data = this.read();
        data.client = {
            ...data.client,
            ...profileUpdates,
            updatedAt: new Date().toISOString(),
        };
        this.logAudit('CLIENT_PROFILE_UPDATED', { client_id: data.client.client_id });
        this.write(data);
        return data.client;
    }

    verifyAuth(username, password) {
        const client = this.getClient();
        if (client.username.toLowerCase() === (username || '').trim().toLowerCase() && client.password === password) {
            return {
                authenticated: true,
                client: {
                    client_id: client.client_id,
                    name: client.name,
                    username: client.username,
                    email: client.email,
                    currency: client.currency || '₱',
                },
                token: 'jwt_mock_' + Buffer.from(client.username + ':' + Date.now()).toString('base64'),
            };
        }
        return { authenticated: false, message: 'Invalid username or password' };
    }

    // --- AUDIT LOGS ---
    getAuditLogs() {
        const data = this.read();
        return data.auditLogs || [];
    }

    logAudit(action, details) {
        const data = this.read();
        data.auditLogs = data.auditLogs || [];
        const log = {
            logId: 'SRV-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random() * 1000),
            action,
            details,
            timestamp: new Date().toISOString(),
            syncStatus: 'synced',
        };
        data.auditLogs.unshift(log);
        if (data.auditLogs.length > 500) {
            data.auditLogs = data.auditLogs.slice(0, 500);
        }
        return log;
    }

    // --- BATCH 2-WAY SYNC ---
    syncBatch(payload) {
        const data = this.read();
        const incomingExpenses = payload.expenses || [];
        const incomingIncomes = payload.incomes || [];
        const incomingSavings = payload.savings || [];
        const incomingLogs = payload.auditLogs || [];

        // Merge Expenses
        data.expenses = data.expenses || [];
        incomingExpenses.forEach((item) => {
            const idx = data.expenses.findIndex((e) => String(e.expense_id) === String(item.expense_id));
            const prepared = { ...item, syncStatus: 'synced', updatedAt: new Date().toISOString() };
            if (idx >= 0) {
                data.expenses[idx] = prepared;
            } else {
                data.expenses.push(prepared);
            }
        });

        // Merge Incomes
        data.incomes = data.incomes || [];
        incomingIncomes.forEach((item) => {
            const idx = data.incomes.findIndex((i) => String(i.income_id) === String(item.income_id));
            const prepared = { ...item, syncStatus: 'synced', updatedAt: new Date().toISOString() };
            if (idx >= 0) {
                data.incomes[idx] = prepared;
            } else {
                data.incomes.push(prepared);
            }
        });

        // Merge Savings
        data.savings = data.savings || [];
        incomingSavings.forEach((item) => {
            const idx = data.savings.findIndex((s) => String(s.savings_id) === String(item.savings_id));
            const prepared = { ...item, syncStatus: 'synced', updatedAt: new Date().toISOString() };
            if (idx >= 0) {
                data.savings[idx] = prepared;
            } else {
                data.savings.push(prepared);
            }
        });

        // Merge Logs
        data.auditLogs = data.auditLogs || [];
        incomingLogs.forEach((log) => {
            const exists = data.auditLogs.some((l) => l.logId === log.logId);
            if (!exists) {
                data.auditLogs.unshift({ ...log, syncStatus: 'synced' });
            }
        });

        this.write(data);

        return {
            success: true,
            syncedAt: new Date().toISOString(),
            serverData: {
                expenses: data.expenses.filter((e) => !e.isDeleted),
                incomes: data.incomes.filter((i) => !i.isDeleted),
                savings: data.savings.filter((s) => !s.isDeleted),
                budgets: data.budgets,
                client: data.client,
            },
        };
    }

    // Reset database
    reset() {
        const defaults = getDefaultData();
        this.write(defaults);
        return defaults;
    }
}

export const serverStore = new ServerStore();
