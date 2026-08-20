import Dexie from 'dexie';

export const db = new Dexie('FinancialManagementDB');

// Define database schema
db.version(1).stores({
    transactions: 'id, date, kind, name, syncStatus, isDeleted',
    auditLogs: 'logId, timestamp, action, syncStatus',
    meta: 'key',
});

// Helper: Calculate balance from active transactions
export async function calculateBalanceFromDB() {
    const active = await db.transactions.where('isDeleted').equals(0).toArray();
    return active.reduce((acc, t) => {
        return t.kind === 'in' ? acc + t.amount : acc - t.amount;
    }, 0);
}

// Transaction operations
export async function getActiveTransactions() {
    return await db.transactions
        .filter((t) => !t.isDeleted)
        .reverse()
        .sortBy('date');
}

export async function getDeletedTransactions() {
    return await db.transactions
        .filter((t) => !!t.isDeleted)
        .reverse()
        .sortBy('deletedAt');
}

export async function saveTransaction(entry) {
    const tx = {
        ...entry,
        isDeleted: entry.isDeleted ? 1 : 0,
        syncStatus: 'pending',
    };
    await db.transactions.put(tx);
    await logServerAudit('TRANSACTION_CREATED', tx);
    triggerBackgroundSync();
    return tx;
}

export async function softDeleteTransaction(id) {
    const tx = await db.transactions.get(id);
    if (!tx) return null;

    const updated = {
        ...tx,
        isDeleted: 1,
        deletedAt: new Date().toISOString(),
        syncStatus: 'pending',
    };
    await db.transactions.put(updated);
    await logServerAudit('TRANSACTION_DELETED_BY_CLIENT', updated);
    triggerBackgroundSync();
    return updated;
}

export async function restoreDeletedTransaction(id) {
    const tx = await db.transactions.get(id);
    if (!tx) return null;

    const updated = {
        ...tx,
        isDeleted: 0,
        deletedAt: null,
        syncStatus: 'pending',
    };
    await db.transactions.put(updated);
    await logServerAudit('TRANSACTION_RESTORED_BY_CLIENT', updated);
    triggerBackgroundSync();
    return updated;
}

export async function purgeDeletedTransaction(id) {
    const tx = await db.transactions.get(id);
    await db.transactions.delete(id);
    await logServerAudit('CLIENT_PURGED_HISTORY_RECORD', { purgedRecord: tx || { id } });
    triggerBackgroundSync();
}

export async function clearAllDeletedFromDB() {
    const deleted = await db.transactions.filter((t) => !!t.isDeleted).toArray();
    const count = deleted.length;
    await db.transactions.where('isDeleted').equals(1).delete();
    await logServerAudit('CLIENT_CLEARED_ALL_HISTORY', { clearedCount: count });
    triggerBackgroundSync();
    return count;
}

// Audit Log operations
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
        console.error('Dexie audit log write error:', e);
    }
    return logEntry;
}

// Metadata operations (balance, settings, last synced)
export async function getMeta(key, defaultValue = null) {
    const item = await db.meta.get(key);
    return item ? item.value : defaultValue;
}

export async function setMeta(key, value) {
    await db.meta.put({ key, value });
}

// Sync Engine: Gather pending items and attempt to sync to backend
export async function syncPendingData(apiEndpoint = '/api/sync') {
    if (!navigator.onLine) {
        return { success: false, reason: 'offline' };
    }

    try {
        const pendingTxs = await db.transactions.where('syncStatus').equals('pending').toArray();
        const pendingLogs = await db.auditLogs.where('syncStatus').equals('pending').toArray();

        if (pendingTxs.length === 0 && pendingLogs.length === 0) {
            return { success: true, count: 0 };
        }

        const payload = {
            transactions: pendingTxs,
            auditLogs: pendingLogs,
            syncedAt: new Date().toISOString(),
        };

        // Try syncing to server endpoint
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).catch((err) => {
            console.info('Backend sync endpoint unavailable (storing locally in Dexie):', err.message);
            return null;
        });

        // If backend returned success OR in demo/standalone PWA mode, mark pending items as synced
        if (response && response.ok) {
            await db.transaction('rw', db.transactions, db.auditLogs, async () => {
                for (const tx of pendingTxs) {
                    await db.transactions.update(tx.id, { syncStatus: 'synced' });
                }
                for (const log of pendingLogs) {
                    await db.auditLogs.update(log.logId, { syncStatus: 'synced' });
                }
            });
            await setMeta('lastSyncedAt', new Date().toISOString());
            window.dispatchEvent(new CustomEvent('sync-completed', { detail: payload }));
            return { success: true, count: pendingTxs.length + pendingLogs.length };
        }

        // Even without active server, record locally that offline batch is preserved
        await setMeta('lastSyncAttempt', new Date().toISOString());
        return { success: false, reason: 'server_unreachable', pendingCount: pendingTxs.length + pendingLogs.length };
    } catch (error) {
        console.error('Background sync error:', error);
        return { success: false, error: error.message };
    }
}

// Trigger background sync via Service Worker or direct fallback
export function triggerBackgroundSync() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready
            .then((registration) => registration.sync.register('sync-financial-data'))
            .catch(() => {
                // Fallback to direct sync if online
                if (navigator.onLine) syncPendingData();
            });
    } else {
        if (navigator.onLine) syncPendingData();
    }
}
