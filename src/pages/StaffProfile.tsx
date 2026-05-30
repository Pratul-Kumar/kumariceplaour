import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Calendar, IndianRupee, Award, Scale, Plus, RefreshCw, Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Skeleton, Button } from "@/components/ui";
import { staffService, salaryService, leaveService, attendanceService, advanceService, employeeLedgerService } from "@/services";
import { type Staff, type SalaryRecord, type LeaveRecord, type Attendance, type AdvanceRecord, type EmployeeLedgerEntry } from "@/types";
import { formatCurrency, formatDate, formatMonth, getInitials, generateAvatarColor } from "@/lib/utils";

export function StaffProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [salaryHistory, setSalaryHistory] = useState<SalaryRecord[]>([]);
  const [leaveHistory, setLeaveHistory] = useState<LeaveRecord[]>([]);
  const [advanceHistory, setAdvanceHistory] = useState<AdvanceRecord[]>([]);
  const [ledgerHistory, setLedgerHistory] = useState<EmployeeLedgerEntry[]>([]);
  const [currentMonthAtt, setCurrentMonthAtt] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"salary" | "leave" | "attendance" | "advance">("salary");

  useEffect(() => {
    if (!id) return;
    const staffId = id;
    const currentMonth = new Date().toISOString().slice(0, 7);
    let active = true;

    // Real-time subscription for the staff document itself (picks up edits from other devices)
    const unsubStaff = staffService.subscribeById(staffId, (s) => {
      if (active) {
        setStaff(s);
        setLoading(false);
      }
    });

    // Real-time subscription for attendance this month
    const unsubAtt = attendanceService.subscribeByMonth(currentMonth, (attData) => {
      if (active) {
        // Filter to just this staff member
        setCurrentMonthAtt(attData.filter(a => a.staffId === staffId));
      }
    });

    // Real-time subscription for employee financial ledger
    const unsubLedger = employeeLedgerService.subscribeByStaff(staffId, (data) => {
      if (active) setLedgerHistory(data);
    });

    // One-time server fetches for history (salary + leave) — forced from server for freshness
    salaryService.getByStaff(staffId).then((sal) => {
      if (active) setSalaryHistory(sal);
    });
    leaveService.getByStaff(staffId).then((lv) => {
      if (active) setLeaveHistory(lv);
    });
    advanceService.getByStaff(staffId).then((adv) => {
      if (active) setAdvanceHistory(adv);
    });

    return () => {
      active = false;
      unsubStaff();
      unsubAtt();
      unsubLedger();
    };
  }, [id]);

  if (loading) return (
    <div className="space-y-4 pb-20 lg:pb-6">
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );

  if (!staff) return <div className="text-center py-20 text-muted-foreground">Staff not found</div>;

  const ledgerStats = useMemo(() => {
    let outstandingBalance = 0;
    let totalAdvances = 0;
    let totalRecoveries = 0;
    let pendingRecoveries = 0;

    ledgerHistory.forEach((e) => {
      if (e.direction === "employee_owes") {
        outstandingBalance += e.amount;
        if (e.type === "salary_advance") {
          totalAdvances += e.amount;
        }
        if (e.status !== "settled") {
          pendingRecoveries += e.amount;
        }
      } else {
        outstandingBalance -= e.amount;
        if (e.type === "repayment" || e.type === "salary_deduction") {
          totalRecoveries += e.amount;
        }
      }
    });

    return {
      outstandingBalance,
      totalAdvances,
      totalRecoveries,
      pendingRecoveries,
    };
  }, [ledgerHistory]);

  const presentDays = currentMonthAtt.filter((a) => a.status === "present").length;
  const absentDays = currentMonthAtt.filter((a) => a.status === "absent").length;
  const halfDays = currentMonthAtt.filter((a) => a.status === "half_day").length;
  const totalDays = presentDays + absentDays + halfDays;
  const attendanceRate = totalDays > 0 ? Math.round(((presentDays + halfDays * 0.5) / totalDays) * 100) : 0;

  const calculateTenure = (joiningDate?: string) => {
    if (!joiningDate) return "N/A";
    const start = new Date(joiningDate);
    const now = new Date();
    const months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
    const years = Math.floor(months / 12);
    const remMonths = months % 12;
    if (years === 0 && remMonths === 0) return "Just Joined";
    if (years === 0) return `${remMonths} months`;
    return `${years} yrs ${remMonths > 0 ? `${remMonths} mos` : ''}`;
  };

  return (
    <div className="space-y-5 pb-20 lg:pb-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Profile Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${generateAvatarColor(staff.name)} flex items-center justify-center text-white text-xl font-bold shadow-lg`}>
              {getInitials(staff.name)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-foreground">{staff.name}</h1>
                <Badge variant={staff.status === "active" ? "success" : "secondary"}>{staff.status}</Badge>
                <Badge variant="secondary" className="capitalize">{staff.salaryType}</Badge>
              </div>
              <p className="text-muted-foreground capitalize mt-1">{staff.role}</p>
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{staff.phone}</p>
              {staff.note && <p className="text-xs text-muted-foreground mt-2 italic">"{staff.note}"</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">Salary</p>
              <p className="text-sm font-bold text-foreground mt-1">
                {staff.salaryType === "monthly" ? formatCurrency(staff.monthlySalary) : formatCurrency(staff.dailyWage)}
              </p>
              <p className="text-xs text-muted-foreground">{staff.salaryType === "monthly" ? "/month" : "/day"}</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">Leaves Taken</p>
              <p className={`text-sm font-bold mt-1 ${staff.leaveCount > staff.allowedCasualLeavesPerMonth ? "text-red-400" : "text-foreground"}`}>{staff.leaveCount}</p>
              <p className="text-xs text-muted-foreground">{staff.allowedCasualLeavesPerMonth} allowed</p>
            </div>
            <div className="bg-emerald-500/10 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">Present</p>
              <p className="text-sm font-bold text-emerald-400 mt-1">{presentDays}</p>
              <p className="text-xs text-muted-foreground">this month</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">Joined</p>
              <p className="text-sm font-bold text-foreground mt-1">{staff.joiningDate ? formatDate(staff.joiningDate) : "N/A"}</p>
              <p className="text-xs text-muted-foreground">{calculateTenure(staff.joiningDate)}</p>
            </div>
          </div>
          <div className="mt-4 bg-muted/30 p-3 rounded-xl border border-border">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-semibold">Monthly Attendance Rate</span>
              <span className={`text-xs font-bold ${attendanceRate >= 90 ? 'text-emerald-500' : attendanceRate >= 75 ? 'text-warning' : 'text-destructive'}`}>
                {attendanceRate}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full ${attendanceRate >= 90 ? 'bg-emerald-500' : attendanceRate >= 75 ? 'bg-warning' : 'bg-destructive'}`} 
                style={{ width: `${attendanceRate}%` }} 
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap rounded-xl bg-muted p-1 gap-1">
        {(["salary", "leave", "attendance", "advance"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 min-w-[100px] py-2 text-sm font-medium rounded-lg capitalize transition-all ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "salary" ? "💰 Salary" : t === "leave" ? "🏖️ Leave" : t === "attendance" ? "📋 Attendance" : "💸 Ledger"}
          </button>
        ))}
      </div>

      {/* Salary History */}
      {tab === "salary" && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Salary History</CardTitle></CardHeader>
          <CardContent className="p-0">
            {salaryHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No salary records yet</p>
            ) : (
              <div className="divide-y divide-border">
                {salaryHistory.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">{formatMonth(`${s.year}-${s.month.toString().padStart(2, '0')}`)}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.leaveDeduction > 0 && `Deducted: ${formatCurrency(s.leaveDeduction)}`}
                        {s.bonus > 0 && ` · Bonus: ${formatCurrency(s.bonus)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground">{formatCurrency(s.finalSalary)}</p>
                      <Badge variant={s.status === "paid" ? "success" : s.status === "partial" ? "warning" : "destructive"}>{s.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Leave History */}
      {tab === "leave" && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Leave History</CardTitle></CardHeader>
          <CardContent className="p-0">
            {leaveHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No leave records yet</p>
            ) : (
              <div className="divide-y divide-border">
                {leaveHistory.map((l) => (
                  <div key={l.id} className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-foreground capitalize">{l.leaveType.replace("_", " ")} Leave</p>
                      <p className="text-xs text-muted-foreground">{formatDate(l.leaveDate)}</p>
                      {l.reason && <p className="text-xs text-muted-foreground/70 italic">{l.reason}</p>}
                    </div>
                    <Badge variant={l.approved ? "success" : "warning"}>{l.approved ? "Approved" : "Pending"}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Attendance Summary */}
      {tab === "attendance" && (
        <Card>
          <CardHeader><CardTitle className="text-sm">This Month's Attendance</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-emerald-500/10 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">Present</p>
                <p className="text-xl font-bold text-emerald-400">{presentDays}</p>
              </div>
              <div className="bg-red-500/10 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">Absent</p>
                <p className="text-xl font-bold text-red-400">{absentDays}</p>
              </div>
              <div className="bg-amber-500/10 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">Half Day</p>
                <p className="text-xl font-bold text-amber-400">{halfDays}</p>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {currentMonthAtt.slice(0, 31).map((a) => (
                <div key={a.id || a.date} title={`${a.date}: ${a.status}`} className={`aspect-square rounded text-xs flex items-center justify-center font-medium ${
                  a.status === "present" ? "bg-emerald-500/20 text-emerald-400" :
                  a.status === "absent" ? "bg-red-500/20 text-red-400" :
                  a.status === "half_day" ? "bg-amber-500/20 text-amber-400" :
                  "bg-blue-500/20 text-blue-400"
                }`}>
                  {parseInt(a.date.slice(8))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ledger History & Financial Summary */}
      {tab === "advance" && (
        <div className="space-y-4">
          {/* Metrics summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className={`p-4 rounded-2xl border ${ledgerStats.outstandingBalance > 0 ? "bg-rose-500/10 border-rose-500/20" : "bg-emerald-500/10 border-emerald-500/20"}`}>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Outstanding Balance</p>
              <p className={`text-lg font-black mt-1 ${ledgerStats.outstandingBalance > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                {ledgerStats.outstandingBalance > 0 ? `Owes ₹${ledgerStats.outstandingBalance.toLocaleString()}` : "Balanced"}
              </p>
            </div>
            <div className="bg-glass-bg border border-glass-border p-4 rounded-2xl">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Advances</p>
              <p className="text-lg font-black text-foreground mt-1">
                {formatCurrency(ledgerStats.totalAdvances)}
              </p>
            </div>
            <div className="bg-glass-bg border border-glass-border p-4 rounded-2xl">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Recoveries</p>
              <p className="text-lg font-black text-emerald-400 mt-1">
                {formatCurrency(ledgerStats.totalRecoveries)}
              </p>
            </div>
            <div className="bg-glass-bg border border-glass-border p-4 rounded-2xl">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pending Recoveries</p>
              <p className="text-lg font-black text-amber-400 mt-1">
                {formatCurrency(ledgerStats.pendingRecoveries)}
              </p>
            </div>
          </div>

          <Card className="glass-card border-glass-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Landmark className="h-4 w-4 text-primary" /> Recovery History & Ledger Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {ledgerHistory.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No ledger entries recorded yet</p>
              ) : (
                <div className="px-5 py-4 space-y-6 relative before:absolute before:left-[27px] before:top-6 before:bottom-6 before:w-0.5 before:bg-glass-border">
                  {ledgerHistory.map((item) => {
                    const isCredit = item.direction === "store_owes";
                    return (
                      <div key={item.id} className="flex gap-4 relative items-start">
                        {/* Dot container */}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border relative z-10 ${
                          isCredit ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                        }`}>
                          <div className={`w-2 h-2 rounded-full ${isCredit ? "bg-emerald-400" : "bg-rose-400"}`} />
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0 bg-glass-bg/50 border border-glass-border/30 rounded-xl p-3.5 hover:bg-glass-bg transition-colors">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                              <p className="text-sm font-bold text-foreground capitalize">
                                {item.type.replace("_", " ")}
                              </p>
                              <span className="text-[10px] font-semibold text-muted-foreground">
                                {formatDate(item.createdAt)}
                              </span>
                            </div>
                            <div className="text-right">
                              <p className={`text-sm font-black ${isCredit ? "text-emerald-400" : "text-rose-400"}`}>
                                {isCredit ? "-" : "+"}{formatCurrency(item.amount)}
                              </p>
                              <Badge variant={item.status === "settled" ? "success" : item.status === "partial" ? "warning" : "destructive"} className="text-[9px] uppercase tracking-wider px-1.5 py-0">
                                {item.status}
                              </Badge>
                            </div>
                          </div>
                          {item.notes && (
                            <p className="text-xs text-muted-foreground italic mt-2 border-t border-glass-border/20 pt-1.5 truncate">
                              "{item.notes}"
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
