import { useEffect, useState, memo, useMemo, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingDown, Users, CalendarOff, Clock, ArrowUpRight,
  IndianRupee, Receipt, Zap, AlertCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Skeleton, Badge, EmptyState } from "@/components/ui";
import { expenseService, staffService, salaryService, leaveService, advanceService } from "@/services";
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
  pendingAdvances: number;
  staffCount: number;
  todayLeaves: number;
  recentExpenses: Expense[];
  categoryTotals: Record<string, number>;
  monthlyTrend: { month: string; amount: number }[];
}

const CHART_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#f97316", "#ec4899", "#8b5cf6", "#64748b"];

const StatCard = memo(function StatCard({ icon: Icon, label, value, sub, color, loading, onClick }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color: string;
  loading: boolean;
  onClick?: () => void;
}) {
  if (loading) return <Skeleton className="h-[120px] rounded-2xl" />;
  return (
    <Card 
      onClick={onClick}
      className={`relative overflow-hidden group glass-card ${onClick ? 'cursor-pointer hover:shadow-[0_0_15px_var(--glass-bg)] hover:-translate-y-0.5 transition-all' : ''}`}
    >
      <div className={`card-accent-primary absolute inset-0 rounded-2xl pointer-events-none`} />
      <CardContent className="p-4 sm:p-5 h-full flex flex-col justify-between">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className={`p-2.5 rounded-xl bg-gradient-to-br ${color} shadow-lg shrink-0`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          {sub && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide" style={{ background: "var(--glass-bg)", color: "hsl(var(--muted-foreground))" }}>
              {sub}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate mb-0.5">{label}</p>
          <p className="text-xl sm:text-2xl font-bold text-foreground truncate">{value}</p>
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
    pendingAdvances: 0,
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
      // Filter out invalid records where remainingDue might be 0 but status is pending
      const pendingTotal = data.filter(r => r.remainingDue > 0).reduce((sum, r) => sum + r.remainingDue, 0);
      setStats(prev => ({ ...prev, pendingSalary: pendingTotal }));
    });

    const unsubAdvances = advanceService.subscribeAll((data) => {
      const pendingTotal = data.filter(a => a.status === "pending").reduce((sum, a) => sum + a.amount, 0);
      setStats(prev => ({ ...prev, pendingAdvances: pendingTotal }));
    });

    // Today's leave count — live listener so it updates cross-device
    const unsubLeaves = leaveService.subscribeByDate(today, (leaves) => {
      setStats(prev => ({ ...prev, todayLeaves: leaves.length }));
    });

    // Monthly trend — updated whenever current month snapshot fires
    // For past 6 months: use getDocs (historical, stable data)
    const months = getLast12Months().slice(-6);
    Promise.all(
      months.map(m =>
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
      unsubAdvances();
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

  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welcome Back 👋</h1>
        <p className="text-muted-foreground text-sm mt-1">Here's your Kumar Ice Parlour business overview.</p>
      </div>

      {/* Stat Cards — render immediately, no chart dependency */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={TrendingDown} label="Today's Spend" value={formatCurrency(stats.todayExpenses)} sub="Today" color="bg-red-500" loading={loading} onClick={() => navigate('/expenses')} />
        <StatCard icon={Receipt} label="This Month" value={formatCurrency(stats.monthExpenses)} sub={formatMonth(getCurrentMonth())} color="bg-violet-500" loading={loading} onClick={() => navigate('/expenses')} />
        <StatCard icon={IndianRupee} label="Salary Due" value={formatCurrency(stats.pendingSalary)} sub="Unpaid" color="bg-amber-500" loading={loading} onClick={() => navigate('/salary')} />
        <StatCard icon={Zap} label="Advances" value={formatCurrency(stats.pendingAdvances)} sub="Pending" color="bg-rose-500" loading={loading} />
        <StatCard icon={Users} label="Staff" value={String(stats.staffCount)} sub="Total active" color="bg-emerald-500" loading={loading} onClick={() => navigate('/staff')} />
        <StatCard icon={CalendarOff} label="On Leave" value={String(stats.todayLeaves)} sub="Today" color="bg-pink-500" loading={loading} onClick={() => navigate('/leaves')} />
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
