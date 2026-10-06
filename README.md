# Web-Based Personal Budget Tracker

An offline-first, modern responsive web application designed for personal financial management, expense tracking, budget monitoring, and savings management in compliance with the **Software Requirements Specification (SRS)**.

---

## 🌟 Key Features

1. **Dashboard & Summary:**
   - 4 Live Metric Cards: **Total Income**, **Total Expenses**, **Remaining Balance** (`Income - Expenses`), and **Total Savings**.
   - Spending Plan progress with monthly budget indicators.
   - Category spending breakdown and recent activity feeds.

2. **Expense Management:**
   - Categorized expenses: **Food**, **Transportation**, **Bills**, **Medicine**, **Shopping**, **Personal Needs**, **Others**.
   - Category filter pills with monthly total card and live counts.
   - Edit records (change amounts, dates, categories) and Delete with safety confirmation modals.

3. **Income Stream:**
   - Track multiple income sources: Salary, Business income, Allowance, and Other earnings.

4. **Budget Management:**
   - Set monthly spending limits per category.
   - Live budget vs actual comparison with automatic warnings for exceeded or near-limit spending.

5. **Savings Tracker:**
   - Log personal savings deposits and monitor total accumulated savings.

6. **Financial Summary & Reporting:**
   - Structured monthly statement matching SRS Section 4.1.
   - One-click **CSV Export** for Excel and Google Sheets.

7. **Client Authentication & Security:**
   - Client Login verification with masked passwords.
   - Single-client privacy protection.

8. **Offline-First & PWA:**
   - Powered by **Dexie IndexedDB** for local data persistence.
   - Service Worker background sync support.
   - Installable on desktop, tablet, and mobile browsers.

---

## 🛠️ Technology Stack

- **Frontend:** React 19, JavaScript (ES Modules)
- **Styling:** Tailwind CSS 4, Plus Jakarta Sans typography
- **Database:** Dexie.js (IndexedDB offline storage)
- **Build Tool:** Vite 6
- **PWA:** Vite Plugin PWA, Service Worker & Web App Manifest

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:5173/`.

### 3. Build for Production
```bash
npm run build
```

### 4. Preview Production Build
```bash
npm run preview
```

---

## 🗄️ Database Architecture (ERD)

The application implements the following 6 core entities in Dexie IndexedDB:
- **`Client (Owner)`**: `client_id`, `name`, `username`, `password`
- **`Income`**: `income_id`, `client_id`, `source`, `amount`, `date`, `description`
- **`Expense`**: `expense_id`, `client_id`, `category_id`, `name`, `amount`, `date`, `description`
- **`Category`**: `category_id`, `category_name`, `emoji`, `color`
- **`Budget`**: `budget_id`, `client_id`, `category_id`, `budget_amount`, `month`
- **`Savings`**: `savings_id`, `owner_id`, `amount`, `date`, `description`

---

## 📄 References & SRS Compliance
- Software Engineering Requirements Specification (SRS) - Web-Based Personal Budget Tracker
- Currency: **Philippine Peso (₱)**
