# 🍦 Kumar Ice Parlour — Business Manager

A responsive, high-performance, real-time Business ERP and Management app built for **Kumar Ice Parlour** to streamline daily operations, manage staff, record attendance, track expenses, and automate salary ledgers.

---

## 🚀 Core Functionalities

### 1. 📊 Interactive Dashboard
- **Instant Stats**: View today's spending, current month totals, unpaid salary due, active staff count, today's leaves, and active alerts.
- **Visual Analytics**: Interactive area and pie charts displaying expense trends and category breakdowns.
- **Quick Alerts**: Automatically flags pending salaries, staff leaves, and critical tasks needing manager attention.

### 2. 👥 Staff Management
- **Full Employee Directory**: Track full employee profiles, contact details, role allocations, joining dates, and employment status.
- **Salary Configurator**: Toggle between monthly fixed salaries or daily wage structures.
- **Leave Limits**: Configure monthly allowed casual leaves per employee.

### 3. 📋 Attendance Management
- **Desktop Grid**: Monthly matrix view allowing quick toggles of staff attendance with a single click.
- **Mobile Daily View**: Stacked cards and touch-friendly status selectors tailored for mobile phone screens.
- **Four-State Tracker**: Easily mark employees as *Present*, *Absent*, *Half Day*, or *On Leave*.

### 4. 💸 Expense Ledger
- **Expense Logging**: Record item purchases, bills, rents, and other business costs.
- **Staff Attribution**: Assign expenses to specific staff members where applicable.
- **Excel Export**: Export filtered logs into Excel (`.xlsx`) spreadsheets locally in one click.

### 5. 💰 Salary Ledger
- **Auto-Calculations**: Generates net salaries taking into account monthly working days, leaves, daily wage rates, bonuses, advance payments, and overtime.
- **Partial Payments**: Record multiple partial payments against a single salary slip.
- **PDF Documents**: Automatically generate and download professional **Salary Slips** and **Payment Receipts**.

### 6. 🏖️ Leave Management
- **Leave Log**: Track leave dates, leave types (Casual, Paid, Unpaid, Sick), approval status, and remarks.
- **Limits Tracking**: Flags when an employee exceeds their allowed casual leaves for the current month.

### 7. 📈 Analytics & Insights
- **12-Month Trends**: High-fidelity charts visualizing monthly expenditure shifts.
- **Top Categories**: Automatically aggregates and ranks top spending categories with graphical percentage meters.

### 8. ⚙️ App Settings & Theme
- **Global Settings**: Customize the shop name and currency symbol.
- **Sync Status**: Displays dynamic internet connection status (Online/Offline) to alert users before sync errors happen.
- **Dark Mode**: Toggle between high-contrast dark and light themes globally.

---

## 🛠️ Technology Stack

- **Frontend**: React 19 (TypeScript), Tailwind CSS
- **Routing**: React Router DOM (optimized with dynamic chunk lazy-loading)
- **Database / Auth**: Firebase Firestore (real-time data sync across all devices) and Firebase Auth
- **State Management**: Zustand
- **Charts**: Recharts
- **Utility Libraries**: `date-fns` (dates), `xlsx` (Excel exports), `jspdf` (PDF generation)
- **PWA (Progressive Web App)**: Service Worker asset caching for premium caching speeds.

---

## 📦 Installation & Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Create a `.env` file in the root directory and add your Firebase API keys:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

3. **Run Locally in Development Mode**:
   ```bash
   npm run dev
   ```

4. **Build for Production**:
   ```bash
   npm run build
   ```
