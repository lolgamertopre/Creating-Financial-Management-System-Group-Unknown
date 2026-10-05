import { useState, useEffect, useMemo } from "react";
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
    getBudget,
    setBudget as saveBudgetToDB,
    getCurrency,
    setCurrency as saveCurrencyToDB,
    db,
} from "./db.js";

// --- Curated Categories matching Pocketwise specifications ---
const DEFAULT_CATEGORIES = [
    { id: "grocery", name: "Grocery Expenses", emoji: "🛒", color: "#10B981", bg: "#ECFDF5" },
    { id: "electricity", name: "Electricity Expenses", emoji: "⚡", color: "#F59E0B", bg: "#FEF3C7" },
    { id: "water", name: "Water Expenses", emoji: "💧", color: "#06B6D4", bg: "#CFFAFE" },
    { id: "transport", name: "Transportation Expenses", emoji: "🚌", color: "#6366F1", bg: "#EEF2FF" },
    { id: "health", name: "Health Expenses", emoji: "❤️", color: "#EF4444", bg: "#FEE2E2" },
    { id: "house", name: "House Expenses", emoji: "🏠", color: "#8B5CF6", bg: "#F3E8FF" },
    { id: "shopping", name: "Shopping", emoji: "🛍️", color: "#EC4899", bg: "#FCE7F3" },
    { id: "dining", name: "Dining & Food", emoji: "🍽️", color: "#F97316", bg: "#FFEDD5" },
];

const INCOME_CATEGORIES = [
    { id: "salary", name: "Salary", emoji: "💼", color: "#10B981", bg: "#ECFDF5" },
    { id: "allowance", name: "Allowance", emoji: "💵", color: "#6366F1", bg: "#EEF2FF" },
    { id: "business", name: "Business", emoji: "📈", color: "#F59E0B", bg: "#FEF3C7" },
    { id: "bonus", name: "Bonus / Gift", emoji: "🎁", color: "#EC4899", bg: "#FCE7F3" },
    { id: "other_income", name: "Other Income", emoji: "✨", color: "#06B6D4", bg: "#CFFAFE" },
];

