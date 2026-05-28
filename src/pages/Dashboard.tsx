import { useEffect, useState, memo, useMemo } from "react";
import {
  TrendingDown, Users, CalendarOff, Clock, ArrowUpRight,
  IndianRupee, Receipt, Zap, AlertCircle
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, Skeleton, Badge, EmptyState } from "@/components/ui";
import { expenseService, staffService, salaryService, leaveService } from "@/services";
import { formatCurrency, formatDate, getCurrentMonth, getLast12Months, formatMonth } from "@/lib/utils";
import { EXPENSE_CATEGORIES, type Expense } from "@/types";

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

const CustomTooltip = memo(function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-sm">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-primary font-semibold">{formatCurrency(payload[0].value)}</p>
    </div>
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

    // Real-time Subscriptions
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
        recentExpenses: data.slice(0, 8) // First 8 (since query is ordered by desc)
      }));
      setLoading(false); // First render completes when expenses arrive
    });

    const unsubStaff = staffService.subscribeAll((data) => {
      setStats(prev => ({ ...prev, staffCount: data.filter(s => s.status === 'active').length }));
    });

    const unsubSalary = salaryService.subscribePending((data) => {
      const pendingTotal = data.reduce((sum, r) => sum + r.remainingDue, 0);
      setStats(prev => ({ ...prev, pendingSalary: pendingTotal }));
    });

    // Lighter query: only today's leaves (avoids full-month subscription)
    leaveService.getTodayCount().then((count) => {
      setStats(prev => ({ ...prev, todayLeaves: count }));
    });

    // Fetch 6-month trend in parallel (not sequential) — dramatically faster
    const fetchTrends = () => {
      const months = getLast12Months().slice(-6);
      Promise.all(
        months.map(m =>
          expenseService.getMonthTotal(m).then(amount => ({
            month: formatMonth(m).split(" ")[0].slice(0, 3),
            amount,
          }))
        )
      ).then(monthlyTrend => setStats(prev => ({ ...prev, monthlyTrend })));
    };
    fetchTrends();

    return () => {
      unsubExpenses();
      unsubStaff();
      unsubSalary();
    };
  }, []);

  const pieData = useMemo(() =>
    Object.entries(stats.categoryTotals).map(([cat, amt]) => {
      const info = EXPENSE_CATEGORIES.find((c) => c.value === cat);
      return { name: info?.label || cat, value: amt, color: info?.color || "#64748b" };
    }),
    [stats.categoryTotals]
  );

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welcome Back 👋</h1>
        <p className="text-muted-foreground text-sm mt-1">Here's your Kumar Ice Parlour business overview.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={TrendingDown} label="Today's Spend" value={formatCurrency(stats.todayExpenses)} sub="Today" color="bg-red-500" loading={loading} />
        <StatCard icon={Receipt} label="This Month" value={formatCurrency(stats.monthExpenses)} sub={formatMonth(getCurrentMonth())} color="bg-violet-500" loading={loading} />
        <StatCard icon={IndianRupee} label="Salary Due" value={formatCurrency(stats.pendingSalary)} sub="Unpaid" color="bg-amber-500" loading={loading} />
        <StatCard icon={Users} label="Staff" value={String(stats.staffCount)} sub="Total active" color="bg-emerald-500" loading={loading} />
        <StatCard icon={CalendarOff} label="On Leave" value={String(stats.todayLeaves)} sub="Today" color="bg-pink-500" loading={loading} />
        <StatCard icon={Zap} label="Alerts" value="3" sub="Need attention" color="bg-orange-500" loading={loading} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-primary" />
              Monthly Expense Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={stats.monthlyTrend}>
                  <defs>
                    <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorAmt)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Expenses by Category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" />
              Category Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : pieData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No expenses this month</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Expenses */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Recent Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : stats.recentExpenses.length === 0 ? (
              <EmptyState icon="💸" title="No recent expenses" description="You haven't recorded any expenses yet." />
            ) : (
              <div className="space-y-3">
                {stats.recentExpenses.map((exp) => {
                  const cat = EXPENSE_CATEGORIES.find((c) => c.value === exp.category) || EXPENSE_CATEGORIES[0];
                  return (
                    <div key={exp.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: `${cat.color}20` }}>
                        {cat.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{exp.title}</p>
                        <p className="text-xs text-muted-foreground">{cat.label} · {formatDate(exp.date)}</p>
                      </div>
                      <p className="text-sm font-bold text-red-400 shrink-0">
                        -{formatCurrency(exp.amount)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions & Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-primary" />
              Alerts & Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.pendingSalary > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  <div className="flex items-center gap-2">
                    <IndianRupee className="h-4 w-4" />
                    <p className="text-sm font-medium">Pending salaries to clear</p>
                  </div>
                  <Badge variant="warning" className="bg-amber-500">{formatCurrency(stats.pendingSalary)}</Badge>
                </div>
              )}
              {stats.todayLeaves > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg border border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-400">
                  <div className="flex items-center gap-2">
                    <CalendarOff className="h-4 w-4" />
                    <p className="text-sm font-medium">Staff on leave today</p>
                  </div>
                  <Badge className="bg-pink-500 hover:bg-pink-600">{stats.todayLeaves} Staff</Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
