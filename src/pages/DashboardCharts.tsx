import { memo } from "react";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid
} from "recharts";
import { Clock, ArrowUpRight, IndianRupee } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Skeleton, EmptyState } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Expense } from "@/types";

interface Props {
  stats: {
    monthlyTrend: { month: string; amount: number }[];
    recentExpenses: Expense[];
    categoryTotals: Record<string, number>;
    pendingSalary: number;
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
    <div className="bg-popover border border-border px-3 py-2 rounded-lg shadow-sm text-xs">
      <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[9px] mb-1">{label}</p>
      <p className="text-sm font-bold text-foreground">{formatCurrency(payload[0].value)}</p>
    </div>
  );
});

export default function DashboardCharts({ stats, loading, pieData, EXPENSE_CATEGORIES }: Props) {
  return (
    <>
      {/* ── Charts Row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Monthly Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="flex items-center gap-2 text-sm">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <ArrowUpRight className="h-4 w-4" />
              </div>
              Expense Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {loading ? (
              <Skeleton className="h-56 w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={stats.monthlyTrend} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} dx={-10} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Area type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorAmt)" activeDot={{ r: 4, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 1.5 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown Pie */}
        <Card>
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="flex items-center gap-2 text-sm">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <span className="h-4 w-4 flex items-center justify-center font-bold">📊</span>
              </div>
              Category Split
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {loading ? (
              <Skeleton className="h-56 w-full rounded-lg" />
            ) : pieData.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">No expenses this month</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={6} dataKey="value" stroke="hsl(var(--card))" strokeWidth={2}>
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} iconType="circle" formatter={(v) => <span className="text-[11px] font-semibold text-muted-foreground">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Activity Row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mt-4 lg:mt-6">
        
        {/* Recent Expenses */}
        <Card>
          <CardHeader className="border-b border-border">
            <CardTitle className="flex items-center gap-2 text-sm">
              <div className="p-1.5 rounded-lg bg-red-500/10 text-red-500">
                <Clock className="h-4 w-4" />
              </div>
              Recent Transactions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            ) : stats.recentExpenses.length === 0 ? (
              <EmptyState icon="💸" title="No recent expenses" description="You haven't recorded any expenses yet." />
            ) : (
              <div className="divide-y divide-border">
                {stats.recentExpenses.map((exp) => {
                  const cat = EXPENSE_CATEGORIES.find((c) => c.value === exp.category) || EXPENSE_CATEGORIES[0];
                  return (
                    <div key={exp.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors group cursor-default">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 border" style={{ backgroundColor: `${cat.color}10`, borderColor: `${cat.color}25` }}>
                        {cat.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate mb-0.5">{exp.title}</p>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{cat.label} • {formatDate(exp.date)}</p>
                      </div>
                      <p className="text-sm font-bold text-red-500 shrink-0 tabular-nums bg-red-500/5 px-2.5 py-1 rounded-lg border border-red-500/10">
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
