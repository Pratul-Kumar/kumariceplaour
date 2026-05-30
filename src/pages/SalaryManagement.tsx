import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, Trash2, FileText, Download, HandCoins,
  Calculator, ChevronDown, ChevronUp,
  IndianRupee, Banknote, Smartphone, Building2, FileDown
} from "lucide-react";
import { Button, Input, Card, CardContent, Badge, EmptyState, Spinner, Skeleton } from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { staffService, salaryService, attendanceService, advanceService } from "@/services";
import { type Staff, type SalaryRecord, type SalaryPayment, type AdvanceRecord, calculateSalary } from "@/types";
import { formatCurrency, formatMonth, getCurrentMonth, formatDate } from "@/lib/utils";

// ─── Schemas ─────────────────────────────────────────────────────────────────
const salarySchema = z.object({
  staffId: z.string().min(1, "Select a staff member"),
  month: z.string().min(1, "Month required"),
  bonus: z.preprocess((v) => Number(v) || 0, z.number().min(0)).default(0),
  advance: z.preprocess((v) => Number(v) || 0, z.number().min(0)).default(0),
  recoveryOption: z.enum(["full", "partial", "skip"]).default("full"),
  recoveryAmount: z.preprocess((v) => Number(v) || 0, z.number().min(0)).default(0),
  extraDeduction: z.preprocess((v) => Number(v) || 0, z.number().min(0)).default(0),
  note: z.string().optional(),
});
type SalaryFormData = z.infer<typeof salarySchema>;

const paymentSchema = z.object({
  amountPaid: z.preprocess((v) => Number(v) || 0, z.number().min(1, "Enter a valid amount")),
  paymentMethod: z.enum(["cash", "upi", "bank", "other"]),
  paymentDate: z.string().min(1, "Date required"),
  note: z.string().optional(),
});
type PaymentFormData = z.infer<typeof paymentSchema>;

// ─── Payment method display helpers ──────────────────────────────────────────
const PAY_METHOD_ICONS: Record<string, { icon: any; label: string; color: string }> = {
  cash:  { icon: Banknote,    label: "Cash",          color: "text-emerald-500" },
  upi:   { icon: Smartphone,  label: "UPI",           color: "text-violet-500"  },
  bank:  { icon: Building2,   label: "Bank Transfer", color: "text-blue-500"    },
  other: { icon: IndianRupee, label: "Other",         color: "text-muted-foreground" },
};

