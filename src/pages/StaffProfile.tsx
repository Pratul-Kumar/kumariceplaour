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
import { staffService, salaryService, attendanceService, ledgerService, expenseService, dueService } from "@/services";
import { type Staff, type SalaryRecord, type Attendance, type SalaryPayment, type LedgerEntry, type DueRecord, type DueType } from "@/types";
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
  const [paymentsHistory, setPaymentsHistory] = useState<SalaryPayment[]>([]);
  const [ledgerHistory, setLedgerHistory] = useState<LedgerEntry[]>([]);
  const [duesHistory, setDuesHistory] = useState<DueRecord[]>([]);
  const [currentMonthAtt, setCurrentMonthAtt] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "salary" | "ledger" | "attendance">("salary");
  const [attendanceMonth, setAttendanceMonth] = useState(getCurrentMonth());

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
  
  // Pay Custom Salary / Full Salary form states
  const [genPayOption, setGenPayOption] = useState<"full" | "custom" | "later">("full");
  const [genPayAmount, setGenPayAmount] = useState("");
  const [genPayMethod, setGenPayMethod] = useState<"cash" | "upi" | "bank" | "other">("cash");
  const [genPayDate, setGenPayDate] = useState(new Date().toISOString().split("T")[0]);

  // Salary Record payment modal states
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "upi" | "bank" | "other">("cash");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payNote, setPayNote] = useState("");
  const [selectedRecordToPay, setSelectedRecordToPay] = useState<SalaryRecord | null>(null);

  const [existingRecord, setExistingRecord] = useState<SalaryRecord | null>(null);

  // Live salary preview states
  const [previewCalc, setPreviewCalc] = useState<ReturnType<typeof calculateSalary> | null>(null);
  const [previewDue, setPreviewDue] = useState(0);
  const [previewActualDeduct, setPreviewActualDeduct] = useState(0);
  const [previewRollover, setPreviewRollover] = useState(0);
  const [previewIsCapped, setPreviewIsCapped] = useState(false);
  const [attRecordsCount, setAttRecordsCount] = useState<Attendance[]>([]);

  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    const staffId = id;
    const currentYear = new Date().getFullYear();
    const currentMonthNum = new Date().getMonth() + 1;
    let active = true;

    // Real-time subscription for the staff document itself
    const unsubStaff = staffService.subscribeById(staffId, (s) => {
      if (active) {
        setStaff(s);
        // s.note tracking removed
        setLoading(false);
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

    // Real-time subscription for payments history
    const unsubPayments = salaryService.subscribePaymentsByStaff(staffId, (payments) => {
      if (active) {
        setPaymentsHistory(payments);
      }
    });

    // Real-time subscription for dues history
    const unsubDues = dueService.subscribeByStaff(staffId, (dues) => {
      if (active) {
        setDuesHistory(dues);
      }
    });

    return () => {
      active = false;
      unsubStaff();
      unsubLedger();
      unsubSalary();
      unsubPayments();
      unsubDues();
    };
  }, [id]);

  // Real-time subscription for attendance of the selected month
  useEffect(() => {
    if (!id) return;
    let active = true;

    const unsubAtt = attendanceService.subscribeByMonth(attendanceMonth, (attData) => {
      if (active) {
        setCurrentMonthAtt(attData.filter(a => a.staffId === id));
      }
    });

    return () => {
      active = false;
      unsubAtt();
    };
  }, [id, attendanceMonth]);

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
        
        const [attRecords, lastUnpaid, existing] = await Promise.all([
          attendanceService.getByStaffAndMonth(staff.id!, genMonth),
          salaryService.getLastUnpaidRecord(staff.id!, year, month),
          salaryService.getExistingRecord(staff.id!, month, year),
        ]);
        
        if (!active) return;
        
        if (existing) {
          const remainingAmount = existing.remainingDue;
          if (active) {
            setExistingRecord(existing);
            setPreviewCalc({
              presentDays: 0,
              absentDays: 0,
              leaveDays: 0,
              halfDays: 0,
              totalOvertimeHours: 0,
              deductedLeaves: 0,
              leaveDeductionAmount: 0,
              overtimeAmount: 0,
              finalSalary: remainingAmount,
              remainingDue: remainingAmount,
              breakdown: [
                `Original Salary: ${formatCurrency(existing.finalSalary + (existing.previousDue || 0))}`,
                `Already Paid: ${formatCurrency(existing.totalPaid)}`,
                `Remaining Due: ${formatCurrency(remainingAmount)}`,
              ],
            });
            setPreviewDue(0);
            setPreviewActualDeduct(0);
            setPreviewRollover(0);
            setPreviewIsCapped(false);
            setAttRecordsCount([]);
            
            if (genPayOption === "full") {
              setGenPayAmount(String(remainingAmount));
            } else if (genPayOption === "later") {
              setGenPayAmount("0");
            }
          }
          return;
        }

        if (active) {
          setExistingRecord(null);
        }

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

        const totalPayable = result.finalSalary + prevDue;

        if (active) {
          setPreviewCalc(result);
          setPreviewDue(prevDue);
          setPreviewActualDeduct(actualDeductedAdvance);
          setPreviewRollover(rolloverAmount);
          setPreviewIsCapped(isCapped);
          setAttRecordsCount(attRecords);
          
          if (genPayOption === "full") {
            setGenPayAmount(String(totalPayable));
          } else if (genPayOption === "later") {
            setGenPayAmount("0");
          }
        }
      } catch (e) {
        console.error("Preview calculation failed", e);
        if (active) setPreviewCalc(null);
      }
    };
    
    run();
    return () => { active = false; };
  }, [isPayrollModalOpen, genMonth, genBonus, genExtra, genRecoveryOption, genRecoveryAmount, genPayOption, staff]);

  if (loading) return (
    <div className="space-y-4 pb-20 lg:pb-6">
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );

  if (!staff) return <div className="text-center py-20 text-muted-foreground">Staff not found</div>;

  const sortedAtt = [...currentMonthAtt].sort((a, b) => a.date.localeCompare(b.date));
  const presentDays = sortedAtt.filter((a) => a.status === "present").length;
  const absentDays = sortedAtt.filter((a) => a.status === "absent").length;
  const halfDays = sortedAtt.filter((a) => a.status === "half_day").length;
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
      setGenPayOption("full");
      setGenPayAmount("");
      setGenPayMethod("cash");
      setGenPayDate(new Date().toISOString().split("T")[0]);
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
        const totalPayable = existing.remainingDue;
        const paymentAmount = genPayOption === "later" ? 0 : (genPayOption === "full" ? totalPayable : (Number(genPayAmount) || 0));

        if (paymentAmount < 0 || paymentAmount > totalPayable) {
          throw new Error(`Payment amount must be between ₹0 and ${formatCurrency(totalPayable)}`);
        }

        if (paymentAmount > 0) {
          await salaryService.addPayment({
            salaryRecordId: existing.id!,
            staffId: staff.id!,
            amountPaid: paymentAmount,
            paymentDate: genPayDate,
            paymentMethod: genPayMethod,
            note: genNote || "Paid upon update",
          });
          toast({
            type: "success",
            title: "Payment Recorded",
            description: `Recorded payment of ${formatCurrency(paymentAmount)} for ${formatMonth(genMonth)}`
          });
        } else {
          toast({
            type: "success",
            title: "No Payment Recorded",
            description: "No changes made."
          });
        }
        setIsPayrollModalOpen(false);
        return;
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

      const totalPayable = calc.finalSalary + previousDue;
      const paymentAmount = genPayOption === "later" ? 0 : (genPayOption === "full" ? totalPayable : (Number(genPayAmount) || 0));

      if (paymentAmount < 0 || paymentAmount > totalPayable) {
        throw new Error(`Payment amount must be between ₹0 and ${formatCurrency(totalPayable)}`);
      }

      const status = paymentAmount >= totalPayable ? "paid" : paymentAmount > 0 ? "partial" : "pending";

      const now = new Date().toISOString();
      const pendingAdvances: any[] = [];

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
        totalPaid: paymentAmount,
        remainingDue: Math.max(0, totalPayable - paymentAmount),
        status,
        note: genNote,
        updatedAt: now,
      } as any, pendingAdvances, paymentAmount > 0 ? {
        amountPaid: paymentAmount,
        paymentDate: genPayDate,
        paymentMethod: genPayMethod,
        note: genNote || "Paid upon generation"
      } : undefined);

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

  const handleDownloadSlip = async (record: SalaryRecord, selectedPaymentId?: string) => {
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
      generateSalarySlip(staff, record, recordPayments, { workingDays: w, presentDays: p, absentDays: a, leaveDays: 0, halfDays: h }, selectedPaymentId);
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
    setTab("ledger");
    setTimeout(() => {
      timelineRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };



  const pendingSalaryDue = salaryHistory.reduce((sum, r) => sum + (r.remainingDue || 0), 0);

  return (
    <div className="space-y-6 pb-20 lg:pb-6 max-w-lg mx-auto">
      <button onClick={() => navigate("/staff")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Staff List
      </button>

      {/* Top Section */}
      <div className="flex items-center gap-4 bg-card border border-border p-4 rounded-2xl shadow-sm mt-2">
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-white text-xl font-bold shrink-0 bg-gradient-to-br ${generateAvatarColor(staff.name)}`}>
          {getInitials(staff.name)}
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-foreground">{staff.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-sm font-semibold text-muted-foreground capitalize">{staff.role}</p>
            <Badge variant="secondary" className="text-[10px] capitalize">{staff.salaryType}</Badge>
          </div>
        </div>
      </div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-5 flex flex-col items-center text-center justify-center gap-1">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Present Day</p>
            <p className="text-3xl font-black text-foreground mt-1">{presentDays}</p>
          </CardContent>
        </Card>
        
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-5 flex flex-col items-center text-center justify-center gap-1">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Salary</p>
            <p className="text-xl font-black text-blue-500 mt-2">{formatCurrency(staff.salaryType === 'monthly' ? staff.monthlySalary : staff.dailyWage)}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-5 flex flex-col items-center text-center justify-center gap-1">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Advance</p>
            <p className="text-xl font-black text-rose-500 mt-2">{formatCurrency(outstanding)}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm bg-primary/5">
          <CardContent className="p-5 flex flex-col items-center text-center justify-center gap-1">
            <p className="text-[11px] font-bold text-primary uppercase tracking-widest">Remaining (बाकी)</p>
            <p className="text-xl font-black text-primary mt-2">{formatCurrency(pendingSalaryDue)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section Actions */}
      <div className="grid grid-cols-1 gap-3 mt-6 mb-4">
        <Button
          size="lg"
          onClick={handleActionPaySalary}
          className="w-full text-base font-bold rounded-xl h-14 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
        >
          {currentMonthRecord ? 'Pay Salary' : 'Generate Salary Slip'}
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            onClick={() => {
              setAdvDate(new Date().toISOString().split('T')[0]);
              setIsAdvanceModalOpen(true);
            }}
            variant="outline"
            className="w-full text-sm font-bold rounded-xl h-12 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border-transparent shadow-sm"
          >
            Give Advance
          </Button>
          <Button
            size="lg"
            onClick={() => {
              setRepDate(new Date().toISOString().split('T')[0]);
              setIsRepaymentModalOpen(true);
            }}
            variant="outline"
            className="w-full text-sm font-bold rounded-xl h-12 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border-transparent shadow-sm"
          >
            Take Repayment
          </Button>
        </div>
      </div>

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

            {/* Payout/Payment Configuration */}
            <div className="col-span-2 p-3.5 bg-emerald-500/5 rounded-xl border border-glass-border space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Salary Payment Option</span>
                {previewCalc && (
                  <Badge variant="success" className="font-extrabold text-xs">
                    Total Payable: {formatCurrency(previewCalc.finalSalary + previewDue)}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(["full", "custom", "later"] as const).map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setGenPayOption(option);
                      if (option === "full" && previewCalc) {
                        setGenPayAmount(String(previewCalc.finalSalary + previewDue));
                      } else if (option === "later") {
                        setGenPayAmount("0");
                      }
                    }}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all ${genPayOption === option ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : "bg-card border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      {option === "full" ? "Full Pay" : option === "custom" ? "Custom Pay" : "Pay Later"}
                    </span>
                    <span className="text-[9px] opacity-75 mt-0.5">
                      {option === "full" && previewCalc ? formatCurrency(previewCalc.finalSalary + previewDue) : option === "custom" ? "Choose" : "₹0"}
                    </span>
                  </button>
                ))}
              </div>

              {genPayOption === "custom" && (
                <div className="pt-1.5 space-y-2">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Payment Amount (₹)</label>
                    <Input
                      type="number"
                      min={0}
                      max={previewCalc ? previewCalc.finalSalary + previewDue : undefined}
                      value={genPayAmount}
                      onChange={(e) => setGenPayAmount(e.target.value)}
                      placeholder="Enter amount..."
                    />
                  </div>
                </div>
              )}

              {genPayOption !== "later" && (
                <div className="grid grid-cols-2 gap-2 pt-1.5">
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Payment Method</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(["cash", "upi", "bank", "other"] as const).map(method => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setGenPayMethod(method)}
                          className={`py-1.5 rounded-lg border text-xs font-bold text-center transition-all ${genPayMethod === method ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-border bg-card text-muted-foreground hover:bg-muted"}`}
                        >
                          {method.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Payment Date</label>
                    <Input
                      type="date"
                      required
                      value={genPayDate}
                      onChange={(e) => setGenPayDate(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

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
