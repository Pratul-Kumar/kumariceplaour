import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Phone, Calendar, IndianRupee, Award, Plus, Coins,
  TrendingDown, TrendingUp, RefreshCw, CheckCircle2, History,
  Sparkles, Wallet, FileText, HandCoins, Trash2, Download,
  Banknote, Smartphone, Building2, Eye, CalendarCheck
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Skeleton, Button, Input, Spinner } from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { staffService, salaryService, attendanceService, ledgerService, expenseService, advanceService } from "@/services";
import { type Staff, type SalaryRecord, type Attendance, type SalaryPayment, type LedgerEntry } from "@/types";
import { formatCurrency, formatDate, formatMonth, getInitials, generateAvatarColor, getCurrentMonth } from "@/lib/utils";
import { calculateSalary } from "@/types";

const PAY_METHOD_ICONS: Record<string, { icon: any; label: string; color: string }> = {
  cash:  { icon: Banknote,    label: "Cash",          color: "text-emerald-500" },
  upi:   { icon: Smartphone,  label: "UPI",           color: "text-violet-500"  },
  bank:  { icon: Building2,   label: "Bank Transfer", color: "text-blue-500"    },
  other: { icon: IndianRupee, label: "Other",         color: "text-muted-foreground" },
};

export function StaffProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [salaryHistory, setSalaryHistory] = useState<SalaryRecord[]>([]);
  const [ledgerHistory, setLedgerHistory] = useState<LedgerEntry[]>([]);
  const [currentMonthAtt, setCurrentMonthAtt] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"salary" | "attendance" | "advance">("salary");

  const [currentMonthRecord, setCurrentMonthRecord] = useState<SalaryRecord | null>(null);

  // Modals & Action states
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [isRepaymentModalOpen, setIsRepaymentModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
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

  // Pay / Generate Salary Form states
  const [genMonth, setGenMonth] = useState(getCurrentMonth());
  const [genBonus, setGenBonus] = useState("0");
  const [genExtra, setGenExtra] = useState("0");
  const [genRecoveryOption, setGenRecoveryOption] = useState<"full" | "partial" | "skip">("full");
  const [genRecoveryAmount, setGenRecoveryAmount] = useState("0");
  const [genNote, setGenNote] = useState("");

  // Salary Record payment modal states
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "upi" | "bank" | "other">("cash");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payNote, setPayNote] = useState("");
  const [selectedRecordToPay, setSelectedRecordToPay] = useState<SalaryRecord | null>(null);

  // Live salary preview states
  const [previewCalc, setPreviewCalc] = useState<ReturnType<typeof calculateSalary> | null>(null);
  const [previewDue, setPreviewDue] = useState(0);
  const [previewActualDeduct, setPreviewActualDeduct] = useState(0);
  const [previewRollover, setPreviewRollover] = useState(0);
  const [previewIsCapped, setPreviewIsCapped] = useState(false);
  const [attRecordsCount, setAttRecordsCount] = useState<Attendance[]>([]);

  const { toast } = useToast();
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    const staffId = id;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentYear = new Date().getFullYear();
    const currentMonthNum = new Date().getMonth() + 1;
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

    // Real-time subscription for salary records
    const unsubSalary = salaryService.subscribeRecordsByStaff(staffId, (records) => {
      if (active) {
        setSalaryHistory(records);
        const current = records.find(r => r.month === currentMonthNum && r.year === currentYear);
        setCurrentMonthRecord(current || null);
      }
    });

    return () => {
      active = false;
      unsubStaff();
      unsubAtt();
      unsubLedger();
      unsubSalary();
    };
  }, [id]);

  // Debounced Live Preview logic for Payroll modal
  useEffect(() => {
    if (!isPayrollModalOpen || !staff) return;
    
    let active = true;
    const run = async () => {
      try {
        const [yrStr, moStr] = genMonth.split("-");
        const year = Number(yrStr);
        const month = Number(moStr);
        const daysInMonth = new Date(year, month, 0).getDate();
        
        const [attRecords, lastUnpaid] = await Promise.all([
          attendanceService.getByStaffAndMonth(staff.id!, genMonth),
          salaryService.getLastUnpaidRecord(staff.id!, year, month)
        ]);
        
        if (!active) return;
        
        const prevDue = lastUnpaid?.remainingDue || 0;
        const outstandingBalance = staff.outstandingBalance || 0;
        
        // Calculate earnings before advance to get the max recoverable amount
        const earningsCalc = calculateSalary({
          staff,
          attendanceRecords: attRecords,
          workingDaysInMonth: daysInMonth,
          bonus: Number(genBonus) || 0,
          advance: 0,
          extraDeduction: Number(genExtra) || 0,
        });

        let requestedAdvance = 0;
        if (outstandingBalance > 0) {
          if (genRecoveryOption === "full") {
            requestedAdvance = outstandingBalance;
          } else if (genRecoveryOption === "partial") {
            requestedAdvance = Number(genRecoveryAmount) || 0;
          }
        }
        
        const maxRecoverable = Math.max(0, earningsCalc.finalSalary);
        const actualDeductedAdvance = Math.min(requestedAdvance, maxRecoverable);
        const rolloverAmount = Math.max(0, outstandingBalance - actualDeductedAdvance);
        const isCapped = requestedAdvance > actualDeductedAdvance && requestedAdvance > 0;

        const result = calculateSalary({
          staff,
          attendanceRecords: attRecords,
          workingDaysInMonth: daysInMonth,
          bonus: Number(genBonus) || 0,
          advance: actualDeductedAdvance,
          extraDeduction: Number(genExtra) || 0,
        });

        setPreviewCalc(result);
        setPreviewDue(prevDue);
        setPreviewActualDeduct(actualDeductedAdvance);
        setPreviewRollover(rolloverAmount);
        setPreviewIsCapped(isCapped);
        setAttRecordsCount(attRecords);
      } catch (e) {
        console.error("Preview calculation failed", e);
        setPreviewCalc(null);
      }
    };
    
    run();
    return () => { active = false; };
  }, [isPayrollModalOpen, genMonth, genBonus, genExtra, genRecoveryOption, genRecoveryAmount, staff]);

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

  // Ledger calculations
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

  // Status text for current month
  let statusBadgeLabel = "NOT GENERATED";
  let statusBadgeVariant: any = "secondary";
  if (currentMonthRecord) {
    if (currentMonthRecord.status === "paid") {
      statusBadgeLabel = "PAID";
      statusBadgeVariant = "success";
    } else if (currentMonthRecord.status === "partial") {
      statusBadgeLabel = "PARTIAL";
      statusBadgeVariant = "warning";
    } else {
      statusBadgeLabel = "UNPAID";
      statusBadgeVariant = "destructive";
    }
  }

  // --- Handlers ---
  const handleActionPaySalary = () => {
    if (!currentMonthRecord) {
      setGenMonth(getCurrentMonth());
      setGenBonus("0");
      setGenExtra("0");
      setGenRecoveryOption("full");
      setGenRecoveryAmount("0");
      setGenNote("");
      setIsPayrollModalOpen(true);
    } else {
      if (currentMonthRecord.status === "paid") {
        toast({ type: "success", title: "Already Paid", description: "Salary for this month is already fully paid!" });
        return;
      }
      setSelectedRecordToPay(currentMonthRecord);
      setPayAmount(String(currentMonthRecord.remainingDue));
      setPayDate(new Date().toISOString().split("T")[0]);
      setPayNote("");
      setPayMethod("cash");
      setIsPaymentModalOpen(true);
    }
  };

  const handleGenerateSalarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const [yearStr, monthStr] = genMonth.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);

      const existing = await salaryService.getExistingRecord(staff.id!, month, year);
      if (existing) {
        throw new Error(`Salary for ${staff.name} in ${formatMonth(genMonth)} already exists.`);
      }

      const daysInMonth = new Date(year, month, 0).getDate();
      const [lastUnpaid] = await Promise.all([
        salaryService.getLastUnpaidRecord(staff.id!, year, month),
      ]);

      const previousDue = lastUnpaid?.remainingDue || 0;
      const outstandingBalance = staff.outstandingBalance || 0;

      let requestedAdvance = 0;
      if (outstandingBalance > 0) {
        if (genRecoveryOption === "full") {
          requestedAdvance = outstandingBalance;
        } else if (genRecoveryOption === "partial") {
          requestedAdvance = Number(genRecoveryAmount) || 0;
        }
        requestedAdvance = Math.min(requestedAdvance, outstandingBalance);
      }

      const calc = calculateSalary({
        staff,
        attendanceRecords: attRecordsCount,
        workingDaysInMonth: daysInMonth,
        bonus: Number(genBonus) || 0,
        advance: previewActualDeduct,
        extraDeduction: Number(genExtra) || 0,
      });

      const now = new Date().toISOString();
      const pendingAdvances = await advanceService.getPendingByStaff(staff.id!);

      await salaryService.addRecord({
        staffId: staff.id!,
        month,
        year,
        baseSalary: staff.salaryType === "monthly" ? staff.monthlySalary : staff.dailyWage,
        bonus: Number(genBonus) || 0,
        advance: previewActualDeduct,
        leaveDeduction: calc.leaveDeductionAmount,
        extraDeduction: Number(genExtra) || 0,
        overtime: calc.overtimeAmount,
        grossSalary: calc.finalSalary + previewActualDeduct,
        finalSalary: calc.finalSalary,
        previousDue,
        totalPaid: 0,
        remainingDue: calc.finalSalary + previousDue,
        status: "pending",
        note: genNote,
        updatedAt: now,
      } as any, pendingAdvances);

      toast({
        type: "success",
        title: "Salary Generated",
        description: `Payroll processed successfully for ${formatMonth(genMonth)}`
      });
      setIsPayrollModalOpen(false);
    } catch (err: any) {
      toast({ type: "error", title: "Failed to generate salary", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecordToPay) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0 || amount > selectedRecordToPay.remainingDue) {
      toast({ type: "error", title: "Invalid Amount", description: `Amount must be between ₹1 and ${formatCurrency(selectedRecordToPay.remainingDue)}` });
      return;
    }
    setSaving(true);
    try {
      await salaryService.addPayment({
        salaryRecordId: selectedRecordToPay.id!,
        staffId: staff.id!,
        amountPaid: amount,
        paymentDate: payDate,
        paymentMethod: payMethod,
        note: payNote,
      });
      toast({
        type: "success",
        title: "Payment Recorded",
        description: `${formatCurrency(amount)} payment confirmed.`
      });
      setIsPaymentModalOpen(false);
    } catch (err: any) {
      toast({ type: "error", title: "Payment Failed", description: err.message });
    } finally {
      setSaving(false);
    }
  };

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

  const handleDownloadSlip = async (record: SalaryRecord) => {
    try {
      const recordPayments = await salaryService.getPaymentsForRecord(record.id!);
      const monthStr = `${record.year}-${String(record.month).padStart(2, "0")}`;
      const attRecords = await attendanceService.getByStaffAndMonth(staff.id!, monthStr);
      let w = new Date(record.year, record.month, 0).getDate(), p = 0, a = 0, h = 0;
      attRecords.forEach(att => {
        if (att.status === "present") p++;
        else if (att.status === "absent") a++;
        else if (att.status === "half_day") h++;
      });
      const { generateSalarySlip } = await import("@/services/pdf/generateSalarySlip");
      generateSalarySlip(staff, record, recordPayments, { workingDays: w, presentDays: p, absentDays: a, leaveDays: 0, halfDays: h });
    } catch {
      toast({ type: "error", title: "Could not generate slip", description: "Please try again." });
    }
  };

  const handleDownloadCurrentSlip = () => {
    const recordToDownload = currentMonthRecord || salaryHistory[0];
    if (!recordToDownload) {
      toast({ type: "error", title: "No Slip Available", description: "Process salary for this employee first." });
      return;
    }
    handleDownloadSlip(recordToDownload);
  };

  const handleDownloadReceipt = async (record: SalaryRecord, payment: SalaryPayment) => {
    const { generatePaymentReceipt } = await import("@/services/pdf/generatePaymentReceipt");
    generatePaymentReceipt(staff, record, payment);
  };

  const handleDeleteRecord = async (id: string) => {
    try {
      await salaryService.deleteRecord(id);
      toast({ type: "success", title: "Salary Record Deleted" });
    } catch {
      toast({ type: "error", title: "Delete Failed", description: "Try again." });
    } finally {
      setDeleteId(null);
    }
  };

  const handleViewLedger = () => {
    setTab("advance");
    setTimeout(() => {
      timelineRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  return (
    <div className="space-y-5 pb-20 lg:pb-6">
      <button onClick={() => navigate("/staff")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Staff List
      </button>

      {/* SECTION 1 — EMPLOYEE HEADER */}
      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${generateAvatarColor(staff.name)} flex items-center justify-center text-white text-xl font-bold shadow-lg shrink-0`}>
                {getInitials(staff.name)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-white truncate">{staff.name}</h1>
                  <Badge variant={staff.status === "active" ? "success" : "secondary"}>{staff.status}</Badge>
                  <Badge variant="secondary" className="capitalize">{staff.salaryType}</Badge>
                </div>
                <p className="text-muted-foreground text-xs capitalize mt-1 font-semibold">{staff.role}</p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" />{staff.phone}</p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 shrink-0" />Joined: {staff.joiningDate ? formatDate(staff.joiningDate) : "N/A"} ({calculateTenure(staff.joiningDate)})</p>
              </div>
            </div>

            {/* Attendance & Stats summary in header */}
            <div className="flex gap-4 self-stretch md:self-auto justify-between md:justify-end border-t md:border-t-0 pt-4 md:pt-0 border-glass-border">
              <div className="text-left md:text-right">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Attendance %</p>
                <p className="text-xl font-extrabold text-white mt-0.5">{attendanceRate}%</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{presentDays}d present this month</p>
              </div>
            </div>
          </div>

          {/* Quick Badges Info */}
          <div className="grid grid-cols-3 gap-3 mt-6 border-t border-glass-border pt-5">
            <div className="bg-glass-bg rounded-xl p-3 text-center border border-glass-border">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Wage</p>
              <p className="text-sm font-extrabold text-foreground mt-1 truncate">
                {staff.salaryType === "monthly" ? formatCurrency(staff.monthlySalary) : formatCurrency(staff.dailyWage)}
              </p>
              <span className="text-[10px] text-muted-foreground font-semibold">{staff.salaryType === "monthly" ? "/month" : "/day"}</span>
            </div>
            <div className="bg-glass-bg rounded-xl p-3 text-center border border-glass-border">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Outstanding Advance</p>
              <p className="text-sm font-extrabold text-amber-500 mt-1 truncate">{formatCurrency(outstanding)}</p>
              <span className="text-[10px] text-muted-foreground font-semibold">Ledger Dues</span>
            </div>
            <div className="bg-glass-bg rounded-xl p-3 text-center border border-glass-border">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Current Month Status</p>
              <div className="mt-1">
                <Badge variant={statusBadgeVariant} className="text-[10px] font-bold uppercase tracking-wider">
                  {statusBadgeLabel}
                </Badge>
              </div>
              <span className="text-[10px] text-muted-foreground font-semibold">{formatMonth(getCurrentMonth())}</span>
            </div>
          </div>

          {/* REQUIRED ACTION BUTTONS */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-5 pt-1">
            <Button
              onClick={handleActionPaySalary}
              className="h-10 text-xs font-bold gap-1.5 shadow-md shadow-indigo-500/10"
            >
              {currentMonthRecord ? <HandCoins className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
              {currentMonthRecord ? "Pay Payout" : "Pay Salary"}
            </Button>
            <Button
              onClick={() => {
                setAdvDate(new Date().toISOString().split("T")[0]);
                setIsAdvanceModalOpen(true);
              }}
              variant="outline"
              className="h-10 text-xs font-bold bg-rose-500/5 hover:bg-rose-500/15 border-rose-500/20 text-rose-400 gap-1.5"
            >
              <TrendingUp className="h-4 w-4" />
              Give Advance
            </Button>
            <Button
              onClick={() => {
                setRepDate(new Date().toISOString().split("T")[0]);
                setIsRepaymentModalOpen(true);
              }}
              variant="outline"
              className="h-10 text-xs font-bold bg-emerald-500/5 hover:bg-emerald-500/15 border-emerald-500/20 text-emerald-400 gap-1.5"
            >
              <TrendingDown className="h-4 w-4" />
              Repayment
            </Button>
            <Button
              onClick={handleDownloadCurrentSlip}
              variant="outline"
              className="h-10 text-xs font-bold gap-1.5"
            >
              <FileText className="h-4 w-4" />
              Generate Slip
            </Button>
            <Button
              onClick={handleViewLedger}
              variant="outline"
              className="h-10 text-xs font-bold col-span-2 sm:col-span-1 gap-1.5"
            >
              <History className="h-4 w-4" />
              View Ledger
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap rounded-xl bg-muted p-1 gap-1">
        {(["salary", "attendance", "advance"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 min-w-[100px] py-2.5 text-xs font-bold rounded-lg capitalize transition-all ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "salary" ? "💰 Salary Workspace" : t === "attendance" ? "📋 Attendance Summary" : "💸 Advance & Ledger"}
          </button>
        ))}
      </div>

      {/* SECTION 2 — SALARY WORKSPACE */}
      {tab === "salary" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* REQUIRED FINANCIAL SUMMARY CARD */}
          <Card className="glass-card border-indigo-500/25 shadow-xl shadow-indigo-500/5 overflow-hidden">
            <CardHeader className="pb-3 border-b border-glass-border flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Payroll Summary — {formatMonth(getCurrentMonth())}
              </CardTitle>
              {currentMonthRecord && (
                <Badge variant={statusBadgeVariant}>{currentMonthRecord.status.toUpperCase()}</Badge>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {currentMonthRecord ? (
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="bg-glass-bg border border-glass-border p-3.5 rounded-xl text-center">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Gross Salary</p>
                      <p className="text-base font-extrabold text-white mt-1">
                        {formatCurrency(currentMonthRecord.grossSalary ?? (currentMonthRecord.baseSalary + currentMonthRecord.overtime + currentMonthRecord.bonus - currentMonthRecord.extraDeduction - currentMonthRecord.leaveDeduction))}
                      </p>
                    </div>
                    <div className="bg-glass-bg border border-glass-border p-3.5 rounded-xl text-center">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Outstanding Advance</p>
                      <p className="text-base font-extrabold text-amber-400 mt-1">
                        {formatCurrency(currentMonthRecord.outstandingBefore ?? 0)}
                      </p>
                    </div>
                    <div className="bg-rose-500/10 border border-rose-500/20 p-3.5 rounded-xl text-center">
                      <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Recovered This Month</p>
                      <p className="text-base font-extrabold text-rose-400 mt-1">
                        -{formatCurrency(currentMonthRecord.recoveredAmount ?? currentMonthRecord.advance)}
                      </p>
                    </div>
                    <div className="bg-glass-bg border border-glass-border p-3.5 rounded-xl text-center">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Remaining Outstanding</p>
                      <p className="text-base font-extrabold text-white mt-1">
                        {formatCurrency(currentMonthRecord.outstandingAfter ?? 0)}
                      </p>
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-3.5 rounded-xl text-center col-span-2 sm:col-span-1">
                      <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Final Payable</p>
                      <p className="text-base font-extrabold text-emerald-400 mt-1">
                        {formatCurrency(currentMonthRecord.finalSalary)}
                      </p>
                    </div>
                  </div>

                  {/* Payment progress */}
                  <div className="bg-[#0b0e14]/50 border border-glass-border p-4 rounded-xl space-y-3">
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span className="text-muted-foreground">Salary Paid: {formatCurrency(currentMonthRecord.totalPaid)} / {formatCurrency(currentMonthRecord.finalSalary)}</span>
                      <span className="text-emerald-400 font-bold">{Math.round((currentMonthRecord.totalPaid / (currentMonthRecord.finalSalary || 1)) * 100)}% Complete</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" style={{ width: `${(currentMonthRecord.totalPaid / (currentMonthRecord.finalSalary || 1)) * 100}%` }} />
                    </div>
                    {currentMonthRecord.status !== "paid" && (
                      <div className="flex justify-end pt-1">
                        <Button size="sm" onClick={handleActionPaySalary} className="h-8 text-xs font-bold gap-1">
                          <HandCoins className="h-3.5 w-3.5" /> Record Payment
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground space-y-3">
                  <p className="text-sm">No payroll record processed for {formatMonth(getCurrentMonth())} yet.</p>
                  <Button onClick={handleActionPaySalary} className="gap-2 mx-auto text-xs font-bold">
                    <Coins className="h-4 w-4" /> Process & Pay Salary
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Salary History */}
          <Card className="glass-card">
            <CardHeader className="pb-3 border-b border-glass-border">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                Historical Salary Payslips
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {salaryHistory.length === 0 ? (
                <p className="text-center text-muted-foreground py-10 text-xs">No salary payments on record yet.</p>
              ) : (
                <div className="divide-y divide-glass-border">
                  {salaryHistory.map((s) => (
                    <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 hover:bg-glass-bg/30 transition-colors">
                      <div>
                        <p className="text-sm font-bold text-foreground">{formatMonth(`${s.year}-${s.month.toString().padStart(2, "0")}`)}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-1 text-[11px] text-muted-foreground">
                          <span>Base: {formatCurrency(s.baseSalary)}</span>
                          {s.bonus > 0 && <span>• Bonus: {formatCurrency(s.bonus)}</span>}
                          {s.overtime > 0 && <span>• OT: {formatCurrency(s.overtime)}</span>}
                          {s.advance > 0 && <span>• Advance Rec: {formatCurrency(s.advance)}</span>}
                          {s.extraDeduction > 0 && <span>• Extra Ded: {formatCurrency(s.extraDeduction)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        <div className="text-left sm:text-right shrink-0">
                          <p className="text-sm font-black text-white">{formatCurrency(s.finalSalary)}</p>
                          <Badge variant={s.status === "paid" ? "success" : s.status === "partial" ? "warning" : "destructive"} className="text-[10px] uppercase font-bold tracking-widest scale-90 -translate-x-1 sm:translate-x-0 mt-0.5">
                            {s.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => handleDownloadSlip(s)} className="h-8 px-2 text-xs gap-1">
                            <Download className="h-3.5 w-3.5" /> Slip
                          </Button>
                          <button onClick={() => setDeleteId(s.id!)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* SECTION 5 — ATTENDANCE SUMMARY */}
      {tab === "attendance" && (
        <Card className="glass-card animate-in fade-in duration-200">
          <CardHeader><CardTitle className="text-sm font-bold flex items-center gap-2"><CalendarCheck className="h-4 w-4 text-emerald-400" /> Attendance Statistics</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3.5 text-center">
                <p className="text-xs text-muted-foreground">Present</p>
                <p className="text-2xl font-extrabold text-emerald-400 mt-1">{presentDays}</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 text-center">
                <p className="text-xs text-muted-foreground">Absent</p>
                <p className="text-2xl font-extrabold text-red-400 mt-1">{absentDays}</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 text-center">
                <p className="text-xs text-muted-foreground">Half Day</p>
                <p className="text-2xl font-extrabold text-amber-400 mt-1">{halfDays}</p>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Attendance Calendar Grid</p>
              <div className="grid grid-cols-7 gap-1.5">
                {currentMonthAtt.slice(0, 31).map((a) => (
                  <div key={a.id || a.date} title={`${a.date}: ${a.status}`} className={`aspect-square rounded-xl text-xs flex items-center justify-center font-bold ${
                    a.status === "present" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                    a.status === "absent" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                    a.status === "half_day" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                    "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  }`}>
                    {parseInt(a.date.slice(8))}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION 3 — ADVANCE / RECOVERY SYSTEM & SECTION 4 TIMELINE */}
      {tab === "advance" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Summary Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
                  className="flex-1 min-w-[120px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 h-9 text-xs font-bold gap-1.5"
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
          <Card className="glass-card" ref={timelineRef}>
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

      {/* ── PAYROLL MODAL ── */}
      <Modal open={isPayrollModalOpen} onClose={() => setIsPayrollModalOpen(false)} title="Process Monthly Salary">
        <form onSubmit={handleGenerateSalarySubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Salary Month *</label>
              <input
                type="month"
                required
                value={genMonth}
                onChange={(e) => setGenMonth(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Bonus (₹)</label>
              <Input
                type="number"
                min={0}
                value={genBonus}
                onChange={(e) => setGenBonus(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Extra Deduction (₹)</label>
              <Input
                type="number"
                min={0}
                value={genExtra}
                onChange={(e) => setGenExtra(e.target.value)}
                placeholder="0"
              />
            </div>

            {/* Advance recovery configuration (Only shown if ledger debt > 0) */}
            {outstanding > 0 && (
              <div className="col-span-2 p-3.5 bg-indigo-500/5 rounded-xl border border-glass-border space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Rolling Advance Recovery</span>
                  <Badge variant="destructive" className="font-extrabold text-xs">
                    Debt: {formatCurrency(outstanding)}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  {(["full", "partial", "skip"] as const).map(option => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setGenRecoveryOption(option)}
                      className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all ${genRecoveryOption === option ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400" : "bg-card border-border text-muted-foreground hover:bg-muted"}`}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider">{option} Recovery</span>
                      <span className="text-[9px] opacity-75 mt-0.5">
                        {option === "full" ? formatCurrency(outstanding) : option === "partial" ? "Choose" : "₹0"}
                      </span>
                    </button>
                  ))}
                </div>

                {genRecoveryOption === "partial" && (
                  <div className="pt-1.5">
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Recovery Amount (₹)</label>
                    <Input
                      type="number"
                      min={0}
                      max={outstanding}
                      value={genRecoveryAmount}
                      onChange={(e) => setGenRecoveryAmount(e.target.value)}
                      placeholder="Enter amount..."
                    />
                  </div>
                )}
              </div>
            )}

            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Optional Remarks / Note</label>
              <Input
                value={genNote}
                onChange={(e) => setGenNote(e.target.value)}
                placeholder="Remarks..."
              />
            </div>
          </div>

          {/* Live calculation preview inside modal */}
          {previewCalc && (
            <div className="bg-muted/40 rounded-xl p-4 border border-glass-border space-y-1.5 animate-in fade-in">
              <div className="flex items-center gap-2 mb-2">
                <Coins className="h-4 w-4 text-indigo-400" />
                <p className="text-xs font-bold text-foreground">Calculated Breakdown Preview</p>
              </div>
              {previewCalc.breakdown.map((b, i) => (
                <p key={i} className="text-xs text-muted-foreground">{b}</p>
              ))}
              {previewDue > 0 && (
                <p className="text-xs text-amber-500">Previous Pending Due: +{formatCurrency(previewDue)}</p>
              )}
              {previewIsCapped && (
                <div className="mt-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[10px] text-amber-500 leading-normal">
                  <span className="font-bold">Cap Notice:</span> Recovery capped to {formatCurrency(previewActualDeduct)} to maintain positive payout. Remaining {formatCurrency(previewRollover)} carried forward.
                </div>
              )}
              <div className="border-t border-glass-border pt-2 mt-2 space-y-1">
                <p className="text-xs text-muted-foreground">Earnings Net: {formatCurrency(previewCalc.finalSalary)}</p>
                <p className="text-sm font-extrabold text-indigo-400">
                  Total Payable Payout: {formatCurrency(previewCalc.finalSalary + previewDue)}
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setIsPayrollModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : "Generate & Confirm"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── RECORD PAYMENT MODAL ── */}
      <Modal open={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title="Record Salary Payout Payment">
        <form onSubmit={handleRecordPaymentSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-foreground">Amount (₹) *</label>
              {selectedRecordToPay && (
                <button
                  type="button"
                  onClick={() => setPayAmount(String(selectedRecordToPay.remainingDue))}
                  className="text-xs text-primary hover:underline font-bold"
                >
                  Pay Full Balance ({formatCurrency(selectedRecordToPay.remainingDue)})
                </button>
              )}
            </div>
            <Input
              type="number"
              min={1}
              required
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Payment Method *</label>
            <div className="grid grid-cols-4 gap-2">
              {(["cash", "upi", "bank", "other"] as const).map(method => {
                const mi = PAY_METHOD_ICONS[method];
                const Icon = mi.icon;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPayMethod(method)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${payMethod === method ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"}`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] font-bold">{mi.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Payment Date *</label>
            <Input
              type="date"
              required
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Note / Reference</label>
            <Input
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="e.g. Transaction ID, remarks..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setIsPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : "Confirm Payout"}
            </Button>
          </div>
        </form>
      </Modal>

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

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDeleteRecord(deleteId)}
        title="Delete Salary Record"
        description="Permanently delete this salary slip and rollback advance recovery. This cannot be undone."
        confirmText="Delete"
      />
    </div>
  );
}
