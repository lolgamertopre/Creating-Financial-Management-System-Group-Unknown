import { useState, useEffect } from "react";

const STORAGE_KEY = "my-money-data";

// --- Design tokens (chalkboard ledger theme) ---
// bg:    #2B3A32  (deep chalkboard green)
// card:  #34473D  (lighter slate green)
// chalk: #F5F1E6  (cream chalk text)
// gold:  #E8A93B  (money in / positive)
// coral: #E85C4A  (money out / warning)
// blue:  #6C93B0  (bills / neutral accent)
// line:  #4A5D52  (hairline divider, chalk-dust)

const CATEGORIES = [
    { id: "food", name: "Grocery", emoji: "🛒", color: "#E8A93B" },
    { id: "power", name: "Power", emoji: "⚡", color: "#E8A93B" },
    { id: "water", name: "Water", emoji: "💧", color: "#6C93B0" },
    { id: "bus", name: "Bus", emoji: "🚌", color: "#6C93B0" },
    { id: "health", name: "Health", emoji: "❤️", color: "#E85C4A" },
    { id: "home", name: "Home", emoji: "🏠", color: "#6C93B0" },
];

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

const DEFAULT_DATA = {
    balance: 0,
    monthLimit: 300,
    spentThisMonth: 0,
    entries: [],
};

export default function BudgetApp() {
    const [balance, setBalance] = useState(DEFAULT_DATA.balance);
    const [monthLimit, setMonthLimit] = useState(DEFAULT_DATA.monthLimit);
    const [spentThisMonth, setSpentThisMonth] = useState(DEFAULT_DATA.spentThisMonth);
    const [entries, setEntries] = useState(DEFAULT_DATA.entries);
    const [pad, setPad] = useState(null); // { emoji, color, kind }
    const [loading, setLoading] = useState(true);
    const [saveError, setSaveError] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const result = await window.storage.get(STORAGE_KEY, false);
                if (result && result.value) {
                    const data = JSON.parse(result.value);
                    setBalance(data.balance ?? DEFAULT_DATA.balance);
                    setMonthLimit(data.monthLimit ?? DEFAULT_DATA.monthLimit);
                    setSpentThisMonth(data.spentThisMonth ?? DEFAULT_DATA.spentThisMonth);
                    setEntries(data.entries ?? DEFAULT_DATA.entries);
                }
            } catch {
                // no saved data yet, start fresh
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const persist = async (next) => {
        try {
            setSaveError(false);
            await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
        } catch {
            setSaveError(true);
        }
    };

    const pct = Math.min(100, Math.round((spentThisMonth / monthLimit) * 100));
    const isWarning = pct >= 80;

    const openCategory = (cat) => setPad({ emoji: cat.emoji, color: cat.color, kind: "out", name: cat.name });
    const openIncome = () => setPad({ emoji: "💵", color: "#E8A93B", kind: "in", name: "Income" });

    const confirm = (amount) => {
        const id = Date.now();
        const nextEntries = [{ id, emoji: pad.emoji, amount, kind: pad.kind }, ...entries].slice(0, 12);
        const nextBalance = pad.kind === "in" ? balance + amount : balance - amount;
        const nextSpent = pad.kind === "in" ? spentThisMonth : spentThisMonth + amount;

        setBalance(nextBalance);
        setSpentThisMonth(nextSpent);
        setEntries(nextEntries);
        setPad(null);

        persist({ balance: nextBalance, monthLimit, spentThisMonth: nextSpent, entries: nextEntries });
    };

    const removeEntry = (id) => {
        const entry = entries.find((e) => e.id === id);
        if (!entry) return;

        const nextBalance = entry.kind === "in" ? balance - entry.amount : balance + entry.amount;
        const nextSpent = entry.kind === "in" ? spentThisMonth : Math.max(0, spentThisMonth - entry.amount);
        const nextEntries = entries.filter((x) => x.id !== id);

        setBalance(nextBalance);
        setSpentThisMonth(nextSpent);
        setEntries(nextEntries);

        persist({ balance: nextBalance, monthLimit, spentThisMonth: nextSpent, entries: nextEntries });
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
            <div className="w-full max-w-sm px-4 pt-6 pb-28 relative">
                {/* App name */}
                <div className="flex items-center justify-center gap-2 mb-5">
                    <span className="text-3xl">💰</span>
                    <span
                        className="text-2xl font-bold tracking-wide"
                        style={{ color: "#F5F1E6", fontFamily: "ui-rounded, system-ui, sans-serif" }}
                    >
                        My Money
                    </span>
                </div>

                {/* Balance card */}
                <div
                    className="rounded-3xl p-6 mb-4 relative overflow-hidden"
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

                {/* Monthly warning bar */}
                <div
                    className="rounded-2xl p-4 mb-6"
                    style={{
                        background: isWarning ? "#E85C4A22" : "#34473D",
                        border: `1px solid ${isWarning ? "#E85C4A" : "#4A5D52"}`,
                    }}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl">{isWarning ? "🔴" : "🟢"}</span>
                        <span
                            className="text-sm font-semibold tabular-nums"
                            style={{ color: "#F5F1E6" }}
                        >
                            ${spentThisMonth.toFixed(0)} / ${monthLimit}
                        </span>
                    </div>
                    <div
                        className="h-4 rounded-full overflow-hidden"
                        style={{ background: "#2B3A32" }}
                    >
                        <div
                            className="h-full rounded-full transition-all"
                            style={{
                                width: `${pct}%`,
                                background: isWarning ? "#E85C4A" : "#E8A93B",
                            }}
                        />
                    </div>
                </div>

                {/* Category grid */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => openCategory(cat)}
                            className="aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 active:scale-95 transition"
                            style={{ background: "#34473D", border: `2px solid ${cat.color}55` }}
                        >
                            <span className="text-3xl">{cat.emoji}</span>
                            <span
                                className="text-xs font-semibold tracking-wide"
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
                    className="w-full h-16 rounded-2xl flex items-center justify-center gap-3 text-2xl font-bold mb-6 active:scale-95 transition"
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
                                className="flex items-center gap-1 px-3 py-2 rounded-full active:scale-95 transition"
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

                {/* Floating big plus button */}
                <button
                    onClick={() => openCategory(CATEGORIES[0])}
                    className="fixed bottom-6 rounded-full flex items-center justify-center text-4xl font-bold shadow-lg active:scale-95 transition"
                    style={{
                        background: "#E85C4A",
                        color: "#F5F1E6",
                        width: "64px",
                        height: "64px",
                        left: "50%",
                        transform: "translateX(-50%)",
                    }}
                >
                    +
                </button>

                {saveError && (
                    <div
                        className="mt-4 rounded-xl px-4 py-3 text-center text-sm font-semibold"
                        style={{ background: "#E85C4A22", border: "1px solid #E85C4A", color: "#F5F1E6" }}
                    >
                        ⚠️ Could not save. Check connection.
                    </div>
                )}

                {pad && (
                    <Keypad
                        icon={pad.emoji}
                        title={pad.name}
                        accentColor={pad.color}
                        onConfirm={confirm}
                        onCancel={() => setPad(null)}
                    />
                )}
            </div>
        </div>
    );
}