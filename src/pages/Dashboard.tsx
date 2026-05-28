import { useEffect, useState, memo, useMemo, lazy, Suspense } from "react";
import {
  TrendingDown, Users, CalendarOff, Clock, ArrowUpRight,
  IndianRupee, Receipt, Zap, AlertCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Skeleton, Badge, EmptyState } from "@/components/ui";
import { expenseService, staffService, salaryService, leaveService } from "@/services";
import { formatCurrency, formatDate, getCurrentMonth, getLast12Months, formatMonth } from "@/lib/utils";
import { EXPENSE_CATEGORIES, type Expense } from "@/types";

// ─── Lazy-load the entire charts section ────────────────────────────────────
// recharts is 84KB gzip. Deferring it means stat cards appear instantly
// while recharts loads in the background after initial paint.
const DashboardCharts = lazy(() => import("./DashboardCharts"));

interface DashboardStats {
  todayExpenses: number;
  monthExpenses: number;
  pendingSalary: number;
  staffCount: number;
  todayLeaves: number;
  recentExpenses: Expense[];
  categoryTotals: Record<string, number>;
  monthlyTrend: { month: string; amount: number }[];
}

const CHART_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#f97316", "#ec4899", "#8b5cf6", "#64748b"];

const StatCard = memo(function StatCard({ icon: Icon, label, value, sub, color, loading }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color: string;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-28 rounded-xl" />;
  return (
    <Card className="relative overflow-hidden group hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-0.5">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{label}</p>
            <p className="text-lg sm:text-2xl font-bold text-foreground mt-1 truncate">{value}</p>
            {sub && <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 truncate">{sub}</p>}
          </div>
          <div className={`p-2 sm:p-2.5 rounded-xl ${color} shrink-0`}>
            <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </CardContent>
    </Card>
  );
});

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    todayExpenses: 0,
    monthExpenses: 0,
    pendingSalary: 0,
    staffCount: 0,
    todayLeaves: 0,
    recentExpenses: [],
    categoryTotals: {},
    monthlyTrend: []
  });
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const month = getCurrentMonth();
    const today = new Date().toISOString().split("T")[0];

    const unsubExpenses = expenseService.subscribeByMonth(month, (data) => {
      let todayTotal = 0;
      let monthTotal = 0;
      const catTotals: Record<string, number> = {};
      
      data.forEach(exp => {
        monthTotal += exp.amount;
        if (exp.date === today) todayTotal += exp.amount;
        catTotals[exp.category] = (catTotals[exp.category] || 0) + exp.amount;
      });

      setStats(prev => ({
        ...prev,
        monthExpenses: monthTotal,
        todayExpenses: todayTotal,
        categoryTotals: catTotals,
        recentExpenses: data.slice(0, 8)
      }));
      setLoading(false);
    });

    const unsubStaff = staffService.subscribeAll((data) => {
      setStats(prev => ({ ...prev, staffCount: data.filter(s => s.status === 'active').length }));
    });

    const unsubSalary = salaryService.subscribePending((data) => {
      const pendingTotal = data.reduce((sum, r) => sum + r.remainingDue, 0);
      setStats(prev => ({ ...prev, pendingSalary: pendingTotal }));
    });

    // Today's leave count — live listener so it updates cross-device
    const unsubLeaves = leaveService.subscribeByDate(today, (leaves) => {
      setStats(prev => ({ ...prev, todayLeaves: leaves.length }));
    });

    // Monthly trend — updated whenever current month snapshot fires
    // For past 5 months: use getDocs (historical, stable data)
    const months = getLast12Months().slice(-6);
    const historicalMonths = months.slice(0, 5); // all except current
    Promise.all(
      historicalMonths.map(m =>
        expenseService.getMonthTotal(m).then(amount => ({
          month: formatMonth(m).split(" ")[0].slice(0, 3),
          amount,
          key: m,
        }))
      )
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
      unsubLeaves();
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

      {/* Stat Cards — render immediately, no chart dependency */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={TrendingDown} label="Today's Spend" value={formatCurrency(stats.todayExpenses)} sub="Today" color="bg-red-500" loading={loading} />
        <StatCard icon={Receipt} label="This Month" value={formatCurrency(stats.monthExpenses)} sub={formatMonth(getCurrentMonth())} color="bg-violet-500" loading={loading} />
        <StatCard icon={IndianRupee} label="Salary Due" value={formatCurrency(stats.pendingSalary)} sub="Unpaid" color="bg-amber-500" loading={loading} />
        <StatCard icon={Users} label="Staff" value={String(stats.staffCount)} sub="Total active" color="bg-emerald-500" loading={loading} />
        <StatCard icon={CalendarOff} label="On Leave" value={String(stats.todayLeaves)} sub="Today" color="bg-pink-500" loading={loading} />
        <StatCard icon={Zap} label="Alerts" value="3" sub="Need attention" color="bg-orange-500" loading={loading} />
      </div>

      {/* Charts + Activity — lazy loaded after stat cards paint */}
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
