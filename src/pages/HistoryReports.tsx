import { useState, useEffect } from "react";
import { Download, Search, Filter } from "lucide-react";
import { Card, CardContent, Input, Button, Badge, EmptyState } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { staffService, salaryService, advanceService, attendanceService } from "@/services";
import { Staff, SalaryRecord, AdvanceRecord, Attendance } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";

type TabType = "attendance" | "salary" | "advances" | "pending";

export function HistoryReports() {
  const [activeTab, setActiveTab] = useState<TabType>("salary");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [advances, setAdvances] = useState<AdvanceRecord[]>([]);
  
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterStaff, setFilterStaff] = useState("all");
  
  const { toast } = useToast();

  useEffect(() => {
    staffService.getAll().then(setStaff);
  }, []);

  useEffect(() => {
    // Load historical data based on filters
    const loadData = async () => {
      try {
        if (activeTab === "salary" || activeTab === "pending") {
          const res = await salaryService.getByMonth(filterMonth, filterYear);
          setSalaries(res);
        } else if (activeTab === "advances") {
          const monthStr = `${filterYear}-${String(filterMonth).padStart(2, "0")}`;
          const res = await advanceService.getByMonth(monthStr);
          setAdvances(res);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadData();
  }, [filterMonth, filterYear, activeTab]);

  const getStaffName = (id: string) => staff.find(s => s.id === id)?.name || "Unknown";
  
  const handleExportCSV = () => {
    let csv = "";
    if (activeTab === "salary") {
      csv = "Staff,Month,Year,Base Salary,Advance,Net Paid,Remaining Due,Status\n";
      salaries.filter(s => filterStaff === "all" || s.staffId === filterStaff).forEach(s => {
        csv += `${getStaffName(s.staffId)},${s.month},${s.year},${s.baseSalary},${s.advance},${s.totalPaid},${s.remainingDue},${s.status}\n`;
      });
    } else if (activeTab === "advances") {
      csv = "Staff,Date,Amount,Status,Reason\n";
      advances.filter(a => filterStaff === "all" || a.staffId === filterStaff).forEach(a => {
        csv += `${getStaffName(a.staffId)},${a.date},${a.amount},${a.status},${a.reason || ""}\n`;
      });
    }
    
    if (!csv) return toast({ title: "Nothing to export", type: "error" });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab}_report_${filterMonth}_${filterYear}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Historical Reports</h1>
          <p className="text-sm text-muted-foreground">View and export historical data</p>
        </div>
        <Button onClick={handleExportCSV} className="gap-2 shrink-0">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {(["salary", "pending", "advances"] as TabType[]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap capitalize ${
              activeTab === t ? "bg-primary text-primary-foreground shadow-md" : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {t} History
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(Number(e.target.value))}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2000, i).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(Number(e.target.value))}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={filterStaff}
              onChange={(e) => setFilterStaff(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">All Employees</option>
              {staff.map(s => <option key={s.id} value={s.id!}>{s.name}</option>)}
            </select>
          </div>

          <div className="mt-4">
            {activeTab === "salary" && (
              <div className="space-y-3">
                {salaries.filter(s => filterStaff === "all" || s.staffId === filterStaff).length === 0 ? (
                  <EmptyState icon="📄" title="No Salary Records" description="No payroll processed for this month." />
                ) : (
                  salaries.filter(s => filterStaff === "all" || s.staffId === filterStaff).map((s) => (
                    <div key={s.id} className="flex justify-between items-center p-3 sm:p-4 rounded-xl border border-border bg-muted/30">
                      <div>
                        <p className="font-semibold">{getStaffName(s.staffId)}</p>
                        <p className="text-xs text-muted-foreground">Base: {formatCurrency(s.baseSalary)} • Advance: {formatCurrency(s.advance)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">{formatCurrency(s.finalSalary)}</p>
                        <Badge variant={s.status === "paid" ? "success" : s.status === "partial" ? "warning" : "secondary"}>
                          {s.status}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            
            {activeTab === "pending" && (
              <div className="space-y-3">
                {salaries.filter(s => (filterStaff === "all" || s.staffId === filterStaff) && s.remainingDue !== 0).length === 0 ? (
                  <EmptyState icon="✅" title="All Cleared" description="No pending dues or owed amounts for this month." />
                ) : (
                  salaries.filter(s => (filterStaff === "all" || s.staffId === filterStaff) && s.remainingDue !== 0).map((s) => (
                    <div key={s.id} className="flex justify-between items-center p-3 sm:p-4 rounded-xl border border-border bg-muted/30">
                      <div>
                        <p className="font-semibold">{getStaffName(s.staffId)}</p>
                        <p className="text-xs text-muted-foreground">Paid: {formatCurrency(s.totalPaid)} / {formatCurrency(s.finalSalary)}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${s.remainingDue < 0 ? "text-red-500" : "text-amber-500"}`}>
                          {s.remainingDue < 0 ? `Owes ${formatCurrency(Math.abs(s.remainingDue))}` : `Pending ${formatCurrency(s.remainingDue)}`}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "advances" && (
              <div className="space-y-3">
                {advances.filter(a => filterStaff === "all" || a.staffId === filterStaff).length === 0 ? (
                  <EmptyState icon="💸" title="No Advances" description="No advances issued this month." />
                ) : (
                  advances.filter(a => filterStaff === "all" || a.staffId === filterStaff).map((a) => (
                    <div key={a.id} className="flex justify-between items-center p-3 sm:p-4 rounded-xl border border-border bg-muted/30">
                      <div>
                        <p className="font-semibold">{getStaffName(a.staffId)}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(a.date)} {a.reason ? `• ${a.reason}` : ""}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-destructive">{formatCurrency(a.amount)}</p>
                        <Badge variant={a.status === "deducted" ? "success" : "warning"}>{a.status}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
