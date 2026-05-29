import { useState, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, Select, Skeleton } from "@/components/ui";
import { expenseService } from "@/services";
import { EXPENSE_CATEGORIES, getCategoryInfo, type ExpenseCategory } from "@/types";
import { formatCurrency, formatMonth, getLast12Months, getCurrentMonth } from "@/lib/utils";

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card !bg-[#0F1322]/90 backdrop-blur-xl border border-glass-border rounded-xl p-3 shadow-2xl text-sm min-w-[120px]">
      <p className="font-bold text-foreground uppercase tracking-widest text-[10px] mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-bold" style={{ color: p.name === "amount" ? "#818cf8" : "#34d399" }}>
          {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
};

export function Analytics() {
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [monthlyData, setMonthlyData] = useState<{ month: string; amount: number; label: string }[]>([]);
  const [categoryData, setCategoryData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [topCategories, setTopCategories] = useState<{ label: string; amount: number; percent: number; color: string; icon: string }[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const months = getLast12Months();

      const monthlyAmounts = await Promise.all(
        months.map(async (m) => ({
          month: m,
          label: formatMonth(m).split(" ")[0].slice(0, 3) + " " + m.split("-")[1],
          amount: await expenseService.getMonthTotal(m),
        }))
      );
      setMonthlyData(monthlyAmounts);

      // Current month category breakdown
      const currentMonth = getCurrentMonth();
      const catTotals = await expenseService.getCategoryTotals(currentMonth);
      const total = Object.values(catTotals).reduce((s, v) => s + v, 0);

      const pieData = Object.entries(catTotals).map(([cat, amt]) => {
        const info = getCategoryInfo(cat as ExpenseCategory);
        return { name: info.label, value: amt, color: info.color };
      });
      setCategoryData(pieData);

      const topCats = Object.entries(catTotals)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([cat, amt]) => {
          const info = getCategoryInfo(cat as ExpenseCategory);
          return { label: info.label, amount: amt, percent: total > 0 ? Math.round((amt / total) * 100) : 0, color: info.color, icon: info.icon };
        });
      setTopCategories(topCats);

      setLoading(false);
    }
    load();
  }, [filterYear]);

  const maxAmount = Math.max(...monthlyData.map((d) => d.amount), 1);

  return (
    <div className="space-y-5 pb-20 lg:pb-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground">Business expense insights and trends</p>
      </div>

      {/* Monthly Overview */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">12-Month Expense Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-52 w-full rounded-xl" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--glass-border)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="amount" stroke="#818cf8" strokeWidth={3} fill="url(#grad1)" dot={{ fill: "#0F1322", stroke: "#818cf8", strokeWidth: 2, r: 4 }} activeDot={{ fill: "#818cf8", stroke: "#fff", strokeWidth: 2, r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Bar Chart */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Monthly Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-44 w-full rounded-xl" /> : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthlyData.slice(-6)}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--glass-bg)' }} />
                  <Bar dataKey="amount" fill="#818cf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Category Pie */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">This Month by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-44 w-full rounded-xl" /> : categoryData.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-muted-foreground font-medium text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={4} dataKey="value" stroke="none">
                    {categoryData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} iconType="circle" formatter={(v) => <span style={{ fontSize: 11, color: "#cbd5e1", fontWeight: 600 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Categories */}
      <Card className="glass-card">
        <CardHeader className="pb-3 border-b border-glass-border">
          <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Top Spending Categories — This Month</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)
          ) : topCategories.length === 0 ? (
            <p className="text-sm font-medium text-muted-foreground text-center py-4">No data for this month</p>
          ) : (
            topCategories.map((cat) => (
              <div key={cat.label} className="group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-glass-bg flex items-center justify-center border border-glass-border group-hover:scale-110 transition-transform">
                      <span className="text-sm">{cat.icon}</span>
                    </div>
                    <span className="text-sm font-bold text-foreground">{cat.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-foreground">{formatCurrency(cat.amount)}</span>
                    <span className="text-xs font-bold text-muted-foreground w-8 text-right bg-glass-bg px-2 py-0.5 rounded-full border border-glass-border">{cat.percent}%</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-glass-bg overflow-hidden border border-glass-border">
                  <div className="h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_currentColor]" style={{ width: `${cat.percent}%`, backgroundColor: cat.color }} />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Monthly Stats Table */}
      <Card className="glass-card overflow-hidden">
        <CardHeader className="pb-3 border-b border-glass-border bg-glass-bg">
          <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Monthly Summary Table</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-glass-border bg-[#0F1322]">
                  <th className="text-left px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest">Month</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest">Amount</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest">vs Avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}><td colSpan={3} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td></tr>
                  ))
                ) : (
                  monthlyData.slice(-6).reverse().map((row) => {
                    const avg = monthlyData.reduce((s, r) => s + r.amount, 0) / (monthlyData.length || 1);
                    const diff = row.amount - avg;
                    return (
                      <tr key={row.month} className="hover:bg-glass-bg transition-colors">
                        <td className="px-5 py-3 font-semibold text-foreground">{formatMonth(row.month)}</td>
                        <td className="px-5 py-3 text-right font-bold text-foreground">{formatCurrency(row.amount)}</td>
                        <td className={`px-5 py-3 text-right text-xs font-bold ${diff > 0 ? "text-red-400" : diff < 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                          {diff === 0 ? "—" : (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border ${diff > 0 ? "bg-red-500/10 border-red-500/20" : "bg-emerald-500/10 border-emerald-500/20"}`}>
                              {diff > 0 ? "+" : ""}{formatCurrency(Math.abs(diff))}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
