import { useEffect, useState } from "react";
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
import { db } from "@/db";

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

function StatCard({ icon: Icon, label, value, sub, color, loading }: {
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
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </CardContent>
    </Card>
  );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-sm">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-primary font-semibold">{formatCurrency(payload[0].value)}</p>
    </div>
  );
};

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const month = getCurrentMonth();
      const [todayExpenses, monthExpenses, pendingSalary, staffCount, todayLeaves, recentExpenses, categoryTotals] = await Promise.all([
        expenseService.getTodayTotal(),
        expenseService.getMonthTotal(month),
        salaryService.getPending().then((r) => r.reduce((s, x) => s + x.finalSalary, 0)),
        staffService.count(),
        leaveService.getTodayCount(),
        expenseService.getRecent(8),
        expenseService.getCategoryTotals(month),
      ]);

      // Monthly trend last 6 months
      const months = getLast12Months().slice(-6);
      const monthlyTrend = await Promise.all(
        months.map(async (m) => ({
          month: formatMonth(m).split(" ")[0].slice(0, 3),
          amount: await expenseService.getMonthTotal(m),
        }))
      );

      setStats({ todayExpenses, monthExpenses, pendingSalary, staffCount, todayLeaves, recentExpenses, categoryTotals, monthlyTrend });
      setLoading(false);
    }
    load();
  }, []);

  const pieData = stats
    ? Object.entries(stats.categoryTotals).map(([cat, amt]) => {
        const info = EXPENSE_CATEGORIES.find((c) => c.value === cat);
        return { name: info?.label || cat, value: amt, color: info?.color || "#64748b" };
      })
    : [];

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Good {getGreeting()} 👋</h1>
        <p className="text-muted-foreground text-sm mt-1">Here's your Kumar Ice Parlour business overview.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={TrendingDown} label="Today's Spend" value={formatCurrency(stats?.todayExpenses || 0)} sub="Today" color="bg-red-500" loading={loading} />
        <StatCard icon={Receipt} label="This Month" value={formatCurrency(stats?.monthExpenses || 0)} sub={formatMonth(getCurrentMonth())} color="bg-violet-500" loading={loading} />
        <StatCard icon={IndianRupee} label="Salary Due" value={formatCurrency(stats?.pendingSalary || 0)} sub="Unpaid" color="bg-amber-500" loading={loading} />
        <StatCard icon={Users} label="Staff" value={String(stats?.staffCount || 0)} sub="Total active" color="bg-emerald-500" loading={loading} />
        <StatCard icon={CalendarOff} label="On Leave" value={String(stats?.todayLeaves || 0)} sub="Today" color="bg-pink-500" loading={loading} />
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
                <AreaChart data={stats?.monthlyTrend}>
                  <defs>
                    <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={2} fill="url(#colorAmt)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Category Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              By Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : pieData.length === 0 ? (
              <EmptyState icon="📊" title="No data" description="Add expenses to see chart" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [formatCurrency(Number(v)), 'Amount']} />
                  <Legend iconSize={8} iconType="circle" formatter={(v) => <span style={{ fontSize: 11, color: "#94a3b8" }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Recent Transactions
            </CardTitle>
            <Badge variant="secondary">{stats?.recentExpenses.length || 0} records</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : (stats?.recentExpenses.length || 0) === 0 ? (
            <EmptyState icon="💸" title="No expenses yet" description="Start adding your business expenses" />
          ) : (
            <div className="divide-y divide-border">
              {stats?.recentExpenses.map((exp) => {
                const cat = EXPENSE_CATEGORIES.find((c) => c.value === exp.category);
                return (
                  <div key={exp.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/30 transition-colors">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: `${cat?.color}20` }}>
                      {cat?.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{exp.title}</p>
                      <p className="text-xs text-muted-foreground">{cat?.label} • {formatDate(exp.date)}</p>
                    </div>
                    <p className="text-sm font-semibold text-red-400 shrink-0">- {formatCurrency(exp.amount)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Alerts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-400">Salary Due</p>
            <p className="text-xs text-muted-foreground">Process salary for current month</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <Users className="h-5 w-5 text-blue-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-400">Staff on Leave Today</p>
            <p className="text-xs text-muted-foreground">{stats?.todayLeaves || 0} staff members absent</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}
