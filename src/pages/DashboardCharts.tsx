// DashboardCharts.tsx — lazy loaded after stat cards paint
// recharts (84KB gzip) only parses after the initial DOM is visible
import { memo } from "react";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts";
import { Clock, ArrowUpRight, AlertCircle, IndianRupee, CalendarOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Skeleton, Badge, EmptyState } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Expense } from "@/types";

interface Props {
  stats: {
    monthlyTrend: { month: string; amount: number }[];
    recentExpenses: Expense[];
    categoryTotals: Record<string, number>;
    pendingSalary: number;
    todayLeaves: number;
  };
  loading: boolean;
  pieData: { name: string; value: number; color: string }[];
  EXPENSE_CATEGORIES: { value: string; label: string; color: string; icon: string }[];
}

const CustomTooltip = memo(function CustomTooltip({
  active, payload, label
}: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-sm">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-primary font-semibold">{formatCurrency(payload[0].value)}</p>
    </div>
  );
});

export default function DashboardCharts({ stats, loading, pieData, EXPENSE_CATEGORIES }: Props) {
  return (
    <>
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

        {/* Category Breakdown Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <span className="h-4 w-4 text-primary">📊</span>
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

        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-primary" />
              Alerts &amp; Quick Actions
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
              {stats.pendingSalary === 0 && stats.todayLeaves === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No alerts today 🎉</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
