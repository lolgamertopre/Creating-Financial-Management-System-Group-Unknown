import { useState, useEffect, useMemo } from "react";
import {
    SRS_CATEGORIES,
    INCOME_SOURCES,
    initDatabaseDefaults,
    getExpenses,
    addExpense,
    updateExpense,
    deleteExpense,
    getIncomes,
    addIncome,
    updateIncome,
    deleteIncome,
    getSavings,
    addSavings,
    updateSavings,
    deleteSavings,
    getBudgets,
    setCategoryBudget,
    getClient,
    updateClientProfile,
    verifyClientLogin,
    getAuditLogs,
    getCurrency,
    setCurrency as saveCurrencyToDB,
    syncPendingData,
    resetDatabaseToDemo,
    db,
} from "./db.js";
import {
    checkApiHealth,
    fetchLiveExchangeRates,
    getAIFinancialAnalysis,
    smartParseExpenseWithAI,
    syncBatchWithServer,
} from "./apiService.js";

// Format currency in Philippine Peso (₱) by default as per SRS 2.3.10
function formatCurrency(amount, currency = "₱") {
    const num = Math.abs(Number(amount) || 0);
    return `${currency}${num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

// Format date nicely (e.g. "Oct 4, 2026")
function formatDateDisplay(isoString) {
    if (!isoString) return "";
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
        });
    } catch {
        return "";
    }
}

export default function PersonalBudgetTrackerWebApp() {
    // Client Profile & Auth (SRS 2.2.1 & ERD Client Table)
    const [client, setClient] = useState(null);
    const [isLoggedIn, setIsLoggedIn] = useState(true);
    const [loginUsername, setLoginUsername] = useState("mother");
    const [loginPassword, setLoginPassword] = useState("password123");
    const [loginError, setLoginError] = useState("");
    const [showLoginModal, setShowLoginModal] = useState(false);

    // Active Tab Navigation: 'home' | 'income' | 'expenses' | 'budget' | 'savings' | 'reports' | 'settings'
    const [activeTab, setActiveTab] = useState("home");

    // Expenses Category Filter (matches screenshot: All, Food, Transport, Bills, Medicine, Shopping, Personal Needs, Others)
    const [selectedExpenseCategory, setSelectedExpenseCategory] = useState("all");

    // Database Records (SRS Section 2.5)
    const [expensesList, setExpensesList] = useState([]);
    const [incomesList, setIncomesList] = useState([]);
    const [savingsList, setSavingsList] = useState([]);
    const [budgetsList, setBudgetsList] = useState([]);
    const [categories, setCategories] = useState(SRS_CATEGORIES);
    const [serverLogs, setServerLogs] = useState([]);
    const [currency, setCurrency] = useState("₱");
    const [loading, setLoading] = useState(true);

    // Reliable API & AI Integration State
    const [apiHealth, setApiHealth] = useState({ online: false, latency: 0, data: null, checking: false });
    const [showApiServerModal, setShowApiServerModal] = useState(false);
    const [showRatesModal, setShowRatesModal] = useState(false);
    const [ratesData, setRatesData] = useState(null);
    const [showAiAdvisorModal, setShowAiAdvisorModal] = useState(false);
    const [aiAnalysis, setAiAnalysis] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);

    // AI Smart Quick Fill State
    const [aiQuickExpenseText, setAiQuickExpenseText] = useState("");
    const [aiQuickIncomeText, setAiQuickIncomeText] = useState("");
    const [aiQuickLoading, setAiQuickLoading] = useState(false);
    const [aiQuickNotice, setAiQuickNotice] = useState("");

    // Live Currency Converter State
    const [converterAmount, setConverterAmount] = useState(100);
    const [converterFrom, setConverterFrom] = useState("USD");
    const [converterTo, setConverterTo] = useState("PHP");

    // UI & Sync Status
    const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState("");
    const [installPrompt, setInstallPrompt] = useState(null);
    const [deviceMode, setDeviceMode] = useState("responsive"); // 'responsive' | 'mobile_preview'

    // Month Selector (Default current: OCTOBER 2026 / current date)
    const now = new Date();
    const [selectedMonth] = useState(now.toISOString().slice(0, 7)); // YYYY-MM

    // Month Name Header (e.g., "OCTOBER 2026")
    const monthHeaderString = useMemo(() => {
        return now
            .toLocaleDateString("en-US", { month: "long", year: "numeric" })
            .toUpperCase();
    }, [now]);

    // Modals
    const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
    const [showAddIncomeModal, setShowAddIncomeModal] = useState(false);
    const [showAddSavingsModal, setShowAddSavingsModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);

    // Delete Confirmation Modal (SRS 2.2.6 & 2.3.9)
    const [deleteCandidate, setDeleteCandidate] = useState(null);

    // Form inputs for Add Expense
    const [formExpenseName, setFormExpenseName] = useState("");
    const [formExpenseAmount, setFormExpenseAmount] = useState("");
    const [formExpenseCategory, setFormExpenseCategory] = useState(SRS_CATEGORIES[0].category_id);
    const [formExpenseDate, setFormExpenseDate] = useState(new Date().toISOString().slice(0, 10));
    const [formExpenseDesc, setFormExpenseDesc] = useState("");
    const [formExpenseError, setFormExpenseError] = useState("");

    // Form inputs for Add Income
    const [formIncomeSource, setFormIncomeSource] = useState(INCOME_SOURCES[0].name);
    const [formIncomeAmount, setFormIncomeAmount] = useState("");
    const [formIncomeDate, setFormIncomeDate] = useState(new Date().toISOString().slice(0, 10));
    const [formIncomeDesc, setFormIncomeDesc] = useState("");
    const [formIncomeError, setFormIncomeError] = useState("");

    // Form inputs for Add Savings
    const [formSavingsAmount, setFormSavingsAmount] = useState("");
    const [formSavingsDate, setFormSavingsDate] = useState(new Date().toISOString().slice(0, 10));
    const [formSavingsDesc, setFormSavingsDesc] = useState("");
    const [formSavingsError, setFormSavingsError] = useState("");

    // Category Budget Edit Modal
    const [showBudgetEditModal, setShowBudgetEditModal] = useState(false);
    const [editingBudgetCat, setEditingBudgetCat] = useState(null);
    const [formBudgetAmount, setFormBudgetAmount] = useState("");

    // Check backend API Server health & latency
    const checkBackendHealth = async () => {
        setApiHealth((prev) => ({ ...prev, checking: true }));
        const health = await checkApiHealth();
        setApiHealth({ online: health.online, latency: health.latency, data: health.data, checking: false });
        return health;
    };

    // Load Live Currency Exchange Rates
    const loadRates = async () => {
        const rates = await fetchLiveExchangeRates("PHP");
        setRatesData(rates);
    };

    // Run AI Financial Analysis
    const runAiAnalysis = async (customExp = expensesList, customInc = incomesList, customSav = savingsList, customBud = budgetsList) => {
        setAiLoading(true);
        const analysis = await getAIFinancialAnalysis({
            expenses: customExp,
            incomes: customInc,
            savings: customSav,
            budgets: customBud,
            client,
            month: selectedMonth,
        });
        if (analysis) {
            setAiAnalysis(analysis);
        }
        setAiLoading(false);
    };

    // Handle Smart NLP Quick Parse
    const handleQuickAiParse = async (text, type = "expense") => {
        if (!text || !text.trim()) return;
        setAiQuickLoading(true);
        setAiQuickNotice("");
        const parsed = await smartParseExpenseWithAI(text);
        setAiQuickLoading(false);
        if (parsed && parsed.success) {
            if (type === "expense") {
                if (parsed.name) setFormExpenseName(parsed.name);
                if (parsed.amount) setFormExpenseAmount(parsed.amount);
                if (parsed.category_id && categories.some((c) => c.category_id === parsed.category_id)) {
                    setFormExpenseCategory(parsed.category_id);
                }
                setAiQuickNotice(`✨ AI identified: ${parsed.name} (₱${parsed.amount}) in ${parsed.category_id}`);
            } else {
                if (parsed.name) setFormIncomeDesc(parsed.name);
                if (parsed.amount) setFormIncomeAmount(parsed.amount);
                setAiQuickNotice(`✨ AI identified: ₱${parsed.amount} income from ${parsed.name}`);
            }
        } else {
            setAiQuickNotice("Could not parse details. Please enter manually.");
        }
    };

    // Load initial data from Dexie & sync with backend API
    const refreshAllData = async () => {
        try {
            await initDatabaseDefaults();
            const clientData = await getClient();
            const exp = await getExpenses();
            const inc = await getIncomes();
            const sav = await getSavings();
            const bud = await getBudgets(selectedMonth);
            const logs = await getAuditLogs();
            const curr = await getCurrency();

            setClient(clientData);
            setExpensesList(exp);
            setIncomesList(inc);
            setSavingsList(sav);
            setBudgetsList(bud);
            setServerLogs(logs);
            setCurrency(curr || "₱");

            // Refresh AI insights
            runAiAnalysis(exp, inc, sav, bud);
        } catch (err) {
            console.error("Dexie database load error:", err);
        }
    };

    useEffect(() => {
        (async () => {
            await refreshAllData();
            setLoading(false);
            await checkBackendHealth();
            await loadRates();
        })();

        const handleOnline = async () => {
            setIsOnline(true);
            setSyncMessage("Online! Synchronizing offline entries...");
            setIsSyncing(true);
            const res = await syncPendingData();
            setIsSyncing(false);
            if (res.success) {
                setSyncMessage("All records synchronized with database!");
                setTimeout(() => setSyncMessage(""), 3000);
            }
            await refreshAllData();
        };

        const handleOffline = () => {
            setIsOnline(false);
            setSyncMessage("Offline mode: Storing securely in local Dexie database.");
        };

        const handleInstall = (e) => {
            e.preventDefault();
            setInstallPrompt(e);
        };

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        window.addEventListener("beforeinstallprompt", handleInstall);

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
            window.removeEventListener("beforeinstallprompt", handleInstall);
        };
    }, [selectedMonth]);

    // Financial Calculations (SRS 1.4, 2.2.9: Remaining Balance = Total Income - Total Expenses)
    const totalIncome = useMemo(() => {
        return incomesList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    }, [incomesList]);

    const totalExpenses = useMemo(() => {
        return expensesList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    }, [expensesList]);

    const remainingBalance = useMemo(() => {
        return totalIncome - totalExpenses;
    }, [totalIncome, totalExpenses]);

    const totalSavings = useMemo(() => {
        return savingsList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    }, [savingsList]);

    const totalBudget = useMemo(() => {
        return budgetsList.reduce((sum, b) => sum + (Number(b.budget_amount) || 0), 0);
    }, [budgetsList]);

    // Category Expense Breakdown & Budget Comparison (SRS Section 2.2.8 & 4.1)
    const categoryReportData = useMemo(() => {
        return categories.map((cat) => {
            const catExpenses = expensesList.filter((e) => e.category_id === cat.category_id);
            const actualSpent = catExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
            const budgetObj = budgetsList.find((b) => b.category_id === cat.category_id);
            const budgetAmount = budgetObj ? Number(budgetObj.budget_amount) : cat.defaultBudget || 0;
            const remaining = budgetAmount - actualSpent;
            const percentageUsed = budgetAmount > 0 ? Math.round((actualSpent / budgetAmount) * 100) : 0;
            const shareOfExpenses = totalExpenses > 0 ? Math.round((actualSpent / totalExpenses) * 100) : 0;

            return {
                ...cat,
                actualSpent,
                budgetAmount,
                remaining,
                percentageUsed,
                shareOfExpenses,
                count: catExpenses.length,
            };
        });
    }, [categories, expensesList, budgetsList, totalExpenses]);

    // Filtered Expenses for Expenses Tab
    const filteredExpenses = useMemo(() => {
        if (selectedExpenseCategory === "all") return expensesList;
        return expensesList.filter((e) => e.category_id === selectedExpenseCategory);
    }, [expensesList, selectedExpenseCategory]);

    const filteredTotalExpense = useMemo(() => {
        return filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    }, [filteredExpenses]);

    // Handler: Client Login (SRS 2.2.1)
    const handleLoginSubmit = async (e) => {
        e?.preventDefault();
        setLoginError("");
        const res = await verifyClientLogin(loginUsername, loginPassword);
        if (res.success) {
            setClient(res.client);
            setIsLoggedIn(true);
            setShowLoginModal(false);
        } else {
            setLoginError(res.message);
        }
    };

    // Handler: Add Expense (SRS 2.2.3 & 2.6 #5, #6)
    const handleAddExpenseSubmit = async (e) => {
        e?.preventDefault();
        setFormExpenseError("");

        if (!formExpenseName.trim()) {
            setFormExpenseError("Expense name is required.");
            return;
        }
        const amt = parseFloat(formExpenseAmount);
        if (isNaN(amt) || amt <= 0) {
            setFormExpenseError("Please enter a valid positive amount.");
            return;
        }

        await addExpense({
            name: formExpenseName.trim(),
            category_id: formExpenseCategory,
            amount: amt,
            date: new Date(formExpenseDate).toISOString(),
            description: formExpenseDesc.trim(),
        });

        setFormExpenseName("");
        setFormExpenseAmount("");
        setFormExpenseDesc("");
        setShowAddExpenseModal(false);
        await refreshAllData();
    };

    // Handler: Add Income (SRS 2.2.2)
    const handleAddIncomeSubmit = async (e) => {
        e?.preventDefault();
        setFormIncomeError("");

        if (!formIncomeSource.trim()) {
            setFormIncomeError("Income source is required.");
            return;
        }
        const amt = parseFloat(formIncomeAmount);
        if (isNaN(amt) || amt <= 0) {
            setFormIncomeError("Please enter a valid positive amount.");
            return;
        }

        await addIncome({
            source: formIncomeSource.trim(),
            amount: amt,
            date: new Date(formIncomeDate).toISOString(),
            description: formIncomeDesc.trim(),
        });

        setFormIncomeAmount("");
        setFormIncomeDesc("");
        setShowAddIncomeModal(false);
        await refreshAllData();
    };

    // Handler: Add Savings (SRS 2.2.10)
    const handleAddSavingsSubmit = async (e) => {
        e?.preventDefault();
        setFormSavingsError("");

        const amt = parseFloat(formSavingsAmount);
        if (isNaN(amt) || amt <= 0) {
            setFormSavingsError("Please enter a valid positive savings amount.");
            return;
        }

        await addSavings({
            amount: amt,
            date: new Date(formSavingsDate).toISOString(),
            description: formSavingsDesc.trim() || "Personal Savings",
        });

        setFormSavingsAmount("");
        setFormSavingsDesc("");
        setShowAddSavingsModal(false);
        await refreshAllData();
    };

    // Handler: Open Edit Transaction (SRS 2.2.5)
    const openEditModal = (item, type) => {
        setEditingItem({
            type,
            data: {
                id: type === "expense" ? item.expense_id : type === "income" ? item.income_id : item.savings_id,
                name: item.name || item.source || item.description || "",
                amount: item.amount.toString(),
                category_id: item.category_id || "food",
                date: item.date ? item.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
                description: item.description || "",
            },
        });
        setShowEditModal(true);
    };

    // Handler: Save Edit Transaction
    const handleSaveEditSubmit = async () => {
        if (!editingItem) return;
        const amt = parseFloat(editingItem.data.amount);
        if (isNaN(amt) || amt <= 0) {
            alert("Please enter a valid amount.");
            return;
        }

        if (editingItem.type === "expense") {
            await updateExpense(editingItem.data.id, {
                name: editingItem.data.name.trim() || "Expense",
                category_id: editingItem.data.category_id,
                amount: amt,
                date: new Date(editingItem.data.date).toISOString(),
                description: editingItem.data.description,
            });
        } else if (editingItem.type === "income") {
            await updateIncome(editingItem.data.id, {
                source: editingItem.data.name.trim() || "Salary",
                amount: amt,
                date: new Date(editingItem.data.date).toISOString(),
                description: editingItem.data.description,
            });
        } else if (editingItem.type === "savings") {
            await updateSavings(editingItem.data.id, {
                amount: amt,
                date: new Date(editingItem.data.date).toISOString(),
                description: editingItem.data.description || "Personal Savings",
            });
        }

        setShowEditModal(false);
        setEditingItem(null);
        await refreshAllData();
    };

    // Handler: Confirm Delete (SRS 2.2.6 & 2.3.9)
    const executeDelete = async () => {
        if (!deleteCandidate) return;
        if (deleteCandidate.type === "expense") {
            await deleteExpense(deleteCandidate.id);
        } else if (deleteCandidate.type === "income") {
            await deleteIncome(deleteCandidate.id);
        } else if (deleteCandidate.type === "savings") {
            await deleteSavings(deleteCandidate.id);
        }
        setDeleteCandidate(null);
        await refreshAllData();
    };

    // Handler: Save Category Budget
    const handleSaveCategoryBudget = async () => {
        if (!editingBudgetCat) return;
        const amt = parseFloat(formBudgetAmount);
        if (isNaN(amt) || amt < 0) {
            alert("Please enter a valid budget amount.");
            return;
        }
        await setCategoryBudget(editingBudgetCat.category_id, amt, selectedMonth);
        setShowBudgetEditModal(false);
        setEditingBudgetCat(null);
        await refreshAllData();
    };

    // Handler: Export CSV Report (Supporting Info 4.1)
    const handleExportCSV = () => {
        const headers = ["Category", "Budget", "Actual Expense", "Remaining", "Status"];
        const rows = categoryReportData.map((c) => [
            `"${c.category_name}"`,
            c.budgetAmount,
            c.actualSpent,
            c.remaining,
            c.percentageUsed > 100 ? "EXCEEDED" : c.percentageUsed >= 80 ? "WARNING" : "HEALTHY",
        ]);

        const summaryRows = [
            [],
            ["TOTAL INCOME", totalIncome],
            ["TOTAL EXPENSES", totalExpenses],
            ["REMAINING BALANCE", remainingBalance],
            ["TOTAL SAVINGS", totalSavings],
        ];

        const csvContent =
            "data:text/csv;charset=utf-8," +
            [headers.join(","), ...rows.map((r) => r.join(",")), ...summaryRows.map((r) => r.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Personal_Budget_Tracker_Report_${selectedMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) {
        return (
            <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#F4F5FA]">
                <div className="w-16 h-16 rounded-3xl bg-indigo-600 flex items-center justify-center text-white text-3xl shadow-xl shadow-indigo-500/25 animate-pulse mb-4">
                    💳
                </div>
                <div className="text-xl font-extrabold text-slate-800 tracking-tight">Personal Budget Tracker</div>
                <div className="text-xs text-slate-400 mt-1">Starting web application...</div>
            </div>
        );
    }

    // Navigation Items list
    const navItems = [
        { id: "home", label: "Dashboard", icon: "🏠" },
        { id: "income", label: "Income", icon: "💵" },
        { id: "expenses", label: "Expenses", icon: "💳" },
        { id: "budget", label: "Budgets", icon: "📊" },
        { id: "savings", label: "Savings", icon: "💰" },
        { id: "reports", label: "Financial Summary", icon: "📈" },
        { id: "settings", label: "Settings", icon: "⚙️" },
    ];

    // =========================================================================
    // RENDER MAIN APPLICATION
    // =========================================================================
    return (
        <div className="min-h-screen bg-[#F0F2F8] text-slate-800 flex flex-col selection:bg-indigo-500 selection:text-white">
            {/* =========================================================================
                WEB APPLICATION TOP NAVIGATION BAR (FOR DESKTOP & TABLETS)
            ========================================================================= */}
            <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Left: Brand Logo & Title */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#6366F1] to-[#4F46E5] text-white flex items-center justify-center shadow-md shadow-indigo-500/20 font-black text-xl">
                                ₱
                            </div>
                            <div>
                                <div className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                                    Personal Budget Tracker
                                    <span className="hidden md:inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                        Web App
                                    </span>
                                </div>
                                <div className="text-[11px] font-medium text-slate-400">
                                    Client: <strong className="text-slate-700">{client ? client.name : "Maria (Mother)"}</strong>
                                </div>
                            </div>
                        </div>

                        {/* Center: Desktop Navigation Tabs */}
                        <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-2xl">
                            {navItems.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveTab(item.id)}
                                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-1.5 ${
                                        activeTab === item.id
                                            ? "bg-white text-indigo-600 shadow-xs"
                                            : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                                    }`}
                                >
                                    <span>{item.icon}</span>
                                    <span>{item.label}</span>
                                </button>
                            ))}
                        </nav>

                        {/* Right: Actions, Sync, Rates, AI & User Account */}
                        <div className="flex items-center gap-2">
                            {/* API Server Status Pill */}
                            <button
                                onClick={() => setShowApiServerModal(true)}
                                className={`px-2.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border transition active:scale-95 ${
                                    apiHealth.online
                                        ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                        : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                                }`}
                                title="Click to view REST API Server diagnostics & endpoints"
                            >
                                <span className={`w-2 h-2 rounded-full ${apiHealth.online ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                                <span className="hidden sm:inline">
                                    {apiHealth.online ? `API Online (${apiHealth.latency}ms)` : "Offline DB"}
                                </span>
                            </button>

                            {/* Live Rates Trigger */}
                            <button
                                onClick={() => setShowRatesModal(true)}
                                className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs flex items-center gap-1 active:scale-95 transition shadow-2xs"
                                title="Live Currency Exchange Rates"
                            >
                                <span>💱</span>
                                <span className="hidden lg:inline">Rates</span>
                            </button>

                            {/* AI Advisor Trigger */}
                            <button
                                onClick={() => {
                                    runAiAnalysis();
                                    setShowAiAdvisorModal(true);
                                }}
                                className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-xs flex items-center gap-1 shadow-xs hover:shadow-md active:scale-95 transition"
                                title="AI Financial Advisor & Insights"
                            >
                                <span>✨</span>
                                <span className="hidden md:inline">AI Advisor</span>
                                {aiAnalysis && (
                                    <span className="ml-1 px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
                                        {aiAnalysis.score}
                                    </span>
                                )}
                            </button>

                            {/* Sync Status Badge */}
                            <button
                                onClick={async () => {
                                    setIsSyncing(true);
                                    setSyncMessage("Syncing with cloud database...");
                                    const res = await syncPendingData("/api/sync", true);
                                    setIsSyncing(false);
                                    setSyncMessage(res.success ? "All records synchronized with database!" : "Saved in Dexie offline database.");
                                    setTimeout(() => setSyncMessage(""), 3000);
                                    await refreshAllData();
                                }}
                                className="px-2.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-white border border-slate-200/80 shadow-2xs text-slate-700 hover:bg-slate-50 transition"
                                title="Click to synchronize offline data"
                            >
                                <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? "bg-emerald-500" : "bg-amber-500"} ${isSyncing ? "animate-spin" : ""}`}>
                                    {isSyncing ? "🔄" : "☁️"}
                                </span>
                                <span className="hidden xl:inline">{isSyncing ? "Syncing..." : "Sync"}</span>
                            </button>

                            {/* Quick Add Buttons on Desktop */}
                            <div className="hidden lg:flex items-center gap-1.5 ml-1">
                                <button
                                    onClick={() => {
                                        setFormIncomeAmount("");
                                        setFormIncomeDesc("");
                                        setAiQuickIncomeText("");
                                        setShowAddIncomeModal(true);
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs active:scale-95 transition"
                                >
                                    + Income
                                </button>
                                <button
                                    onClick={() => {
                                        setFormExpenseName("");
                                        setFormExpenseAmount("");
                                        setFormExpenseDesc("");
                                        setAiQuickExpenseText("");
                                        setFormExpenseCategory(SRS_CATEGORIES[0].category_id);
                                        setShowAddExpenseModal(true);
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-500/20 active:scale-95 transition"
                                >
                                    + Expense
                                </button>
                            </div>

                            {/* User Account / Profile */}
                            <button
                                onClick={() => setActiveTab("settings")}
                                className="w-8 h-8 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs hover:bg-indigo-100 transition"
                                title="Client Account & Settings"
                            >
                                👩‍👦
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Sync Alert Banner */}
            {syncMessage && (
                <div className="bg-indigo-50 border-b border-indigo-100 text-indigo-700 text-xs font-semibold py-2 px-4 text-center animate-fade-in shadow-xs">
                    {syncMessage}
                </div>
            )}

            {/* PWA Install Alert */}
            {installPrompt && (
                <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mt-3">
                    <div className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-between shadow-md">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">📲</span>
                            <div>
                                <div className="text-sm font-bold">Install Personal Budget Tracker</div>
                                <div className="text-xs opacity-90">Install as a standalone web app on your PC, Tablet, or Phone</div>
                            </div>
                        </div>
                        <button
                            onClick={async () => {
                                installPrompt.prompt();
                                const { outcome } = await installPrompt.userChoice;
                                if (outcome === "accepted") setInstallPrompt(null);
                            }}
                            className="px-4 py-1.5 bg-white text-indigo-600 rounded-xl text-xs font-bold active:scale-95 transition shadow-xs"
                        >
                            Install App
                        </button>
                    </div>
                </div>
            )}

            {/* =========================================================================
                MAIN WEB CONTENT AREA
            ========================================================================= */}
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-32 md:pb-12">
                {/* =====================================================================
                    VIEW 1: DASHBOARD (HOME)
                ===================================================================== */}
                {activeTab === "home" && (
                    <div className="space-y-6 animate-fade-in">
                        {/* AI Financial Health & Live Exchange Rates Banner */}
                        <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 shadow-xl border border-indigo-900/50 relative overflow-hidden">
                            {/* Decorative background glow */}
                            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

                            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                                {/* Left: AI Health Score & Diagnosis */}
                                <div className="space-y-2 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 flex items-center gap-1.5">
                                            <span>✨ AI Financial Advisor</span>
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        </span>
                                        {aiAnalysis && (
                                            <span
                                                className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border"
                                                style={{
                                                    backgroundColor: `${aiAnalysis.ratingColor}20`,
                                                    color: aiAnalysis.ratingColor,
                                                    borderColor: `${aiAnalysis.ratingColor}40`,
                                                }}
                                            >
                                                Score: {aiAnalysis.score}/100 • {aiAnalysis.rating}
                                            </span>
                                        )}
                                        <span className="text-[11px] text-slate-400">
                                            50/30/20 Rule: Needs {aiAnalysis?.rule50_30_20?.needs?.actualPct || 0}% • Wants {aiAnalysis?.rule50_30_20?.wants?.actualPct || 0}% • Savings {aiAnalysis?.rule50_30_20?.savings?.actualPct || 0}%
                                        </span>
                                    </div>

                                    <div className="text-sm font-semibold text-slate-200">
                                        {aiAnalysis?.insights?.[0]?.description || "Tracking daily burn rate and monthly budget health across all 7 categories."}
                                    </div>

                                    <div className="flex items-center gap-3 pt-1">
                                        <button
                                            onClick={() => {
                                                runAiAnalysis();
                                                setShowAiAdvisorModal(true);
                                            }}
                                            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-500/30 active:scale-95 transition flex items-center gap-1.5"
                                        >
                                            <span>View Full AI Health Report</span>
                                            <span>→</span>
                                        </button>
                                        <div className="text-xs text-slate-400 hidden sm:inline">
                                            Daily Burn Rate: <strong className="text-white">₱{aiAnalysis?.summary?.dailyBurnRate || 0}/day</strong>
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Live Forex Rates Bar */}
                                <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-3 sm:p-4 min-w-[280px]">
                                    <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/10">
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                                            <span>💱 Live Forex (vs PHP)</span>
                                        </div>
                                        <button
                                            onClick={() => setShowRatesModal(true)}
                                            className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 hover:underline"
                                        >
                                            FX Converter →
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        {ratesData?.popularCurrencies?.slice(0, 3).map((curr) => (
                                            <div
                                                key={curr.code}
                                                onClick={() => {
                                                    setConverterFrom(curr.code);
                                                    setShowRatesModal(true);
                                                }}
                                                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer transition"
                                            >
                                                <div className="text-[10px] text-slate-400 font-bold">{curr.flag} {curr.code}</div>
                                                <div className="text-xs font-extrabold text-white mt-0.5">₱{curr.rateToPhp}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Top Hero Cards (4 across on desktop) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* 1. Total Income */}
                            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-100 flex flex-col justify-between hover:shadow-md transition">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                                        TOTAL INCOME
                                    </span>
                                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center text-sm font-bold">
                                        ↓
                                    </div>
                                </div>
                                <div>
                                    <div className="text-3xl font-extrabold text-slate-900 tracking-tight tabular-nums">
                                        {formatCurrency(totalIncome, currency)}
                                    </div>
                                    <div className="text-xs font-semibold text-emerald-600 mt-1 flex items-center gap-1">
                                        <span>{incomesList.length} income entries logged</span>
                                    </div>
                                </div>
                            </div>

                            {/* 2. Total Expenses */}
                            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-100 flex flex-col justify-between hover:shadow-md transition">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                                        TOTAL EXPENSES
                                    </span>
                                    <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-500 border border-rose-100 flex items-center justify-center text-sm font-bold">
                                        ↑
                                    </div>
                                </div>
                                <div>
                                    <div className="text-3xl font-extrabold text-slate-900 tracking-tight tabular-nums">
                                        {formatCurrency(totalExpenses, currency)}
                                    </div>
                                    <div className="text-xs font-semibold text-slate-400 mt-1">
                                        {expensesList.length} expenses this month
                                    </div>
                                </div>
                            </div>

                            {/* 3. Remaining Balance (SRS 2.2.9: Total Income - Total Expenses) */}
                            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-100 flex flex-col justify-between hover:shadow-md transition">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                                        REMAINING BALANCE
                                    </span>
                                    <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center text-sm">
                                        ⚖️
                                    </div>
                                </div>
                                <div>
                                    <div
                                        className={`text-3xl font-extrabold tracking-tight tabular-nums ${
                                            remainingBalance >= 0 ? "text-slate-900" : "text-rose-600"
                                        }`}
                                    >
                                        {remainingBalance < 0 ? "-" : ""}
                                        {formatCurrency(remainingBalance, currency)}
                                    </div>
                                    <div className="text-xs font-semibold text-slate-400 mt-1">
                                        {remainingBalance >= 0 ? "Income exceeds expenses" : "Deficit: Over spending"}
                                    </div>
                                </div>
                            </div>

                            {/* 4. Total Savings */}
                            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-100 flex flex-col justify-between hover:shadow-md transition">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                                        TOTAL SAVINGS
                                    </span>
                                    <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center text-sm">
                                        💰
                                    </div>
                                </div>
                                <div>
                                    <div className="text-3xl font-extrabold text-purple-700 tracking-tight tabular-nums">
                                        {formatCurrency(totalSavings, currency)}
                                    </div>
                                    <div className="text-xs font-semibold text-slate-400 mt-1">
                                        {savingsList.length} savings deposits
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2-Column Responsive Layout */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* Left Column (7 cols): Overall Budget Progress & Spending Breakdown */}
                            <div className="lg:col-span-7 space-y-6">
                                {/* Overall Budget Progress Card */}
                                <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <div className="text-xs font-bold tracking-wider text-slate-400 uppercase">
                                                MONTHLY BUDGET PROGRESS
                                            </div>
                                            <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                                                Overall Spending Plan
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setActiveTab("budget")}
                                            className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-bold text-xs transition"
                                        >
                                            Adjust Budgets →
                                        </button>
                                    </div>

                                    <div className="flex items-baseline justify-between mt-3">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-3xl font-extrabold text-slate-900 tabular-nums">
                                                {formatCurrency(totalExpenses, currency)}
                                            </span>
                                            <span className="text-xs font-semibold text-slate-400">
                                                spent of {formatCurrency(totalBudget, currency)} budget
                                            </span>
                                        </div>
                                        <span className="text-sm font-extrabold text-indigo-600">
                                            {totalBudget > 0 ? Math.min(100, Math.round((totalExpenses / totalBudget) * 100)) : 0}% used
                                        </span>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden my-3">
                                        <div
                                            className={`h-full rounded-full transition-all duration-700 ${
                                                totalBudget > 0 && totalExpenses > totalBudget
                                                    ? "bg-rose-500"
                                                    : totalBudget > 0 && totalExpenses / totalBudget >= 0.8
                                                    ? "bg-amber-500"
                                                    : "bg-gradient-to-r from-indigo-500 to-purple-600"
                                            }`}
                                            style={{
                                                width: `${totalBudget > 0 ? Math.min(100, (totalExpenses / totalBudget) * 100) : 0}%`,
                                            }}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between text-xs font-medium text-slate-500 pt-1">
                                        <span>
                                            Remaining to spend:{" "}
                                            <strong className="text-slate-800">{formatCurrency(Math.max(0, totalBudget - totalExpenses), currency)}</strong>
                                        </span>
                                        <span>
                                            {totalExpenses > totalBudget ? (
                                                <span className="text-rose-600 font-bold">⚠️ Budget Exceeded!</span>
                                            ) : (
                                                <span className="text-emerald-600 font-bold">✓ Within Budget</span>
                                            )}
                                        </span>
                                    </div>
                                </div>

                                {/* Category Spending Breakdown */}
                                <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <div className="text-xs font-bold tracking-wider text-slate-400 uppercase">
                                                BREAKDOWN
                                            </div>
                                            <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                                                Spending by Category
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setActiveTab("expenses")}
                                            className="text-xs font-bold text-indigo-600 hover:underline"
                                        >
                                            View all expenses →
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        {categoryReportData.map((cat) => (
                                            <div key={cat.category_id} className="space-y-1.5">
                                                <div className="flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className="w-7 h-7 rounded-xl flex items-center justify-center text-sm shadow-xs"
                                                            style={{ backgroundColor: cat.bg, color: cat.color }}
                                                        >
                                                            {cat.emoji}
                                                        </span>
                                                        <span className="font-bold text-slate-800">{cat.category_name}</span>
                                                    </div>
                                                    <div className="text-right font-bold text-slate-900 tabular-nums">
                                                        {formatCurrency(cat.actualSpent, currency)}{" "}
                                                        <span className="text-slate-400 font-normal">({cat.shareOfExpenses}%)</span>
                                                    </div>
                                                </div>
                                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-500"
                                                        style={{
                                                            width: `${cat.shareOfExpenses}%`,
                                                            backgroundColor: cat.color,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Right Column (5 cols): Quick Actions & Recent Transactions */}
                            <div className="lg:col-span-5 space-y-6">
                                {/* Quick Actions */}
                                <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
                                    <div className="text-base font-extrabold text-slate-900 mb-3">
                                        Quick Actions
                                    </div>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <button
                                            onClick={() => {
                                                setFormExpenseName("");
                                                setFormExpenseAmount("");
                                                setFormExpenseDesc("");
                                                setShowAddExpenseModal(true);
                                            }}
                                            className="p-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-700 font-bold text-xs text-left transition flex items-center gap-2"
                                        >
                                            <span className="text-lg">💳</span>
                                            <span>Add Expense</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setFormIncomeAmount("");
                                                setFormIncomeDesc("");
                                                setShowAddIncomeModal(true);
                                            }}
                                            className="p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 font-bold text-xs text-left transition flex items-center gap-2"
                                        >
                                            <span className="text-lg">💵</span>
                                            <span>Add Income</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setFormSavingsAmount("");
                                                setFormSavingsDesc("");
                                                setShowAddSavingsModal(true);
                                            }}
                                            className="p-3 rounded-2xl bg-purple-50 hover:bg-purple-100 border border-purple-100 text-purple-700 font-bold text-xs text-left transition flex items-center gap-2"
                                        >
                                            <span className="text-lg">💰</span>
                                            <span>Record Savings</span>
                                        </button>
                                        <button
                                            onClick={handleExportCSV}
                                            className="p-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs text-left transition flex items-center gap-2"
                                        >
                                            <span className="text-lg">📥</span>
                                            <span>Export CSV</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Recent Transactions Feed */}
                                <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="text-base font-extrabold text-slate-900">
                                            Recent Activity
                                        </div>
                                        <button
                                            onClick={() => setActiveTab("expenses")}
                                            className="text-xs font-bold text-indigo-600 hover:underline"
                                        >
                                            View all
                                        </button>
                                    </div>

                                    {expensesList.length === 0 && incomesList.length === 0 ? (
                                        <div className="text-center py-8 text-xs text-slate-400">
                                            No recent transactions logged yet.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {expensesList.slice(0, 5).map((item) => {
                                                const cat = categories.find((c) => c.category_id === item.category_id) || categories[0];
                                                return (
                                                    <div
                                                        key={item.expense_id}
                                                        className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/70 border border-slate-100 hover:bg-slate-100/60 transition"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div
                                                                className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shadow-xs"
                                                                style={{ backgroundColor: cat.arrowBg, color: cat.arrowColor }}
                                                            >
                                                                ↑
                                                            </div>
                                                            <div>
                                                                <div className="text-xs font-bold text-slate-800">{item.name}</div>
                                                                <div className="text-[10px] text-slate-400 font-medium">
                                                                    {cat.category_name} • {formatDateDisplay(item.date)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-extrabold text-slate-900 tabular-nums">
                                                                -{formatCurrency(item.amount, currency)}
                                                            </span>
                                                            <button
                                                                onClick={() => openEditModal(item, "expense")}
                                                                className="text-slate-300 hover:text-indigo-600 transition text-xs"
                                                                title="Edit"
                                                            >
                                                                ✏️
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* =====================================================================
                    VIEW 2: EXPENSES (MATCHES SCREENSHOT & SRS 2.2.3, 2.2.4)
                ===================================================================== */}
                {activeTab === "expenses" && (
                    <div className="space-y-6 animate-fade-in">
                        {/* Header: Month, Title, Subtitle, and Add Expense Button */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <div className="text-xs font-extrabold tracking-wider text-[#6366F1] uppercase">
                                    {monthHeaderString}
                                </div>
                                <h1 className="text-3xl font-extrabold text-[#111827] tracking-tight mt-0.5">
                                    Expenses
                                </h1>
                                <p className="text-xs font-medium text-slate-500 mt-1">
                                    Stay on top of where your money goes.
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setFormExpenseName("");
                                    setFormExpenseAmount("");
                                    setFormExpenseDesc("");
                                    setFormExpenseCategory(
                                        selectedExpenseCategory !== "all" ? selectedExpenseCategory : "food"
                                    );
                                    setShowAddExpenseModal(true);
                                }}
                                className="px-5 py-2.5 rounded-2xl bg-[#6366F1] hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-500/25 active:scale-95 transition flex items-center gap-2 self-start sm:self-auto"
                            >
                                <span className="text-base">+</span>
                                <span>Add New Expense</span>
                            </button>
                        </div>

                        {/* Category Filter Pills Row (Exact match to screenshot) */}
                        <div className="flex gap-2 overflow-x-auto py-1 scrollbar-none select-none">
                            <button
                                onClick={() => setSelectedExpenseCategory("all")}
                                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all duration-200 shrink-0 ${
                                    selectedExpenseCategory === "all"
                                        ? "bg-[#6366F1] text-white shadow-md shadow-indigo-500/25"
                                        : "bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50"
                                }`}
                            >
                                All
                            </button>
                            {categories.map((cat) => {
                                const isSelected = selectedExpenseCategory === cat.category_id;
                                const displayName = cat.shortName || cat.category_name;
                                return (
                                    <button
                                        key={cat.category_id}
                                        onClick={() => setSelectedExpenseCategory(cat.category_id)}
                                        className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all duration-200 shrink-0 ${
                                            isSelected
                                                ? "bg-[#6366F1] text-white shadow-md shadow-indigo-500/25"
                                                : "bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50"
                                        }`}
                                    >
                                        {displayName}
                                    </button>
                                );
                            })}
                        </div>

                        {/* 2-Column Grid on Web: Left List (Screenshot) + Right Category Summary */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* Main Expenses List Card (Exact design from screenshot) */}
                            <div className="lg:col-span-8 bg-white rounded-3xl p-6 shadow-xs border border-slate-100/90">
                                <div className="flex items-baseline justify-between mb-1">
                                    <div>
                                        <div className="text-xs font-medium text-slate-500">
                                            Total this month
                                        </div>
                                        <div className="text-3xl font-extrabold text-[#111827] tracking-tight mt-1 tabular-nums">
                                            {formatCurrency(filteredTotalExpense, currency)}
                                        </div>
                                    </div>
                                    <div className="text-xs font-medium text-slate-400">
                                        {filteredExpenses.length} entries
                                    </div>
                                </div>

                                <div className="w-full h-px bg-slate-100 my-4" />

                                {filteredExpenses.length === 0 ? (
                                    <div className="text-center py-12">
                                        <div className="text-3xl mb-2">🛒</div>
                                        <div className="text-sm font-bold text-slate-800">No expense records found</div>
                                        <div className="text-xs text-slate-400 mt-1">
                                            No records logged under this filter for {monthHeaderString}.
                                        </div>
                                        <button
                                            onClick={() => {
                                                setFormExpenseCategory(
                                                    selectedExpenseCategory !== "all" ? selectedExpenseCategory : "food"
                                                );
                                                setShowAddExpenseModal(true);
                                            }}
                                            className="mt-4 px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-bold hover:bg-indigo-100 transition"
                                        >
                                            + Add Expense Now
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {filteredExpenses.map((item) => {
                                            const cat =
                                                categories.find((c) => c.category_id === item.category_id) || categories[0];
                                            return (
                                                <div
                                                    key={item.expense_id}
                                                    className="flex items-center justify-between group py-1 hover:bg-slate-50/60 px-2 rounded-2xl transition"
                                                >
                                                    <div className="flex items-center gap-3.5">
                                                        <div
                                                            className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-base shadow-xs shrink-0 transition"
                                                            style={{
                                                                backgroundColor: cat.arrowBg,
                                                                color: cat.arrowColor,
                                                            }}
                                                        >
                                                            ↑
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-extrabold text-[#111827] tracking-tight">
                                                                {item.name}
                                                            </div>
                                                            <div className="text-xs font-medium text-slate-400 mt-0.5">
                                                                {cat.shortName || cat.category_name} • {formatDateDisplay(item.date)}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3">
                                                        <div className="text-sm font-extrabold text-[#111827] tracking-tight tabular-nums">
                                                            -{formatCurrency(item.amount, currency)}
                                                        </div>
                                                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                                                            <button
                                                                onClick={() => openEditModal(item, "expense")}
                                                                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600 flex items-center justify-center transition text-xs"
                                                                title="Edit transaction"
                                                            >
                                                                ✏️
                                                            </button>
                                                            <button
                                                                onClick={() =>
                                                                    setDeleteCandidate({
                                                                        type: "expense",
                                                                        id: item.expense_id,
                                                                        name: item.name,
                                                                        amount: item.amount,
                                                                    })
                                                                }
                                                                className="w-8 h-8 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 flex items-center justify-center transition text-xs font-bold"
                                                                title="Delete transaction"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Right Side: Category Summary & Quick Actions */}
                            <div className="lg:col-span-4 space-y-6">
                                <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
                                    <div className="text-base font-extrabold text-slate-900 mb-3">
                                        Category Spending Summary
                                    </div>
                                    <div className="space-y-3">
                                        {categoryReportData.map((cat) => (
                                            <div key={cat.category_id} className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base">{cat.emoji}</span>
                                                    <span className="font-bold text-slate-700">{cat.category_name}</span>
                                                </div>
                                                <div className="font-extrabold text-slate-900 tabular-nums">
                                                    {formatCurrency(cat.actualSpent, currency)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => {
                                            setFormIncomeAmount("");
                                            setFormIncomeDesc("");
                                            setShowAddIncomeModal(true);
                                        }}
                                        className="mt-5 w-full py-2.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition"
                                    >
                                        ↓ Add Income Entry
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* =====================================================================
                    VIEW 3: INCOME (SRS SECTION 1.4 #1 & 2.2.2)
                ===================================================================== */}
                {activeTab === "income" && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Income Stream</h1>
                                <p className="text-xs text-slate-500 mt-1">Record money received from salary, business, and other sources</p>
                            </div>
                            <button
                                onClick={() => {
                                    setFormIncomeAmount("");
                                    setFormIncomeDesc("");
                                    setShowAddIncomeModal(true);
                                }}
                                className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/25 active:scale-95 transition"
                            >
                                + Add Income
                            </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* Income Hero Card */}
                            <div className="lg:col-span-4 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 text-white shadow-lg shadow-emerald-500/15 flex flex-col justify-between">
                                <div>
                                    <div className="text-xs font-semibold opacity-90 uppercase tracking-wider">
                                        Total Recorded Income
                                    </div>
                                    <div className="text-4xl font-extrabold mt-2 tabular-nums">
                                        {formatCurrency(totalIncome, currency)}
                                    </div>
                                </div>
                                <div className="mt-6 pt-4 border-t border-white/20 text-xs opacity-90">
                                    {incomesList.length} transactions recorded for this client
                                </div>
                            </div>

                            {/* Incomes List */}
                            <div className="lg:col-span-8 bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
                                <div className="text-base font-extrabold text-slate-900 mb-4">
                                    Income Ledger & Sources
                                </div>

                                {incomesList.length === 0 ? (
                                    <div className="text-center py-10 text-xs text-slate-400">
                                        No income records logged yet.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {incomesList.map((item) => (
                                            <div
                                                key={item.income_id}
                                                className="flex items-center justify-between p-3.5 rounded-2xl bg-emerald-50/40 border border-emerald-100 hover:bg-emerald-50/70 transition"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-white text-emerald-600 shadow-xs flex items-center justify-center font-bold text-sm">
                                                        ↓
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-bold text-slate-800">{item.source}</div>
                                                        <div className="text-[10px] text-slate-400 font-medium">
                                                            {formatDateDisplay(item.date)} {item.description ? `• ${item.description}` : ""}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-extrabold text-emerald-600 tabular-nums">
                                                        +{formatCurrency(item.amount, currency)}
                                                    </span>
                                                    <button
                                                        onClick={() => openEditModal(item, "income")}
                                                        className="p-1 text-slate-400 hover:text-indigo-600 transition text-xs"
                                                        title="Edit income"
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            setDeleteCandidate({
                                                                type: "income",
                                                                id: item.income_id,
                                                                name: item.source,
                                                                amount: item.amount,
                                                            })
                                                        }
                                                        className="p-1 text-slate-300 hover:text-rose-500 transition text-xs"
                                                        title="Delete income"
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
                    </div>
                )}

                {/* =====================================================================
                    VIEW 4: BUDGETS (SRS SECTION 1.4 #3, 2.2.7, 2.2.8)
                ===================================================================== */}
                {activeTab === "budget" && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Personal Budgets</h1>
                                <p className="text-xs text-slate-500 mt-1">Set spending limits for categories and monitor budget health</p>
                            </div>
                            <div className="px-4 py-2 bg-white rounded-2xl border border-slate-200 shadow-xs text-xs font-bold text-slate-700">
                                Total Budget: <strong className="text-indigo-600">{formatCurrency(totalBudget, currency)}</strong>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {categoryReportData.map((cat) => {
                                const isOverBudget = cat.actualSpent > cat.budgetAmount;
                                const isNearLimit = !isOverBudget && cat.percentageUsed >= 80;

                                return (
                                    <div key={cat.category_id} className="bg-white rounded-3xl p-5 shadow-xs border border-slate-100 flex flex-col justify-between hover:shadow-md transition">
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div
                                                        className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg shadow-xs"
                                                        style={{ backgroundColor: cat.bg, color: cat.color }}
                                                    >
                                                        {cat.emoji}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-extrabold text-slate-900">{cat.category_name}</div>
                                                        <div className="text-[10px] text-slate-400">Budget Limit: {formatCurrency(cat.budgetAmount, currency)}</div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setEditingBudgetCat(cat);
                                                        setFormBudgetAmount(cat.budgetAmount.toString());
                                                        setShowBudgetEditModal(true);
                                                    }}
                                                    className="px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 text-xs font-bold transition"
                                                >
                                                    Set ✏️
                                                </button>
                                            </div>

                                            <div className="mt-3">
                                                <div className="flex justify-between text-xs font-bold mb-1.5">
                                                    <span className="text-slate-600">Spent: {formatCurrency(cat.actualSpent, currency)}</span>
                                                    <span className={isOverBudget ? "text-rose-600 font-extrabold" : "text-indigo-600"}>
                                                        {cat.percentageUsed}%
                                                    </span>
                                                </div>
                                                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${
                                                            isOverBudget
                                                                ? "bg-rose-500"
                                                                : isNearLimit
                                                                ? "bg-amber-500"
                                                                : "bg-indigo-600"
                                                        }`}
                                                        style={{ width: `${Math.min(100, cat.percentageUsed)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                                            <span className="text-slate-500">
                                                Remaining:{" "}
                                                <strong className={cat.remaining < 0 ? "text-rose-600" : "text-slate-800"}>
                                                    {cat.remaining < 0 ? "-" : ""}
                                                    {formatCurrency(cat.remaining, currency)}
                                                </strong>
                                            </span>
                                            <span>
                                                {isOverBudget && <span className="text-rose-600 font-bold">⚠️ Exceeded</span>}
                                                {isNearLimit && <span className="text-amber-600 font-bold">⚠️ High</span>}
                                                {!isOverBudget && !isNearLimit && <span className="text-emerald-600 font-bold">✓ Good</span>}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* =====================================================================
                    VIEW 5: SAVINGS (SRS SECTION 1.4 #5, 2.2.10)
                ===================================================================== */}
                {activeTab === "savings" && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Savings Tracker</h1>
                                <p className="text-xs text-slate-500 mt-1">Record money set aside for emergency funds and long-term goals</p>
                            </div>
                            <button
                                onClick={() => {
                                    setFormSavingsAmount("");
                                    setFormSavingsDesc("");
                                    setShowAddSavingsModal(true);
                                }}
                                className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-500/25 active:scale-95 transition"
                            >
                                + Record Savings
                            </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* Total Savings Hero Card */}
                            <div className="lg:col-span-4 bg-gradient-to-br from-purple-600 to-indigo-700 rounded-3xl p-6 text-white shadow-lg shadow-purple-600/15 flex flex-col justify-between">
                                <div>
                                    <div className="text-xs font-semibold opacity-90 uppercase tracking-wider">
                                        Total Recorded Savings
                                    </div>
                                    <div className="text-4xl font-extrabold mt-2 tabular-nums">
                                        {formatCurrency(totalSavings, currency)}
                                    </div>
                                </div>
                                <div className="mt-6 pt-4 border-t border-white/20 text-xs opacity-90">
                                    {savingsList.length} savings records securely stored
                                </div>
                            </div>

                            {/* Savings Entries List */}
                            <div className="lg:col-span-8 bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
                                <div className="text-base font-extrabold text-slate-900 mb-4">
                                    Savings Ledger
                                </div>

                                {savingsList.length === 0 ? (
                                    <div className="text-center py-10 text-xs text-slate-400">
                                        No savings records logged yet.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {savingsList.map((item) => (
                                            <div
                                                key={item.savings_id}
                                                className="flex items-center justify-between p-3.5 rounded-2xl bg-purple-50/40 border border-purple-100 hover:bg-purple-50/70 transition"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-white text-purple-600 shadow-xs flex items-center justify-center font-bold text-sm">
                                                        💰
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-bold text-slate-800">
                                                            {item.description || "Personal Savings"}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 font-medium">
                                                            {formatDateDisplay(item.date)}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-extrabold text-purple-700 tabular-nums">
                                                        +{formatCurrency(item.amount, currency)}
                                                    </span>
                                                    <button
                                                        onClick={() => openEditModal(item, "savings")}
                                                        className="p-1 text-slate-400 hover:text-indigo-600 transition text-xs"
                                                        title="Edit savings"
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            setDeleteCandidate({
                                                                type: "savings",
                                                                id: item.savings_id,
                                                                name: item.description || "Savings",
                                                                amount: item.amount,
                                                            })
                                                        }
                                                        className="p-1 text-slate-300 hover:text-rose-500 transition text-xs"
                                                        title="Delete savings"
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
                    </div>
                )}

                {/* =====================================================================
                    VIEW 6: FINANCIAL SUMMARY (SRS SECTION 1.4 #7, 2.2.11 & 4.1)
                ===================================================================== */}
                {activeTab === "reports" && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Financial Summary</h1>
                                <p className="text-xs text-slate-500 mt-1">Complete statement matching SRS Section 4.1 Specification</p>
                            </div>
                            <button
                                onClick={handleExportCSV}
                                className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-500/25 active:scale-95 transition flex items-center gap-2"
                            >
                                <span>📥</span>
                                <span>Export Report (CSV)</span>
                            </button>
                        </div>

                        {/* Statement Table matching SRS Section 4.1 */}
                        <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
                            <div className="text-base font-extrabold text-slate-900 mb-1">
                                Example Personal Monthly Budget Statement
                            </div>
                            <div className="text-xs text-slate-400 mb-4">
                                Structured overview of budget vs actual spending per category
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] font-bold">
                                            <th className="py-3 px-3">Category</th>
                                            <th className="py-3 px-3 text-right">Budget</th>
                                            <th className="py-3 px-3 text-right">Actual Expense</th>
                                            <th className="py-3 px-3 text-right">Remaining</th>
                                            <th className="py-3 px-3 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {categoryReportData.map((row) => (
                                            <tr key={row.category_id} className="hover:bg-slate-50/70 transition">
                                                <td className="py-3.5 px-3 font-bold text-slate-800 flex items-center gap-2">
                                                    <span>{row.emoji}</span>
                                                    <span>{row.category_name}</span>
                                                </td>
                                                <td className="py-3.5 px-3 text-right tabular-nums text-slate-600">
                                                    {formatCurrency(row.budgetAmount, currency)}
                                                </td>
                                                <td className="py-3.5 px-3 text-right tabular-nums font-bold text-slate-900">
                                                    {formatCurrency(row.actualSpent, currency)}
                                                </td>
                                                <td
                                                    className={`py-3.5 px-3 text-right tabular-nums font-extrabold ${
                                                        row.remaining < 0 ? "text-rose-600" : "text-emerald-600"
                                                    }`}
                                                >
                                                    {row.remaining < 0 ? "-" : ""}
                                                    {formatCurrency(row.remaining, currency)}
                                                </td>
                                                <td className="py-3.5 px-3 text-center">
                                                    {row.actualSpent > row.budgetAmount ? (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                                                            Over Budget
                                                        </span>
                                                    ) : row.percentageUsed >= 80 ? (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                            Near Limit
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                            Healthy
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}

                                        {/* Savings Row matching SRS 4.1 */}
                                        <tr className="bg-purple-50/50 font-bold">
                                            <td className="py-3.5 px-3 text-purple-900 flex items-center gap-2">
                                                <span>💰</span>
                                                <span>Savings</span>
                                            </td>
                                            <td className="py-3.5 px-3 text-right tabular-nums text-purple-800">
                                                {formatCurrency(totalSavings, currency)}
                                            </td>
                                            <td className="py-3.5 px-3 text-right tabular-nums text-purple-800">
                                                {formatCurrency(totalSavings, currency)}
                                            </td>
                                            <td className="py-3.5 px-3 text-right tabular-nums text-purple-800 font-extrabold">
                                                ₱0.00
                                            </td>
                                            <td className="py-3.5 px-3 text-center">
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                                                    Recorded
                                                </span>
                                            </td>
                                        </tr>

                                        {/* Total Row matching SRS 4.1 */}
                                        <tr className="bg-slate-100 font-extrabold text-slate-900 text-sm">
                                            <td className="py-4 px-3">TOTAL</td>
                                            <td className="py-4 px-3 text-right tabular-nums">
                                                {formatCurrency(totalBudget + totalSavings, currency)}
                                            </td>
                                            <td className="py-4 px-3 text-right tabular-nums">
                                                {formatCurrency(totalExpenses + totalSavings, currency)}
                                            </td>
                                            <td className="py-4 px-3 text-right tabular-nums text-indigo-600 font-extrabold">
                                                {formatCurrency(Math.max(0, totalBudget - totalExpenses), currency)}
                                            </td>
                                            <td className="py-4 px-3 text-center text-xs text-slate-500 font-semibold">
                                                Balanced
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Balance Formula Card */}
                        <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
                            <div className="text-base font-extrabold text-slate-900 mb-2">
                                Cash Balance Equation (SRS Section 1.4 #4)
                            </div>
                            <div className="text-xs text-slate-500 mb-4">
                                Remaining Balance = Total Income ({formatCurrency(totalIncome, currency)}) − Total Expenses ({formatCurrency(totalExpenses, currency)})
                            </div>
                            <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-between">
                                <span className="text-sm font-bold text-indigo-900">Net Remaining Balance:</span>
                                <span className="text-2xl font-extrabold text-indigo-700 tabular-nums">
                                    {remainingBalance < 0 ? "-" : ""}
                                    {formatCurrency(remainingBalance, currency)}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* =====================================================================
                    VIEW 7: SETTINGS & CLIENT ACCOUNT (SRS SECTION 2.1.1, 2.2.1, 2.8)
                ===================================================================== */}
                {activeTab === "settings" && (
                    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
                        <div>
                            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Settings & Client Profile</h1>
                            <p className="text-xs text-slate-500 mt-1">Manage client account, currency preferences, and database storage</p>
                        </div>

                        {/* Client Profile Card */}
                        <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-base font-extrabold text-slate-900">
                                    Client Account (Owner)
                                </div>
                                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                                    ✓ Authorized Client
                                </span>
                            </div>
                            <div className="space-y-3 text-xs">
                                <div className="flex justify-between py-2 border-b border-slate-100">
                                    <span className="text-slate-400">Client Name</span>
                                    <span className="font-bold text-slate-800">{client?.name || "Maria (Mother)"}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-slate-100">
                                    <span className="text-slate-400">Login Username</span>
                                    <span className="font-bold text-slate-800">{client?.username || "mother"}</span>
                                </div>
                                <div className="flex justify-between py-2">
                                    <span className="text-slate-400">Security Password</span>
                                    <span className="font-bold text-slate-400">•••••••• (Protected)</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowLoginModal(true)}
                                className="mt-4 w-full py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
                            >
                                Switch / Re-login Client Account
                            </button>
                        </div>

                        {/* Currency Preference */}
                        <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
                            <div className="text-base font-extrabold text-slate-900 mb-3">
                                System Currency (SRS 2.3.10)
                            </div>
                            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                                <div>
                                    <div className="text-xs font-bold text-slate-800">Primary Currency</div>
                                    <div className="text-[10px] text-slate-400">Default Philippine Peso (₱)</div>
                                </div>
                                <div className="flex gap-2">
                                    {["₱", "$", "€", "¥"].map((sym) => (
                                        <button
                                            key={sym}
                                            onClick={async () => {
                                                setCurrency(sym);
                                                await saveCurrencyToDB(sym);
                                            }}
                                            className={`w-9 h-9 rounded-xl text-xs font-bold transition ${
                                                currency === sym
                                                    ? "bg-indigo-600 text-white shadow-xs"
                                                    : "bg-white text-slate-700 border border-slate-200"
                                            }`}
                                        >
                                            {sym}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Reliable REST API Server & Cloud Sync Console */}
                        <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                                    <span>🌐</span>
                                    <span>Reliable REST API & Cloud Sync Engine</span>
                                </div>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                                    apiHealth.online ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                                }`}>
                                    {apiHealth.online ? `● Connected (${apiHealth.latency}ms)` : "● Local Offline Mode"}
                                </span>
                            </div>
                            <div className="text-xs text-slate-500 mb-4">
                                High-reliability backend API providing full CRUD endpoints, 2-way batch synchronization, live forex exchange rates, and AI financial analysis.
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-xs">
                                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5">
                                    <div className="font-bold text-slate-700">API Health Status</div>
                                    <div className="flex justify-between text-slate-500">
                                        <span>Endpoint:</span>
                                        <code className="bg-white px-1.5 py-0.5 rounded border text-[11px] font-mono">/api/health</code>
                                    </div>
                                    <div className="flex justify-between text-slate-500">
                                        <span>Status:</span>
                                        <span className="font-bold text-emerald-600">{apiHealth.online ? "Healthy & Responsive" : "Offline / Local"}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-500">
                                        <span>Response Latency:</span>
                                        <span className="font-bold text-slate-700">{apiHealth.latency} ms</span>
                                    </div>
                                </div>

                                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5">
                                    <div className="font-bold text-slate-700">Storage & Sync</div>
                                    <div className="flex justify-between text-slate-500">
                                        <span>Local Engine:</span>
                                        <span className="font-bold text-slate-700">Dexie IndexedDB v2</span>
                                    </div>
                                    <div className="flex justify-between text-slate-500">
                                        <span>Server Storage:</span>
                                        <span className="font-bold text-slate-700">Persistent JSON Store</span>
                                    </div>
                                    <div className="flex justify-between text-slate-500">
                                        <span>Sync Protocol:</span>
                                        <span className="font-bold text-indigo-600">2-Way Reconciled Sync</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setShowApiServerModal(true)}
                                    className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition active:scale-95 text-center"
                                >
                                    Open API Console & Endpoints
                                </button>
                                <button
                                    onClick={async () => {
                                        setIsSyncing(true);
                                        setSyncMessage("Syncing with cloud database...");
                                        const res = await syncPendingData("/api/sync", true);
                                        setIsSyncing(false);
                                        setSyncMessage(res.success ? "All records synchronized with database!" : "Saved in Dexie offline database.");
                                        setTimeout(() => setSyncMessage(""), 3000);
                                        await refreshAllData();
                                        await checkBackendHealth();
                                    }}
                                    className="py-2.5 px-4 rounded-xl border border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold text-xs transition active:scale-95"
                                >
                                    Force Cloud Sync Now
                                </button>
                            </div>
                        </div>

                        {/* Database Diagnostics */}
                        <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
                            <div className="text-base font-extrabold text-slate-900 mb-2">
                                Database Diagnostics (Dexie IndexedDB)
                            </div>
                            <div className="text-xs text-slate-500 mb-4">
                                Stores client personal financial records offline in Dexie IndexedDB according to SRS Section 2.5.
                            </div>
                            <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                                <div className="p-3 bg-slate-50 rounded-2xl">
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">Expenses</div>
                                    <div className="text-lg font-extrabold text-slate-800 mt-1">{expensesList.length}</div>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-2xl">
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">Incomes</div>
                                    <div className="text-lg font-extrabold text-slate-800 mt-1">{incomesList.length}</div>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-2xl">
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">Savings</div>
                                    <div className="text-lg font-extrabold text-slate-800 mt-1">{savingsList.length}</div>
                                </div>
                            </div>
                            <button
                                onClick={async () => {
                                    if (confirm("Reset database to initial screenshot and SRS demonstration data?")) {
                                        await resetDatabaseToDemo();
                                        await refreshAllData();
                                    }
                                }}
                                className="w-full py-2.5 rounded-xl border border-indigo-200 text-indigo-600 font-bold text-xs hover:bg-indigo-50 transition"
                            >
                                Reset & Load Initial Sample Data
                            </button>
                        </div>
                    </div>
                )}
            </main>

            {/* =========================================================================
                MOBILE BOTTOM NAVIGATION BAR (FOR SCREENS < 768px)
            ========================================================================= */}
            <div className="md:hidden fixed bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm bg-[#161B2E] text-white rounded-3xl p-1.5 px-2 shadow-2xl flex items-center justify-between z-40">
                {/* 1. Home */}
                <button
                    onClick={() => setActiveTab("home")}
                    className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition active:scale-95 ${
                        activeTab === "home"
                            ? "bg-[#6366F1] text-white shadow-md shadow-indigo-500/30"
                            : "text-slate-400 hover:text-white"
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
                        activeTab === "income"
                            ? "bg-[#6366F1] text-white shadow-md shadow-indigo-500/30"
                            : "text-slate-400 hover:text-white"
                    }`}
                >
                    <span className="text-base font-bold">₱</span>
                    <span className="text-[10px] font-bold mt-0.5">Income</span>
                </button>

                {/* 3. Expenses (HIGHLIGHTED IN PURPLE CAPSULE) */}
                <button
                    onClick={() => setActiveTab("expenses")}
                    className={`flex flex-col items-center justify-center py-1.5 px-3.5 rounded-2xl transition active:scale-95 ${
                        activeTab === "expenses"
                            ? "bg-[#6366F1] text-white shadow-md shadow-indigo-500/30"
                            : "text-slate-400 hover:text-white"
                    }`}
                >
                    <span className="text-base font-bold">💳</span>
                    <span className="text-[10px] font-bold mt-0.5">Expenses</span>
                </button>

                {/* 4. Reports / Summary */}
                <button
                    onClick={() => setActiveTab("reports")}
                    className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition active:scale-95 ${
                        activeTab === "reports" || activeTab === "budget" || activeTab === "savings"
                            ? "bg-[#6366F1] text-white shadow-md shadow-indigo-500/30"
                            : "text-slate-400 hover:text-white"
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
                        activeTab === "settings"
                            ? "bg-[#6366F1] text-white shadow-md shadow-indigo-500/30"
                            : "text-slate-400 hover:text-white"
                    }`}
                >
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                    </svg>
                    <span className="text-[10px] font-bold mt-0.5">Settings</span>
                </button>
            </div>

            {/* Mobile Floating Action Buttons for Expenses */}
            {activeTab === "expenses" && (
                <div className="md:hidden fixed bottom-24 right-4 flex flex-col items-end gap-2.5 z-30">
                    <button
                        onClick={() => {
                            setFormIncomeAmount("");
                            setFormIncomeDesc("");
                            setShowAddIncomeModal(true);
                        }}
                        className="bg-white/95 backdrop-blur text-[#6366F1] border border-indigo-100 shadow-md font-extrabold text-xs px-4 py-2.5 rounded-full hover:shadow-lg transition active:scale-95 flex items-center gap-1.5"
                    >
                        <span>↓</span>
                        <span>Add income</span>
                    </button>
                    <button
                        onClick={() => {
                            setFormExpenseName("");
                            setFormExpenseAmount("");
                            setFormExpenseDesc("");
                            setFormExpenseCategory(
                                selectedExpenseCategory !== "all" ? selectedExpenseCategory : "food"
                            );
                            setShowAddExpenseModal(true);
                        }}
                        className="w-14 h-14 rounded-2xl bg-[#6366F1] hover:bg-indigo-700 text-white shadow-xl shadow-indigo-600/35 flex items-center justify-center text-3xl font-light transition active:scale-90"
                    >
                        +
                    </button>
                </div>
            )}

            {/* =========================================================================
                MODALS: ADD EXPENSE, ADD INCOME, ADD SAVINGS, EDIT, DELETE, LOGIN
            ========================================================================= */}
            {/* Modal: Add Expense */}
            {showAddExpenseModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
                    <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-slide-up">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <div className="text-base font-extrabold text-slate-900">Add Expense</div>
                                <div className="text-xs text-slate-400">Record a new personal expense</div>
                            </div>
                            <button
                                onClick={() => setShowAddExpenseModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        {formExpenseError && (
                            <div className="mt-3 p-2 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-bold">
                                {formExpenseError}
                            </div>
                        )}

                        <form onSubmit={handleAddExpenseSubmit} className="mt-4 space-y-3.5">
                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">
                                    Expense Name / Item *
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Electric bill, Weekly groceries, Fuel"
                                    value={formExpenseName}
                                    onChange={(e) => setFormExpenseName(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">
                                    Category (SRS Section 2.5) *
                                </label>
                                <select
                                    value={formExpenseCategory}
                                    onChange={(e) => setFormExpenseCategory(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    {categories.map((cat) => (
                                        <option key={cat.category_id} value={cat.category_id}>
                                            {cat.emoji} {cat.category_name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs font-bold text-slate-700 block mb-1">
                                        Amount (₱) *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formExpenseAmount}
                                        onChange={(e) => setFormExpenseAmount(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-700 block mb-1">
                                        Date *
                                    </label>
                                    <input
                                        type="date"
                                        value={formExpenseDate}
                                        onChange={(e) => setFormExpenseDate(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">
                                    Description (Optional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="Additional memo"
                                    value={formExpenseDesc}
                                    onChange={(e) => setFormExpenseDesc(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAddExpenseModal(false)}
                                    className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-2.5 rounded-xl bg-[#6366F1] text-white font-bold text-xs shadow-md shadow-indigo-500/25 active:scale-95 transition"
                                >
                                    Save Expense
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Add Income */}
            {showAddIncomeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
                    <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-slide-up">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <div className="text-base font-extrabold text-slate-900">Add Income</div>
                                <div className="text-xs text-slate-400">Record money received</div>
                            </div>
                            <button
                                onClick={() => setShowAddIncomeModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        {formIncomeError && (
                            <div className="mt-3 p-2 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-bold">
                                {formIncomeError}
                            </div>
                        )}

                        <form onSubmit={handleAddIncomeSubmit} className="mt-4 space-y-3.5">
                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">
                                    Income Source (SRS 1.4 #1) *
                                </label>
                                <select
                                    value={formIncomeSource}
                                    onChange={(e) => setFormIncomeSource(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    {INCOME_SOURCES.map((s) => (
                                        <option key={s.id} value={s.name}>
                                            {s.emoji} {s.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs font-bold text-slate-700 block mb-1">
                                        Amount (₱) *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formIncomeAmount}
                                        onChange={(e) => setFormIncomeAmount(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-700 block mb-1">
                                        Date *
                                    </label>
                                    <input
                                        type="date"
                                        value={formIncomeDate}
                                        onChange={(e) => setFormIncomeDate(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">
                                    Description / Memo
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. October Salary payout"
                                    value={formIncomeDesc}
                                    onChange={(e) => setFormIncomeDesc(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAddIncomeModal(false)}
                                    className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-md shadow-emerald-500/25 active:scale-95 transition"
                                >
                                    Save Income
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Add Savings */}
            {showAddSavingsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
                    <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-slide-up">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <div className="text-base font-extrabold text-slate-900">Record Savings</div>
                                <div className="text-xs text-slate-400">Put money aside for future use</div>
                            </div>
                            <button
                                onClick={() => setShowAddSavingsModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        {formSavingsError && (
                            <div className="mt-3 p-2 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-bold">
                                {formSavingsError}
                            </div>
                        )}

                        <form onSubmit={handleAddSavingsSubmit} className="mt-4 space-y-3.5">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs font-bold text-slate-700 block mb-1">
                                        Amount (₱) *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formSavingsAmount}
                                        onChange={(e) => setFormSavingsAmount(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-700 block mb-1">
                                        Date *
                                    </label>
                                    <input
                                        type="date"
                                        value={formSavingsDate}
                                        onChange={(e) => setFormSavingsDate(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">
                                    Description / Purpose
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Emergency fund, House renovation"
                                    value={formSavingsDesc}
                                    onChange={(e) => setFormSavingsDesc(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAddSavingsModal(false)}
                                    className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-xs shadow-md shadow-purple-500/25 active:scale-95 transition"
                                >
                                    Save Savings
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Edit Transaction (SRS 2.2.5) */}
            {showEditModal && editingItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
                    <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-slide-up">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <div className="text-base font-extrabold text-slate-900">
                                    Edit {editingItem.type === "expense" ? "Expense" : editingItem.type === "income" ? "Income" : "Savings"}
                                </div>
                                <div className="text-xs text-slate-400">Update record details</div>
                            </div>
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="mt-4 space-y-3.5">
                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">
                                    Title / Name *
                                </label>
                                <input
                                    type="text"
                                    value={editingItem.data.name}
                                    onChange={(e) =>
                                        setEditingItem({
                                            ...editingItem,
                                            data: { ...editingItem.data, name: e.target.value },
                                        })
                                    }
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                            </div>

                            {editingItem.type === "expense" && (
                                <div>
                                    <label className="text-xs font-bold text-slate-700 block mb-1">
                                        Category
                                    </label>
                                    <select
                                        value={editingItem.data.category_id}
                                        onChange={(e) =>
                                            setEditingItem({
                                                ...editingItem,
                                                data: { ...editingItem.data, category_id: e.target.value },
                                            })
                                        }
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900"
                                    >
                                        {categories.map((cat) => (
                                            <option key={cat.category_id} value={cat.category_id}>
                                                {cat.emoji} {cat.category_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs font-bold text-slate-700 block mb-1">
                                        Amount (₱) *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={editingItem.data.amount}
                                        onChange={(e) =>
                                            setEditingItem({
                                                ...editingItem,
                                                data: { ...editingItem.data, amount: e.target.value },
                                            })
                                        }
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-700 block mb-1">
                                        Date *
                                    </label>
                                    <input
                                        type="date"
                                        value={editingItem.data.date}
                                        onChange={(e) =>
                                            setEditingItem({
                                                ...editingItem,
                                                data: { ...editingItem.data, date: e.target.value },
                                            })
                                        }
                                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">
                                    Description
                                </label>
                                <input
                                    type="text"
                                    value={editingItem.data.description}
                                    onChange={(e) =>
                                        setEditingItem({
                                            ...editingItem,
                                            data: { ...editingItem.data, description: e.target.value },
                                        })
                                    }
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
                                />
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowEditModal(false)}
                                    className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveEditSubmit}
                                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-md shadow-indigo-500/25 active:scale-95 transition"
                                >
                                    Update Record
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Delete Confirmation (SRS 2.2.6 & 2.3.9) */}
            {deleteCandidate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
                    <div className="w-full max-w-xs bg-white rounded-3xl p-6 shadow-2xl text-center animate-slide-up">
                        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl mx-auto mb-3">
                            🗑️
                        </div>
                        <div className="text-base font-extrabold text-slate-900">
                            Confirm Deletion
                        </div>
                        <div className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
                            Are you sure you want to delete{" "}
                            <strong className="text-slate-800">&apos;{deleteCandidate.name}&apos;</strong> (
                            {formatCurrency(deleteCandidate.amount, currency)})?
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setDeleteCandidate(null)}
                                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeDelete}
                                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-xs shadow-md shadow-rose-500/25 active:scale-95 transition"
                            >
                                Yes, Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Set Category Budget (SRS 2.2.7) */}
            {showBudgetEditModal && editingBudgetCat && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
                    <div className="w-full max-w-xs bg-white rounded-3xl p-6 shadow-2xl">
                        <div className="text-base font-bold text-slate-900 mb-1">
                            Set {editingBudgetCat.category_name} Budget
                        </div>
                        <div className="text-xs text-slate-400 mb-3">
                            Set your monthly target spending limit.
                        </div>

                        <div className="relative mb-4">
                            <span className="absolute left-3.5 top-2.5 font-bold text-slate-400">
                                {currency}
                            </span>
                            <input
                                type="number"
                                value={formBudgetAmount}
                                onChange={(e) => setFormBudgetAmount(e.target.value)}
                                className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                autoFocus
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowBudgetEditModal(false)}
                                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveCategoryBudget}
                                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-md shadow-indigo-500/25"
                            >
                                Save Limit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Client Login (SRS 2.2.1) */}
            {showLoginModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
                    <div className="w-full max-w-xs bg-white rounded-3xl p-6 shadow-2xl">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <div className="text-base font-extrabold text-slate-900">Client Login</div>
                                <div className="text-xs text-slate-400">SRS Section 2.2.1 Verification</div>
                            </div>
                            <button
                                onClick={() => setShowLoginModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        {loginError && (
                            <div className="mt-3 p-2 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-bold">
                                {loginError}
                            </div>
                        )}

                        <form onSubmit={handleLoginSubmit} className="mt-4 space-y-3">
                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">
                                    Username
                                </label>
                                <input
                                    type="text"
                                    value={loginUsername}
                                    onChange={(e) => setLoginUsername(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">
                                    Password (Masked - SRS 2.8.1)
                                </label>
                                <input
                                    type="password"
                                    value={loginPassword}
                                    onChange={(e) => setLoginPassword(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowLoginModal(false)}
                                    className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-md shadow-indigo-500/25"
                                >
                                    Log In
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =========================================================================
                MODAL: AI FINANCIAL ADVISOR & HEALTH REPORT
            ========================================================================= */}
            {showAiAdvisorModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4 animate-fade-in">
                    <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl animate-slide-up max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-t-3xl">
                            <div>
                                <div className="text-base font-extrabold text-white flex items-center gap-2">
                                    ✨ AI Financial Health Report
                                </div>
                                <div className="text-xs text-indigo-200 mt-0.5">
                                    Powered by Pocketwise Intelligence Engine · {aiAnalysis?.generatedAt ? new Date(aiAnalysis.generatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "Analyzing..."}
                                </div>
                            </div>
                            <button
                                onClick={() => setShowAiAdvisorModal(false)}
                                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-sm"
                            >✕</button>
                        </div>

                        <div className="overflow-y-auto p-5 space-y-4 flex-1">
                            {aiLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
                                    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                    <span className="text-sm font-semibold">AI is analyzing your finances...</span>
                                </div>
                            ) : aiAnalysis ? (
                                <>
                                    {/* Health Score Ring */}
                                    <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <div
                                            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-extrabold border-4 shadow-inner flex-shrink-0"
                                            style={{
                                                borderColor: aiAnalysis.ratingColor,
                                                color: aiAnalysis.ratingColor,
                                                backgroundColor: `${aiAnalysis.ratingColor}15`,
                                            }}
                                        >
                                            {aiAnalysis.score}
                                        </div>
                                        <div>
                                            <div className="text-lg font-extrabold text-slate-900">{aiAnalysis.rating}</div>
                                            <div className="text-xs text-slate-500 mt-0.5">
                                                Daily spend: <strong>₱{aiAnalysis.summary?.dailyBurnRate}/day</strong> · Projected month-end: <strong>₱{aiAnalysis.summary?.projectedMonthTotal?.toLocaleString()}</strong>
                                            </div>
                                            <div className="text-xs text-slate-500 mt-0.5">
                                                Savings rate: <strong className="text-emerald-600">{aiAnalysis.summary?.directSavingsRate}%</strong> · Days remaining: <strong>{aiAnalysis.summary?.daysRemaining}</strong>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 50/30/20 Rule Breakdown */}
                                    <div className="space-y-2">
                                        <div className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">50/30/20 Budget Rule</div>
                                        {[
                                            { label: "Needs (50%)", key: "needs", color: "#EF4444", targetPct: 50 },
                                            { label: "Wants (30%)", key: "wants", color: "#F59E0B", targetPct: 30 },
                                            { label: "Savings (20%)", key: "savings", color: "#10B981", targetPct: 20 },
                                        ].map((rule) => {
                                            const ruleData = aiAnalysis.rule50_30_20?.[rule.key];
                                            const pct = ruleData?.actualPct || 0;
                                            const over = pct > rule.targetPct;
                                            return (
                                                <div key={rule.key} className="space-y-1">
                                                    <div className="flex justify-between text-xs font-semibold text-slate-700">
                                                        <span>{rule.label}</span>
                                                        <span className={over ? "text-rose-500" : "text-slate-600"}>{pct}% {over ? `(+${(pct - rule.targetPct).toFixed(0)}% over)` : "✓"}</span>
                                                    </div>
                                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full transition-all"
                                                            style={{
                                                                width: `${Math.min(100, (pct / rule.targetPct) * 100)}%`,
                                                                backgroundColor: over ? "#EF4444" : rule.color,
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Budget Alerts */}
                                    {aiAnalysis.budgetAlerts?.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">Budget Alerts</div>
                                            {aiAnalysis.budgetAlerts.map((alert, i) => (
                                                <div
                                                    key={i}
                                                    className={`p-3 rounded-xl text-xs font-semibold border ${
                                                        alert.level === "danger"
                                                            ? "bg-rose-50 border-rose-200 text-rose-700"
                                                            : "bg-amber-50 border-amber-200 text-amber-700"
                                                    }`}
                                                >
                                                    <span className="font-extrabold uppercase">{alert.categoryId}:</span> {alert.message}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* AI Smart Insights */}
                                    <div className="space-y-2">
                                        <div className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">Smart Insights</div>
                                        {aiAnalysis.insights?.map((insight, i) => (
                                            <div key={i} className="flex gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                                <span className="text-lg flex-shrink-0">{insight.icon}</span>
                                                <div>
                                                    <div className="text-xs font-extrabold text-slate-800">{insight.title}</div>
                                                    <div className="text-xs text-slate-500 mt-0.5">{insight.description}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-8 text-slate-400 text-xs">
                                    Click "Refresh Analysis" to run AI diagnostics.
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-slate-100 flex gap-2">
                            <button
                                onClick={() => runAiAnalysis()}
                                disabled={aiLoading}
                                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xs shadow-md active:scale-95 transition disabled:opacity-50"
                            >
                                {aiLoading ? "Analyzing..." : "🔄 Refresh Analysis"}
                            </button>
                            <button
                                onClick={() => setShowAiAdvisorModal(false)}
                                className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* =========================================================================
                MODAL: LIVE CURRENCY EXCHANGE RATES & FX CONVERTER
            ========================================================================= */}
            {showRatesModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4 animate-fade-in">
                    <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl animate-slide-up max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-100">
                            <div>
                                <div className="text-base font-extrabold text-slate-900">💱 Live Exchange Rates</div>
                                <div className="text-xs text-slate-400 mt-0.5">
                                    {ratesData?.provider === "fallback-cached" ? "📶 Fallback rates (offline)" : ratesData?.provider ? `✅ ${ratesData.provider}` : "Loading..."}
                                    {ratesData?.timestamp ? ` · ${new Date(ratesData.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}` : ""}
                                </div>
                            </div>
                            <button
                                onClick={() => setShowRatesModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm"
                            >✕</button>
                        </div>

                        <div className="overflow-y-auto p-5 space-y-5 flex-1">
                            {/* FX Converter */}
                            <div className="space-y-3">
                                <div className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">Currency Converter</div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">Amount</label>
                                        <input
                                            type="number"
                                            value={converterAmount}
                                            onChange={(e) => setConverterAmount(Number(e.target.value))}
                                            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            placeholder="Amount"
                                            min="0"
                                        />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">From</label>
                                        <select
                                            value={converterFrom}
                                            onChange={(e) => setConverterFrom(e.target.value)}
                                            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="PHP">🇵🇭 PHP</option>
                                            {ratesData?.popularCurrencies?.map((c) => (
                                                <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">To</label>
                                        <select
                                            value={converterTo}
                                            onChange={(e) => setConverterTo(e.target.value)}
                                            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="PHP">🇵🇭 PHP</option>
                                            {ratesData?.popularCurrencies?.map((c) => (
                                                <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                {/* Conversion Result */}
                                <div className="p-3.5 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-between">
                                    <div className="text-xs text-indigo-500 font-semibold">{converterAmount.toLocaleString()} {converterFrom} =</div>
                                    <div className="text-lg font-extrabold text-indigo-700">
                                        {(() => {
                                            if (!ratesData?.rates) return "...";
                                            const fromRate = converterFrom === "PHP" ? 1 : (ratesData.rates[converterFrom] || 1);
                                            const toRate = converterTo === "PHP" ? 1 : (ratesData.rates[converterTo] || 1);
                                            const phpBase = 1; // PHP is base
                                            // rates are how many of currency per 1 PHP (when base=PHP)
                                            const inPhp = converterFrom === "PHP" ? converterAmount : (converterAmount / fromRate);
                                            const result = converterTo === "PHP" ? inPhp : (inPhp * toRate);
                                            return result.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + converterTo;
                                        })()}
                                    </div>
                                </div>
                            </div>

                            {/* Popular Rates Grid */}
                            <div className="space-y-2">
                                <div className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">Popular Rates vs Philippine Peso (₱)</div>
                                <div className="grid grid-cols-2 gap-2">
                                    {ratesData?.popularCurrencies?.map((curr) => (
                                        <div
                                            key={curr.code}
                                            onClick={() => {
                                                setConverterFrom(curr.code);
                                                setConverterTo("PHP");
                                                setConverterAmount(1);
                                            }}
                                            className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-indigo-50 hover:border-indigo-100 cursor-pointer transition"
                                        >
                                            <div>
                                                <div className="text-xs font-bold text-slate-700">{curr.flag} {curr.code}</div>
                                                <div className="text-[11px] text-slate-400">{curr.name}</div>
                                            </div>
                                            <div className="text-xs font-extrabold text-slate-900">
                                                ₱{curr.rateToPhp?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 flex gap-2">
                            <button
                                onClick={async () => {
                                    const rates = await fetchLiveExchangeRates("PHP");
                                    setRatesData(rates);
                                }}
                                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs active:scale-95 transition"
                            >
                                🔄 Refresh Rates
                            </button>
                            <button
                                onClick={() => setShowRatesModal(false)}
                                className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* =========================================================================
                MODAL: REST API SERVER CONSOLE & DIAGNOSTICS
            ========================================================================= */}
            {showApiServerModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4 animate-fade-in">
                    <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl animate-slide-up max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 pb-4 bg-slate-900 rounded-t-3xl">
                            <div>
                                <div className="text-base font-extrabold text-white flex items-center gap-2">
                                    🌐 REST API Server Console
                                </div>
                                <div className={`text-xs mt-0.5 font-semibold ${apiHealth.online ? "text-emerald-400" : "text-amber-400"}`}>
                                    {apiHealth.online ? `● Online · ${apiHealth.latency}ms response · ${apiHealth.data?.version || "v2.0.0"}` : "● Offline mode · Local Dexie DB active"}
                                </div>
                            </div>
                            <button
                                onClick={() => setShowApiServerModal(false)}
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-sm"
                            >✕</button>
                        </div>

                        <div className="overflow-y-auto p-5 space-y-4 flex-1">
                            {/* Server Info */}
                            <div className="grid grid-cols-3 gap-2 text-center">
                                {[
                                    { label: "Expenses", value: apiHealth.data?.database?.expensesCount ?? expensesList.length },
                                    { label: "Incomes", value: apiHealth.data?.database?.incomesCount ?? incomesList.length },
                                    { label: "Savings", value: apiHealth.data?.database?.savingsCount ?? savingsList.length },
                                ].map((stat) => (
                                    <div key={stat.label} className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                        <div className="text-[10px] text-slate-400 font-bold uppercase">{stat.label}</div>
                                        <div className="text-lg font-extrabold text-slate-800 mt-1">{stat.value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* API Endpoints */}
                            <div className="space-y-2">
                                <div className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">Available API Endpoints</div>
                                <div className="space-y-1.5">
                                    {[
                                        { method: "GET", path: "/api/health", label: "Server health & diagnostics" },
                                        { method: "POST", path: "/api/sync", label: "Bidirectional 2-way batch sync" },
                                        { method: "GET", path: "/api/summary", label: "Monthly financial summary" },
                                        { method: "GET/POST", path: "/api/expenses", label: "Expenses CRUD" },
                                        { method: "GET/POST", path: "/api/incomes", label: "Incomes CRUD" },
                                        { method: "GET/POST", path: "/api/savings", label: "Savings CRUD" },
                                        { method: "GET/POST", path: "/api/budgets", label: "Category budget management" },
                                        { method: "GET", path: "/api/rates", label: "Live currency exchange rates" },
                                        { method: "GET", path: "/api/rates/convert", label: "FX currency converter" },
                                        { method: "POST", path: "/api/ai/advisor", label: "AI financial health analysis" },
                                        { method: "POST", path: "/api/ai/categorize", label: "Smart NLP expense parser" },
                                        { method: "POST", path: "/api/auth/login", label: "Client authentication" },
                                    ].map((ep) => (
                                        <div key={ep.path} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                                            <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded shrink-0 ${
                                                ep.method.startsWith("GET") ? "bg-emerald-100 text-emerald-700" :
                                                ep.method === "POST" ? "bg-blue-100 text-blue-700" : "bg-indigo-100 text-indigo-700"
                                            }`}>
                                                {ep.method}
                                            </span>
                                            <code className="text-[11px] font-mono text-indigo-600 shrink-0">{ep.path}</code>
                                            <span className="text-[11px] text-slate-400 truncate">{ep.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Architecture Note */}
                            <div className="p-3.5 bg-indigo-50 rounded-2xl border border-indigo-100 text-xs text-indigo-700">
                                <div className="font-extrabold mb-1">Architecture</div>
                                <div>This API runs <strong>embedded inside the Vite dev server</strong> via <code className="bg-white/60 px-1 rounded font-mono">financialApiPlugin()</code> — no separate server process required. Data persists in <code className="bg-white/60 px-1 rounded font-mono">server_data/database.json</code>.</div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 flex gap-2">
                            <button
                                onClick={async () => {
                                    const health = await checkBackendHealth();
                                    if (health.online) {
                                        setSyncMessage(`API Server: ${health.latency}ms · ${health.data?.database?.expensesCount || 0} records synced`);
                                        setTimeout(() => setSyncMessage(""), 3000);
                                    }
                                }}
                                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs active:scale-95 transition"
                            >
                                🔍 Ping API Server
                            </button>
                            <button
                                onClick={() => setShowApiServerModal(false)}
                                className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}