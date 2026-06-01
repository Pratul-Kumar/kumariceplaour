import { useEffect, useState, memo, useMemo, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingDown, Users, Clock, ArrowUpRight,
  IndianRupee, Receipt, Zap, AlertCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Skeleton, Badge, EmptyState } from "@/components/ui";
import { expenseService, staffService, salaryService, attendanceService } from "@/services";
import { formatCurrency, formatDate, getCurrentMonth, getLast12Months, formatMonth } from "@/lib/utils";
import { EXPENSE_CATEGORIES, type Expense } from "@/types";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebase/config";

// ─── Lazy-load the entire charts section ────────────────────────────────────
const DashboardCharts = lazy(() => import("./DashboardCharts"));

interface DashboardStats {
  todayExpenses: number;
  monthExpenses: number;
  pendingSalary: number;
  outstandingRecoveries: number;
  todayAttendance: string;
  staffCount: number;
  recentExpenses: Expense[];
  categoryTotals: Record<string, number>;
  monthlyTrend: { month: string; amount: number }[];
}

const StatCard = memo(function StatCard({ icon: Icon, label, value, sub, color, loading, onClick }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color: string;
  loading: boolean;
  onClick?: () => void;
}) {
  if (loading) return <Skeleton className="h-24 rounded-lg" />;
  return (
    <Card 
      onClick={onClick}
      className={`relative overflow-hidden group ${onClick ? "cursor-pointer hover:bg-muted/40 transition-colors" : ""}`}
    >
      <CardContent className="p-4 h-full flex flex-col justify-between">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className={`p-2 rounded-lg ${color} shrink-0`}>
            <Icon className="h-4 w-4" />
          </div>
          {sub && (
            <span className="px-2 py-0.5 rounded border bg-muted text-[10px] font-medium text-muted-foreground">
              {sub}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider truncate mb-0.5">{label}</p>
          <p className="text-xl font-bold text-foreground truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
});

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    todayExpenses: 0,
    monthExpenses: 0,
    pendingSalary: 0,
    outstandingRecoveries: 0,
    todayAttendance: "0 / 0 Present",
    staffCount: 0,
    recentExpenses: [],
    categoryTotals: {},
    monthlyTrend: []
  });
  
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const month = getCurrentMonth();
    const today = new Date().toISOString().split("T")[0];

    // Exclude staff transactions from operational expenses
    const unsubExpenses = expenseService.subscribeByMonth(month, (data) => {
      let todayTotal = 0;
      let monthTotal = 0;
      const catTotals: Record<string, number> = {};
      
      const operationalData = data.filter(exp => exp.category !== "salary" && exp.category !== "salary_advance" && exp.category !== "bonus");
      
      operationalData.forEach(exp => {
        monthTotal += exp.amount;
        if (exp.date === today) todayTotal += exp.amount;
        catTotals[exp.category] = (catTotals[exp.category] || 0) + exp.amount;
      });

      setStats(prev => ({
        ...prev,
        monthExpenses: monthTotal,
        todayExpenses: todayTotal,
        categoryTotals: catTotals,
        recentExpenses: operationalData.slice(0, 8)
      }));
      setLoading(false);
    });

    const unsubStaff = staffService.subscribeAll((data) => {
      const activeStaff = data.filter(s => s.status === "active");
      const outstandingTotal = data.reduce((sum, s) => sum + (s.outstandingBalance || 0), 0);
      
      attendanceService.getTodaySummary().then(summary => {
        const activeCount = activeStaff.length;
        const presentCount = summary.present + (summary.half_day * 0.5);
        setStats(prev => ({
          ...prev,
          staffCount: activeCount,
          outstandingRecoveries: outstandingTotal,
          todayAttendance: `${presentCount} / ${activeCount} Present`
        }));
      });
    });

    const unsubSalary = salaryService.subscribePending((data) => {
      const pendingTotal = data.filter(r => r.remainingDue > 0).reduce((sum, r) => sum + r.remainingDue, 0);
      setStats(prev => ({ ...prev, pendingSalary: pendingTotal }));
    });

    // Monthly trend representing ONLY operational expenses
    const months = getLast12Months().slice(-6);
    Promise.all(
      months.map(async m => {
        const q = query(collection(db, "expenses"), where("date", ">=", `${m}-01`), where("date", "<=", `${m}-31`));
        const snap = await getDocs(q);
        const amount = snap.docs
          .map(d => d.data() as Expense)
          .filter(e => e.category !== "salary" && e.category !== "salary_advance" && e.category !== "bonus")
          .reduce((sum, e) => sum + e.amount, 0);
        return {
          month: formatMonth(m).split(" ")[0].slice(0, 3),
          amount,
          key: m,
        };
      })
    ).then(historical => {
      setStats(prev => ({
        ...prev,
        monthlyTrend: historical.map(h => ({ month: h.month, amount: h.amount })),
      }));
    });

    return () => {
      unsubExpenses();
      unsubStaff();
      unsubSalary();
    };
  }, []);

  // Keep monthly trend current month in sync with live expense data
  useEffect(() => {
    const currentMonthShort = formatMonth(getCurrentMonth()).split(" ")[0].slice(0, 3);
    setStats(prev => ({
      ...prev,
      monthlyTrend: prev.monthlyTrend.map((t, i) =>
        i === prev.monthlyTrend.length - 1
          ? { ...t, month: currentMonthShort, amount: prev.monthExpenses }
          : t
      ),
    }));
  }, [stats.monthExpenses]);

  const pieData = useMemo(() =>
    Object.entries(stats.categoryTotals).map(([cat, amt]) => {
      const info = EXPENSE_CATEGORIES.find((c) => c.value === cat);
      return { name: info?.label || cat, value: amt, color: info?.color || "#64748b" };
    }),
    [stats.categoryTotals]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welcome Back 👋</h1>
        <p className="text-muted-foreground text-sm mt-1">Here's your Kumar Ice Parlour business overview.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={IndianRupee} label="Pending Salaries" value={formatCurrency(stats.pendingSalary)} sub="Unpaid" color="bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400" loading={loading} onClick={() => navigate("/staff")} />
        <StatCard icon={Zap} label="Outstanding Recoveries" value={formatCurrency(stats.outstandingRecoveries)} sub="Advances" color="bg-amber-500/10 text-amber-500 dark:bg-amber-500/20 dark:text-amber-400" loading={loading} onClick={() => navigate("/staff")} />
        <StatCard icon={Clock} label="Today's Attendance" value={stats.todayAttendance} sub="Today" color="bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20 dark:text-emerald-400" loading={loading} onClick={() => navigate("/attendance")} />
        <StatCard icon={Receipt} label="Monthly Expenses" value={formatCurrency(stats.monthExpenses)} sub={formatMonth(getCurrentMonth())} color="bg-red-500/10 text-red-500 dark:bg-red-500/20 dark:text-red-400" loading={loading} onClick={() => navigate("/expenses")} />
      </div>

      {/* Charts + Activity */}
      <Suspense fallback={
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      }>
        <DashboardCharts
          stats={stats}
          loading={loading}
          pieData={pieData}
          EXPENSE_CATEGORIES={EXPENSE_CATEGORIES}
        />
      </Suspense>
    </div>
  );
}
