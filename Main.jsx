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
    getBudgets,
    setCategoryBudget,
    getClient,
    updateClientProfile,
    verifyClientLogin,
    resetClientPassword,
    resetDatabaseToDemo,
} from "./db.js";

// Format currency in Philippine Peso (₱) as required by SRS 2.3.10
function formatCurrency(amount) {
    const num = Number(amount) || 0;
    return `₱${num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

// Format date nicely (e.g. "Nov 13")
function formatDateDisplay(isoString) {
    if (!isoString) return "";
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
        return "";
    }
}

export default function PocketwiseApp() {
    // -------------------------------------------------------------
    // Core State
    // -------------------------------------------------------------
    const [client, setClient] = useState(null);
    const [isLoggedIn, setIsLoggedIn] = useState(true);
    const [authView, setAuthView] = useState("login"); // 'login' | 'reset'
    const [activeTab, setActiveTab] = useState("home"); // 'home' | 'income' | 'expenses' | 'reports' | 'settings'

    // Data lists
    const [expensesList, setExpensesList] = useState([]);
    const [incomesList, setIncomesList] = useState([]);
    const [savingsList, setSavingsList] = useState([]);
    const [budgetsList, setBudgetsList] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [expenseCategoryFilter, setExpenseCategoryFilter] = useState("all");
    const [incomeSourceFilter, setIncomeSourceFilter] = useState("all");

    // Modal States
    const [showAddModal, setShowAddModal] = useState(false);
    const [addModalType, setAddModalType] = useState("expense"); // 'expense' | 'income'
    const [editingItem, setEditingItem] = useState(null);
    const [deletingItem, setDeletingItem] = useState(null);
    const [showBudgetModal, setShowBudgetModal] = useState(false);
    const [editingBudgetCat, setEditingBudgetCat] = useState(null);
    const [showNotifications, setShowNotifications] = useState(false);

    // Form inputs for Add/Edit
    const [formAmount, setFormAmount] = useState("");
    const [formName, setFormName] = useState("");
    const [formCategory, setFormCategory] = useState("food");
    const [formSource, setFormSource] = useState("Salary");
    const [formDescription, setFormDescription] = useState("");
    const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [formStatus, setFormStatus] = useState("Completed");
    const [formError, setFormError] = useState("");

    // Auth Form State
    const [loginUsername, setLoginUsername] = useState("canillasjohnlouie2007@gmail.com");
    const [loginPassword, setLoginPassword] = useState("password123");
    const [showPassword, setShowPassword] = useState(false);
    const [loginError, setLoginError] = useState("");

    // Reset Password Form State
    const [resetUser, setResetUser] = useState("lowigwapo");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [resetMessage, setResetMessage] = useState("");

    // Budget Edit Form
    const [formBudgetAmount, setFormBudgetAmount] = useState("");

    // -------------------------------------------------------------
    // Data Loading & Refresh
    // -------------------------------------------------------------
    const refreshAllData = async () => {
        try {
            await initDatabaseDefaults();
            const [c, exp, inc, sav, bud] = await Promise.all([
                getClient(),
                getExpenses(),
                getIncomes(),
                getSavings(),
                getBudgets(selectedMonth),
            ]);
            setClient(c);
            setExpensesList(exp || []);
            setIncomesList(inc || []);
            setSavingsList(sav || []);
            setBudgetsList(bud || []);
        } catch (err) {
            console.error("Dexie loading error:", err);
        }
    };

    useEffect(() => {
        (async () => {
            await refreshAllData();
            setLoading(false);
        })();
    }, [selectedMonth]);

    // -------------------------------------------------------------
    // Financial Metrics Calculations (SRS 2.2.8, 2.2.9, 2.2.11)
    // -------------------------------------------------------------
    const metrics = useMemo(() => {
        // Filter by selected month
        const currentExpenses = expensesList.filter((e) => !e.isDeleted && (e.date || "").startsWith(selectedMonth));
        const currentIncomes = incomesList.filter((i) => !i.isDeleted && (i.date || "").startsWith(selectedMonth));
        const currentSavings = savingsList.filter((s) => !s.isDeleted);

        // Sum completed items (completed items count toward financial totals as per UI notes)
        const totalCompletedExpenses = currentExpenses
            .filter((e) => e.status !== "Pending")
            .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

        const totalCompletedIncome = currentIncomes
            .filter((i) => i.status !== "Pending")
            .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

        const totalSavings = currentSavings.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

        // SRS 2.2.9: Remaining Balance = Total Income - Total Expenses
        const netBalance = totalCompletedIncome - totalCompletedExpenses;

        // Total Planned Budget
        const totalPlannedBudget = budgetsList.reduce((sum, b) => sum + (Number(b.budget_amount) || 0), 0);
        const remainingBudget = Math.max(0, totalPlannedBudget - totalCompletedExpenses);
        const budgetPercentRemaining = totalPlannedBudget > 0 ? Math.round((remainingBudget / totalPlannedBudget) * 100) : 100;

        // Days Remaining in Month
        const now = new Date();
        const year = parseInt(selectedMonth.slice(0, 4), 10) || now.getFullYear();
        const month = parseInt(selectedMonth.slice(5, 7), 10) || now.getMonth() + 1;
        const totalDaysInMonth = new Date(year, month, 0).getDate();
        const currentDay = year === now.getFullYear() && month === now.getMonth() + 1 ? now.getDate() : totalDaysInMonth;
        const daysRemaining = Math.max(0, totalDaysInMonth - currentDay);

        // Average Daily Spending
        const dailySpend = currentDay > 0 ? totalCompletedExpenses / currentDay : 0;

        // Savings Target & Goal Progress (Default Target: ₱5,000)
        const savingsTarget = client?.monthlyTargetSavings || 5000;
        const savingsPercent = Math.min(100, Math.round((totalSavings / savingsTarget) * 100));
        const savingsToGo = Math.max(0, savingsTarget - totalSavings);

        // Category Breakdown
        const categorySpending = {};
        SRS_CATEGORIES.forEach((cat) => {
            categorySpending[cat.category_id] = 0;
        });
        currentExpenses.forEach((exp) => {
            const cat = exp.category_id || "others";
            categorySpending[cat] = (categorySpending[cat] || 0) + (Number(exp.amount) || 0);
        });

        // Notifications / Budget Warnings (SRS 2.2.8)
        const alerts = [];
        budgetsList.forEach((b) => {
            const spent = categorySpending[b.category_id] || 0;
            const limit = Number(b.budget_amount) || 0;
            const cat = SRS_CATEGORIES.find((c) => c.category_id === b.category_id) || { category_name: b.category_id };
            if (limit > 0 && spent >= limit) {
                alerts.push({
                    type: "exceeded",
                    title: `${cat.category_name} budget exceeded!`,
                    message: `You spent ${formatCurrency(spent)} which is over your ${formatCurrency(limit)} limit.`,
                });
            } else if (limit > 0 && spent >= limit * 0.8) {
                alerts.push({
                    type: "warning",
                    title: `${cat.category_name} near limit`,
                    message: `You have used ${Math.round((spent / limit) * 100)}% of your ${formatCurrency(limit)} budget.`,
                });
            }
        });

        return {
            totalIncome: totalCompletedIncome,
            totalExpenses: totalCompletedExpenses,
            netBalance,
            totalPlannedBudget,
            remainingBudget,
            budgetPercentRemaining,
            totalSavings,
            daysRemaining,
            dailySpend,
            currentDay,
            savingsTarget,
            savingsPercent,
            savingsToGo,
            categorySpending,
            alerts,
            currentExpenses,
            currentIncomes,
        };
    }, [expensesList, incomesList, savingsList, budgetsList, selectedMonth, client]);

    // -------------------------------------------------------------
    // Handlers: Authentication (SRS 2.2.1 & Screenshots 6 & 7)
    // -------------------------------------------------------------
    const handleLogin = async (e) => {
        e?.preventDefault();
        setLoginError("");
        const res = await verifyClientLogin(loginUsername, loginPassword);
        if (res.success) {
            setClient(res.client);
            setIsLoggedIn(true);
        } else {
            setLoginError("Incorrect username or password.");
        }
    };

    const handleResetPassword = async (e) => {
        e?.preventDefault();
        setResetMessage("");
        if (!newPassword || newPassword !== confirmPassword) {
            setResetMessage("Passwords do not match. Please verify.");
            return;
        }
        await resetClientPassword(resetUser, newPassword);
        setResetMessage("Password updated successfully! You can now log in.");
        setTimeout(() => {
            setAuthView("login");
            setResetMessage("");
        }, 1500);
    };

    // -------------------------------------------------------------
    // Handlers: Add / Edit / Delete Transactions
    // -------------------------------------------------------------
    const openAddModal = (type) => {
        setAddModalType(type);
        setEditingItem(null);
        setFormAmount("");
        setFormName("");
        setFormCategory("food");
        setFormSource("Salary");
        setFormDescription("");
        setFormDate(new Date().toISOString().slice(0, 10));
        setFormStatus("Completed");
        setFormError("");
        setShowAddModal(true);
    };

    const openEditModal = (item, type) => {
        setAddModalType(type);
        setEditingItem(item);
        setFormAmount(String(item.amount || ""));
        setFormName(item.name || item.source || "");
        setFormCategory(item.category_id || "food");
        setFormSource(item.source || "Salary");
        setFormDescription(item.description || "");
        setFormDate(item.date ? item.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
        setFormStatus(item.status || "Completed");
        setFormError("");
        setShowAddModal(true);
    };

    const handleSaveTransaction = async (e) => {
        e?.preventDefault();
        setFormError("");

        const amountNum = parseFloat(formAmount);
        if (isNaN(amountNum) || amountNum <= 0) {
            setFormError("Please enter a valid amount greater than 0.");
            return;
        }

        const dateIso = new Date(formDate).toISOString();

        if (addModalType === "expense") {
            const catObj = SRS_CATEGORIES.find((c) => c.category_id === formCategory);
            const expenseName = formName.trim() || catObj?.category_name || "Expense";

            if (editingItem) {
                await updateExpense(editingItem.expense_id, {
                    name: expenseName,
                    amount: amountNum,
                    category_id: formCategory,
                    date: dateIso,
                    description: formDescription.trim(),
                    status: formStatus,
                });
            } else {
                await addExpense({
                    name: expenseName,
                    amount: amountNum,
                    category_id: formCategory,
                    date: dateIso,
                    description: formDescription.trim(),
                    status: formStatus,
                });
            }
        } else {
            const incomeName = formName.trim() || formSource;

            if (editingItem) {
                await updateIncome(editingItem.income_id, {
                    source: incomeName,
                    amount: amountNum,
                    date: dateIso,
                    description: formDescription.trim(),
                    status: formStatus,
                });
            } else {
                await addIncome({
                    source: incomeName,
                    amount: amountNum,
                    date: dateIso,
                    description: formDescription.trim(),
                    status: formStatus,
                });
            }
        }

        await refreshAllData();
        setShowAddModal(false);
    };

    const handleDeleteConfirm = async () => {
        if (!deletingItem) return;
        if (deletingItem.expense_id) {
            await deleteExpense(deletingItem.expense_id);
        } else if (deletingItem.income_id) {
            await deleteIncome(deletingItem.income_id);
        }
        setDeletingItem(null);
        await refreshAllData();
    };

    // -------------------------------------------------------------
    // Handlers: Export CSV (SRS 4.1 & Image 8)
    // -------------------------------------------------------------
    const exportCSV = (type = "expense") => {
        const items = type === "income" ? metrics.currentIncomes : metrics.currentExpenses;
        let csv = type === "income" ? "Date,Source,Amount,Status,Description\n" : "Date,Expense Name,Category,Amount,Status,Description\n";

        items.forEach((item) => {
            const d = (item.date || "").slice(0, 10);
            const amt = item.amount || 0;
            const desc = `"${(item.description || "").replace(/"/g, '""')}"`;
            const stat = item.status || "Completed";
            if (type === "income") {
                csv += `${d},"${item.source || ""}",${amt},${stat},${desc}\n`;
            } else {
                const cat = SRS_CATEGORIES.find((c) => c.category_id === item.category_id)?.category_name || item.category_id;
                csv += `${d},"${item.name || ""}",${cat},${amt},${stat},${desc}\n`;
            }
        });

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `Pocketwise_${type}_${selectedMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // -------------------------------------------------------------
    // Navigation Label helper
    // -------------------------------------------------------------
    const activeTabLabel = useMemo(() => {
        switch (activeTab) {
            case "home":
                return "Dashboard";
            case "income":
                return "Income";
            case "expenses":
                return "Expenses";
            case "reports":
                return "Reports";
            case "settings":
                return "Settings";
            default:
                return "Dashboard";
        }
    }, [activeTab]);

    // -------------------------------------------------------------
    // RENDER: Auth Screen (Matching Screenshot 6 & 7)
    // -------------------------------------------------------------
    if (!isLoggedIn) {
        if (authView === "reset") {
            return (
                <div className="min-h-screen bg-[#F6F8FC] flex flex-col items-center justify-center p-4 selection:bg-indigo-500 selection:text-white">
                    <div className="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-100">
                        <button
                            type="button"
                            onClick={() => {
                                setAuthView("login");
                                setResetMessage("");
                            }}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mb-4"
                        >
                            ← Back
                        </button>

                        <div className="flex flex-col items-center text-center">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6366F1] to-[#4F46E5] text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 mb-4">
                                <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24">
                                    <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Reset your password</h2>
                            <p className="text-xs text-slate-400 mt-1">Choose a new password for your account</p>
                        </div>

                        {resetMessage && (
                            <div className={`mt-4 p-2.5 rounded-xl text-xs font-semibold ${resetMessage.includes("success") ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-600 border border-rose-200"}`}>
                                {resetMessage}
                            </div>
                        )}

                        <form onSubmit={handleResetPassword} className="mt-5 space-y-3.5">
                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">Username</label>
                                <input
                                    type="text"
                                    value={resetUser}
                                    onChange={(e) => setResetUser(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">New password</label>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Enter password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">Confirm password</label>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Re-enter password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#6366F1] to-[#4F46E5] text-white font-bold text-xs shadow-md shadow-indigo-500/25 active:scale-98 transition mt-2"
                            >
                                Update password
                            </button>

                            <button
                                type="button"
                                onClick={() => setAuthView("login")}
                                className="w-full text-center text-xs text-indigo-600 font-semibold hover:underline mt-2 block"
                            >
                                Back to login
                            </button>
                        </form>
                    </div>
                </div>
            );
        }

        // Default Login Screen (Image 6)
        return (
            <div className="min-h-screen bg-[#F6F8FC] flex flex-col items-center justify-center p-4 selection:bg-indigo-500 selection:text-white">
                <div className="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-100">
                    <div className="flex flex-col items-center text-center">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6366F1] to-[#4F46E5] text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 mb-4">
                            <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24">
                                <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Welcome back</h2>
                        <p className="text-xs text-slate-400 mt-1">Log in to your Pocketwise account</p>
                    </div>

                    {loginError && (
                        <div className="mt-4 p-2.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-semibold">
                            {loginError}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="mt-5 space-y-3.5">
                        <div>
                            <label className="text-xs font-bold text-slate-700 block mb-1">Username</label>
                            <input
                                type="text"
                                value={loginUsername}
                                onChange={(e) => setLoginUsername(e.target.value)}
                                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                required
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-700 block mb-1">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={loginPassword}
                                    onChange={(e) => setLoginPassword(e.target.value)}
                                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                                >
                                    {showPassword ? "🙈" : "👁️"}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#6366F1] to-[#4F46E5] text-white font-bold text-xs shadow-md shadow-indigo-500/25 active:scale-98 transition mt-2"
                        >
                            Login
                        </button>

                        <div className="flex items-center justify-between pt-2 text-xs">
                            <button
                                type="button"
                                onClick={() => setAuthView("reset")}
                                className="text-indigo-600 font-semibold hover:underline"
                            >
                                Forgot password?
                            </button>
                            <span className="text-slate-400">Default: password123</span>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    // -------------------------------------------------------------
    // RENDER: Main Application
    // -------------------------------------------------------------
    return (
        <div className="min-h-screen bg-[#F6F8FC] text-slate-800 flex flex-col selection:bg-indigo-500 selection:text-white">
            {/* =========================================================
                TOP APP HEADER (Matching Screenshot 3, 5, 8)
            ========================================================= */}
            <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
                <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
                    {/* Left: Brand Logo & Section Subtitle */}
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6366F1] to-[#4F46E5] text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                                <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                            </svg>
                        </div>
                        <div>
                            <div className="text-base font-extrabold text-slate-900 tracking-tight leading-none">Pocketwise</div>
                            <div className="text-[11px] font-medium text-slate-400 capitalize mt-0.5">{activeTabLabel}</div>
                        </div>
                    </div>

                    {/* Right: Notification Bell & Logout */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowNotifications(true)}
                            className="relative w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-100 active:scale-95 transition"
                            title="Notifications & Budget Alerts"
                        >
                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                            </svg>
                            {metrics.alerts.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-extrabold flex items-center justify-center">
                                    {metrics.alerts.length}
                                </span>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsLoggedIn(false)}
                            className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 active:scale-95 transition"
                            title="Logout account"
                        >
                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </header>

            {/* =========================================================
                MAIN CONTENT BODY
            ========================================================= */}
            <main className="flex-1 max-w-md w-full mx-auto px-4 pt-4 pb-28">
                {/* -----------------------------------------------------
                    TAB 1: DASHBOARD (Matching Image 2 & 5)
                ----------------------------------------------------- */}
                {activeTab === "home" && (
                    <div className="space-y-4">
                        {/* Welcome Header */}
                        <div>
                            <div className="text-[11px] font-extrabold text-[#6366F1] tracking-wider uppercase">
                                {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                            </div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                                Welcome back, {client?.name?.split(" ")[0] || "Guest"}!
                            </h1>
                            <p className="text-xs text-slate-400 mt-0.5">Here's how your money is looking today.</p>
                        </div>

                        {/* 6 Key Metric Cards in 2x3 Grid (Matching Image 5) */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* 1. Total Income */}
                            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Income</span>
                                    <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs font-bold">
                                        ↓
                                    </span>
                                </div>
                                <div className="mt-3">
                                    <div className="text-lg font-black text-slate-900 tracking-tight">{formatCurrency(metrics.totalIncome)}</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">Income received this month</div>
                                </div>
                            </div>

                            {/* 2. Total Expenses */}
                            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Expenses</span>
                                    <span className="w-6 h-6 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center text-xs font-bold">
                                        ↑
                                    </span>
                                </div>
                                <div className="mt-3">
                                    <div className="text-lg font-black text-slate-900 tracking-tight">{formatCurrency(metrics.totalExpenses)}</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">{metrics.currentExpenses.length} transactions this month</div>
                                </div>
                            </div>

                            {/* 3. Remaining Budget */}
                            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Remaining Budget</span>
                                    <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs">
                                        💳
                                    </span>
                                </div>
                                <div className="mt-3">
                                    <div className="text-lg font-black text-slate-900 tracking-tight">{formatCurrency(metrics.remainingBudget)}</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">{metrics.budgetPercentRemaining}% available to spend</div>
                                </div>
                            </div>

                            {/* 4. Net Balance */}
                            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Net Balance</span>
                                    <span className="w-6 h-6 rounded-full bg-cyan-50 text-cyan-600 flex items-center justify-center text-xs">
                                        📊
                                    </span>
                                </div>
                                <div className="mt-3">
                                    <div className={`text-lg font-black tracking-tight ${metrics.netBalance >= 0 ? "text-slate-900" : "text-rose-600"}`}>
                                        {formatCurrency(metrics.netBalance)}
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">All income minus all expenses</div>
                                </div>
                            </div>

                            {/* 5. Days Remaining */}
                            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Days Remaining</span>
                                    <span className="w-6 h-6 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center text-xs">
                                        📅
                                    </span>
                                </div>
                                <div className="mt-3">
                                    <div className="text-lg font-black text-slate-900 tracking-tight">{metrics.daysRemaining} days</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">Left in this month</div>
                                </div>
                            </div>

                            {/* 6. Average Daily Spending */}
                            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Daily Spending</span>
                                    <span className="w-6 h-6 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-xs">
                                        📈
                                    </span>
                                </div>
                                <div className="mt-3">
                                    <div className="text-lg font-black text-slate-900 tracking-tight">{formatCurrency(metrics.dailySpend)}</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">Over {metrics.currentDay} days so far</div>
                                </div>
                            </div>
                        </div>

                        {/* Savings Progress Card (Matching Image 2) */}
                        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Savings Progress</span>
                                <span className="text-[11px] font-extrabold text-indigo-600">{metrics.savingsPercent}%</span>
                            </div>
                            <div className="mt-2">
                                <div className="text-xl font-black text-slate-900">{formatCurrency(metrics.totalSavings)}</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">You're building a good habit. Keep it going!</div>
                            </div>
                            {/* Visual Progress Bar */}
                            <div className="mt-3 w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div
                                    className="bg-gradient-to-r from-emerald-400 to-[#10B981] h-full rounded-full transition-all duration-500"
                                    style={{ width: `${metrics.savingsPercent}%` }}
                                />
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1.5 font-semibold">
                                <span>{metrics.savingsPercent}% of {formatCurrency(metrics.savingsTarget)} goal</span>
                                <span>{formatCurrency(metrics.savingsToGo)} to go</span>
                            </div>
                        </div>

                        {/* Quick Action Buttons */}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => openAddModal("expense")}
                                className="flex-1 py-3 bg-[#6366F1] hover:bg-[#4F46E5] text-white font-bold text-xs rounded-2xl shadow-md shadow-indigo-500/20 active:scale-98 transition flex items-center justify-center gap-1.5"
                            >
                                <span className="text-sm font-extrabold">+</span> Add Expense
                            </button>
                            <button
                                type="button"
                                onClick={() => openAddModal("income")}
                                className="flex-1 py-3 bg-white hover:bg-slate-50 text-indigo-600 font-bold text-xs rounded-2xl border border-indigo-100 active:scale-98 transition flex items-center justify-center gap-1.5"
                            >
                                <span className="text-sm font-extrabold">+</span> Add Income
                            </button>
                        </div>

                        {/* Recent Transactions Feed */}
                        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-extrabold text-slate-900">Recent Activity</span>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("expenses")}
                                    className="text-[11px] font-bold text-indigo-600 hover:underline"
                                >
                                    View all →
                                </button>
                            </div>

                            {expensesList.length === 0 ? (
                                <div className="text-center py-6 text-xs text-slate-400">No transactions recorded yet.</div>
                            ) : (
                                <div className="space-y-2.5">
                                    {expensesList.slice(0, 4).map((exp) => {
                                        const cat = SRS_CATEGORIES.find((c) => c.category_id === exp.category_id) || { category_name: "Expense", emoji: "💳", arrowBg: "#F1F5F9", arrowColor: "#64748B" };
                                        return (
                                            <div
                                                key={exp.expense_id}
                                                onClick={() => openEditModal(exp, "expense")}
                                                className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50/80 cursor-pointer transition"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                                                        style={{ backgroundColor: cat.arrowBg || "#FFF7ED", color: cat.arrowColor || "#EA580C" }}
                                                    >
                                                        ↑
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-extrabold text-slate-900 leading-tight">{exp.name}</div>
                                                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                                                            <span>{cat.category_name}</span>
                                                            <span>·</span>
                                                            <span>{formatDateDisplay(exp.date)}</span>
                                                            <span className="px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-600 font-bold border border-emerald-100 text-[9px]">
                                                                {exp.status || "Completed"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-xs font-black text-slate-900 tracking-tight">
                                                    -{formatCurrency(exp.amount)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* -----------------------------------------------------
                    TAB 2: EXPENSES (Matching Image 3)
                ----------------------------------------------------- */}
                {activeTab === "expenses" && (
                    <div className="space-y-4">
                        {/* Header & Add Button */}
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="text-[11px] font-extrabold text-[#6366F1] tracking-wider uppercase">
                                    {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                                </div>
                                <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">Expenses</h1>
                                <p className="text-xs text-slate-400 mt-0.5">Stay on top of where your money goes.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => openAddModal("expense")}
                                className="w-10 h-10 rounded-2xl bg-[#6366F1] text-white flex items-center justify-center text-xl font-bold shadow-md shadow-indigo-500/25 active:scale-95 transition"
                            >
                                +
                            </button>
                        </div>

                        {/* Category Filter Pills */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                            <button
                                type="button"
                                onClick={() => setExpenseCategoryFilter("all")}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition ${
                                    expenseCategoryFilter === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200"
                                }`}
                            >
                                ALL
                            </button>
                            {SRS_CATEGORIES.map((cat) => (
                                <button
                                    key={cat.category_id}
                                    type="button"
                                    onClick={() => setExpenseCategoryFilter(cat.category_id)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition flex items-center gap-1 ${
                                        expenseCategoryFilter === cat.category_id
                                            ? "bg-[#6366F1] text-white"
                                            : "bg-white text-slate-600 border border-slate-200"
                                    }`}
                                >
                                    <span>{cat.emoji}</span>
                                    <span>{cat.category_name}</span>
                                </button>
                            ))}
                        </div>

                        {/* Total Completed Card (Matching Image 3) */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs">
                            <div className="text-[11px] font-bold text-slate-400">Total completed</div>
                            <div className="flex items-baseline justify-between mt-1">
                                <div className="text-2xl font-black text-slate-900">
                                    {formatCurrency(
                                        metrics.currentExpenses
                                            .filter((e) => (expenseCategoryFilter === "all" ? true : e.category_id === expenseCategoryFilter))
                                            .reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
                                    )}
                                </div>
                                <div className="text-xs text-slate-400 font-semibold">
                                    {metrics.currentExpenses.filter((e) => (expenseCategoryFilter === "all" ? true : e.category_id === expenseCategoryFilter)).length} entries
                                </div>
                            </div>
                        </div>

                        {/* Expense Items List */}
                        <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-xs space-y-3">
                            {metrics.currentExpenses
                                .filter((e) => (expenseCategoryFilter === "all" ? true : e.category_id === expenseCategoryFilter))
                                .length === 0 ? (
                                <div className="text-center py-10 text-xs text-slate-400">No expenses recorded for this filter.</div>
                            ) : (
                                metrics.currentExpenses
                                    .filter((e) => (expenseCategoryFilter === "all" ? true : e.category_id === expenseCategoryFilter))
                                    .map((exp) => {
                                        const cat = SRS_CATEGORIES.find((c) => c.category_id === exp.category_id) || { category_name: "Expense", emoji: "💳", arrowBg: "#FFF7ED", arrowColor: "#EA580C" };
                                        return (
                                            <div
                                                key={exp.expense_id}
                                                className="flex items-center justify-between p-2 rounded-2xl hover:bg-slate-50 transition group"
                                            >
                                                <div
                                                    onClick={() => openEditModal(exp, "expense")}
                                                    className="flex items-center gap-3 cursor-pointer flex-1"
                                                >
                                                    <div
                                                        className="w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold shrink-0"
                                                        style={{ backgroundColor: cat.arrowBg || "#FFF7ED", color: cat.arrowColor || "#EA580C" }}
                                                    >
                                                        ↑
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-black text-slate-900">{exp.name}</div>
                                                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                                                            <span>{cat.category_name}</span>
                                                            <span>·</span>
                                                            <span>{formatDateDisplay(exp.date)}</span>
                                                            <span className="px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-600 font-bold border border-emerald-100 text-[9px]">
                                                                {exp.status || "Completed"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <div className="text-xs font-black text-slate-900 tracking-tight">
                                                        -{formatCurrency(exp.amount)}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeletingItem(exp)}
                                                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 p-1 text-xs transition"
                                                        title="Delete expense"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                            )}
                        </div>
                    </div>
                )}

                {/* -----------------------------------------------------
                    TAB 3: INCOME
                ----------------------------------------------------- */}
                {activeTab === "income" && (
                    <div className="space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="text-[11px] font-extrabold text-[#6366F1] tracking-wider uppercase">
                                    {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                                </div>
                                <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">Income</h1>
                                <p className="text-xs text-slate-400 mt-0.5">Track all money received.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => openAddModal("income")}
                                className="w-10 h-10 rounded-2xl bg-[#6366F1] text-white flex items-center justify-center text-xl font-bold shadow-md shadow-indigo-500/25 active:scale-95 transition"
                            >
                                +
                            </button>
                        </div>

                        {/* Total Completed Income Card */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs">
                            <div className="text-[11px] font-bold text-slate-400">Total completed income</div>
                            <div className="flex items-baseline justify-between mt-1">
                                <div className="text-2xl font-black text-slate-900">{formatCurrency(metrics.totalIncome)}</div>
                                <div className="text-xs text-slate-400 font-semibold">{metrics.currentIncomes.length} entries</div>
                            </div>
                        </div>

                        {/* Income List */}
                        <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-xs space-y-3">
                            {metrics.currentIncomes.length === 0 ? (
                                <div className="text-center py-10 text-xs text-slate-400">No income records found for this month.</div>
                            ) : (
                                metrics.currentIncomes.map((inc) => (
                                    <div
                                        key={inc.income_id}
                                        className="flex items-center justify-between p-2 rounded-2xl hover:bg-slate-50 transition group"
                                    >
                                        <div
                                            onClick={() => openEditModal(inc, "income")}
                                            className="flex items-center gap-3 cursor-pointer flex-1"
                                        >
                                            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-bold shrink-0">
                                                ↓
                                            </div>
                                            <div>
                                                <div className="text-xs font-black text-slate-900">{inc.source}</div>
                                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                                                    <span>{formatDateDisplay(inc.date)}</span>
                                                    <span>·</span>
                                                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-600 font-bold border border-emerald-100 text-[9px]">
                                                        {inc.status || "Completed"}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <div className="text-xs font-black text-emerald-600 tracking-tight">
                                                +{formatCurrency(inc.amount)}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setDeletingItem(inc)}
                                                className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 p-1 text-xs transition"
                                                title="Delete income"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* -----------------------------------------------------
                    TAB 4: REPORTS / INSIGHTS (Matching Image 8)
                ----------------------------------------------------- */}
                {activeTab === "reports" && (
                    <div className="space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="text-[11px] font-extrabold text-[#6366F1] tracking-wider uppercase">INSIGHTS</div>
                                <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">Reports</h1>
                                <p className="text-xs text-slate-400 mt-0.5">Understand your habits and make smarter choices.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => exportCSV("expense")}
                                className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-base font-bold transition"
                                title="Download Full CSV Report"
                            >
                                ↓
                            </button>
                        </div>

                        {/* Month Selector Card */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs">
                            <div className="text-[11px] font-extrabold text-[#6366F1] uppercase tracking-wider">MONTHLY OVERVIEW</div>
                            <div className="text-base font-extrabold text-slate-900 mt-1">Financial tracking report</div>
                            <p className="text-xs text-slate-400 mt-0.5">Review completed income, expenses, and budget performance.</p>

                            <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-2xl border border-slate-100 mt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const [y, m] = selectedMonth.split("-").map(Number);
                                        const prev = new Date(y, m - 2, 1);
                                        setSelectedMonth(prev.toISOString().slice(0, 7));
                                    }}
                                    className="w-8 h-8 rounded-xl bg-white text-slate-600 font-bold flex items-center justify-center shadow-xs"
                                >
                                    ‹
                                </button>
                                <div className="text-center">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase">REPORT MONTH</div>
                                    <div className="text-xs font-black text-slate-900">
                                        {new Date(selectedMonth + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const [y, m] = selectedMonth.split("-").map(Number);
                                        const next = new Date(y, m, 1);
                                        setSelectedMonth(next.toISOString().slice(0, 7));
                                    }}
                                    className="w-8 h-8 rounded-xl bg-white text-slate-600 font-bold flex items-center justify-center shadow-xs"
                                >
                                    ›
                                </button>
                            </div>

                            {/* CSV Export Buttons */}
                            <div className="grid grid-cols-2 gap-2 mt-3">
                                <button
                                    type="button"
                                    onClick={() => exportCSV("income")}
                                    className="py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                                >
                                    <span>↓</span> Income CSV
                                </button>
                                <button
                                    type="button"
                                    onClick={() => exportCSV("expense")}
                                    className="py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                                >
                                    <span>↓</span> Expense CSV
                                </button>
                            </div>
                        </div>

                        {/* SRS 4.1 Budget vs Actual Expense Breakdown */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs">
                            <div className="text-xs font-extrabold text-slate-900 mb-3">Category Spending vs Monthly Budget</div>
                            <div className="space-y-3">
                                {SRS_CATEGORIES.map((cat) => {
                                    const spent = metrics.categorySpending[cat.category_id] || 0;
                                    const budgetObj = budgetsList.find((b) => b.category_id === cat.category_id);
                                    const budgetLimit = budgetObj ? Number(budgetObj.budget_amount) : cat.defaultBudget;
                                    const pct = budgetLimit > 0 ? Math.min(100, Math.round((spent / budgetLimit) * 100)) : 0;
                                    const remaining = budgetLimit - spent;

                                    return (
                                        <div key={cat.category_id} className="p-3 rounded-2xl bg-slate-50/70 border border-slate-100">
                                            <div className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-2">
                                                    <span>{cat.emoji}</span>
                                                    <span className="font-extrabold text-slate-900">{cat.category_name}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="font-extrabold text-slate-900">{formatCurrency(spent)}</span>
                                                    <span className="text-slate-400"> / {formatCurrency(budgetLimit)}</span>
                                                </div>
                                            </div>
                                            <div className="mt-2 w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${
                                                        pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-[#6366F1]"
                                                    }`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1 font-semibold">
                                                <span>{pct}% spent</span>
                                                <span className={remaining < 0 ? "text-rose-500 font-bold" : "text-slate-500"}>
                                                    {remaining < 0 ? `Over by ${formatCurrency(Math.abs(remaining))}` : `${formatCurrency(remaining)} left`}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* -----------------------------------------------------
                    TAB 5: SETTINGS / PROFILE
                ----------------------------------------------------- */}
                {activeTab === "settings" && (
                    <div className="space-y-4">
                        <div>
                            <div className="text-[11px] font-extrabold text-[#6366F1] tracking-wider uppercase">PROFILE & PREFERENCES</div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">Settings</h1>
                            <p className="text-xs text-slate-400 mt-0.5">Manage your account and personal budget limits.</p>
                        </div>

                        {/* Account Details Card */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs">
                            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-[#10B981] text-white flex items-center justify-center font-black text-xl shadow-md shadow-emerald-500/20">
                                    {client?.name ? client.name.charAt(0).toUpperCase() : "R"}
                                </div>
                                <div>
                                    <div className="text-base font-extrabold text-slate-900">{client?.name || "Rey Fevin Cabildo"}</div>
                                    <div className="text-xs text-slate-400">{client?.username || "Authorized Owner"}</div>
                                </div>
                            </div>

                            <div className="mt-4 space-y-2.5 text-xs">
                                <div className="flex justify-between py-1.5 border-b border-slate-50">
                                    <span className="text-slate-400">Currency</span>
                                    <span className="font-bold text-slate-900">Philippine Peso (₱)</span>
                                </div>
                                <div className="flex justify-between py-1.5 border-b border-slate-50">
                                    <span className="text-slate-400">Monthly Savings Goal</span>
                                    <span className="font-bold text-slate-900">{formatCurrency(metrics.savingsTarget)}</span>
                                </div>
                                <div className="flex justify-between py-1.5">
                                    <span className="text-slate-400">Single Client Protection</span>
                                    <span className="font-bold text-emerald-600">Active (SRS 1.2)</span>
                                </div>
                            </div>
                        </div>

                        {/* Budget Management (SRS 2.2.7) */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs">
                            <div className="text-xs font-extrabold text-slate-900 mb-1">Monthly Spending Limits</div>
                            <p className="text-[11px] text-slate-400 mb-3">Set your target spending budget per category.</p>

                            <div className="space-y-2">
                                {SRS_CATEGORIES.map((cat) => {
                                    const budgetObj = budgetsList.find((b) => b.category_id === cat.category_id);
                                    const budgetLimit = budgetObj ? Number(budgetObj.budget_amount) : cat.defaultBudget;
                                    return (
                                        <div
                                            key={cat.category_id}
                                            onClick={() => {
                                                setEditingBudgetCat(cat);
                                                setFormBudgetAmount(String(budgetLimit));
                                                setShowBudgetModal(true);
                                            }}
                                            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-indigo-50/50 cursor-pointer transition border border-slate-100"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span>{cat.emoji}</span>
                                                <span className="text-xs font-bold text-slate-800">{cat.category_name}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-extrabold text-slate-900">{formatCurrency(budgetLimit)}</span>
                                                <span className="text-[10px] text-indigo-600 font-bold">Edit ✎</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Demo Data Reset Button */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs">
                            <div className="text-xs font-extrabold text-slate-900 mb-1">Database Administration</div>
                            <p className="text-[11px] text-slate-400 mb-3">Reset all data back to the demo screenshot records.</p>
                            <button
                                type="button"
                                onClick={async () => {
                                    if (confirm("Reset database to initial screenshot and SRS demonstration data?")) {
                                        await resetDatabaseToDemo();
                                        await refreshAllData();
                                    }
                                }}
                                className="w-full py-2.5 rounded-xl border border-rose-200 text-rose-600 font-bold text-xs hover:bg-rose-50 transition"
                            >
                                Reset to Screenshot Demo Data
                            </button>
                        </div>
                    </div>
                )}
            </main>

            {/* =========================================================
                BOTTOM NAVIGATION BAR (Matching Screenshot 3 & 5)
            ========================================================= */}
            <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-100 max-w-md mx-auto px-2 py-1.5 flex items-center justify-around shadow-lg">
                {/* 1. Dashboard */}
                <button
                    type="button"
                    onClick={() => setActiveTab("home")}
                    className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition active:scale-95 ${
                        activeTab === "home" ? "bg-[#6366F1] text-white shadow-md shadow-indigo-500/25" : "text-slate-400 hover:text-slate-600"
                    }`}
                >
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                    </svg>
                    <span className="text-[10px] font-bold mt-0.5">Dashboard</span>
                </button>

                {/* 2. Income */}
                <button
                    type="button"
                    onClick={() => setActiveTab("income")}
                    className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition active:scale-95 ${
                        activeTab === "income" ? "bg-[#6366F1] text-white shadow-md shadow-indigo-500/25" : "text-slate-400 hover:text-slate-600"
                    }`}
                >
                    <span className="text-base font-bold leading-none">₱</span>
                    <span className="text-[10px] font-bold mt-0.5">Income</span>
                </button>

                {/* 3. Expenses */}
                <button
                    type="button"
                    onClick={() => setActiveTab("expenses")}
                    className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition active:scale-95 ${
                        activeTab === "expenses" ? "bg-[#6366F1] text-white shadow-md shadow-indigo-500/25" : "text-slate-400 hover:text-slate-600"
                    }`}
                >
                    <span className="text-base font-bold leading-none">💳</span>
                    <span className="text-[10px] font-bold mt-0.5">Expenses</span>
                </button>

                {/* 4. Reports */}
                <button
                    type="button"
                    onClick={() => setActiveTab("reports")}
                    className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition active:scale-95 ${
                        activeTab === "reports" ? "bg-[#6366F1] text-white shadow-md shadow-indigo-500/25" : "text-slate-400 hover:text-slate-600"
                    }`}
                >
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z" />
                    </svg>
                    <span className="text-[10px] font-bold mt-0.5">Reports</span>
                </button>

                {/* 5. Settings */}
                <button
                    type="button"
                    onClick={() => setActiveTab("settings")}
                    className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition active:scale-95 ${
                        activeTab === "settings" ? "bg-[#6366F1] text-white shadow-md shadow-indigo-500/25" : "text-slate-400 hover:text-slate-600"
                    }`}
                >
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                    </svg>
                    <span className="text-[10px] font-bold mt-0.5">Settings</span>
                </button>
            </nav>

            {/* =========================================================
                BOTTOM SHEET MODAL: ADD / EDIT TRANSACTION (Image 4)
            ========================================================= */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs animate-fade-in">
                    <div className="w-full max-w-md bg-white rounded-t-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                        {/* Pull bar & Header */}
                        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <div className="text-[10px] font-extrabold text-[#6366F1] uppercase tracking-wider">
                                    {editingItem ? "EDIT TRANSACTION" : "NEW TRANSACTION"}
                                </div>
                                <h3 className="text-lg font-black text-slate-900 mt-0.5">
                                    {editingItem ? `Edit ${addModalType}` : `Add ${addModalType}`}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAddModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center font-bold text-xs"
                            >
                                ✕
                            </button>
                        </div>

                        {formError && (
                            <div className="mt-3 p-2 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-semibold">
                                {formError}
                            </div>
                        )}

                        <form onSubmit={handleSaveTransaction} className="mt-4 space-y-4">
                            {/* Amount Input (Matching Image 4) */}
                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">Amount</label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">₱</span>
                                    <input
                                        type="number"
                                        step="any"
                                        placeholder="0.00"
                                        value={formAmount}
                                        onChange={(e) => setFormAmount(e.target.value)}
                                        className="w-full pl-9 pr-3.5 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xl font-black text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {/* Name / Note */}
                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">
                                    {addModalType === "expense" ? "Expense Name / Note" : "Source / Name"}
                                </label>
                                <input
                                    type="text"
                                    placeholder={addModalType === "expense" ? "e.g. gigutom ko, grocery, humba" : "e.g. Salary, Allowance"}
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            {/* Category or Source Dropdown */}
                            {addModalType === "expense" ? (
                                <div>
                                    <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
                                    <select
                                        value={formCategory}
                                        onChange={(e) => setFormCategory(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        {SRS_CATEGORIES.map((c) => (
                                            <option key={c.category_id} value={c.category_id}>
                                                {c.emoji} {c.category_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <div>
                                    <label className="text-xs font-bold text-slate-700 block mb-1">Source</label>
                                    <select
                                        value={formSource}
                                        onChange={(e) => setFormSource(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        {INCOME_SOURCES.map((s) => (
                                            <option key={s.id} value={s.name}>
                                                {s.emoji} {s.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Description */}
                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">Description</label>
                                <input
                                    type="text"
                                    placeholder="Add a short note"
                                    value={formDescription}
                                    onChange={(e) => setFormDescription(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            {/* Date Picker */}
                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">Date</label>
                                <input
                                    type="date"
                                    value={formDate}
                                    onChange={(e) => setFormDate(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                            </div>

                            {/* Status Dropdown (Matching Image 4) */}
                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">Status</label>
                                <select
                                    value={formStatus}
                                    onChange={(e) => setFormStatus(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="Completed">Completed</option>
                                    <option value="Pending">Pending</option>
                                </select>
                                <div className="text-[10px] text-slate-400 mt-1">Pending items count toward totals once marked completed.</div>
                            </div>

                            {/* Big Purple Submit Button */}
                            <button
                                type="submit"
                                className="w-full py-3.5 rounded-2xl bg-[#6366F1] hover:bg-[#4F46E5] text-white font-black text-xs shadow-lg shadow-indigo-500/25 active:scale-98 transition flex items-center justify-center gap-1.5 mt-2"
                            >
                                <span>+</span> {editingItem ? "Save Changes" : `Add ${addModalType}`}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* =========================================================
                MODAL: DELETE CONFIRMATION (SRS 2.2.6)
            ========================================================= */}
            {deletingItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
                    <div className="w-full max-w-xs bg-white rounded-3xl p-6 shadow-2xl text-center">
                        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-3 text-xl font-bold">
                            🗑️
                        </div>
                        <h4 className="text-base font-extrabold text-slate-900">Delete Record?</h4>
                        <p className="text-xs text-slate-400 mt-1 mb-5">
                            Are you sure you want to permanently delete{" "}
                            <strong>{deletingItem.name || deletingItem.source}</strong> ({formatCurrency(deletingItem.amount)})?
                        </p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setDeletingItem(null)}
                                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteConfirm}
                                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-xs shadow-md shadow-rose-500/20"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* =========================================================
                MODAL: CATEGORY BUDGET LIMIT (SRS 2.2.7)
            ========================================================= */}
            {showBudgetModal && editingBudgetCat && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
                    <div className="w-full max-w-xs bg-white rounded-3xl p-6 shadow-2xl">
                        <h4 className="text-base font-extrabold text-slate-900">Set {editingBudgetCat.category_name} Budget</h4>
                        <p className="text-xs text-slate-400 mt-0.5 mb-4">Set your monthly planned spending limit.</p>

                        <div className="relative mb-4">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-slate-400">₱</span>
                            <input
                                type="number"
                                value={formBudgetAmount}
                                onChange={(e) => setFormBudgetAmount(e.target.value)}
                                className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                autoFocus
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setShowBudgetModal(false)}
                                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    await setCategoryBudget(editingBudgetCat.category_id, formBudgetAmount, selectedMonth);
                                    await refreshAllData();
                                    setShowBudgetModal(false);
                                }}
                                className="flex-1 py-2.5 rounded-xl bg-[#6366F1] text-white font-bold text-xs shadow-md shadow-indigo-500/25"
                            >
                                Save Limit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* =========================================================
                MODAL: NOTIFICATIONS & BUDGET WARNINGS (SRS 2.2.8)
            ========================================================= */}
            {showNotifications && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
                    <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">🔔</span>
                                <h4 className="text-base font-extrabold text-slate-900">Budget Notifications</h4>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowNotifications(false)}
                                className="text-slate-400 hover:text-slate-600 font-bold text-xs"
                            >
                                ✕
                            </button>
                        </div>

                        {metrics.alerts.length === 0 ? (
                            <div className="text-center py-8 text-xs text-slate-400">
                                ✓ All categories are within healthy budget limits!
                            </div>
                        ) : (
                            <div className="space-y-2.5 max-h-60 overflow-y-auto">
                                {metrics.alerts.map((alt, idx) => (
                                    <div
                                        key={idx}
                                        className={`p-3 rounded-2xl border text-xs ${
                                            alt.type === "exceeded"
                                                ? "bg-rose-50 border-rose-200 text-rose-800"
                                                : "bg-amber-50 border-amber-200 text-amber-800"
                                        }`}
                                    >
                                        <div className="font-extrabold">{alt.title}</div>
                                        <div className="text-[11px] mt-0.5 opacity-90">{alt.message}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => setShowNotifications(false)}
                            className="w-full mt-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs"
                        >
                            Got it
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
