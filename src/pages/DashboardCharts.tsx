import { memo } from "react";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
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
    <div className="glass px-4 py-3 rounded-xl shadow-2xl" style={{ border: "1px solid var(--glass-border)", backgroundColor: "var(--popover)" }}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
      <p className="text-base font-bold text-foreground text-gradient">{formatCurrency(payload[0].value)}</p>
    </div>
  );
});

export default function DashboardCharts({ stats, loading, pieData, EXPENSE_CATEGORIES }: Props) {
  return (
    <>
      {/* ── Charts Row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Monthly Trend */}
        <Card className="lg:col-span-2 glass-card">
          <CardHeader className="pb-2 border-b border-glass-border">
            <CardTitle className="flex items-center gap-2 text-sm">
              <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                <ArrowUpRight className="h-4 w-4" />
              </div>
              Expense Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {loading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={stats.monthlyTrend} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `Rs.${(v / 1000).toFixed(0)}k`} dx={-10} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--glass-border)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Area type="monotone" dataKey="amount" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorAmt)" activeDot={{ r: 6, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown Pie */}
        <Card className="glass-card">
          <CardHeader className="pb-2 border-b border-glass-border">
            <CardTitle className="flex items-center gap-2 text-sm">
              <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
                <span className="h-4 w-4 flex items-center justify-center font-bold">📊</span>
              </div>
              Category Split
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {loading ? (
              <Skeleton className="h-56 w-full" />
            ) : pieData.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">No expenses this month</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={6} dataKey="value" stroke="var(--glass-bg)" strokeWidth={2}>
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))' }} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} iconType="circle" formatter={(v) => <span style={{ fontSize: 11, color: "#cbd5e1", fontWeight: 600 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Activity Row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mt-4 lg:mt-6">
        
        {/* Recent Expenses */}
        <Card className="glass-card">
          <CardHeader className="border-b border-glass-border">
            <CardTitle className="flex items-center gap-2 text-sm">
              <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400">
                <Clock className="h-4 w-4" />
              </div>
              Recent Transactions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-5 space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : stats.recentExpenses.length === 0 ? (
              <EmptyState icon="💸" title="No recent expenses" description="You haven't recorded any expenses yet." />
            ) : (
              <div className="divide-y divide-white/5">
                {stats.recentExpenses.map((exp) => {
                  const cat = EXPENSE_CATEGORIES.find((c) => c.value === exp.category) || EXPENSE_CATEGORIES[0];
                  return (
                    <div key={exp.id} className="flex items-center gap-4 p-4 hover:bg-glass-bg transition-colors group cursor-default">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 transition-transform duration-300 group-hover:scale-110" style={{ backgroundColor: `${cat.color}15`, border: `1px solid ${cat.color}30`, boxShadow: `0 0 20px ${cat.color}10` }}>
                        {cat.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate mb-0.5 group-hover:text-white transition-colors">{exp.title}</p>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{cat.label} • {formatDate(exp.date)}</p>
                      </div>
                      <p className="text-sm font-bold text-rose-400 shrink-0 tabular-nums bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20">
                        -{formatCurrency(exp.amount)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </>
  );
}
