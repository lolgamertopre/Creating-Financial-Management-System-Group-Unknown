import { useState, useEffect } from "react";
import {
    getActiveTransactions,
    getDeletedTransactions,
    saveTransaction,
    softDeleteTransaction,
    restoreDeletedTransaction,
    purgeDeletedTransaction,
    clearAllDeletedFromDB,
    getAuditLogs,
    calculateBalanceFromDB,
    syncPendingData,
    getMeta,
    setMeta,
    db,
} from "./db.js";

// --- Design tokens (chalkboard ledger theme) ---
// bg:    #2B3A32  (deep chalkboard green)
// card:  #34473D  (lighter slate green)
// chalk: #F5F1E6  (cream chalk text)
// gold:  #E8A93B  (money in / positive)
// coral: #E85C4A  (money out / warning)
// blue:  #6C93B0  (bills / neutral accent)
// line:  #4A5D52  (hairline divider, chalk-dust)

const CATEGORIES = [
    { id: "food", name: "Grocery Expenses", emoji: "🛒", color: "#E8A93B" },
    { id: "electricity", name: "Electricity Expenses", emoji: "⚡", color: "#E8A93B" },
    { id: "water", name: "Water Expenses", emoji: "💧", color: "#6C93B0" },
    { id: "transportation", name: "Transportation Expenses", emoji: "🚌", color: "#6C93B0" },
    { id: "health", name: "Health Expenses", emoji: "❤️", color: "#E85C4A" },
    { id: "home", name: "house Expenses", emoji: "🏠", color: "#6C93B0" },
];

function formatDate(isoString) {
    if (!isoString) return "";
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "";
    }
}