// ─── Salary Record Card ───────────────────────────────────────────────────────
function SalaryCard({
  record,
  staffName,
  onPay,
  onDelete,
  onDownloadSlip,
  onDownloadReceipt,
}: {
  record: SalaryRecord;
  staffName: string;
  onPay: (r: SalaryRecord) => void;
  onDelete: (id: string) => void;
  onDownloadSlip: (r: SalaryRecord) => void;
  onDownloadReceipt: (r: SalaryRecord, p: SalaryPayment) => void;
}) {
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [expanded, setExpanded] = useState(false);

  // Live subscription per record — real-time cross-device payment sync
  useEffect(() => {
    if (!record.id) return;
    const unsub = salaryService.subscribePaymentsByRecord(record.id, setPayments);
    return () => unsub();
  }, [record.id]);

  const totalDue = record.finalSalary + (record.previousDue || 0);
  const paidPct  = totalDue > 0 ? Math.min(100, (record.totalPaid / totalDue) * 100) : 0;

  const statusColor = record.status === "paid"
    ? "success"
    : record.remainingDue < 0 
      ? "destructive"
      : record.status === "partial"
        ? "warning"
        : "destructive";

  const methodInfo = (m: string) => PAY_METHOD_ICONS[m] || PAY_METHOD_ICONS.other;

  return (
    <Card className="group glass-card overflow-hidden">
      <CardContent className="p-0">
        {/* ── Top bar ──────────────────────────────────────────── */}
        <div className="p-4 sm:p-5">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-base font-bold text-foreground">{staffName}</p>
                <Badge variant={statusColor} className="text-[10px] font-bold uppercase tracking-wide">
                  {record.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatMonth(`${record.year}-${String(record.month).padStart(2, "0")}`)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {record.status !== "paid" && (
                <Button
                  size="sm"
                  onClick={() => onPay(record)}
                  className="h-8 px-3 text-xs gap-1.5"
                >
                  <HandCoins className="h-3.5 w-3.5" />
                  Pay
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDownloadSlip(record)}
                className="h-8 px-2.5 text-xs gap-1"
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Slip</span>
              </Button>
              <button
                onClick={() => onDelete(record.id!)}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Salary breakdown grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-glass-bg rounded-xl p-3 border border-glass-border">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Base Salary</p>
              <p className="text-sm font-bold text-foreground">{formatCurrency(record.baseSalary)}</p>
            </div>
            {record.previousDue > 0 && (
              <div className="bg-amber-500/10 rounded-xl p-3 border border-amber-500/20">
                <p className="text-[10px] font-bold text-amber-500/70 uppercase tracking-widest mb-0.5">Previous Due</p>
                <p className="text-sm font-bold text-amber-400">+{formatCurrency(record.previousDue)}</p>
              </div>
            )}
            <div className="bg-glass-bg rounded-xl p-3 border border-glass-border">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Net Payable</p>
              <p className="text-sm font-bold text-foreground">{formatCurrency(totalDue)}</p>
            </div>
            <div className="bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20">
              <p className="text-[10px] font-bold text-emerald-500/70 uppercase tracking-widest mb-0.5">Paid</p>
              <p className="text-sm font-bold text-emerald-400">{formatCurrency(record.totalPaid)}</p>
            </div>
            <div className={`rounded-xl p-3 border ${record.remainingDue > 0 ? "bg-red-500/10 border-red-500/20" : "bg-emerald-500/10 border-emerald-500/20"}`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${record.remainingDue > 0 ? "text-muted-foreground" : record.remainingDue < 0 ? "text-orange-500/70" : "text-emerald-500/70"}`}>
                {record.remainingDue > 0 ? "Remaining" : record.remainingDue < 0 ? "Owes Company" : "Settled"}
              </p>
              <p className={`text-sm font-bold ${record.remainingDue > 0 ? "text-red-400" : record.remainingDue < 0 ? "text-orange-400" : "text-emerald-400"}`}>
                {record.remainingDue < 0 ? "-" : ""}{formatCurrency(Math.abs(record.remainingDue))}
              </p>
            </div>
          </div>

          {/* Payment progress bar */}
          <div className="mb-1">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>Payment Progress</span>
              <span>{paidPct.toFixed(0)}% paid</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${paidPct >= 100 ? "bg-emerald-500" : paidPct > 0 ? "bg-amber-500" : "bg-muted-foreground/30"}`}
                style={{ width: `${paidPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* ── Payment History (collapsible) ──────────────────── */}
        <div className="border-t border-glass-border">
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-between px-4 sm:px-5 py-3 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-glass-bg transition-colors"
          >
            <span>
              {payments.length > 0
                ? `${payments.length} payment${payments.length > 1 ? "s" : ""} recorded`
                : "No payments yet"}
            </span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {expanded && (
            <div className="px-4 sm:px-5 pb-4 space-y-2">
              {payments.length === 0 ? (
                <p className="text-xs font-medium text-muted-foreground text-center py-3">No payments recorded yet.</p>
              ) : (
                payments.map((p, idx) => {
                  const mi = methodInfo(p.paymentMethod);
                  const Icon = mi.icon;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-3 bg-glass-bg border border-glass-border rounded-xl hover:bg-glass-bg transition-colors"
                    >
                      {/* Timeline dot */}
                      <div className="relative flex flex-col items-center shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-[#0B0F19] border border-glass-border ${record.status === "paid" && idx === 0 ? "shadow-[0_0_10px_rgba(16,185,129,0.3)] border-emerald-500/50" : ""}`}>
                          <Icon className={`h-3.5 w-3.5 ${mi.color}`} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-foreground">{formatCurrency(p.amountPaid)}</p>
                          <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground bg-glass-bg px-2 py-0.5 rounded-full border border-glass-border">
                            {mi.label}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-muted-foreground">{formatDate(p.paymentDate)}</p>
                        {p.note && <p className="text-xs text-muted-foreground italic mt-0.5 truncate">{p.note}</p>}
                      </div>
                      <button
                        onClick={() => onDownloadReceipt(record, p)}
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors shrink-0"
                        title="Download Receipt"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function SalaryManagement() {
  const [records,   setRecords]   = useState<SalaryRecord[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth());

  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [paymentModalOpen,  setPaymentModalOpen]  = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<SalaryRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewCalc, setPreviewCalc] = useState<ReturnType<typeof calculateSalary> | null>(null);
  const [previewDue, setPreviewDue] = useState(0); // previous due shown in preview
  const [previewActualDeduct, setPreviewActualDeduct] = useState(0);
  const [previewRollover, setPreviewRollover] = useState(0);
  const [outstandingRecovery, setOutstandingRecovery] = useState(0);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  // ── Forms ──
  const {
    register: regGen, handleSubmit: handleGenSubmit,
    reset: resetGen, watch: watchGen, setValue: setGenValue,
    formState: { errors: errGen },
  } = useForm<SalaryFormData>({
    resolver: zodResolver(salarySchema),
    defaultValues: { month: getCurrentMonth(), bonus: 0, advance: 0, recoveryOption: "full", recoveryAmount: 0, extraDeduction: 0 },
  });

  const {
    register: regPay, handleSubmit: handlePaySubmit,
    reset: resetPay, setValue: setPayValue,
    formState: { errors: errPay },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { paymentMethod: "cash", paymentDate: new Date().toISOString().split("T")[0] },
  });

  const watchedStaffId = watchGen("staffId");
  const watchedMonth   = watchGen("month");
  const watchedBonus   = watchGen("bonus");
  const watchedAdvance = watchGen("advance");
  const watchedRecoveryOption = watchGen("recoveryOption");
  const watchedRecoveryAmount = watchGen("recoveryAmount");
  const watchedExtra   = watchGen("extraDeduction");

  // ── Staff subscription (stable) ──
  useEffect(() => {
    const unsub = staffService.subscribeAll(setStaffList);
    return () => unsub();
  }, []);

  // ── Salary records subscription for selected month ──
  useEffect(() => {
    setLoading(true);
    let active = true;
    const [yearStr, monthStr] = filterMonth.split("-");
    const unsub = salaryService.subscribeByMonth(Number(monthStr), Number(yearStr), (data) => {
      if (active) { setRecords(data); setLoading(false); }
    });
    return () => { active = false; unsub(); };
  }, [filterMonth]);

  // ── Live salary preview (debounced 400ms) ──
  useEffect(() => {
    if (!watchedStaffId || !watchedMonth) {
      setPreviewCalc(null);
      setPreviewActualDeduct(0);
      setPreviewRollover(0);
      return;
    }
    const staff = staffList.find(s => s.id === watchedStaffId);
    if (!staff) return;

    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try {
        const [yrStr, moStr] = watchedMonth.split("-");
        const daysInMonth = new Date(Number(yrStr), Number(moStr), 0).getDate();
        const [attRecords, lastUnpaid, pendingAdvances] = await Promise.all([
          attendanceService.getByStaffAndMonth(watchedStaffId, watchedMonth),
          salaryService.getLastUnpaidRecord(watchedStaffId, Number(yrStr), Number(moStr)),
          advanceService.getPendingByStaff(watchedStaffId)
        ]);
        const prevDue = lastUnpaid?.remainingDue || 0;
        const autoAdvanceAmount = pendingAdvances.reduce((sum, a) => sum + a.amount, 0);
        
        // Auto-fill advance field if it's 0 to show the recovered amount
        if (Number(watchedAdvance) === 0 && autoAdvanceAmount > 0) {
          setGenValue("advance", autoAdvanceAmount);
        }

        // Calculate earnings before advance to get the max recoverable amount
        const earningsCalc = calculateSalary({
          staff,
          attendanceRecords: attRecords,
          workingDaysInMonth: daysInMonth,
          bonus: Number(watchedBonus) || 0,
          advance: 0,
          extraDeduction: Number(watchedExtra) || 0,
        });

        setOutstandingRecovery(autoAdvanceAmount);

        let requestedAdvance = 0;
        if (autoAdvanceAmount > 0) {
          if (watchedRecoveryOption === "full") {
            requestedAdvance = autoAdvanceAmount;
          } else if (watchedRecoveryOption === "partial") {
            requestedAdvance = Number(watchedRecoveryAmount) || 0;
          }
        } else {
          requestedAdvance = Number(watchedAdvance) || 0;
        }

        const maxRecoverable = Math.max(0, earningsCalc.finalSalary);
        const actualDeductedAdvance = Math.min(requestedAdvance, maxRecoverable);
        const rolloverAmount = Math.max(0, autoAdvanceAmount - actualDeductedAdvance);

        const result = calculateSalary({
          staff,
          attendanceRecords: attRecords,
          workingDaysInMonth: daysInMonth,
          bonus: Number(watchedBonus) || 0,
          advance: actualDeductedAdvance,
          extraDeduction: Number(watchedExtra) || 0,
        });

        setPreviewCalc(result);
        setPreviewDue(prevDue);
        setPreviewActualDeduct(actualDeductedAdvance);
        setPreviewRollover(rolloverAmount);
      } catch {
        // Preview errors are non-critical — just clear it
        setPreviewCalc(null);
        setPreviewActualDeduct(0);
        setPreviewRollover(0);
        setOutstandingRecovery(0);
      }
    }, 400);
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [watchedStaffId, watchedMonth, watchedBonus, watchedAdvance, watchedRecoveryOption, watchedRecoveryAmount, watchedExtra, staffList]);

  // ── Totals ──
  const { totalPaid, totalDue } = useMemo(() => ({
    totalPaid: records.reduce((s, r) => s + r.totalPaid, 0),
    totalDue:  records.reduce((s, r) => s + r.remainingDue, 0),
  }), [records]);

  // ── Handlers ──
  const openGenerate = useCallback(() => {
    setPreviewCalc(null); setPreviewDue(0); setOutstandingRecovery(0);
    resetGen({ month: filterMonth, bonus: 0, advance: 0, recoveryOption: "full", recoveryAmount: 0, extraDeduction: 0 });
    setGenerateModalOpen(true);
  }, [filterMonth, resetGen]);

  const openPayment = useCallback((record: SalaryRecord) => {
    setSelectedRecord(record);
    resetPay({ paymentMethod: "cash", paymentDate: new Date().toISOString().split("T")[0] });
    setPayValue("amountPaid", record.remainingDue);
    setPaymentModalOpen(true);
  }, [resetPay, setPayValue]);

  const onGenerate = async (data: SalaryFormData) => {
    setSaving(true);
    try {
      const staff = staffList.find(s => s.id === data.staffId);
      if (!staff) throw new Error("Staff not found");

      const [yearStr, monthStr] = data.month.split("-");
      const year  = Number(yearStr);
      const month = Number(monthStr);

      // ── Duplicate check ──
      const existing = await salaryService.getExistingRecord(data.staffId, month, year);
      if (existing) {
        throw new Error(`Salary for ${staff.name} in ${formatMonth(data.month)} already exists.`);
      }

      const daysInMonth = new Date(year, month, 0).getDate();
      const [attRecords, lastUnpaid, pendingAdvances] = await Promise.all([
        attendanceService.getByStaffAndMonth(data.staffId, data.month),
        salaryService.getLastUnpaidRecord(data.staffId, year, month),
        advanceService.getPendingByStaff(data.staffId)
      ]);

      const previousDue = lastUnpaid?.remainingDue || 0;
      const autoAdvanceAmount = pendingAdvances.reduce((sum, a) => sum + a.amount, 0);

      // Calculate earnings before advance to get the max recoverable amount
      const earningsCalc = calculateSalary({
        staff,
        attendanceRecords: attRecords,
        workingDaysInMonth: daysInMonth,
        bonus: data.bonus,
        advance: 0,
        extraDeduction: data.extraDeduction,
      });

      let requestedAdvance = 0;
      if (autoAdvanceAmount > 0) {
        if (data.recoveryOption === "full") {
          requestedAdvance = autoAdvanceAmount;
        } else if (data.recoveryOption === "partial") {
          requestedAdvance = data.recoveryAmount || 0;
        }
        requestedAdvance = Math.min(requestedAdvance, autoAdvanceAmount);
      } else {
        requestedAdvance = data.advance || 0;
      }

      const maxRecoverable = Math.max(0, earningsCalc.finalSalary);
      const actualDeductedAdvance = Math.min(requestedAdvance, maxRecoverable);

      const calc = calculateSalary({
        staff,
        attendanceRecords: attRecords,
        workingDaysInMonth: daysInMonth,
        bonus: data.bonus,
        advance: actualDeductedAdvance,
        extraDeduction: data.extraDeduction,
      });

      const now = new Date().toISOString();
      await salaryService.addRecord({
        staffId: data.staffId,
        month,
        year,
        baseSalary: staff.salaryType === "monthly" ? staff.monthlySalary : staff.dailyWage,
        bonus: data.bonus,
        advance: actualDeductedAdvance,
        leaveDeduction: calc.leaveDeductionAmount,
        extraDeduction: data.extraDeduction,
        overtime: calc.overtimeAmount,
        finalSalary: calc.finalSalary,
        previousDue,
        totalPaid: 0,
        remainingDue: calc.finalSalary + previousDue,
        status: "pending",
        note: data.note,
        updatedAt: now,
      } as any, pendingAdvances);

      toast({
        type: "success",
        title: "Salary Generated",
        description: `${formatCurrency(calc.finalSalary + previousDue)} payable for ${staff.name}${previousDue > 0 ? ` (incl. ₹${previousDue} prev. due)` : ""}`,
      });
      setGenerateModalOpen(false);
    } catch (e: any) {
      toast({ type: "error", title: "Generation Failed", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const onPayment = async (data: PaymentFormData) => {
    if (!selectedRecord) return;
    setSaving(true);
    try {
      if (data.amountPaid > selectedRecord.remainingDue) {
        throw new Error(`Amount exceeds remaining due of ${formatCurrency(selectedRecord.remainingDue)}`);
      }
      await salaryService.addPayment({
        salaryRecordId: selectedRecord.id!,
        staffId: selectedRecord.staffId,
        amountPaid: data.amountPaid,
        paymentDate: data.paymentDate,
        paymentMethod: data.paymentMethod,
        note: data.note,
      });
      toast({
        type: "success",
        title: "Payment Recorded",
        description: `${formatCurrency(data.amountPaid)} via ${PAY_METHOD_ICONS[data.paymentMethod]?.label || data.paymentMethod}`,
      });
      setPaymentModalOpen(false);
    } catch (e: any) {
      toast({ type: "error", title: "Payment Failed", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await salaryService.deleteRecord(id);
      toast({ type: "success", title: "Record Deleted" });
    } catch {
      toast({ type: "error", title: "Delete Failed", description: "Please try again." });
    } finally {
      setDeleteId(null);
    }
  };

  const downloadSlip = async (record: SalaryRecord) => {
    const staff = staffList.find(s => s.id === record.staffId);
    if (!staff) return;
    try {
      const payments  = await salaryService.getPaymentsForRecord(record.id!);
      const monthStr  = `${record.year}-${String(record.month).padStart(2, "0")}`;
      const attRecords = await attendanceService.getByStaffAndMonth(staff.id!, monthStr);
      let w = new Date(record.year, record.month, 0).getDate(), p = 0, a = 0, h = 0;
      attRecords.forEach(att => {
        if (att.status === "present") p++;
        else if (att.status === "absent") a++;
        else if (att.status === "half_day") h++;
      });
      const { generateSalarySlip } = await import("@/services/pdf/generateSalarySlip");
      generateSalarySlip(staff, record, payments, { workingDays: w, presentDays: p, absentDays: a, leaveDays: 0, halfDays: h });
    } catch {
      toast({ type: "error", title: "Could not generate slip", description: "Try again." });
    }
  };

  const downloadReceipt = async (record: SalaryRecord, payment: SalaryPayment) => {
    const staff = staffList.find(s => s.id === record.staffId);
    if (!staff) return;
    const { generatePaymentReceipt } = await import("@/services/pdf/generatePaymentReceipt");
    generatePaymentReceipt(staff, record, payment);
  };

  const downloadMonthlyReport = async () => {
    if (records.length === 0) {
      toast({ type: "error", title: "No records", description: "Generate salary records first." });
      return;
    }
    try {
      const { generateMonthlySalaryReport } = await import("@/services/pdf/generateMonthlySalaryReport");
      generateMonthlySalaryReport(filterMonth, records, staffList);
      toast({ type: "success", title: "Report exported", description: `${formatMonth(filterMonth)} salary report downloaded.` });
    } catch (e: any) {
      toast({ type: "error", title: "Export failed", description: e?.message || "Try again." });
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-24 lg:pb-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Salary Ledger</h1>
          <p className="text-sm text-muted-foreground">{records.length} records · {formatMonth(filterMonth)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={downloadMonthlyReport}
            className="gap-2 h-9 px-3 text-sm"
            title="Export monthly salary report as PDF"
          >
            <FileDown className="h-4 w-4" />
            <span className="hidden sm:inline">Export PDF</span>
          </Button>
          <Button onClick={openGenerate} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Generate</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      {/* Month filter */}
      <div className="relative inline-block">
        <input
          type="month"
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          className="flex h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-44"
        />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4">
        <Card className="glass-card"><CardContent className="p-4 sm:p-5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Total Records</p>
          <p className="text-2xl font-bold text-foreground">{records.length}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 sm:p-5">
          <p className="text-[10px] font-bold text-emerald-500/70 uppercase tracking-widest mb-1">Total Paid</p>
          <p className="text-2xl font-bold text-emerald-400 text-gradient from-emerald-400 to-teal-400">{formatCurrency(totalPaid)}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 sm:p-5">
          <p className="text-[10px] font-bold text-red-500/70 uppercase tracking-widest mb-1">Still Due</p>
          <p className="text-2xl font-bold text-red-400 text-gradient from-red-400 to-rose-400">{formatCurrency(totalDue)}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 sm:p-5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Fully Paid</p>
          <p className="text-2xl font-bold text-foreground">{records.filter(r => r.status === "paid").length}<span className="text-base text-muted-foreground font-medium">/{records.length}</span></p>
        </CardContent></Card>
      </div>

      {/* Records list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : records.length === 0 ? (
        <EmptyState
          icon="💰"
          title="No salary records"
          description={`No salaries generated for ${formatMonth(filterMonth)}`}
          action={<Button onClick={openGenerate}><Plus className="h-4 w-4 mr-2" />Generate Salary</Button>}
        />
      ) : (
        <div className="space-y-4">
          {records.map(r => (
            <SalaryCard
              key={r.id}
              record={r}
              staffName={staffList.find(s => s.id === r.staffId)?.name || "Unknown"}
              onPay={openPayment}
              onDelete={setDeleteId}
              onDownloadSlip={downloadSlip}
              onDownloadReceipt={downloadReceipt}
            />
          ))}
        </div>
      )}

      {/* ── Generate Salary Modal ─────────────────────────────── */}
      <Modal open={generateModalOpen} onClose={() => setGenerateModalOpen(false)} title="Generate Salary">
        <form onSubmit={handleGenSubmit(onGenerate)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Staff */}
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Staff Member *</label>
              <select
                {...regGen("staffId")}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select staff...</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                ))}
              </select>
              {errGen.staffId && <p className="text-xs text-red-400 mt-1">{errGen.staffId.message}</p>}
            </div>

            {/* Month */}
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Month *</label>
              <input
                type="month"
                {...regGen("month")}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {/* Bonus */}
            <div className={outstandingRecovery > 0 ? "col-span-1" : "col-span-2"}>
              <label className="text-sm font-medium text-foreground block mb-1.5">Bonus (₹)</label>
              <Input type="number" min={0} {...regGen("bonus", { valueAsNumber: true })} placeholder="0" />
            </div>

            {/* Advance deduction input (Only if no outstanding recorded to allow ad-hoc recovery) */}
            {outstandingRecovery === 0 && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Advance (₹)</label>
                <Input type="number" min={0} {...regGen("advance", { valueAsNumber: true })} placeholder="0" className="bg-amber-500/5 focus-visible:ring-amber-500/30" />
              </div>
            )}

            {/* Outstanding Recovery Section (Only visible if outstanding dues > 0) */}
            {outstandingRecovery > 0 && (
              <div className="col-span-2 p-3.5 bg-indigo-500/5 rounded-2xl border border-border space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Outstanding Recovery</span>
                  <Badge variant="destructive" className="font-bold text-xs">
                    {formatCurrency(outstandingRecovery)}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  <label className={`flex flex-col items-center justify-center p-2.5 rounded-xl border cursor-pointer text-center select-none transition-all ${watchedRecoveryOption === "full" ? "bg-indigo-500/10 border-indigo-500/50 shadow-md shadow-indigo-500/10" : "bg-card border-border hover:bg-muted"}`}>
                    <input type="radio" value="full" {...regGen("recoveryOption")} className="sr-only" />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${watchedRecoveryOption === "full" ? "text-indigo-400 font-bold" : "text-muted-foreground"}`}>
                      Deduct Full
                    </span>
                    <span className="text-[10px] text-muted-foreground mt-0.5 font-black">
                      {formatCurrency(outstandingRecovery)}
                    </span>
                  </label>
                  
                  <label className={`flex flex-col items-center justify-center p-2.5 rounded-xl border cursor-pointer text-center select-none transition-all ${watchedRecoveryOption === "partial" ? "bg-indigo-500/10 border-indigo-500/50 shadow-md shadow-indigo-500/10" : "bg-card border-border hover:bg-muted"}`}>
                    <input type="radio" value="partial" {...regGen("recoveryOption")} className="sr-only" />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${watchedRecoveryOption === "partial" ? "text-indigo-400 font-bold" : "text-muted-foreground"}`}>
                      Partial
                    </span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      Choose Amount
                    </span>
                  </label>

                  <label className={`flex flex-col items-center justify-center p-2.5 rounded-xl border cursor-pointer text-center select-none transition-all ${watchedRecoveryOption === "skip" ? "bg-indigo-500/10 border-indigo-500/50 shadow-md shadow-indigo-500/10" : "bg-card border-border hover:bg-muted"}`}>
                    <input type="radio" value="skip" {...regGen("recoveryOption")} className="sr-only" />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${watchedRecoveryOption === "skip" ? "text-indigo-400 font-bold" : "text-muted-foreground"}`}>
                      Skip
                    </span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      Deduct ₹0
                    </span>
                  </label>
                </div>

                {watchedRecoveryOption === "partial" && (
                  <div className="pt-1.5">
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Deduction Amount (₹)</label>
                    <Input
                      type="number"
                      min={0}
                      max={outstandingRecovery}
                      {...regGen("recoveryAmount", { valueAsNumber: true })}
                      placeholder="Enter recovery amount..."
                      className="bg-card"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Extra deduction */}
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Extra Deduction (₹)</label>
              <Input type="number" min={0} {...regGen("extraDeduction", { valueAsNumber: true })} placeholder="0" />
            </div>

            {/* Note */}
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Note</label>
              <Input {...regGen("note")} placeholder="Optional..." />
            </div>
          </div>

          {/* Live preview */}
          {previewCalc && (
            <div className="bg-muted/50 rounded-xl p-4 border border-border space-y-1.5">
              <div className="flex items-center gap-2 mb-3">
                <Calculator className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Salary Preview</p>
              </div>
              {previewCalc.breakdown.map((b, i) => (
                <p key={i} className="text-xs text-muted-foreground">{b}</p>
              ))}
              {previewDue > 0 && (
                <p className="text-xs text-amber-500">Previous Due: +{formatCurrency(previewDue)}</p>
              )}
              {previewRollover > 0 && (
                <div className="mt-2.5 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-500 leading-normal">
                  <span className="font-bold">Advance Cap Notice:</span> Capping deduction to {formatCurrency(previewActualDeduct)} to prevent negative payable salary. The remaining {formatCurrency(previewRollover)} will roll over to next month.
                </div>
              )}
              <div className="border-t border-border pt-2 mt-2 space-y-0.5">
                <p className="text-xs text-muted-foreground">This month: {formatCurrency(previewCalc.finalSalary)}</p>
                {previewDue > 0 && (
                  <p className="text-sm font-bold text-primary">
                    Total Payable: {formatCurrency(previewCalc.finalSalary + previewDue)}
                  </p>
                )}
                {previewDue === 0 && (
                  <p className="text-sm font-bold text-primary">Net: {formatCurrency(previewCalc.finalSalary)}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setGenerateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : "Generate"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Make Payment Modal ───────────────────────────────── */}
      <Modal open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} title="Record Payment">
        {selectedRecord && (
          <form onSubmit={handlePaySubmit(onPayment)} className="space-y-4">
            {/* Balance summary */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-muted/40 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Total Due</p>
                <p className="text-sm font-bold">{formatCurrency(selectedRecord.finalSalary + selectedRecord.previousDue)}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-xl p-3">
                <p className="text-[10px] text-emerald-600 uppercase mb-0.5">Paid So Far</p>
                <p className="text-sm font-bold text-emerald-600">{formatCurrency(selectedRecord.totalPaid)}</p>
              </div>
              <div className="bg-red-500/10 rounded-xl p-3 border border-red-500/20">
                <p className="text-[10px] text-red-500 uppercase mb-0.5">Remaining</p>
                <p className="text-sm font-bold text-red-500">{formatCurrency(selectedRecord.remainingDue)}</p>
              </div>
            </div>

            <div className="space-y-3">
              {/* Amount */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-foreground">Amount (₹) *</label>
                  <button
                    type="button"
                    onClick={() => setPayValue("amountPaid", selectedRecord.remainingDue)}
                    className="text-xs text-primary hover:underline"
                  >
                    Pay in full
                  </button>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={selectedRecord.remainingDue}
                  step="any"
                  {...regPay("amountPaid", { valueAsNumber: true })}
                />
                {errPay.amountPaid && <p className="text-xs text-red-400 mt-1">{errPay.amountPaid.message}</p>}
              </div>

              {/* Payment method — styled toggle */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Payment Method *</label>
                <div className="grid grid-cols-4 gap-2">
                  {(["cash", "upi", "bank", "other"] as const).map(method => {
                    const mi = PAY_METHOD_ICONS[method];
                    const Icon = mi.icon;
                    return (
                      <label
                        key={method}
                        className="cursor-pointer"
                      >
                        <input type="radio" {...regPay("paymentMethod")} value={method} className="sr-only peer" />
                        <div className="flex flex-col items-center gap-1 p-2 rounded-xl border border-border bg-muted/40 peer-checked:border-primary peer-checked:bg-primary/10 transition-all">
                          <Icon className={`h-4 w-4 ${mi.color}`} />
                          <span className="text-[10px] font-medium leading-none">{mi.label}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Payment Date *</label>
                <Input type="date" {...regPay("paymentDate")} />
              </div>

              {/* Note */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Note / Reference</label>
                <Input {...regPay("note")} placeholder="Transaction ID, remarks..." />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setPaymentModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? <Spinner className="h-4 w-4" /> : "Confirm Payment"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="Delete Salary Record"
        description="This will permanently delete this salary record and all its payment history."
        confirmText="Delete"
      />
    </div>
  );
}
