import { useState, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@/components/ui";
import { expenseService, attendanceService, salaryService } from "@/services";
import { formatCurrency, formatMonth, getLast12Months } from "@/lib/utils";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebase/config";
import type { Expense, LedgerEntry } from "@/types";

interface AnalyticsData {
  month: string;
  label: string;
  salaryGenerated: number;
  salaryPaid: number;
  recoveries: number;
  attendanceRate: number;
  operationalExpenses: number;
}

const CurrencyTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card !bg-[#0F1322]/90 backdrop-blur-xl border border-glass-border rounded-xl p-3 shadow-2xl text-xs min-w-[130px]">
      <p className="font-bold text-muted-foreground uppercase tracking-widest text-[9px] mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex justify-between items-center gap-4 py-0.5">
          <span className="text-[10px] text-muted-foreground font-semibold uppercase">{p.name.replace(/([A-Z])/g, " $1")}</span>
          <span className="font-bold text-sm" style={{ color: p.color || p.stroke }}>{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

const PercentTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card !bg-[#0F1322]/90 backdrop-blur-xl border border-glass-border rounded-xl p-3 shadow-2xl text-xs min-w-[130px]">
      <p className="font-bold text-muted-foreground uppercase tracking-widest text-[9px] mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex justify-between items-center gap-4 py-0.5">
          <span className="text-[10px] text-muted-foreground font-semibold uppercase">{p.name.replace(/([A-Z])/g, " $1")}</span>
          <span className="font-bold text-sm text-emerald-400">{p.value}%</span>
        </div>
      ))}
    </div>
  );
};

export function Analytics() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const months = getLast12Months().slice(-6); // last 6 months for cleaner visualization

        const trendData = await Promise.all(
          months.map(async (m) => {
            const [yearStr, monthStr] = m.split("-");
            const yr = Number(yearStr);
            const mo = Number(monthStr);

            // 1. Salary Records
            const salSnap = await getDocs(query(collection(db, "salaryRecords"), where("month", "==", mo), where("year", "==", yr)));
            const salaryGenerated = salSnap.docs.reduce((sum, d) => sum + (d.data().finalSalary || 0), 0);
            const salaryPaid = salSnap.docs.reduce((sum, d) => sum + (d.data().totalPaid || 0), 0);

            // 2. Recovery & Repayment Ledger
            const ledgerSnap = await getDocs(query(collection(db, "employee_ledger"), where("month", "==", m)));
            const recoveries = ledgerSnap.docs
              .map(d => d.data() as LedgerEntry)
              .filter(e => e.type === "salary_recovery" || e.type === "manual_repayment")
              .reduce((sum, e) => sum + e.amount, 0);

            // 3. Attendance Rate
            const attSnap = await getDocs(query(collection(db, "attendance"), where("date", ">=", `${m}-01`), where("date", "<=", `${m}-31`)));
            const totalAtt = attSnap.size;
            let attRate = 0;
            if (totalAtt > 0) {
              const present = attSnap.docs.filter(d => d.data().status === "present").length;
              const half = attSnap.docs.filter(d => d.data().status === "half_day").length;
              attRate = Math.round(((present + half * 0.5) / totalAtt) * 100);
            } else {
              attRate = 100; // default active rate
            }

            // 4. Operational Expenses (Exclude salaries, advances, bonuses)
            const expSnap = await getDocs(query(collection(db, "expenses"), where("date", ">=", `${m}-01`), where("date", "<=", `${m}-31`)));
            const operationalExpenses = expSnap.docs
              .map(d => d.data() as Expense)
              .filter(e => e.category !== "salary" && e.category !== "salary_advance" && e.category !== "bonus")
              .reduce((sum, e) => sum + e.amount, 0);

            return {
              month: m,
              label: formatMonth(m).split(" ")[0].slice(0, 3) + " " + yearStr.slice(2),
              salaryGenerated,
              salaryPaid,
              recoveries,
              attendanceRate: attRate,
              operationalExpenses,
            };
          })
        );

        setData(trendData);
      } catch (err) {
        console.error("Error loading analytics trends data", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">ERP Analytics</h1>
        <p className="text-sm text-muted-foreground">Unified insights and operational trends</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 1. Salary Trends Chart */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Salary Generated vs Paid</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full rounded-xl" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradGenerated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradPaid" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-bg)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CurrencyTooltip />} />
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                  <Area type="monotone" name="Salary Generated" dataKey="salaryGenerated" stroke="#818cf8" strokeWidth={2.5} fill="url(#gradGenerated)" />
                  <Area type="monotone" name="Salary Paid" dataKey="salaryPaid" stroke="#34d399" strokeWidth={2.5} fill="url(#gradPaid)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 2. Recovery Trends Chart */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Advance Recovery & Repayments</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full rounded-xl" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-bg)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CurrencyTooltip />} />
                  <Bar name="Recoveries" dataKey="recoveries" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 3. Attendance Trends Chart */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Attendance Rates Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full rounded-xl" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-bg)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<PercentTooltip />} />
                  <Line type="monotone" name="Attendance Rate" dataKey="attendanceRate" stroke="#34d399" strokeWidth={3} dot={{ r: 4, stroke: "#34d399", strokeWidth: 2, fill: "#0B0F19" }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 4. Expense Trends Chart (Operational) */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Operational Expenses Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full rounded-xl" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradExpenses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#c084fc" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#c084fc" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-bg)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CurrencyTooltip />} />
                  <Area type="monotone" name="Operational Expenses" dataKey="operationalExpenses" stroke="#c084fc" strokeWidth={2.5} fill="url(#gradExpenses)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