function Keypad({ onConfirm, onCancel, accentColor, icon, title }) {
    const [value, setValue] = useState("");

    const press = (d) => {
        if (d === "back") {
            setValue((v) => v.slice(0, -1));
            return;
        }
        if (d === "." && value.includes(".")) return;
        if (value.length > 8) return;
        setValue((v) => v + d);
    };

    const display = value === "" ? "0" : value;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ background: "rgba(20,28,24,0.72)" }}
        >
            <div
                className="w-full max-w-sm rounded-t-3xl p-6 pb-8"
                style={{ background: "#34473D" }}
            >
                <div className="flex flex-col items-center mb-6">
                    <div
                        className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-1"
                        style={{ background: accentColor + "33", border: `3px solid ${accentColor}` }}
                    >
                        {icon}
                    </div>
                    {title && (
                        <div className="text-xs font-semibold tracking-wide mb-2 opacity-80" style={{ color: "#F5F1E6" }}>
                            {title}
                        </div>
                    )}
                    <div
                        className="text-5xl font-bold tabular-nums"
                        style={{ color: "#F5F1E6", fontFamily: "ui-rounded, system-ui, sans-serif" }}
                    >
                        ${display}
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-6">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"].map((d) => (
                        <button
                            key={d}
                            onClick={() => press(d)}
                            className="h-14 rounded-2xl text-2xl font-semibold flex items-center justify-center active:scale-95 transition"
                            style={{ background: "#2B3A32", color: "#F5F1E6" }}
                        >
                            {d === "back" ? "⌫" : d}
                        </button>
                    ))}
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 h-14 rounded-2xl text-lg font-semibold active:scale-95 transition"
                        style={{ background: "#4A5D52", color: "#F5F1E6" }}
                    >
                        ✕
                    </button>
                    <button
                        onClick={() => {
                            const num = parseFloat(value);
                            if (!isNaN(num) && num > 0) onConfirm(num);
                        }}
                        className="flex-[2] h-14 rounded-2xl text-lg font-semibold active:scale-95 transition"
                        style={{ background: accentColor, color: "#2B3A32" }}
                    >
                        ✓
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function BudgetApp() {
    const [balance, setBalance] = useState(0);
    const [entries, setEntries] = useState([]);
    const [deletedHistory, setDeletedHistory] = useState([]);
    const [serverLogs, setServerLogs] = useState([]);
    const [pad, setPad] = useState(null); // { emoji, color, kind, name }
    const [loading, setLoading] = useState(true);

    // Online & PWA Sync states
    const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState("");
    const [installPrompt, setInstallPrompt] = useState(null);

    // Modal states
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyTab, setHistoryTab] = useState("active"); // 'active' | 'deleted' | 'server'
    const [serverAdminUnlocked, setServerAdminUnlocked] = useState(false);
    const [adminPin, setAdminPin] = useState("");
    const [pinError, setPinError] = useState(false);

    // Load data from Dexie DB on startup (with migration from legacy storage)
    const refreshDataFromDB = async () => {
        try {
            const active = await getActiveTransactions();
            const deleted = await getDeletedTransactions();
            const logs = await getAuditLogs();
            const calculatedBalance = await calculateBalanceFromDB();

            // Migration check: If Dexie is completely empty, check legacy storage
            if (active.length === 0 && deleted.length === 0) {
                const legacy = localStorage.getItem("my-money-data");
                if (legacy) {
                    try {
                        const parsed = JSON.parse(legacy);
                        if (parsed.entries && parsed.entries.length > 0) {
                            for (const entry of parsed.entries) {
                                await db.transactions.put({ ...entry, isDeleted: 0, syncStatus: "pending" });
                            }
                        }
                        if (parsed.deletedHistory && parsed.deletedHistory.length > 0) {
                            for (const entry of parsed.deletedHistory) {
                                await db.transactions.put({ ...entry, isDeleted: 1, syncStatus: "pending" });
                            }
                        }
                        // Refresh after migration
                        const migratedActive = await getActiveTransactions();
                        const migratedDeleted = await getDeletedTransactions();
                        const migratedBal = await calculateBalanceFromDB();
                        setEntries(migratedActive);
                        setDeletedHistory(migratedDeleted);
                        setBalance(migratedBal);
                        setServerLogs(await getAuditLogs());
                        return;
                    } catch (e) {
                        console.error("Migration error:", e);
                    }
                }
            }

            setEntries(active);
            setDeletedHistory(deleted);
            setBalance(calculatedBalance);
            setServerLogs(logs);
        } catch (err) {
            console.error("DB Load Error:", err);
        }
    };

    useEffect(() => {
        (async () => {
            await refreshDataFromDB();
            setLoading(false);
        })();

        // Network status event listeners
        const handleOnline = async () => {
            setIsOnline(true);
            setSyncMessage("Back Online! Syncing pending data...");
            setIsSyncing(true);
            const result = await syncPendingData();
            setIsSyncing(false);
            if (result.success) {
                setSyncMessage("All offline changes synced!");
                setTimeout(() => setSyncMessage(""), 3500);
            }
            await refreshDataFromDB();
        };

        const handleOffline = () => {
            setIsOnline(false);
            setSyncMessage("Offline Mode: changes saved locally in Dexie DB");
        };

        const handleSyncCompleted = async () => {
            await refreshDataFromDB();
        };

        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault();
            setInstallPrompt(e);
        };

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        window.addEventListener("sync-completed", handleSyncCompleted);
        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
            window.removeEventListener("sync-completed", handleSyncCompleted);
            window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        };
    }, []);

    const handleManualSync = async () => {
        setIsSyncing(true);
        setSyncMessage("Syncing with server...");
        const result = await syncPendingData();
        setIsSyncing(false);
        if (result.success) {
            setSyncMessage("Synced successfully!");
        } else if (result.reason === "offline") {
            setSyncMessage("Cannot sync while offline.");
        } else {
            setSyncMessage("Pending changes stored securely in Dexie.");
        }
        setTimeout(() => setSyncMessage(""), 3500);
        await refreshDataFromDB();
    };

    const handleInstallApp = async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        if (outcome === "accepted") {
            setInstallPrompt(null);
        }
    };

    const openCategory = (cat) => setPad({ emoji: cat.emoji, color: cat.color, kind: "out", name: cat.name });
    const openIncome = () => setPad({ emoji: "💵", color: "#E8A93B", kind: "in", name: "Income" });

    // Client creates a transaction (persisted to Dexie DB with offline sync queue)
    const confirm = async (amount) => {
        const id = Date.now();
        const newEntry = {
            id,
            emoji: pad.emoji,
            name: pad.name || (pad.kind === "in" ? "Income" : "Expense"),
            amount,
            kind: pad.kind,
            date: new Date().toISOString(),
        };

        await saveTransaction(newEntry);
        setPad(null);
        await refreshDataFromDB();
    };

    // Client deletes an active transaction (soft delete in Dexie)
    const removeEntry = async (id) => {
        await softDeleteTransaction(id);
        await refreshDataFromDB();
    };

    // Client permanently deletes an entry from her own deleted history view
    const purgeClientHistoryItem = async (id) => {
        await purgeDeletedTransaction(id);
        await refreshDataFromDB();
    };

    // Client clears all her deleted history view from Dexie
    const clearAllClientHistory = async () => {
        await clearAllDeletedFromDB();
        await refreshDataFromDB();
    };

    // Client restores a deleted transaction
    const restoreEntry = async (id) => {
        await restoreDeletedTransaction(id);
        await refreshDataFromDB();
    };

    const handleUnlockAdmin = () => {
        if (adminPin === "1234" || adminPin.toLowerCase() === "admin") {
            setServerAdminUnlocked(true);
            setPinError(false);
        } else {
            setPinError(true);
        }
    };

    if (loading) {
        return (
            <div
                className="min-h-screen w-full flex items-center justify-center"
                style={{ background: "#2B3A32" }}
            >
                <span className="text-3xl animate-pulse" style={{ color: "#F5F1E6" }}>
                    💰
                </span>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen w-full flex justify-center"
            style={{ background: "#2B3A32", fontFamily: "system-ui, sans-serif" }}
        >
            <div className="w-full max-w-sm px-4 pt-5 pb-24 relative">
                {/* Header: App Name & PWA Status */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <span className="text-3xl">💰</span>
                        <span
                            className="text-2xl font-bold tracking-wide"
                            style={{ color: "#F5F1E6", fontFamily: "ui-rounded, system-ui, sans-serif" }}
                        >
                            My Money
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* PWA Install Button */}
                        {installPrompt && (
                            <button
                                onClick={handleInstallApp}
                                className="px-2.5 py-1 rounded-full text-xs font-bold transition active:scale-95 shadow-md flex items-center gap-1"
                                style={{ background: "#E8A93B", color: "#2B3A32" }}
                                title="Install App to Homescreen"
                            >
                                <span>📲</span>
                                <span>Install</span>
                            </button>
                        )}

                        {/* Online / Offline Sync Pill */}
                        <button
                            onClick={handleManualSync}
                            className="px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition active:scale-95"
                            style={{
                                background: isOnline ? "#34473D" : "#E85C4A22",
                                border: `1px solid ${isOnline ? "#4A5D52" : "#E85C4A"}`,
                                color: "#F5F1E6",
                            }}
                            title="Click to sync data with backend"
                        >
                            <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-400" : "bg-amber-400"} ${isSyncing ? "animate-ping" : ""}`} />
                            <span>{isSyncing ? "Syncing..." : isOnline ? "Online" : "Offline (Dexie)"}</span>
                        </button>
                    </div>
                </div>

                {/* Sync Notification Banner */}
                {syncMessage && (
                    <div
                        className="mb-4 rounded-xl px-3 py-2 text-center text-xs font-semibold animate-fade-in"
                        style={{ background: "#34473D", border: "1px solid #E8A93B", color: "#F5F1E6" }}
                    >
                        {syncMessage}
                    </div>
                )}

                {/* Balance card */}
                <div
                    className="rounded-3xl p-6 mb-4 relative overflow-hidden shadow-lg"
                    style={{ background: "#34473D", border: "1px solid #4A5D52" }}
                >
                    <div className="text-center">
                        <div
                            className="text-6xl font-bold tabular-nums leading-none mb-1"
                            style={{ color: balance >= 0 ? "#E8A93B" : "#E85C4A", fontFamily: "ui-rounded, system-ui, sans-serif" }}
                        >
                            ${balance.toFixed(0)}
                        </div>
                        <div className="flex items-center justify-center gap-2 mt-2">
                            <span className="text-xl">💰</span>
                        </div>
                    </div>
                </div>

                {/* Transaction History Widget (Placed between Balance Card and Category Grid) */}
                <div
                    className="rounded-3xl p-4 mb-6 shadow-md"
                    style={{ background: "#34473D", border: "1px solid #4A5D52" }}
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">📜</span>
                            <span className="text-sm font-bold tracking-wide" style={{ color: "#F5F1E6" }}>
                                Transaction History
                            </span>
                            {deletedHistory.length > 0 && (
                                <span
                                    className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                    style={{ background: "#E85C4A33", color: "#E85C4A", border: "1px solid #E85C4A55" }}
                                >
                                    {deletedHistory.length} deleted
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => {
                                setHistoryTab("active");
                                setShowHistoryModal(true);
                            }}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg transition active:scale-95 flex items-center gap-1 shadow-sm"
                            style={{ background: "#2B3A32", color: "#E8A93B", border: "1px solid #4A5D52" }}
                        >
                            <span>View All</span>
                            <span>↗</span>
                        </button>
                    </div>

                    {/* Compact Preview of recent activity */}
                    {entries.length === 0 && deletedHistory.length === 0 ? (
                        <div className="text-center py-2 text-xs opacity-60" style={{ color: "#F5F1E6" }}>
                            No activity recorded yet in Dexie DB.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {entries.slice(0, 2).map((e) => (
                                <div
                                    key={e.id}
                                    className="flex items-center justify-between p-2.5 rounded-2xl transition"
                                    style={{ background: "#2B3A32", border: "1px solid #4A5D5255" }}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <span className="text-xl">{e.emoji}</span>
                                        <div>
                                            <div className="text-xs font-semibold" style={{ color: "#F5F1E6" }}>
                                                {e.name}
                                            </div>
                                            <div className="text-[10px] opacity-60" style={{ color: "#F5F1E6" }}>
                                                {formatDate(e.date)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="text-xs font-bold tabular-nums"
                                            style={{ color: e.kind === "in" ? "#E8A93B" : "#F5F1E6" }}
                                        >
                                            {e.kind === "in" ? "+" : "-"}${e.amount.toFixed(0)}
                                        </span>
                                        <button
                                            onClick={() => removeEntry(e.id)}
                                            className="p-1 text-xs opacity-60 hover:opacity-100 transition rounded"
                                            title="Delete transaction"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {deletedHistory.length > 0 && (
                                <button
                                    onClick={() => {
                                        setHistoryTab("deleted");
                                        setShowHistoryModal(true);
                                    }}
                                    className="w-full text-center py-1.5 rounded-xl text-[11px] font-medium transition active:scale-98 flex items-center justify-center gap-1.5"
                                    style={{ background: "#E85C4A15", color: "#E85C4A", border: "1px dashed #E85C4A44" }}
                                >
                                    <span>🗑️</span>
                                    <span>{deletedHistory.length} deleted {deletedHistory.length === 1 ? "record" : "records"} in client history</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Category grid */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => openCategory(cat)}
                            className="aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 active:scale-95 transition shadow-sm"
                            style={{ background: "#34473D", border: `2px solid ${cat.color}55` }}
                        >
                            <span className="text-3xl">{cat.emoji}</span>
                            <span
                                className="text-xs font-semibold tracking-wide text-center px-1"
                                style={{ color: "#F5F1E6" }}
                            >
                                {cat.name}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Income button */}
                <button
                    onClick={openIncome}
                    className="w-full h-16 rounded-2xl flex items-center justify-center gap-3 text-2xl font-bold mb-6 active:scale-95 transition shadow-lg"
                    style={{ background: "#E8A93B", color: "#2B3A32" }}
                >
                    <span>💵</span>
                    <span>+</span>
                </button>

                {/* Basket strip: recent activity as icon chips */}
                <div>
                    <div className="flex flex-wrap gap-2">
                        {entries.map((e) => (
                            <button
                                key={e.id}
                                onClick={() => removeEntry(e.id)}
                                className="flex items-center gap-1 px-3 py-2 rounded-full active:scale-95 transition shadow-sm"
                                style={{
                                    background: "#34473D",
                                    border: `1px solid ${e.kind === "in" ? "#E8A93B" : "#4A5D52"}`,
                                }}
                                title="Tap to remove"
                            >
                                <span className="text-lg">{e.emoji}</span>
                                <span
                                    className="text-sm font-semibold tabular-nums"
                                    style={{ color: e.kind === "in" ? "#E8A93B" : "#F5F1E6" }}
                                >
                                    {e.kind === "in" ? "+" : "-"}${e.amount.toFixed(0)}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Keypad Modal */}
                {pad && (
                    <Keypad
                        icon={pad.emoji}
                        title={pad.name}
                        accentColor={pad.color}
                        onConfirm={confirm}
                        onCancel={() => setPad(null)}
                    />
                )}

                {/* Full Transaction History & Server Audit Modal */}
                {showHistoryModal && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        style={{ background: "rgba(20,28,24,0.85)", backdropFilter: "blur(4px)" }}
                    >
                        <div
                            className="w-full max-w-sm rounded-3xl p-5 flex flex-col max-h-[85vh] shadow-2xl relative"
                            style={{ background: "#34473D", border: "1px solid #4A5D52" }}
                        >
                            {/* Modal Header */}
                            <div className="flex items-center justify-between pb-3 mb-3 border-b" style={{ borderColor: "#4A5D52" }}>
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">📜</span>
                                    <span className="text-base font-bold" style={{ color: "#F5F1E6" }}>
                                        Transaction Ledger
                                    </span>
                                </div>
                                <button
                                    onClick={() => setShowHistoryModal(false)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold active:scale-95 transition"
                                    style={{ background: "#2B3A32", color: "#F5F1E6" }}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Tabs */}
                            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl mb-3" style={{ background: "#2B3A32" }}>
                                <button
                                    onClick={() => setHistoryTab("active")}
                                    className={`py-1.5 text-[11px] font-semibold rounded-lg transition ${historyTab === "active" ? "shadow font-bold" : "opacity-70"
                                        }`}
                                    style={{
                                        background: historyTab === "active" ? "#4A5D52" : "transparent",
                                        color: "#F5F1E6",
                                    }}
                                >
                                    Active ({entries.length})
                                </button>
                                <button
                                    onClick={() => setHistoryTab("deleted")}
                                    className={`py-1.5 text-[11px] font-semibold rounded-lg transition ${historyTab === "deleted" ? "shadow font-bold" : "opacity-70"
                                        }`}
                                    style={{
                                        background: historyTab === "deleted" ? "#4A5D52" : "transparent",
                                        color: "#E85C4A",
                                    }}
                                >
                                    Deleted ({deletedHistory.length})
                                </button>
                                <button
                                    onClick={() => setHistoryTab("server")}
                                    className={`py-1.5 text-[11px] font-semibold rounded-lg transition ${historyTab === "server" ? "shadow font-bold" : "opacity-70"
                                        }`}
                                    style={{
                                        background: historyTab === "server" ? "#4A5D52" : "transparent",
                                        color: "#E8A93B",
                                    }}
                                >
                                    🛡️ Server ({serverLogs.length})
                                </button>
                            </div>

                            {/* Tab 1: Active Transactions */}
                            {historyTab === "active" && (
                                <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
                                    {entries.length === 0 ? (
                                        <div className="text-center py-8 text-xs opacity-60" style={{ color: "#F5F1E6" }}>
                                            No active transactions recorded.
                                        </div>
                                    ) : (
                                        entries.map((e) => (
                                            <div
                                                key={e.id}
                                                className="flex items-center justify-between p-3 rounded-2xl"
                                                style={{ background: "#2B3A32", border: "1px solid #4A5D5266" }}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="text-2xl">{e.emoji}</span>
                                                    <div>
                                                        <div className="text-xs font-bold" style={{ color: "#F5F1E6" }}>
                                                            {e.name}
                                                        </div>
                                                        <div className="text-[10px] opacity-60" style={{ color: "#F5F1E6" }}>
                                                            {formatDate(e.date)}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span
                                                        className="text-sm font-bold tabular-nums"
                                                        style={{ color: e.kind === "in" ? "#E8A93B" : "#F5F1E6" }}
                                                    >
                                                        {e.kind === "in" ? "+" : "-"}${e.amount.toFixed(0)}
                                                    </span>
                                                    <button
                                                        onClick={() => removeEntry(e.id)}
                                                        className="p-1.5 rounded-lg text-xs active:scale-95 transition"
                                                        style={{ background: "#E85C4A22", color: "#E85C4A", border: "1px solid #E85C4A44" }}
                                                        title="Delete from active"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {/* Tab 2: Deleted by Client */}
                            {historyTab === "deleted" && (
                                <div className="flex-1 flex flex-col min-h-[220px]">
                                    <div className="flex items-center justify-between mb-2 px-1">
                                        <span className="text-[11px] opacity-75" style={{ color: "#F5F1E6" }}>
                                            What client deleted:
                                        </span>
                                        {deletedHistory.length > 0 && (
                                            <button
                                                onClick={clearAllClientHistory}
                                                className="text-[10px] font-bold px-2 py-1 rounded-lg transition active:scale-95"
                                                style={{ background: "#E85C4A33", color: "#E85C4A", border: "1px solid #E85C4A" }}
                                            >
                                                Clear My History
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                                        {deletedHistory.length === 0 ? (
                                            <div className="text-center py-8 text-xs opacity-60" style={{ color: "#F5F1E6" }}>
                                                No deleted records in your client history.
                                            </div>
                                        ) : (
                                            deletedHistory.map((e) => (
                                                <div
                                                    key={e.id}
                                                    className="flex items-center justify-between p-3 rounded-2xl"
                                                    style={{ background: "#2B3A32", border: "1px solid #E85C4A44" }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-2xl opacity-75">{e.emoji}</span>
                                                        <div>
                                                            <div className="text-xs font-semibold line-through opacity-80" style={{ color: "#F5F1E6" }}>
                                                                {e.name}
                                                            </div>
                                                            <div className="text-[10px]" style={{ color: "#E85C4A" }}>
                                                                Deleted: {formatDate(e.deletedAt)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-semibold tabular-nums opacity-60" style={{ color: "#F5F1E6" }}>
                                                            ${e.amount.toFixed(0)}
                                                        </span>
                                                        <button
                                                            onClick={() => restoreEntry(e.id)}
                                                            className="p-1.5 rounded-lg text-xs active:scale-95 transition"
                                                            style={{ background: "#4A5D52", color: "#F5F1E6" }}
                                                            title="Restore transaction"
                                                        >
                                                            ↩
                                                        </button>
                                                        <button
                                                            onClick={() => purgeClientHistoryItem(e.id)}
                                                            className="p-1.5 rounded-lg text-xs active:scale-95 transition"
                                                            style={{ background: "#E85C4A22", color: "#E85C4A", border: "1px solid #E85C4A44" }}
                                                            title="Erase from client history"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <div className="text-[10px] opacity-60 text-center mt-2 pt-2 border-t" style={{ borderColor: "#4A5D52", color: "#F5F1E6" }}>
                                        Client can clear records from view; server audit log retains all actions.
                                    </div>
                                </div>
                            )}

                            {/* Tab 3: Server Access & Immutable Audit Log */}
                            {historyTab === "server" && (
                                <div className="flex-1 flex flex-col min-h-[220px]">
                                    {!serverAdminUnlocked ? (
                                        <div className="flex flex-col items-center justify-center p-4 text-center my-auto space-y-3">
                                            <div className="text-3xl">🛡️</div>
                                            <div className="text-sm font-bold" style={{ color: "#F5F1E6" }}>
                                                Server Administrator Access
                                            </div>
                                            <div className="text-xs opacity-75 max-w-xs" style={{ color: "#F5F1E6" }}>
                                                View the immutable server master audit log of all transactions and deletion records.
                                            </div>
                                            <div className="flex gap-2 w-full max-w-xs pt-1">
                                                <input
                                                    type="password"
                                                    value={adminPin}
                                                    onChange={(e) => {
                                                        setAdminPin(e.target.value);
                                                        setPinError(false);
                                                    }}
                                                    placeholder="Enter PIN (Default: 1234)"
                                                    className="flex-1 px-3 py-2 rounded-xl text-xs outline-none"
                                                    style={{ background: "#2B3A32", border: `1px solid ${pinError ? "#E85C4A" : "#4A5D52"}`, color: "#F5F1E6" }}
                                                />
                                                <button
                                                    onClick={handleUnlockAdmin}
                                                    className="px-4 py-2 rounded-xl text-xs font-bold active:scale-95 transition"
                                                    style={{ background: "#E8A93B", color: "#2B3A32" }}
                                                >
                                                    Unlock
                                                </button>
                                            </div>
                                            {pinError && (
                                                <span className="text-[11px] font-semibold" style={{ color: "#E85C4A" }}>
                                                    Incorrect PIN. Try 1234 or admin.
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex flex-col">
                                            <div className="flex items-center justify-between mb-2 pb-1 border-b" style={{ borderColor: "#4A5D52" }}>
                                                <span className="text-[11px] font-bold text-emerald-400">
                                                    ● Server Master Ledger (Immutable)
                                                </span>
                                                <button
                                                    onClick={() => setServerAdminUnlocked(false)}
                                                    className="text-[10px] px-2 py-0.5 rounded opacity-75 hover:opacity-100"
                                                    style={{ background: "#2B3A32", color: "#F5F1E6" }}
                                                >
                                                    Lock View
                                                </button>
                                            </div>

                                            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[300px]">
                                                {serverLogs.length === 0 ? (
                                                    <div className="text-center py-8 text-xs opacity-60" style={{ color: "#F5F1E6" }}>
                                                        No server logs generated yet.
                                                    </div>
                                                ) : (
                                                    serverLogs.map((log) => (
                                                        <div
                                                            key={log.logId}
                                                            className="p-2.5 rounded-xl text-[11px] space-y-1 font-mono"
                                                            style={{ background: "#2B3A32", border: "1px solid #4A5D52" }}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <span
                                                                    className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                                                                    style={{
                                                                        background:
                                                                            log.action === "TRANSACTION_CREATED"
                                                                                ? "#E8A93B33"
                                                                                : "#E85C4A33",
                                                                        color:
                                                                            log.action === "TRANSACTION_CREATED"
                                                                                ? "#E8A93B"
                                                                                : "#E85C4A",
                                                                    }}
                                                                >
                                                                    {log.action.replace(/_/g, " ")}
                                                                </span>
                                                                <span className="text-[9px] opacity-60" style={{ color: "#F5F1E6" }}>
                                                                    {formatDate(log.timestamp)}
                                                                </span>
                                                            </div>

                                                            {log.details && (
                                                                <div className="text-[11px] flex items-center justify-between" style={{ color: "#F5F1E6" }}>
                                                                    <span>
                                                                        {log.details.emoji || "📄"} {log.details.name || (log.details.clearedCount !== undefined ? `Cleared ${log.details.clearedCount} items` : "Record")}
                                                                    </span>
                                                                    {log.details.amount !== undefined && (
                                                                        <span className="font-bold tabular-nums">
                                                                            ${log.details.amount}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <div className="text-[8px] opacity-40 truncate" style={{ color: "#F5F1E6" }}>
                                                                ID: {log.logId}
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}