function formatCurrency(amount, currency = "₱") {
    const num = Math.abs(Number(amount) || 0);
    return `${currency}${num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

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

export default function PocketwiseApp() {
    // Core data states
    const [entries, setEntries] = useState([]);
    const [deletedHistory, setDeletedHistory] = useState([]);
    const [serverLogs, setServerLogs] = useState([]);
    const [monthlyBudget, setMonthlyBudget] = useState(15000);
    const [currency, setCurrency] = useState("₱");
    const [loading, setLoading] = useState(true);

    // Active navigation tab: 'home' | 'income' | 'expenses' | 'reports' | 'settings'
    const [activeTab, setActiveTab] = useState("home");

    // Network & PWA status
    const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState("");
    const [installPrompt, setInstallPrompt] = useState(null);

    // Modals
    const [showKeypad, setShowKeypad] = useState(false);
    const [keypadType, setKeypadType] = useState("out"); // 'in' | 'out'
    const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORIES[0]);
    const [keypadValue, setKeypadValue] = useState("");
    const [keypadNote, setKeypadNote] = useState("");

    const [showBudgetModal, setShowBudgetModal] = useState(false);
    const [editBudgetInput, setEditBudgetInput] = useState("15000");

    const [showNotificationDrawer, setShowNotificationDrawer] = useState(false);
    const [reportPeriod, setReportPeriod] = useState("this_month"); // 'this_month' | 'last_month' | 'all'

    // Device container toggle for desktop users
    const [usePhoneFrame, setUsePhoneFrame] = useState(true);

    // Load initial data
    const refreshData = async () => {
        try {
            const active = await getActiveTransactions();
            const deleted = await getDeletedTransactions();
            const logs = await getAuditLogs();
            const budgetVal = await getBudget();
            const currVal = await getCurrency();

            // Migration / Initial demo if completely empty
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
                    } catch (e) {
                        console.error("Migration error:", e);
                    }
                }
            }

            const freshActive = await getActiveTransactions();
            const freshDeleted = await getDeletedTransactions();

            setEntries(freshActive);
            setDeletedHistory(freshDeleted);
            setServerLogs(logs);
            setMonthlyBudget(budgetVal || 15000);
            setCurrency(currVal || "₱");
        } catch (err) {
            console.error("Failed to load IndexedDB data:", err);
        }
    };

    useEffect(() => {
        (async () => {
            await refreshData();
            setLoading(false);
        })();

        const handleOnline = async () => {
            setIsOnline(true);
            setSyncMessage("Back Online! Syncing offline records...");
            setIsSyncing(true);
            const res = await syncPendingData();
            setIsSyncing(false);
            if (res.success) {
                setSyncMessage("All offline records synced!");
                setTimeout(() => setSyncMessage(""), 3000);
            }
            await refreshData();
        };

        const handleOffline = () => {
            setIsOnline(false);
            setSyncMessage("Offline mode: Storing securely in IndexedDB");
        };

        const handleBeforeInstall = (e) => {
            e.preventDefault();
            setInstallPrompt(e);
        };

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        window.addEventListener("beforeinstallprompt", handleBeforeInstall);

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
            window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
        };
    }, []);

    // Filtered data by periods
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyTransactions = useMemo(() => {
        return entries.filter((t) => {
            if (!t.date) return false;
            const d = new Date(t.date);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });
    }, [entries, currentMonth, currentYear]);

    const lastMonthTransactions = useMemo(() => {
        const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
        const lmMonth = lastMonthDate.getMonth();
        const lmYear = lastMonthDate.getFullYear();
        return entries.filter((t) => {
            if (!t.date) return false;
            const d = new Date(t.date);
            return d.getMonth() === lmMonth && d.getFullYear() === lmYear;
        });
    }, [entries, currentMonth, currentYear]);

    // Financial Metrics Calculation
    const totalIncomeThisMonth = useMemo(() => {
        return monthlyTransactions
            .filter((t) => t.kind === "in")
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    }, [monthlyTransactions]);

    const totalExpensesThisMonth = useMemo(() => {
        return monthlyTransactions
            .filter((t) => t.kind === "out")
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    }, [monthlyTransactions]);

    const totalIncomeLastMonth = useMemo(() => {
        return lastMonthTransactions
            .filter((t) => t.kind === "in")
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    }, [lastMonthTransactions]);

    const expensesCountThisMonth = useMemo(() => {
        return monthlyTransactions.filter((t) => t.kind === "out").length;
    }, [monthlyTransactions]);

    const netBalance = useMemo(() => {
        return totalIncomeThisMonth - totalExpensesThisMonth;
    }, [totalIncomeThisMonth, totalExpensesThisMonth]);

    const remainingBudget = useMemo(() => {
        return Math.max(0, monthlyBudget - totalExpensesThisMonth);
    }, [monthlyBudget, totalExpensesThisMonth]);

    const budgetPercentUsed = useMemo(() => {
        if (!monthlyBudget || monthlyBudget <= 0) return 0;
        return Math.min(100, Math.round((totalExpensesThisMonth / monthlyBudget) * 100));
    }, [monthlyBudget, totalExpensesThisMonth]);

    const budgetPercentRemaining = useMemo(() => {
        return Math.max(0, 100 - budgetPercentUsed);
    }, [budgetPercentUsed]);

    // Income change comparison %
    const incomeGrowthPercent = useMemo(() => {
        if (totalIncomeLastMonth === 0) {
            return totalIncomeThisMonth > 0 ? "+100%" : "+0.0%";
        }
        const diff = ((totalIncomeThisMonth - totalIncomeLastMonth) / totalIncomeLastMonth) * 100;
        return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
    }, [totalIncomeThisMonth, totalIncomeLastMonth]);

    // Days remaining in month calculation
    const daysRemaining = useMemo(() => {
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        return Math.max(0, lastDayOfMonth - now.getDate());
    }, [currentMonth, currentYear, now]);

    // Weekly average spending
    const weeklyAverage = useMemo(() => {
        const currentDay = now.getDate() || 1;
        const weeksElapsed = Math.max(1, currentDay / 7);
        return totalExpensesThisMonth / weeksElapsed;
    }, [totalExpensesThisMonth, now]);

    // Category breakdown calculation
    const categorySpending = useMemo(() => {
        const map = {};
        for (const cat of DEFAULT_CATEGORIES) {
            map[cat.id] = { ...cat, total: 0, count: 0 };
        }

        for (const t of monthlyTransactions) {
            if (t.kind === "out") {
                const catId = t.categoryId || (DEFAULT_CATEGORIES.find((c) => c.name === t.name)?.id) || "grocery";
                if (!map[catId]) {
                    map[catId] = { id: catId, name: t.name, emoji: t.emoji || "💸", color: "#6366F1", bg: "#EEF2FF", total: 0, count: 0 };
                }
                map[catId].total += Number(t.amount) || 0;
                map[catId].count += 1;
            }
        }

        return Object.values(map)
            .map((cat) => ({
                ...cat,
                percentage: totalExpensesThisMonth > 0 ? Math.round((cat.total / totalExpensesThisMonth) * 100) : 0,
            }))
            .sort((a, b) => b.total - a.total);
    }, [monthlyTransactions, totalExpensesThisMonth]);

    // Manual sync handler
    const handleManualSync = async () => {
        setIsSyncing(true);
        setSyncMessage("Syncing with cloud backend...");
        const res = await syncPendingData();
        setIsSyncing(false);
        if (res.success) {
            setSyncMessage("Cloud sync complete!");
        } else if (res.reason === "offline") {
            setSyncMessage("Currently offline. Changes remain saved locally.");
        } else {
            setSyncMessage("Offline records preserved in Dexie IndexedDB.");
        }
        setTimeout(() => setSyncMessage(""), 3500);
        await refreshData();
    };

    // Install PWA
    const handleInstallApp = async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        if (outcome === "accepted") setInstallPrompt(null);
    };

    // Open add transaction sheet
    const openAddTransaction = (type = "out", defaultCat = null) => {
        setKeypadType(type);
        const categories = type === "in" ? INCOME_CATEGORIES : DEFAULT_CATEGORIES;
        setSelectedCategory(defaultCat || categories[0]);
        setKeypadValue("");
        setKeypadNote("");
        setShowKeypad(true);
    };

    // Save transaction
    const handleSaveTransaction = async () => {
        const amount = parseFloat(keypadValue);
        if (isNaN(amount) || amount <= 0) return;

        const newEntry = {
            id: Date.now(),
            categoryId: selectedCategory.id,
            name: keypadNote.trim() || selectedCategory.name,
            emoji: selectedCategory.emoji,
            amount,
            kind: keypadType,
            date: new Date().toISOString(),
        };

        await saveTransaction(newEntry);
        setShowKeypad(false);
        setKeypadValue("");
        setKeypadNote("");
        await refreshData();
    };

    // Soft delete transaction
    const handleDeleteTransaction = async (id) => {
        await softDeleteTransaction(id);
        await refreshData();
    };

    // Restore deleted transaction
    const handleRestoreTransaction = async (id) => {
        await restoreDeletedTransaction(id);
        await refreshData();
    };

    // Save Budget
    const handleSaveBudget = async () => {
        const val = parseFloat(editBudgetInput);
        if (!isNaN(val) && val > 0) {
            setMonthlyBudget(val);
            await saveBudgetToDB(val);
            setShowBudgetModal(false);
        }
    };

    // CSV Export functionality (specified in Figma workflow!)
    const handleExportCSV = () => {
        const targetList = reportPeriod === "last_month" ? lastMonthTransactions : reportPeriod === "all" ? entries : monthlyTransactions;
        if (targetList.length === 0) {
            alert("No transactions available to export for this timeframe.");
            return;
        }

        const headers = ["ID", "Date", "Type", "Category", "Description", "Amount", "Currency", "SyncStatus"];
        const rows = targetList.map((t) => [
            t.id,
            `"${new Date(t.date).toISOString()}"`,
            t.kind === "in" ? "Income" : "Expense",
            `"${t.name || ""}"`,
            `"${t.name || ""}"`,
            t.amount,
            currency,
            t.syncStatus || "local",
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        const filename = `Pocketwise_Report_${reportPeriod}_${new Date().toISOString().slice(0, 10)}.csv`;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Demo Data Seeder for quick presentation
    const handleSeedDemoData = async () => {
        const demoItems = [
            { id: Date.now() - 800000, categoryId: "salary", name: "Monthly Salary", emoji: "💼", amount: 28500, kind: "in", date: new Date().toISOString() },
            { id: Date.now() - 700000, categoryId: "grocery", name: "Grocery Expenses", emoji: "🛒", amount: 2450, kind: "out", date: new Date().toISOString() },
            { id: Date.now() - 600000, categoryId: "electricity", name: "Electricity Expenses", emoji: "⚡", amount: 1850, kind: "out", date: new Date().toISOString() },
            { id: Date.now() - 500000, categoryId: "water", name: "Water Expenses", emoji: "💧", amount: 480, kind: "out", date: new Date().toISOString() },
            { id: Date.now() - 400000, categoryId: "transport", name: "Transportation Expenses", emoji: "🚌", amount: 620, kind: "out", date: new Date().toISOString() },
            { id: Date.now() - 300000, categoryId: "dining", name: "Dining & Food", emoji: "🍽️", amount: 750, kind: "out", date: new Date().toISOString() },
        ];

        for (const item of demoItems) {
            await saveTransaction(item);
        }
        await refreshData();
    };

    if (loading) {
        return (
            <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#F0F2F8]">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl shadow-lg animate-pulse mb-3">
                    💳
                </div>
                <div className="text-base font-bold text-slate-700">Pocketwise</div>
                <div className="text-xs text-slate-400 mt-1">Loading offline database...</div>
            </div>
        );
    }

    // App Content
    const appBody = (
        <div className="w-full flex flex-col pb-28 pt-2">
            {/* Top Bar: Pocketwise + Overview & Notifications */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#6366F1] to-[#4F46E5] text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                            <path d="M21 7.28V5c0-1.1-.9-2-2-2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-2.28c.59-.35 1-.98 1-1.72V9c0-.74-.41-1.37-1-1.72zM20 9v6h-7V9h7zM5 19V5h14v2h-6c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h6v2H5z" />
                        </svg>
                    </div>
                    <div>
                        <div className="text-lg font-extrabold text-slate-900 tracking-tight leading-tight">
                            Pocketwise
                        </div>
                        <div className="text-[11px] font-semibold text-slate-400">
                            {activeTab === "home" && "Overview"}
                            {activeTab === "income" && "Income Stream"}
                            {activeTab === "expenses" && "Expense Manager"}
                            {activeTab === "reports" && "Financial Reports"}
                            {activeTab === "settings" && "Preferences"}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Offline / Online Sync status badge */}
                    <button
                        onClick={handleManualSync}
                        className="px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 transition active:scale-95 bg-white border border-slate-200 shadow-sm text-slate-700"
                        title="Click to trigger cloud synchronization"
                    >
                        <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-amber-500"} ${isSyncing ? "animate-ping" : ""}`} />
                        <span>{isSyncing ? "Syncing..." : isOnline ? "Synced" : "Offline"}</span>
                    </button>

                    {/* Notification Bell */}
                    <button
                        onClick={() => setShowNotificationDrawer(true)}
                        className="w-10 h-10 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-center text-slate-700 hover:bg-slate-50 transition active:scale-95 relative"
                        title="Notifications and audit activity"
                    >
                        <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        {serverLogs.length > 0 && (
                            <span className="w-2 h-2 rounded-full bg-indigo-600 absolute top-2.5 right-2.5 ring-2 ring-white" />
                        )}
                    </button>
                </div>
            </div>

            {/* Sync banner if active */}
            {syncMessage && (
                <div className="mx-4 mt-2 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-50 border border-indigo-100 text-indigo-700 text-center animate-fade-in">
                    {syncMessage}
                </div>
            )}

            {/* PWA Install Alert if prompt available */}
            {installPrompt && (
                <div className="mx-4 mt-2 p-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white flex items-center justify-between shadow-md">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">📲</span>
                        <div className="text-xs font-bold leading-tight">
                            Install Pocketwise App
                            <div className="text-[10px] font-normal opacity-90">OPPO A9 2020 & Android Ready</div>
                        </div>
                    </div>
                    <button
                        onClick={handleInstallApp}
                        className="px-3 py-1 bg-white text-indigo-600 rounded-xl text-xs font-bold active:scale-95 transition"
                    >
                        Install
                    </button>
                </div>
            )}

            {/* --- TAB 1: HOME (FIGMA DASHBOARD) --- */}
            {activeTab === "home" && (
                <div className="px-4 space-y-4 mt-3">
                    {/* 2x2 Metric Cards Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* TOTAL INCOME */}
                        <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex flex-col justify-between">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                                    TOTAL INCOME
                                </span>
                                <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center text-xs font-bold">
                                    ↓
                                </div>
                            </div>
                            <div>
                                <div className="text-2xl font-extrabold text-slate-900 tracking-tight tabular-nums">
                                    {formatCurrency(totalIncomeThisMonth, currency)}
                                </div>
                                <div className="text-[11px] font-semibold text-emerald-600 mt-1 flex items-center gap-0.5">
                                    {incomeGrowthPercent} from last month
                                </div>
                            </div>
                        </div>

                        {/* TOTAL EXPENSES */}
                        <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex flex-col justify-between">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                                    TOTAL EXPENSES
                                </span>
                                <div className="w-7 h-7 rounded-full bg-rose-50 text-rose-500 border border-rose-100 flex items-center justify-center text-xs font-bold">
                                    ↑
                                </div>
                            </div>
                            <div>
                                <div className="text-2xl font-extrabold text-slate-900 tracking-tight tabular-nums">
                                    {formatCurrency(totalExpensesThisMonth, currency)}
                                </div>
                                <div className="text-[11px] font-semibold text-slate-400 mt-1">
                                    {expensesCountThisMonth} transactions this month
                                </div>
                            </div>
                        </div>

                        {/* REMAINING BUDGET */}
                        <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex flex-col justify-between">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                                    REMAINING BUDGET
                                </span>
                                <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center text-xs">
                                    💳
                                </div>
                            </div>
                            <div>
                                <div className="text-2xl font-extrabold text-slate-900 tracking-tight tabular-nums">
                                    {formatCurrency(remainingBudget, currency)}
                                </div>
                                <div className="text-[11px] font-semibold text-slate-400 mt-1">
                                    {budgetPercentRemaining}% available to spend
                                </div>
                            </div>
                        </div>

                        {/* NET BALANCE */}
                        <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex flex-col justify-between">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                                    NET BALANCE
                                </span>
                                <div className="w-7 h-7 rounded-full bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center text-xs">
                                    📊
                                </div>
                            </div>
                            <div>
                                <div className={`text-2xl font-extrabold tracking-tight tabular-nums ${netBalance >= 0 ? "text-slate-900" : "text-rose-600"}`}>
                                    {netBalance < 0 ? "-" : ""}{formatCurrency(netBalance, currency)}
                                </div>
                                <div className="text-[11px] font-semibold text-slate-400 mt-1">
                                    {netBalance >= 0 ? "You're in a healthy range" : "Spending exceeds income"}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* MONTHLY BUDGET Card ("Spending plan") */}
                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                                    MONTHLY BUDGET
                                </div>
                                <div className="text-base font-bold text-slate-900">
                                    Spending plan
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setEditBudgetInput(monthlyBudget.toString());
                                    setShowBudgetModal(true);
                                }}
                                className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100 transition active:scale-95"
                            >
                                {budgetPercentUsed}% used
                            </button>
                        </div>

                        {/* Amount progress */}
                        <div className="mt-3 flex items-baseline gap-1.5">
                            <span className="text-3xl font-extrabold text-slate-900 tabular-nums">
                                {formatCurrency(totalExpensesThisMonth, currency)}
                            </span>
                            <span className="text-xs font-semibold text-slate-400">
                                of {formatCurrency(monthlyBudget, currency)}
                            </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden my-3">
                            <div
                                className={`h-full rounded-full transition-all duration-700 ${
                                    budgetPercentUsed > 90
                                        ? "bg-rose-500"
                                        : budgetPercentUsed > 75
                                        ? "bg-amber-500"
                                        : "bg-gradient-to-r from-indigo-500 to-purple-500"
                                }`}
                                style={{ width: `${budgetPercentUsed}%` }}
                            />
                        </div>

                        {/* Sub statistics row */}
                        <div className="flex items-center justify-between text-xs font-medium text-slate-400 pt-1">
                            <div>
                                {formatCurrency(weeklyAverage, currency)} weekly avg.
                            </div>
                            <div>
                                {daysRemaining} days remaining
                            </div>
                        </div>
                    </div>

                    {/* BREAKDOWN Section ("Spending by category") */}
                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                                    BREAKDOWN
                                </div>
                                <div className="text-base font-bold text-slate-900">
                                    Spending by category
                                </div>
                            </div>
                            <button
                                onClick={() => setActiveTab("reports")}
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5 active:scale-95 transition"
                            >
                                <span>View report</span>
                                <span>&gt;</span>
                            </button>
                        </div>

                        {/* Category Items list */}
                        {categorySpending.length === 0 || totalExpensesThisMonth === 0 ? (
                            <div className="py-6 text-center">
                                <div className="text-3xl mb-2">🛒</div>
                                <div className="text-xs font-semibold text-slate-600">No expense recorded yet</div>
                                <div className="text-[11px] text-slate-400 mt-1">
                                    Tap the '+' button below to log your first expense
                                </div>
                                <button
                                    onClick={handleSeedDemoData}
                                    className="mt-3 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition"
                                >
                                    Load Sample Data
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3.5">
                                {categorySpending.slice(0, 5).map((cat) => (
                                    <div key={cat.id} className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2.5">
                                                <div
                                                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-2xl"
                                                    style={{ backgroundColor: cat.bg, color: cat.color }}
                                                >
                                                    {cat.emoji}
                                                </div>
                                                <span className="text-xs font-bold text-slate-800">
                                                    {cat.name}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-xs font-extrabold text-slate-900 tabular-nums">
                                                    {formatCurrency(cat.total, currency)}
                                                </span>
                                                <span className="text-[10px] font-semibold text-slate-400 ml-1.5">
                                                    ({cat.percentage}%)
                                                </span>
                                            </div>
                                        </div>
                                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-500"
                                                style={{
                                                    width: `${cat.percentage}%`,
                                                    backgroundColor: cat.color,
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* RECENT TRANSACTIONS */}
                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-base font-bold text-slate-900">
                                Recent Transactions
                            </div>
                            <span className="text-xs font-semibold text-slate-400">
                                {entries.length} items
                            </span>
                        </div>

                        {entries.length === 0 ? (
                            <div className="text-center py-4 text-xs text-slate-400">
                                No recent transactions recorded.
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {entries.slice(0, 5).map((item) => (
                                    <div
                                        key={item.id}
                                        className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/70 border border-slate-100 hover:bg-slate-100/60 transition"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-base">
                                                {item.emoji || (item.kind === "in" ? "💵" : "💸")}
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-slate-800">
                                                    {item.name}
                                                </div>
                                                <div className="text-[10px] font-medium text-slate-400">
                                                    {formatDate(item.date)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`text-xs font-extrabold tabular-nums ${
                                                    item.kind === "in" ? "text-emerald-600" : "text-slate-900"
                                                }`}
                                            >
                                                {item.kind === "in" ? "+" : "-"}{formatCurrency(item.amount, currency)}
                                            </span>
                                            <button
                                                onClick={() => handleDeleteTransaction(item.id)}
                                                className="w-7 h-7 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 flex items-center justify-center transition"
                                                title="Delete transaction"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- TAB 2: INCOME --- */}
            {activeTab === "income" && (
                <div className="px-4 space-y-4 mt-3">
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 text-white shadow-lg shadow-emerald-500/15">
                        <div className="text-xs font-semibold opacity-90 uppercase tracking-wider">
                            Total Income (This Month)
                        </div>
                        <div className="text-3xl font-extrabold mt-1 tabular-nums">
                            {formatCurrency(totalIncomeThisMonth, currency)}
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                            <span className="text-xs opacity-90">
                                {monthlyTransactions.filter((t) => t.kind === "in").length} income entries
                            </span>
                            <button
                                onClick={() => openAddTransaction("in")}
                                className="px-3.5 py-1.5 rounded-xl bg-white text-emerald-700 text-xs font-bold shadow-sm active:scale-95 transition"
                            >
                                + Add Income
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
                        <div className="text-base font-bold text-slate-900 mb-3">
                            Income Transactions
                        </div>
                        {entries.filter((t) => t.kind === "in").length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-xs">
                                No income entries logged yet.
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {entries
                                    .filter((t) => t.kind === "in")
                                    .map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50/40 border border-emerald-100"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-base">
                                                    {item.emoji || "💵"}
                                                </div>
                                                <div>
                                                    <div className="text-xs font-bold text-slate-800">{item.name}</div>
                                                    <div className="text-[10px] text-slate-400">{formatDate(item.date)}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-extrabold text-emerald-600 tabular-nums">
                                                    +{formatCurrency(item.amount, currency)}
                                                </span>
                                                <button
                                                    onClick={() => handleDeleteTransaction(item.id)}
                                                    className="text-slate-300 hover:text-rose-500 text-xs"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- TAB 3: EXPENSES --- */}
            {activeTab === "expenses" && (
                <div className="px-4 space-y-4 mt-3">
                    <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-3xl p-6 text-white shadow-lg shadow-rose-500/15">
                        <div className="text-xs font-semibold opacity-90 uppercase tracking-wider">
                            Total Expenses (This Month)
                        </div>
                        <div className="text-3xl font-extrabold mt-1 tabular-nums">
                            {formatCurrency(totalExpensesThisMonth, currency)}
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                            <span className="text-xs opacity-90">
                                {expensesCountThisMonth} transactions logged
                            </span>
                            <button
                                onClick={() => openAddTransaction("out")}
                                className="px-3.5 py-1.5 rounded-xl bg-white text-rose-700 text-xs font-bold shadow-sm active:scale-95 transition"
                            >
                                + Add Expense
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
                        <div className="text-base font-bold text-slate-900 mb-3">
                            Expense Transactions
                        </div>
                        {entries.filter((t) => t.kind === "out").length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-xs">
                                No expense records logged yet.
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {entries
                                    .filter((t) => t.kind === "out")
                                    .map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-base">
                                                    {item.emoji || "💸"}
                                                </div>
                                                <div>
                                                    <div className="text-xs font-bold text-slate-800">{item.name}</div>
                                                    <div className="text-[10px] text-slate-400">{formatDate(item.date)}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-extrabold text-slate-900 tabular-nums">
                                                    -{formatCurrency(item.amount, currency)}
                                                </span>
                                                <button
                                                    onClick={() => handleDeleteTransaction(item.id)}
                                                    className="text-slate-300 hover:text-rose-500 text-xs"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- TAB 4: REPORTS (SPECIFIED IN FIGMA NOTES) --- */}
            {activeTab === "reports" && (
                <div className="px-4 space-y-4 mt-3">
                    {/* Timeframe selector: This Month / Last Month / All */}
                    <div className="flex p-1 bg-slate-200/70 rounded-2xl">
                        {[
                            { id: "this_month", label: "This Month" },
                            { id: "last_month", label: "Last Month" },
                            { id: "all", label: "All Time" },
                        ].map((t) => (
                            <button
                                key={t.id}
                                onClick={() => setReportPeriod(t.id)}
                                className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
                                    reportPeriod === t.id
                                        ? "bg-white text-indigo-600 shadow-sm"
                                        : "text-slate-600 hover:text-slate-900"
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Summary comparison card */}
                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
                        <div className="text-base font-bold text-slate-900 mb-3">
                            Period Summary
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-emerald-50 rounded-2xl">
                                <div className="text-[10px] font-bold text-emerald-700 uppercase">Total Inflow</div>
                                <div className="text-lg font-extrabold text-emerald-700 tabular-nums">
                                    {formatCurrency(
                                        reportPeriod === "last_month"
                                            ? totalIncomeLastMonth
                                            : reportPeriod === "all"
                                            ? entries.filter((t) => t.kind === "in").reduce((s, t) => s + t.amount, 0)
                                            : totalIncomeThisMonth,
                                        currency
                                    )}
                                </div>
                            </div>
                            <div className="p-3 bg-rose-50 rounded-2xl">
                                <div className="text-[10px] font-bold text-rose-700 uppercase">Total Outflow</div>
                                <div className="text-lg font-extrabold text-rose-700 tabular-nums">
                                    {formatCurrency(
                                        reportPeriod === "last_month"
                                            ? lastMonthTransactions.filter((t) => t.kind === "out").reduce((s, t) => s + t.amount, 0)
                                            : reportPeriod === "all"
                                            ? entries.filter((t) => t.kind === "out").reduce((s, t) => s + t.amount, 0)
                                            : totalExpensesThisMonth,
                                        currency
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Export CSV button - matching Figma workflow step 7-9! */}
                        <button
                            onClick={handleExportCSV}
                            className="mt-4 w-full py-3 rounded-2xl bg-indigo-600 text-white font-bold text-xs shadow-md shadow-indigo-500/20 hover:bg-indigo-700 active:scale-98 transition flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                            </svg>
                            <span>Export as CSV (Excel / Sheets)</span>
                        </button>
                    </div>

                    {/* Category Breakdown Graph in Reports */}
                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
                        <div className="text-base font-bold text-slate-900 mb-3">
                            Category Distribution
                        </div>
                        <div className="space-y-3">
                            {categorySpending.map((cat) => (
                                <div key={cat.id} className="space-y-1">
                                    <div className="flex justify-between text-xs font-semibold">
                                        <span className="flex items-center gap-1.5">
                                            <span>{cat.emoji}</span>
                                            <span>{cat.name}</span>
                                        </span>
                                        <span className="tabular-nums font-bold">
                                            {formatCurrency(cat.total, currency)} ({cat.percentage}%)
                                        </span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full"
                                            style={{
                                                width: `${cat.percentage}%`,
                                                backgroundColor: cat.color,
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* --- TAB 5: SETTINGS --- */}
            {activeTab === "settings" && (
                <div className="px-4 space-y-4 mt-3">
                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
                        <div className="text-base font-bold text-slate-900 mb-3">
                            Budget & Currency
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                <div>
                                    <div className="text-xs font-bold text-slate-800">Monthly Spending Budget</div>
                                    <div className="text-[11px] text-slate-400">Target limit for monthly spending</div>
                                </div>
                                <button
                                    onClick={() => {
                                        setEditBudgetInput(monthlyBudget.toString());
                                        setShowBudgetModal(true);
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 font-bold text-xs active:scale-95 transition"
                                >
                                    {formatCurrency(monthlyBudget, currency)} ✏️
                                </button>
                            </div>

                            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                <div>
                                    <div className="text-xs font-bold text-slate-800">Currency Symbol</div>
                                    <div className="text-[11px] text-slate-400">Default Philippine Peso (₱)</div>
                                </div>
                                <div className="flex gap-1">
                                    {["₱", "$", "€", "£"].map((sym) => (
                                        <button
                                            key={sym}
                                            onClick={async () => {
                                                setCurrency(sym);
                                                await saveCurrencyToDB(sym);
                                            }}
                                            className={`w-8 h-8 rounded-xl text-xs font-bold transition ${
                                                currency === sym
                                                    ? "bg-indigo-600 text-white shadow-sm"
                                                    : "bg-white text-slate-600 border border-slate-200"
                                            }`}
                                        >
                                            {sym}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Offline Storage & Sync Info */}
                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
                        <div className="text-base font-bold text-slate-900 mb-2">
                            Offline Engine (Dexie IndexedDB)
                        </div>
                        <div className="text-xs text-slate-500 mb-4">
                            All your data is saved offline on your device in Dexie IndexedDB. When online, pending data syncs seamlessly in the background.
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="p-3 bg-slate-50 rounded-2xl text-center">
                                <div className="text-[10px] font-bold text-slate-400 uppercase">Stored Entries</div>
                                <div className="text-xl font-extrabold text-slate-800 mt-1">{entries.length}</div>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-2xl text-center">
                                <div className="text-[10px] font-bold text-slate-400 uppercase">Audit Records</div>
                                <div className="text-xl font-extrabold text-slate-800 mt-1">{serverLogs.length}</div>
                            </div>
                        </div>

                        <button
                            onClick={handleManualSync}
                            className="w-full py-2.5 rounded-xl border border-indigo-200 text-indigo-600 text-xs font-bold hover:bg-indigo-50 active:scale-98 transition flex items-center justify-center gap-1.5"
                        >
                            <span>🔄</span>
                            <span>Force Cloud Sync Now</span>
                        </button>
                    </div>

                    {/* Device & Hardware Info */}
                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
                        <div className="text-base font-bold text-slate-900 mb-2">
                            Hardware Optimization
                        </div>
                        <div className="text-xs text-slate-500 space-y-1">
                            <div>• Device: <span className="font-semibold text-slate-700">OPPO A9 2020 (CPH1937)</span></div>
                            <div>• Chipset: <span className="font-semibold text-slate-700">Snapdragon 665 / Android 11</span></div>
                            <div>• Architecture: <span className="font-semibold text-slate-700">Offline-First IndexedDB + Service Worker</span></div>
                        </div>
                        <button
                            onClick={handleSeedDemoData}
                            className="mt-4 w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold active:scale-98 transition"
                        >
                            ⚡ Seed Demonstration Transactions
                        </button>
                    </div>
                </div>
            )}

            {/* Floating Action Buttons (Home screen) */}
            {activeTab === "home" && (
                <div className="fixed bottom-24 right-4 sm:right-6 flex flex-col items-end gap-2.5 z-30">
                    <button
                        onClick={() => openAddTransaction("in")}
                        className="bg-white/95 backdrop-blur text-indigo-600 border border-indigo-200 shadow-md font-bold text-xs px-4 py-2.5 rounded-full hover:shadow-lg transition active:scale-95 flex items-center gap-1.5"
                    >
                        <span>+</span>
                        <span>Add income</span>
                    </button>

                    <button
                        onClick={() => openAddTransaction("out")}
                        className="w-14 h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-600/30 flex items-center justify-center text-3xl font-light transition active:scale-90"
                        title="Add expense"
                    >
                        +
                    </button>
                </div>
            )}

            {/* --- BOTTOM NAVIGATION BAR (MATCHES FIGMA) --- */}
            <div className="fixed bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm bg-[#161B2E] text-white rounded-3xl p-2 px-3 shadow-2xl flex items-center justify-between z-40">
                {/* 1. Home */}
                <button
                    onClick={() => setActiveTab("home")}
                    className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition active:scale-95 ${
                        activeTab === "home" ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30" : "text-slate-400 hover:text-white"
                    }`}
                >
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                    </svg>
                    <span className="text-[10px] font-bold mt-0.5">Home</span>
                </button>

                {/* 2. Income */}
                <button
                    onClick={() => setActiveTab("income")}
                    className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition active:scale-95 ${
                        activeTab === "income" ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30" : "text-slate-400 hover:text-white"
                    }`}
                >
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" transform="rotate(180 12 12)" />
                    </svg>
                    <span className="text-[10px] font-bold mt-0.5">Income</span>
                </button>

                {/* 3. Expenses */}
                <button
                    onClick={() => setActiveTab("expenses")}
                    className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition active:scale-95 ${
                        activeTab === "expenses" ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30" : "text-slate-400 hover:text-white"
                    }`}
                >
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                    </svg>
                    <span className="text-[10px] font-bold mt-0.5">Expenses</span>
                </button>

                {/* 4. Reports */}
                <button
                    onClick={() => setActiveTab("reports")}
                    className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition active:scale-95 ${
                        activeTab === "reports" ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30" : "text-slate-400 hover:text-white"
                    }`}
                >
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z" />
                    </svg>
                    <span className="text-[10px] font-bold mt-0.5">Reports</span>
                </button>

                {/* 5. Settings */}
                <button
                    onClick={() => setActiveTab("settings")}
                    className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition active:scale-95 ${
                        activeTab === "settings" ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30" : "text-slate-400 hover:text-white"
                    }`}
                >
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                    </svg>
                    <span className="text-[10px] font-bold mt-0.5">Settings</span>
                </button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#E5E9F2] text-slate-800 flex flex-col items-center justify-start p-0 sm:py-6">
            {/* Desktop Screen Switcher Toolbar */}
            <div className="hidden sm:flex items-center gap-3 mb-4 px-4 py-2 bg-white/80 backdrop-blur rounded-2xl border border-slate-200 shadow-sm text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1.5 text-indigo-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    OPPO A9 2020 Optimized
                </span>
                <span className="text-slate-300">|</span>
                <button
                    onClick={() => setUsePhoneFrame(!usePhoneFrame)}
                    className="hover:text-indigo-600 transition"
                >
                    {usePhoneFrame ? "📱 Mobile Shell View (Figma)" : "💻 Expanded Screen View"}
                </button>
            </div>

            {/* Responsive Container: Either Phone Frame or Full Container */}
            <div
                className={`w-full bg-[#F4F5FA] relative overflow-hidden transition-all duration-300 ${
                    usePhoneFrame
                        ? "sm:max-w-[412px] sm:rounded-[48px] sm:border-[9px] sm:border-[#1C2333] sm:shadow-2xl sm:min-h-[860px]"
                        : "max-w-2xl sm:rounded-3xl sm:shadow-xl sm:border border-slate-200"
                }`}
            >
                {/* Smartphone Dynamic Island / Camera Punch Hole (in Phone Frame mode) */}
                {usePhoneFrame && (
                    <div className="hidden sm:flex items-center justify-between px-7 pt-3 pb-1 select-none">
                        <span className="text-xs font-bold text-slate-800">10:40</span>
                        {/* Dynamic Island Pill */}
                        <div className="w-24 h-5 rounded-full bg-black flex items-center justify-end pr-2 gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-800" />
                        </div>
                        <div className="flex items-center gap-1 text-[11px] font-bold text-slate-800">
                            <span>5G</span>
                            <span>📶</span>
                            <span>🔋</span>
                        </div>
                    </div>
                )}

                {/* Main Content */}
                {appBody}

                {/* MODAL 1: ADD TRANSACTION KEYPAD */}
                {showKeypad && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs animate-fade-in">
                        <div className="w-full max-w-sm sm:max-w-[412px] bg-white rounded-t-3xl p-5 pb-8 shadow-2xl animate-slide-up border-t border-slate-100">
                            {/* Type Toggle: Expense vs Income */}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex p-1 bg-slate-100 rounded-2xl w-48">
                                    <button
                                        onClick={() => {
                                            setKeypadType("out");
                                            setSelectedCategory(DEFAULT_CATEGORIES[0]);
                                        }}
                                        className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition ${
                                            keypadType === "out" ? "bg-rose-500 text-white shadow-sm" : "text-slate-600"
                                        }`}
                                    >
                                        Expense
                                    </button>
                                    <button
                                        onClick={() => {
                                            setKeypadType("in");
                                            setSelectedCategory(INCOME_CATEGORIES[0]);
                                        }}
                                        className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition ${
                                            keypadType === "in" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600"
                                        }`}
                                    >
                                        Income
                                    </button>
                                </div>
                                <button
                                    onClick={() => setShowKeypad(false)}
                                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-sm"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Amount Display */}
                            <div className="text-center my-3">
                                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                                    {selectedCategory.name}
                                </div>
                                <div className="text-4xl font-extrabold text-slate-900 mt-1 tabular-nums">
                                    {currency}{keypadValue === "" ? "0.00" : keypadValue}
                                </div>
                            </div>

                            {/* Category Selector Chips */}
                            <div className="flex gap-2 overflow-x-auto py-2 px-1 mb-3 scrollbar-none">
                                {(keypadType === "in" ? INCOME_CATEGORIES : DEFAULT_CATEGORIES).map((cat) => (
                                    <button
                                        key={cat.id}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition ${
                                            selectedCategory.id === cat.id
                                                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                        }`}
                                    >
                                        <span>{cat.emoji}</span>
                                        <span>{cat.name.replace(" Expenses", "")}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Note field */}
                            <div className="mb-3">
                                <input
                                    type="text"
                                    placeholder="Optional note / memo..."
                                    value={keypadNote}
                                    onChange={(e) => setKeypadNote(e.target.value)}
                                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            {/* Numeric Keypad */}
                            <div className="grid grid-cols-3 gap-2 mb-3">
                                {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"].map((d) => (
                                    <button
                                        key={d}
                                        onClick={() => {
                                            if (d === "back") {
                                                setKeypadValue((v) => v.slice(0, -1));
                                            } else if (d === "." && keypadValue.includes(".")) {
                                                return;
                                            } else if (keypadValue.length < 8) {
                                                setKeypadValue((v) => v + d);
                                            }
                                        }}
                                        className="h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-lg font-bold text-slate-800 flex items-center justify-center transition"
                                    >
                                        {d === "back" ? "⌫" : d}
                                    </button>
                                ))}
                            </div>

                            {/* Submit Button */}
                            <button
                                onClick={handleSaveTransaction}
                                disabled={!keypadValue || parseFloat(keypadValue) <= 0}
                                className={`w-full py-3.5 rounded-2xl font-bold text-sm shadow-md transition active:scale-98 ${
                                    keypadType === "in"
                                        ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/25"
                                        : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/25"
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                                Confirm {keypadType === "in" ? "Income" : "Expense"}
                            </button>
                        </div>
                    </div>
                )}

                {/* MODAL 2: EDIT BUDGET TARGET */}
                {showBudgetModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
                        <div className="w-full max-w-xs bg-white rounded-3xl p-5 shadow-2xl">
                            <div className="text-base font-bold text-slate-900 mb-1">
                                Set Monthly Budget
                            </div>
                            <div className="text-xs text-slate-400 mb-4">
                                Enter your target monthly spending plan.
                            </div>
                            <div className="relative mb-4">
                                <span className="absolute left-3.5 top-2.5 font-bold text-slate-400">
                                    {currency}
                                </span>
                                <input
                                    type="number"
                                    value={editBudgetInput}
                                    onChange={(e) => setEditBudgetInput(e.target.value)}
                                    className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    autoFocus
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowBudgetModal(false)}
                                    className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveBudget}
                                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-md shadow-indigo-500/25"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* DRAWER: NOTIFICATIONS & AUDIT TRAIL */}
                {showNotificationDrawer && (
                    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-fade-in">
                        <div className="w-full max-w-xs bg-white h-full p-5 flex flex-col shadow-2xl animate-slide-up">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                <div>
                                    <div className="text-base font-bold text-slate-900">Activity & Sync</div>
                                    <div className="text-xs text-slate-400">Local audit records</div>
                                </div>
                                <button
                                    onClick={() => setShowNotificationDrawer(false)}
                                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Deleted entries restore section */}
                            {deletedHistory.length > 0 && (
                                <div className="mt-3 p-3 rounded-2xl bg-amber-50 border border-amber-200/70">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-amber-800">
                                            Deleted Items ({deletedHistory.length})
                                        </span>
                                        <button
                                            onClick={async () => {
                                                await clearAllDeletedFromDB();
                                                await refreshData();
                                            }}
                                            className="text-[10px] text-amber-700 underline font-semibold"
                                        >
                                            Clear all
                                        </button>
                                    </div>
                                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                        {deletedHistory.map((d) => (
                                            <div key={d.id} className="flex items-center justify-between text-xs bg-white p-1.5 rounded-lg border border-amber-100">
                                                <span className="truncate max-w-[120px] font-medium text-slate-700">
                                                    {d.emoji} {d.name}
                                                </span>
                                                <button
                                                    onClick={() => handleRestoreTransaction(d.id)}
                                                    className="text-[10px] font-bold text-indigo-600 hover:underline"
                                                >
                                                    Restore
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Audit Logs list */}
                            <div className="flex-1 overflow-y-auto mt-4 space-y-2.5">
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                                    System Log History
                                </div>
                                {serverLogs.length === 0 ? (
                                    <div className="text-xs text-slate-400 py-4 text-center">
                                        No audit events recorded.
                                    </div>
                                ) : (
                                    serverLogs.slice(0, 15).map((log) => (
                                        <div key={log.logId} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                                            <div className="font-bold text-slate-800 text-[11px]">
                                                {log.action.replace(/_/g, " ")}
                                            </div>
                                            <div className="text-[10px] text-slate-400 mt-0.5">
                                                {formatDate(log.timestamp)}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}