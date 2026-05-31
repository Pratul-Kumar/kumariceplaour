import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Phone, Calendar, IndianRupee, Award, Plus, Coins,
  TrendingDown, TrendingUp, RefreshCw, CheckCircle2, History,
  Sparkles, Wallet
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Skeleton, Button, Input, Spinner } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { staffService, salaryService, attendanceService, ledgerService, expenseService } from "@/services";
import { type Staff, type SalaryRecord, type Attendance, type AdvanceRecord, type LedgerEntry } from "@/types";
import { formatCurrency, formatDate, formatMonth, getInitials, generateAvatarColor } from "@/lib/utils";

export function StaffProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [salaryHistory, setSalaryHistory] = useState<SalaryRecord[]>([]);
  const [ledgerHistory, setLedgerHistory] = useState<LedgerEntry[]>([]);
  const [currentMonthAtt, setCurrentMonthAtt] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"salary" | "attendance" | "advance">("salary");

  // Modals & Action states
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [isRepaymentModalOpen, setIsRepaymentModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [advAmount, setAdvAmount] = useState("");
  const [advDate, setAdvDate] = useState(new Date().toISOString().split("T")[0]);
  const [advReason, setAdvReason] = useState("");

  const [repAmount, setRepAmount] = useState("");
  const [repDate, setRepDate] = useState(new Date().toISOString().split("T")[0]);
  const [repNote, setRepNote] = useState("");

  const [adjType, setAdjType] = useState<"add" | "subtract">("add");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjDate, setAdjDate] = useState(new Date().toISOString().split("T")[0]);
  const [adjNote, setAdjNote] = useState("");

  const { toast } = useToast();

  useEffect(() => {
    if (!id) return;
    const staffId = id;
    const currentMonth = new Date().toISOString().slice(0, 7);
    let active = true;

    // Real-time subscription for the staff document itself
    const unsubStaff = staffService.subscribeById(staffId, (s) => {
      if (active) {
        setStaff(s);
        setLoading(false);
      }
    });

    // Real-time subscription for attendance this month
    const unsubAtt = attendanceService.subscribeByMonth(currentMonth, (attData) => {
      if (active) {
        setCurrentMonthAtt(attData.filter(a => a.staffId === staffId));
      }
    });

    // Real-time ledger subscription
    const unsubLedger = ledgerService.subscribeByStaff(staffId, (entries) => {
      if (active) {
        setLedgerHistory(entries);
      }
    });

    salaryService.getByStaff(staffId).then((sal) => {
      if (active) setSalaryHistory(sal);
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
    return `${years} yrs ${remMonths > 0 ? `${remMonths} mos` : ""}`;
  };

  // Ledger calculation helpers
  const totalAdvances = ledgerHistory
    .filter(e => e.type === "salary_advance" || (e.type === "manual_adjustment" && e.amount > 0))
    .reduce((sum, e) => sum + e.amount, 0);

  const totalRecovered = ledgerHistory
    .filter(e => e.type === "salary_recovery")
    .reduce((sum, e) => sum + e.amount, 0);

  const totalRepayments = ledgerHistory
    .filter(e => e.type === "manual_repayment" || (e.type === "manual_adjustment" && e.amount < 0))
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);

  const outstanding = staff.outstandingBalance || 0;
  const settledAmount = totalRecovered + totalRepayments;
  const progressPct = totalAdvances > 0 ? Math.min(100, (settledAmount / totalAdvances) * 100) : (outstanding === 0 ? 100 : 0);

  const handleAddAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(advAmount);
    if (!amount || amount <= 0) {
      toast({ type: "error", title: "Invalid amount", description: "Please enter a valid amount." });
      return;
    }
    setSaving(true);
    try {
      await expenseService.add({
        title: `Salary Advance - ${staff.name}`,
        amount,
        category: "salary_advance",
        date: advDate,
        note: advReason || "Direct salary advance",
        staffId: staff.id
      });
      toast({ type: "success", title: "Advance recorded successfully" });
      setIsAdvanceModalOpen(false);
      setAdvAmount("");
      setAdvReason("");
    } catch (err: any) {
      toast({ type: "error", title: "Failed to record advance", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAddRepayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(repAmount);
    if (!amount || amount <= 0) {
      toast({ type: "error", title: "Invalid amount", description: "Please enter a valid amount." });
      return;
    }
    setSaving(true);
    try {
      await ledgerService.addEntry({
        staffId: staff.id!,
        type: "manual_repayment",
        amount,
        date: repDate,
        month: repDate.slice(0, 7),
        note: repNote || "Manual advance repayment"
      });
      toast({ type: "success", title: "Repayment recorded successfully" });
      setIsRepaymentModalOpen(false);
      setRepAmount("");
      setRepNote("");
    } catch (err: any) {
      toast({ type: "error", title: "Failed to record repayment", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAddAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(adjAmount);
    if (!amount || amount <= 0) {
      toast({ type: "error", title: "Invalid amount", description: "Please enter a valid amount." });
      return;
    }
    setSaving(true);
    try {
      const finalAmount = adjType === "add" ? amount : -amount;
      await ledgerService.addEntry({
        staffId: staff.id!,
        type: "manual_adjustment",
        amount: finalAmount,
        date: adjDate,
        month: adjDate.slice(0, 7),
        note: adjNote || "Manual ledger adjustment"
      });
      toast({ type: "success", title: "Adjustment recorded successfully" });
      setIsAdjustmentModalOpen(false);
      setAdjAmount("");
      setAdjNote("");
    } catch (err: any) {
      toast({ type: "error", title: "Failed to record adjustment", description: err.message });
    } finally {
      setSaving(false);
    }
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">Salary</p>
              <p className="text-sm font-bold text-foreground mt-1">
                {staff.salaryType === "monthly" ? formatCurrency(staff.monthlySalary) : formatCurrency(staff.dailyWage)}
              </p>
              <p className="text-xs text-muted-foreground">{staff.salaryType === "monthly" ? "/month" : "/day"}</p>
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
              <span className={`text-xs font-bold ${attendanceRate >= 90 ? "text-emerald-500" : attendanceRate >= 75 ? "text-warning" : "text-destructive"}`}>
                {attendanceRate}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full ${attendanceRate >= 90 ? "bg-emerald-500" : attendanceRate >= 75 ? "bg-warning" : "bg-destructive"}`} 
                style={{ width: `${attendanceRate}%` }} 
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap rounded-xl bg-muted p-1 gap-1">
        {(["salary", "attendance", "advance"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 min-w-[100px] py-2 text-sm font-medium rounded-lg capitalize transition-all ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "salary" ? "💰 Salary" : t === "attendance" ? "📋 Attendance" : "💸 Advances"}
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
                      <p className="text-sm font-medium text-foreground">{formatMonth(`${s.year}-${s.month.toString().padStart(2, "0")}`)}</p>
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

      {/* Advance / Ledger Workspace */}
      {tab === "advance" && (
        <div className="space-y-5">
          {/* Summary Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <Card className="glass-card">
              <CardContent className="p-4 sm:p-5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Total Advances</p>
                <p className="text-xl font-bold text-foreground">{formatCurrency(totalAdvances)}</p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="p-4 sm:p-5">
                <p className="text-[10px] font-bold text-emerald-500/70 uppercase tracking-widest mb-1">Recovered (Salary)</p>
                <p className="text-xl font-bold text-emerald-400">{formatCurrency(totalRecovered)}</p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="p-4 sm:p-5">
                <p className="text-[10px] font-bold text-teal-500/70 uppercase tracking-widest mb-1">Repayments (Cash)</p>
                <p className="text-xl font-bold text-teal-400">{formatCurrency(totalRepayments)}</p>
              </CardContent>
            </Card>
            <Card className="glass-card border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
              <CardContent className="p-4 sm:p-5">
                <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">Outstanding Balance</p>
                <p className="text-xl font-bold text-amber-400">{formatCurrency(outstanding)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Progress & Actions */}
          <Card className="glass-card">
            <CardContent className="p-5 space-y-4">
              {/* Progress Bar */}
              <div>
                <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground mb-1.5">
                  <span>Settlement Progress</span>
                  <span>{progressPct.toFixed(0)}% Settled</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  onClick={() => {
                    setAdvDate(new Date().toISOString().split("T")[0]);
                    setIsAdvanceModalOpen(true);
                  }}
                  className="flex-1 min-w-[120px] bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 h-9 text-xs font-bold gap-1.5"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Give Advance
                </Button>
                <Button
                  onClick={() => {
                    setRepDate(new Date().toISOString().split("T")[0]);
                    setIsRepaymentModalOpen(true);
                  }}
                  className="flex-1 min-w-[120px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 h-9 text-xs font-bold gap-1.5"
                >
                  <TrendingDown className="h-3.5 w-3.5" />
                  Record Repayment
                </Button>
                <Button
                  onClick={() => {
                    setAdjDate(new Date().toISOString().split("T")[0]);
                    setAdjType("add");
                    setIsAdjustmentModalOpen(true);
                  }}
                  className="flex-1 min-w-[120px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 h-9 text-xs font-bold gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Adjust Balance
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Ledger Timeline */}
          <Card className="glass-card">
            <CardHeader className="pb-3 border-b border-glass-border">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                Financial Ledger Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              {ledgerHistory.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-xs text-muted-foreground">No transaction entries found in ledger.</p>
                </div>
              ) : (
                <div className="space-y-4 relative before:absolute before:left-[13px] before:top-2 before:bottom-2 before:w-0.5 before:bg-glass-border">
                  {ledgerHistory.map((entry) => {
                    let icon = <Coins className="h-3.5 w-3.5 text-muted-foreground" />;
                    let iconBg = "bg-muted/10 border-glass-border";
                    let title = "Transaction";
                    let amountText = formatCurrency(entry.amount);
                    let amountColor = "text-foreground";
                    
                    if (entry.type === "salary_advance") {
                      icon = <TrendingUp className="h-3.5 w-3.5 text-rose-400" />;
                      iconBg = "bg-rose-500/10 border-rose-500/20";
                      title = "Salary Advance Given";
                      amountText = `+${formatCurrency(entry.amount)}`;
                      amountColor = "text-rose-400 font-bold";
                    } else if (entry.type === "salary_recovery") {
                      icon = <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />;
                      iconBg = "bg-emerald-500/10 border-emerald-500/20";
                      title = "Auto-Recovered in Salary";
                      amountText = `-${formatCurrency(entry.amount)}`;
                      amountColor = "text-emerald-400 font-bold";
                    } else if (entry.type === "manual_repayment") {
                      icon = <TrendingDown className="h-3.5 w-3.5 text-teal-400" />;
                      iconBg = "bg-teal-500/10 border-teal-500/20";
                      title = "Manual Repayment Received";
                      amountText = `-${formatCurrency(entry.amount)}`;
                      amountColor = "text-teal-400 font-bold";
                    } else if (entry.type === "manual_adjustment") {
                      icon = <RefreshCw className="h-3.5 w-3.5 text-indigo-400" />;
                      iconBg = "bg-indigo-500/10 border-indigo-500/20";
                      title = "Manual Ledger Adjustment";
                      amountText = entry.amount > 0 ? `+${formatCurrency(entry.amount)}` : `-${formatCurrency(Math.abs(entry.amount))}`;
                      amountColor = entry.amount > 0 ? "text-rose-400 font-bold" : "text-emerald-400 font-bold";
                    } else if (entry.type === "salary_generated") {
                      icon = <Coins className="h-3.5 w-3.5 text-blue-400" />;
                      iconBg = "bg-blue-500/10 border-blue-500/20";
                      title = "Salary Generated (Payout)";
                      amountText = formatCurrency(entry.amount);
                      amountColor = "text-blue-400 font-bold";
                    } else if (entry.type === "salary_paid") {
                      icon = <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
                      iconBg = "bg-emerald-500/10 border-emerald-500/20";
                      title = "Salary Payout Paid";
                      amountText = formatCurrency(entry.amount);
                      amountColor = "text-emerald-400 font-bold";
                    }

                    return (
                      <div key={entry.id} className="flex items-start gap-4 relative">
                        {/* Timeline Circle */}
                        <div className={`w-[28px] h-[28px] rounded-full flex items-center justify-center border ${iconBg} shrink-0 z-10 bg-[#0B0F19]`}>
                          {icon}
                        </div>
                        
                        <div className="flex-1 min-w-0 bg-glass-bg border border-glass-border rounded-xl p-3 hover:bg-glass-bg/60 transition-colors">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                              <p className="text-xs font-bold text-foreground">{title}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(entry.date)}</p>
                            </div>
                            <span className={`text-sm ${amountColor}`}>{amountText}</span>
                          </div>
                          {entry.note && (
                            <p className="text-[11px] text-muted-foreground italic mt-1 bg-[#07090e]/40 p-2 rounded-lg border border-glass-border/30">
                              "{entry.note}"
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

      {/* ── Give Advance Modal ─────────────────────────────── */}
      <Modal open={isAdvanceModalOpen} onClose={() => setIsAdvanceModalOpen(false)} title="Give Salary Advance">
        <form onSubmit={handleAddAdvance} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Advance Amount (₹) *</label>
            <Input
              type="number"
              min={1}
              required
              value={advAmount}
              onChange={(e) => setAdvAmount(e.target.value)}
              placeholder="Enter amount..."
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Date *</label>
            <Input
              type="date"
              required
              value={advDate}
              onChange={(e) => setAdvDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Reason / Note</label>
            <Input
              value={advReason}
              onChange={(e) => setAdvReason(e.target.value)}
              placeholder="e.g. Family emergency, medical..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setIsAdvanceModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : "Confirm Advance"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Record Repayment Modal ─────────────────────────── */}
      <Modal open={isRepaymentModalOpen} onClose={() => setIsRepaymentModalOpen(false)} title="Record Cash Repayment">
        <form onSubmit={handleAddRepayment} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Repayment Amount (₹) *</label>
            <Input
              type="number"
              min={1}
              required
              value={repAmount}
              onChange={(e) => setRepAmount(e.target.value)}
              placeholder="Enter amount..."
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Date *</label>
            <Input
              type="date"
              required
              value={repDate}
              onChange={(e) => setRepDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Note</label>
            <Input
              value={repNote}
              onChange={(e) => setRepNote(e.target.value)}
              placeholder="e.g. Paid cash directly..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setIsRepaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : "Confirm Repayment"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Adjust Balance Modal ───────────────────────────── */}
      <Modal open={isAdjustmentModalOpen} onClose={() => setIsAdjustmentModalOpen(false)} title="Adjust Ledger Balance">
        <form onSubmit={handleAddAdjustment} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Adjustment Type *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAdjType("add")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${adjType === "add" ? "bg-red-500/10 border-red-500/50 text-red-400" : "bg-card border-border text-muted-foreground"}`}
              >
                Add Debt (+)
              </button>
              <button
                type="button"
                onClick={() => setAdjType("subtract")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${adjType === "subtract" ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : "bg-card border-border text-muted-foreground"}`}
              >
                Reduce Debt (-)
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Amount (₹) *</label>
            <Input
              type="number"
              min={1}
              required
              value={adjAmount}
              onChange={(e) => setAdjAmount(e.target.value)}
              placeholder="Enter amount..."
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Date *</label>
            <Input
              type="date"
              required
              value={adjDate}
              onChange={(e) => setAdjDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Reason / Note *</label>
            <Input
              required
              value={adjNote}
              onChange={(e) => setAdjNote(e.target.value)}
              placeholder="e.g. Correction for data entry error..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setIsAdjustmentModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : "Apply Adjustment"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
