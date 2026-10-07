// AI Financial Advisor, Spending Analytics & Smart Expense Parser Engine

/**
 * Perform comprehensive financial analysis based on income, expenses, savings and budgets
 */
export function analyzeFinancialHealth({ expenses = [], incomes = [], savings = [], budgets = [], client = null, month = '' }) {
    // 1. Total Metrics
    const totalIncome = incomes
        .filter((i) => !i.isDeleted)
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    const totalExpenses = expenses
        .filter((e) => !e.isDeleted)
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    const totalSavings = savings
        .filter((s) => !s.isDeleted)
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    const remainingBalance = totalIncome - totalExpenses;
    const effectiveSavingsRate = totalIncome > 0 ? ((totalSavings + Math.max(0, remainingBalance)) / totalIncome) * 100 : 0;
    const directSavingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;

    // 2. Category Aggregates
    const categoryTotals = {};
    expenses
        .filter((e) => !e.isDeleted)
        .forEach((e) => {
            const cat = e.category_id || 'others';
            categoryTotals[cat] = (categoryTotals[cat] || 0) + (Number(e.amount) || 0);
        });

    // 3. 50/30/20 Rule Analysis (Needs / Wants / Savings)
    const needsCategories = ['bills', 'food', 'medicine'];
    const wantsCategories = ['shopping', 'personal', 'others', 'transport'];

    let spentNeeds = 0;
    let spentWants = 0;

    Object.entries(categoryTotals).forEach(([cat, amount]) => {
        if (needsCategories.includes(cat)) spentNeeds += amount;
        else spentWants += amount;
    });

    const needsPct = totalIncome > 0 ? (spentNeeds / totalIncome) * 100 : 0;
    const wantsPct = totalIncome > 0 ? (spentWants / totalIncome) * 100 : 0;
    const savingsPct = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;

    // 4. Budget Overrun Checks
    const budgetAlerts = [];
    budgets.forEach((b) => {
        const spent = categoryTotals[b.category_id] || 0;
        const limit = Number(b.budget_amount) || 0;
        if (limit > 0) {
            const ratio = (spent / limit) * 100;
            if (ratio >= 100) {
                budgetAlerts.push({
                    categoryId: b.category_id,
                    level: 'danger',
                    message: `Exceeded budget limit by ₱${(spent - limit).toLocaleString('en-US', { minimumFractionDigits: 2 })} (${ratio.toFixed(0)}% used).`,
                    spent,
                    limit,
                });
            } else if (ratio >= 80) {
                budgetAlerts.push({
                    categoryId: b.category_id,
                    level: 'warning',
                    message: `Near limit at ${ratio.toFixed(0)}% (₱${(limit - spent).toLocaleString('en-US', { minimumFractionDigits: 2 })} remaining).`,
                    spent,
                    limit,
                });
            }
        }
    });

    // 5. Health Score Calculation (0 to 100)
    let score = 50;

    // Income vs Expenses bonus/penalty
    if (totalIncome > 0) {
        if (remainingBalance > 0) {
            const margin = remainingBalance / totalIncome;
            score += Math.min(25, margin * 50); // Up to +25
        } else {
            score -= 30; // Deficit penalty
        }
    }

    // Savings bonus
    if (directSavingsRate >= 20) score += 20;
    else if (directSavingsRate >= 10) score += 10;
    else if (directSavingsRate > 0) score += 5;

    // Budget overruns penalty
    const overruns = budgetAlerts.filter((a) => a.level === 'danger').length;
    score -= overruns * 10;

    // 50/30/20 Rule alignment bonus
    if (needsPct <= 55 && wantsPct <= 35) score += 10;

    // Clamp score
    score = Math.max(10, Math.min(99, Math.round(score)));

    let rating = 'Fair';
    let ratingColor = '#F59E0B'; // Amber
    if (score >= 85) {
        rating = 'Excellent';
        ratingColor = '#10B981'; // Emerald
    } else if (score >= 70) {
        rating = 'Good';
        ratingColor = '#3B82F6'; // Blue
    } else if (score < 50) {
        rating = 'Needs Attention';
        ratingColor = '#EF4444'; // Red
    }

    // 6. Generate Smart Actionable Insights & AI Recommendations
    const insights = [];

    if (totalIncome === 0) {
        insights.push({
            type: 'tip',
            icon: '💡',
            title: 'Record Your Monthly Incomes',
            description: 'Log your primary salary or freelance income to unlock budget tracking and savings rate calculations.',
        });
    }

    if (budgetAlerts.some((a) => a.level === 'danger')) {
        const topOver = budgetAlerts.find((a) => a.level === 'danger');
        insights.push({
            type: 'alert',
            icon: '⚠️',
            title: `Budget Limit Exceeded in ${topOver.categoryId.toUpperCase()}`,
            description: topOver.message + ' Consider scaling back non-essential expenses this week.',
        });
    }

    if (effectiveSavingsRate >= 25) {
        insights.push({
            type: 'positive',
            icon: '🏆',
            title: 'Exceptional Savings Discipline',
            description: `You are retaining ${(effectiveSavingsRate).toFixed(1)}% of your earnings. You are beating the standard 20% savings rule!`,
        });
    } else if (totalIncome > 0 && directSavingsRate < 10) {
        insights.push({
            type: 'action',
            icon: '🎯',
            title: 'Boost Your Emergency Savings',
            description: `Target depositing at least ₱${((totalIncome * 0.1) - totalSavings).toFixed(0)} more into savings to reach a healthy 10% safety cushion.`,
        });
    }

    // Food & Groceries check
    const foodSpent = categoryTotals['food'] || 0;
    if (totalIncome > 0 && foodSpent > totalIncome * 0.35) {
        insights.push({
            type: 'warning',
            icon: '🛒',
            title: 'High Food & Dining Outlay',
            description: `Food expenses make up ${((foodSpent / totalIncome) * 100).toFixed(0)}% of your monthly income. Batch cooking or supermarket bulk purchases can reduce this.`,
        });
    }

    // Daily burn rate
    const now = new Date();
    const dayOfMonth = Math.max(1, now.getDate());
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyBurnRate = totalExpenses / dayOfMonth;
    const projectedMonthTotal = dailyBurnRate * daysInMonth;
    const daysRemaining = daysInMonth - dayOfMonth;

    insights.push({
        type: 'forecast',
        icon: '📈',
        title: 'Month-End Spending Projection',
        description: `At your current pace of ₱${dailyBurnRate.toFixed(2)}/day, monthly expenses are projected to reach ₱${projectedMonthTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
    });

    return {
        score,
        rating,
        ratingColor,
        summary: {
            totalIncome,
            totalExpenses,
            totalSavings,
            remainingBalance,
            directSavingsRate: Number(directSavingsRate.toFixed(1)),
            effectiveSavingsRate: Number(effectiveSavingsRate.toFixed(1)),
            dailyBurnRate: Number(dailyBurnRate.toFixed(2)),
            projectedMonthTotal: Number(projectedMonthTotal.toFixed(2)),
            daysRemaining,
        },
        rule50_30_20: {
            needs: { spent: spentNeeds, target: totalIncome * 0.5, actualPct: Number(needsPct.toFixed(1)), targetPct: 50 },
            wants: { spent: spentWants, target: totalIncome * 0.3, actualPct: Number(wantsPct.toFixed(1)), targetPct: 30 },
            savings: { spent: totalSavings, target: totalIncome * 0.2, actualPct: Number(savingsPct.toFixed(1)), targetPct: 20 },
        },
        budgetAlerts,
        insights,
        generatedAt: new Date().toISOString(),
    };
}

/**
 * Smart NLP parser: Extract transaction information from natural speech, receipt text, or bank SMS
 */
export function smartCategorize(inputText) {
    if (!inputText || typeof inputText !== 'string') {
        return {
            success: false,
            message: 'Please provide a text or receipt description to analyze.',
        };
    }

    const text = inputText.trim();
    const lower = text.toLowerCase();

    // 1. Extract amount (e.g., "₱1,450.50", "1450.50", "Php 500", "250 pesos", "50k")
    let extractedAmount = null;

    // Look for currency amounts with symbols or numbers
    const amountRegex = /(?:₱|php|pesos?|\$)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i;
    const matches = text.match(amountRegex);
    if (matches && matches[1]) {
        const cleanNum = matches[1].replace(/,/g, '');
        const val = parseFloat(cleanNum);
        if (!isNaN(val) && val > 0) {
            extractedAmount = val;
        }
    }

    // 2. Classify Category based on keywords
    let category_id = 'others';
    let type = 'expense';
    let confidence = 0.7;

    // Income checks
    if (
        lower.includes('salary') ||
        lower.includes('sweldo') ||
        lower.includes('sahod') ||
        lower.includes('payroll') ||
        lower.includes('freelance') ||
        lower.includes('client payment') ||
        lower.includes('allowance') ||
        lower.includes('bonus') ||
        lower.includes('dividend') ||
        lower.includes('business sales')
    ) {
        type = 'income';
        category_id = 'salary';
        if (lower.includes('business') || lower.includes('sales')) category_id = 'business';
        if (lower.includes('allowance')) category_id = 'allowance';
        confidence = 0.95;
    }
    // Expense Categories
    else if (
        lower.includes('meralco') ||
        lower.includes('electric') ||
        lower.includes('kuryente') ||
        lower.includes('water') ||
        lower.includes('maynilad') ||
        lower.includes('manila water') ||
        lower.includes('internet') ||
        lower.includes('pldt') ||
        lower.includes('globe') ||
        lower.includes('smart') ||
        lower.includes('converge') ||
        lower.includes('rent') ||
        lower.includes('bill') ||
        lower.includes('utility') ||
        lower.includes('association due')
    ) {
        category_id = 'bills';
        confidence = 0.95;
    } else if (
        lower.includes('grocery') ||
        lower.includes('supermarket') ||
        lower.includes('sm hypermarket') ||
        lower.includes('puregold') ||
        lower.includes('robinsons') ||
        lower.includes('waltermart') ||
        lower.includes('palengke') ||
        lower.includes('food') ||
        lower.includes('jollibee') ||
        lower.includes('mcdo') ||
        lower.includes('mcdonald') ||
        lower.includes('kfc') ||
        lower.includes('starbucks') ||
        lower.includes('coffee') ||
        lower.includes('restaurant') ||
        lower.includes('dinner') ||
        lower.includes('lunch') ||
        lower.includes('breakfast') ||
        lower.includes('snack') ||
        lower.includes('milk') ||
        lower.includes('bread') ||
        lower.includes('rice') ||
        lower.includes('meat') ||
        lower.includes('vegetable')
    ) {
        category_id = 'food';
        confidence = 0.92;
    } else if (
        lower.includes('gas') ||
        lower.includes('gasoline') ||
        lower.includes('fuel') ||
        lower.includes('petron') ||
        lower.includes('shell') ||
        lower.includes('caltex') ||
        lower.includes('grab') ||
        lower.includes('angkas') ||
        lower.includes('joyride') ||
        lower.includes('taxi') ||
        lower.includes('fare') ||
        lower.includes('jeep') ||
        lower.includes('jeepney') ||
        lower.includes('bus') ||
        lower.includes('mrt') ||
        lower.includes('lrt') ||
        lower.includes('toll') ||
        lower.includes('parking') ||
        lower.includes('easytrip') ||
        lower.includes('autosweep')
    ) {
        category_id = 'transport';
        confidence = 0.94;
    } else if (
        lower.includes('mercury drug') ||
        lower.includes('watsons') ||
        lower.includes('south star') ||
        lower.includes('pharmacy') ||
        lower.includes('medicine') ||
        lower.includes('gamot') ||
        lower.includes('doctor') ||
        lower.includes('clinic') ||
        lower.includes('hospital') ||
        lower.includes('checkup') ||
        lower.includes('vitamins') ||
        lower.includes('dental') ||
        lower.includes('prescription')
    ) {
        category_id = 'medicine';
        confidence = 0.95;
    } else if (
        lower.includes('shopee') ||
        lower.includes('lazada') ||
        lower.includes('tiktok shop') ||
        lower.includes('uniqlo') ||
        lower.includes('zara') ||
        lower.includes('h&m') ||
        lower.includes('clothes') ||
        lower.includes('shoes') ||
        lower.includes('bag') ||
        lower.includes('gadget') ||
        lower.includes('shopping') ||
        lower.includes('mall')
    ) {
        category_id = 'shopping';
        confidence = 0.9;
    } else if (
        lower.includes('haircut') ||
        lower.includes('salon') ||
        lower.includes('barber') ||
        lower.includes('spa') ||
        lower.includes('massage') ||
        lower.includes('gym') ||
        lower.includes('skincare') ||
        lower.includes('lotion') ||
        lower.includes('soap') ||
        lower.includes('shampoo') ||
        lower.includes('personal') ||
        lower.includes('hygiene')
    ) {
        category_id = 'personal';
        confidence = 0.88;
    }

    // 3. Clean and extract Title/Name
    let name = text;
    // Strip amount and common leading/trailing words
    name = name
        .replace(/(?:₱|php|pesos?|\$)\s*[0-9,.]+/gi, '')
        .replace(/\b[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?\b/g, '')
        .replace(/^(paid|bought|spent|ordered|payment for|spent on|purchased|deposit|got|received)\s+/i, '')
        .replace(/\s+(at|in|via|through|from|for|on)\s*$/i, '')
        .trim();

    if (!name || name.length < 2) {
        name = category_id.charAt(0).toUpperCase() + category_id.slice(1) + ' payment';
    } else {
        // Capitalize first letter
        name = name.charAt(0).toUpperCase() + name.slice(1);
    }

    return {
        success: true,
        type,
        name,
        amount: extractedAmount || 0,
        category_id,
        confidence,
        date: new Date().toISOString().slice(0, 10),
        rawInput: inputText,
        aiExplanation: `Identified as ${type.toUpperCase()} under ${category_id.toUpperCase()} (Confidence: ${(confidence * 100).toFixed(0)}%).`,
    };
}
