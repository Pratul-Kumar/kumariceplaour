import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, IndianRupee, HandCoins, Wallet, Clock, Calculator, History, CheckCircle2, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Card, CardContent, Button, Input, Skeleton, Spinner, Badge } from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { staffService, attendanceService, salaryService, ledgerService } from '@/services';
import { type Staff, calculateSalary, type SalaryRecord, type Attendance, type SalaryPayment } from '@/types';
import { formatCurrency, getCurrentMonth, formatMonth, generateAvatarColor, getInitials } from '@/lib/utils';
import { useForm } from 'react-hook-form';

export function SalaryProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [currentMonthStr, setCurrentMonthStr] = useState(getCurrentMonth());
  const [presentDays, setPresentDays] = useState(0);
  const [workingDays, setWorkingDays] = useState(0);
  const [calculatedSalary, setCalculatedSalary] = useState(0);
  
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [salaryPayments, setSalaryPayments] = useState<SalaryPayment[]>([]);

  // Adjustment modal state
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjAddDue, setAdjAddDue] = useState(false);
  const [adjDueAmount, setAdjDueAmount] = useState(0);
  const [adjDeductAdvance, setAdjDeductAdvance] = useState(false);
  const [adjAdvanceAmount, setAdjAdvanceAmount] = useState(0);
  // Confirmed values carried into payment modal
  const [confirmedDue, setConfirmedDue] = useState(0);
  const [confirmedAdvance, setConfirmedAdvance] = useState(0);
  const [confirmedFinal, setConfirmedFinal] = useState(0);

  // Payment modal
  const [paymentType, setPaymentType] = useState<'full' | 'partial' | 'remaining' | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Delete salary record
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingSalary, setDeletingSalary] = useState(false);

  const { register, handleSubmit, reset, watch, setValue } = useForm({
    defaultValues: { amount: 0, bonus: 0, note: '', paymentDate: new Date().toISOString().split('T')[0], paymentMethod: 'cash' }
  });
  const watchedBonus = watch('bonus') || 0;

  useEffect(() => {
    if (!id) return;
    const unsubStaff = staffService.subscribeById(id, setStaff);
    return () => unsubStaff();
  }, [id]);

  useEffect(() => {
    if (!staff) return;
    const loadSalaryData = async () => {
      const [yrStr, moStr] = currentMonthStr.split('-');
      const year = Number(yrStr);
      const month = Number(moStr);
      const daysInMonth = new Date(year, month, 0).getDate();
      
      const attRecords = await attendanceService.getByStaffAndMonth(staff.id!, currentMonthStr);
      const pDays = attRecords.filter(r => r.status === 'present').length;
      
      const calc = calculateSalary({
        staff,
        attendanceRecords: attRecords,
        workingDaysInMonth: daysInMonth,
        bonus: watchedBonus,
        advance: 0,
        extraDeduction: 0,
      });

      setPresentDays(pDays);
      setWorkingDays(daysInMonth);
      setCalculatedSalary(calc.finalSalary);
      setLoading(false);
    };
    loadSalaryData();
  }, [staff, currentMonthStr, watchedBonus]);

  useEffect(() => {
    if (!id) return;
    const [yrStr, moStr] = currentMonthStr.split('-');
    const unsub = salaryService.subscribeByMonth(Number(moStr), Number(yrStr), (data) => {
      setRecords(data.filter(r => r.staffId === id));
    });
    return () => unsub();
  }, [id, currentMonthStr]);

  useEffect(() => {
    if (records.length > 0 && records[0].id) {
      salaryService.getPaymentsForRecord(records[0].id).then(setSalaryPayments);
    } else {
      setSalaryPayments([]);
    }
  }, [records]);

  if (loading) {
    return (
      <div className="space-y-4 max-w-lg mx-auto">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!staff) return <div className="p-8 text-center text-muted-foreground">Staff not found.</div>;

  const outstandingBalance = staff.outstandingBalance || 0;
  const advanceSalary = outstandingBalance > 0 ? outstandingBalance : 0;
  const dueMoney = outstandingBalance < 0 ? Math.abs(outstandingBalance) : 0;

  const currentRecord = records[0]; // If there's a record for this month
  const isGenerated = !!currentRecord;

  const grossPayable = calculatedSalary + dueMoney;
  const actualDeduct = Math.min(advanceSalary, grossPayable);
  const finalPayableCalc = grossPayable - actualDeduct;

  const openPaymentModal = (type: 'full' | 'partial' | 'remaining') => {
    setPaymentType(type);
    if (type === 'full') {
      setValue('amount', confirmedFinal > 0 ? confirmedFinal : finalPayableCalc);
    } else if (type === 'remaining') {
      setValue('amount', currentRecord?.remainingDue || 0);
    } else {
      setValue('amount', 0);
    }
  };

  // Open the adjustment modal, pre-populating with available amounts
  const openAdjustModal = () => {
    setAdjAddDue(dueMoney > 0);
    setAdjDueAmount(dueMoney);
    setAdjDeductAdvance(advanceSalary > 0);
    setAdjAdvanceAmount(Math.min(advanceSalary, calculatedSalary + dueMoney));
    setShowAdjustModal(true);
  };

  // Confirm adjustments → move to payment modal
  const confirmAdjustments = (type: 'full' | 'partial') => {
    const addedDue = adjAddDue ? Math.min(adjDueAmount, dueMoney) : 0;
    const deductedAdv = adjDeductAdvance ? Math.min(adjAdvanceAmount, advanceSalary) : 0;
    const gross = calculatedSalary + addedDue;
    const final = Math.max(0, gross - deductedAdv);
    setConfirmedDue(addedDue);
    setConfirmedAdvance(deductedAdv);
    setConfirmedFinal(final);
    setShowAdjustModal(false);
    setPaymentType(type);
    setValue('amount', type === 'full' ? final : 0);
  };

  const handleDeleteSalary = async () => {
    if (!currentRecord?.id) return;
    setDeletingSalary(true);
    try {
      await salaryService.deleteRecord(currentRecord.id);
      setSalaryPayments([]);
      setConfirmedDue(0);
      setConfirmedAdvance(0);
      setConfirmedFinal(0);
      setShowDeleteConfirm(false);
      toast({ type: 'success', title: 'Salary Deleted', description: 'Salary record removed. Advance & due balances restored.' });
    } catch (err: any) {
      toast({ type: 'error', title: 'Delete Failed', description: err.message });
    } finally {
      setDeletingSalary(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    try {
      await salaryService.deletePayment(paymentId);
      toast({ type: 'success', title: 'Deleted', description: 'Payment deleted and balance restored.' });
      if (currentRecord?.id) {
        salaryService.getPaymentsForRecord(currentRecord.id).then(setSalaryPayments);
      }
    } catch (err: any) {
      toast({ type: 'error', title: 'Error', description: err.message });
    }
    setDeleteConfirmId(null);
  };

  const onProcessSalary = async (data: any) => {
    setSaving(true);
    try {
      const [yrStr, moStr] = currentMonthStr.split('-');
      const year = Number(yrStr);
      const month = Number(moStr);

      if (isGenerated) {
        if (paymentType === 'remaining') {
          const actualPayable = currentRecord!.remainingDue;
          const paymentAmount = data.amount;
          if (paymentAmount > actualPayable) throw new Error(`Cannot pay more than remaining: ${formatCurrency(actualPayable)}`);
          if (paymentAmount <= 0) throw new Error('Enter a valid amount.');
          await salaryService.addPayment({
            salaryRecordId: currentRecord!.id!,
            staffId: staff.id!,
            amountPaid: paymentAmount,
            paymentDate: data.paymentDate,
            paymentMethod: data.paymentMethod,
            note: data.note || 'Partial Remaining Payment'
          });
          toast({ type: 'success', title: 'Payment Recorded', description: 'Remaining payment saved successfully.' });
          setPaymentType(null);
          setTimeout(async () => {
            const fetchedRecords = await salaryService.getByMonth(month, year);
            const newRecord = fetchedRecords.find((r: any) => r.staffId === staff.id);
            if (newRecord) {
              downloadSlip(newRecord);
              salaryService.getPaymentsForRecord(newRecord.id!).then(setSalaryPayments);
            }
          }, 1500);
          return;
        } else {
          throw new Error('Salary already processed for this month.');
        }
      }

      // Use confirmed adjustment amounts if set, else fall back to auto values
      const usedDue     = confirmedFinal > 0 ? confirmedDue     : dueMoney;
      const usedAdvance = confirmedFinal > 0 ? confirmedAdvance : actualDeduct;
      const actualPayable = confirmedFinal > 0 ? confirmedFinal : finalPayableCalc;
      const paymentAmount = paymentType === 'full' ? actualPayable : data.amount;

      if (paymentAmount > actualPayable) {
        throw new Error(`Cannot pay more than final payable of ${formatCurrency(actualPayable)}`);
      }

      await salaryService.addRecord({
        staffId: staff.id!,
        month,
        year,
        baseSalary: staff.salaryType === 'monthly' ? staff.monthlySalary : staff.dailyWage,
        bonus: data.bonus || 0,
        advance: usedAdvance,
        leaveDeduction: 0,
        extraDeduction: 0,
        overtime: 0,
        grossSalary: calculatedSalary,
        finalSalary: calculatedSalary,
        previousDue: usedDue,
        totalPaid: 0,
        remainingDue: Math.max(0, actualPayable - paymentAmount),
        status: 'pending',
        note: data.note || (paymentType === 'full' ? 'Full Settlement' : 'Partial Settlement'),
        updatedAt: new Date().toISOString(),
      } as any, [], paymentAmount > 0 ? {
        amountPaid: paymentAmount,
        paymentDate: data.paymentDate,
        paymentMethod: data.paymentMethod,
        note: data.note || 'Salary Payout'
      } : undefined);

      // Reset confirmed values for next use
      setConfirmedDue(0);
      setConfirmedAdvance(0);
      setConfirmedFinal(0);

      toast({ type: 'success', title: 'Salary Processed', description: 'Salary processed and recorded successfully. Generating slip...' });
      setPaymentType(null);
      
      // Auto-trigger PDF generation
      setTimeout(async () => {
        const fetchedRecords = await salaryService.getByMonth(month, year);
        const newRecord = fetchedRecords.find((r: any) => r.staffId === staff.id);
        if (newRecord) {
          salaryService.getPaymentsForRecord(newRecord.id!).then(setSalaryPayments);
          downloadSlip(newRecord);
          // Log PDF generation in ledger history
          await ledgerService.addEntry({
            staffId: staff.id!,
            type: "salary_slip_generated" as any,
            amount: 0,
            date: new Date().toISOString().split("T")[0],
            month: `${year}-${String(month).padStart(2, "0")}`,
            note: "Automatically generated salary slip PDF",
            salaryRecordId: newRecord.id
          });
        }
      }, 1500); // give time for firestore propagation

    } catch (e: any) {
      toast({ type: 'error', title: 'Error', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const downloadSlip = async (record: SalaryRecord) => {
    try {
      const payments  = await salaryService.getPaymentsForRecord(record.id!);
      const { generateSalarySlip } = await import("@/services/pdf/generateSalarySlip");
      const attRecords = await attendanceService.getByStaffAndMonth(staff.id!, currentMonthStr);
      
      let pDays = 0, aDays = 0, lDays = 0, hDays = 0;
      attRecords.forEach(r => {
        if (r.status === 'present') pDays++;
        else if (r.status === 'absent') aDays++;
        else if (r.status === 'leave') lDays++;
        else if (r.status === 'half_day') hDays++;
      });
      
      const ledgerEntries = await ledgerService.getByStaff(staff.id!);
      
      generateSalarySlip(staff, record, payments, { 
        workingDays, 
        presentDays: pDays, 
        absentDays: aDays, 
        leaveDays: lDays, 
        halfDays: hDays 
      }, ledgerEntries);
    } catch (err) {
      console.error(err);
      toast({ type: "error", title: "Could not generate slip", description: "Try again." });
    }
  };

  return (
    <div className="space-y-5 pb-24 max-w-xl mx-auto">
      {/* Header — fixed horizontal layout with truncation */}
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/staff?mode=salary')} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center justify-between flex-1 min-w-0 gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-12 h-12 rounded-full shrink-0 flex items-center justify-center font-bold text-white shadow-sm bg-gradient-to-br ${generateAvatarColor(staff.name)}`}>
              {getInitials(staff.name)}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground leading-tight truncate">{staff.name}</h1>
              <p className="text-sm text-muted-foreground">Salary Management</p>
            </div>
          </div>
          <input
            type="month"
            value={currentMonthStr}
            onChange={e => setCurrentMonthStr(e.target.value)}
            className="shrink-0 h-10 rounded-xl border border-input bg-card px-3 py-1 text-sm shadow-sm w-[140px]"
          />
        </div>
      </div>

      {/* 4 Essential Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="glass-card border-none bg-gradient-to-br from-blue-500/10 to-indigo-500/5">
          <CardContent className="p-5 text-center">
            <IndianRupee className="h-6 w-6 text-blue-500 mx-auto mb-2 opacity-80" />
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Generated Salary</p>
            <p className="text-2xl font-bold text-blue-500">{formatCurrency(calculatedSalary)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-none bg-gradient-to-br from-amber-500/10 to-orange-500/5">
          <CardContent className="p-5 text-center">
            <HandCoins className="h-6 w-6 text-amber-500 mx-auto mb-2 opacity-80" />
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Advance Salary</p>
            <p className="text-2xl font-bold text-amber-500">{formatCurrency(advanceSalary)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-none bg-gradient-to-br from-emerald-500/10 to-teal-500/5">
          <CardContent className="p-5 text-center">
            <Wallet className="h-6 w-6 text-emerald-500 mx-auto mb-2 opacity-80" />
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Due Money</p>
            <p className="text-2xl font-bold text-emerald-500">{formatCurrency(dueMoney)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-none bg-gradient-to-br from-purple-500/10 to-fuchsia-500/5">
          <CardContent className="p-5 text-center">
            <Clock className="h-6 w-6 text-purple-500 mx-auto mb-2 opacity-80" />
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Present Days</p>
            <p className="text-2xl font-bold text-purple-500">{presentDays} <span className="text-sm font-medium text-muted-foreground">/ {workingDays}</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Main Workflow Area */}
      {isGenerated ? (
        <Card className="glass-card border-emerald-500/30 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4">
            <Badge variant="success" className="shadow-sm shadow-emerald-500/20 px-3 py-1 text-[10px] uppercase font-bold tracking-widest">
              Processed
            </Badge>
          </div>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <History className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">Salary Processed</h3>
                <p className="text-sm text-muted-foreground">{formatMonth(currentMonthStr)} complete.</p>
              </div>
            </div>
            <div className="bg-card/50 rounded-xl p-4 border border-border mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Final Paid Amount</span>
                <span className="font-bold text-foreground">{formatCurrency(currentRecord.totalPaid)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Remaining Pending</span>
                <span className={`font-bold ${currentRecord.remainingDue > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {formatCurrency(currentRecord.remainingDue)}
                </span>
              </div>
            </div>
            {currentRecord.remainingDue > 0 ? (
              <Button className="w-full h-12 mb-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold" onClick={() => openPaymentModal('remaining')}>
                Pay Remaining
              </Button>
            ) : (
              <div className="flex items-center justify-center gap-2 text-emerald-500 font-bold mb-4 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                <CheckCircle2 className="h-5 w-5" />
                Salary Fully Paid
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Button className="h-12" variant="outline" onClick={() => downloadSlip(currentRecord)}>
                Download Slip
              </Button>
              <Button
                className="h-12 border-rose-500/30 text-rose-500 hover:bg-rose-500/10"
                variant="outline"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Record
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card border-border overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                <SlidersHorizontal className="h-5 w-5 text-indigo-500" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">Salary Generation</h3>
                <p className="text-xs text-muted-foreground">Adjust advance & due before generating</p>
              </div>
            </div>

            {/* Live preview of current auto values */}
            <div className="space-y-2 mb-5 bg-muted/30 rounded-xl p-4 border border-border">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Generated Salary</span>
                <span className="font-semibold text-foreground">{formatCurrency(calculatedSalary)}</span>
              </div>
              {dueMoney > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Previous Due Available</span>
                  <span className="font-semibold text-emerald-500">+{formatCurrency(dueMoney)}</span>
                </div>
              )}
              {advanceSalary > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Advance Available</span>
                  <span className="font-semibold text-amber-500">{formatCurrency(advanceSalary)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-border flex justify-between items-center">
                <span className="font-bold text-foreground uppercase tracking-widest text-xs">Est. Final Payable</span>
                <span className="text-xl font-bold text-indigo-500">{formatCurrency(finalPayableCalc)}</span>
              </div>
            </div>

            <Button
              onClick={openAdjustModal}
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/20 font-bold"
              disabled={calculatedSalary === 0}
            >
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Configure & Generate Salary
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Partial Payments History UI */}
      {isGenerated && salaryPayments.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-4 px-1">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">Payment History</h2>
          </div>
          <div className="space-y-3">
            {salaryPayments.map((p) => (
              <div key={p.id} className="p-4 bg-card border border-border rounded-2xl flex items-center justify-between shadow-sm relative group">
                <div>
                  <p className="font-bold text-foreground">{p.note || 'Salary Payment'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{p.paymentDate}</span>
                    <Badge variant="outline" className="text-[9px] uppercase">{p.paymentMethod}</Badge>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end">
                  <p className="text-lg font-bold text-emerald-500">+{formatCurrency(p.amountPaid)}</p>
                </div>
                {/* Delete Button */}
                <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:bg-rose-500/10" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(p.id!); }}>
                    <ArrowLeft className="h-4 w-4 rotate-45" /> {/* Delete Icon placeholder */}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Salary Adjustment Modal ── */}
      <Modal open={showAdjustModal} onClose={() => setShowAdjustModal(false)} title="Configure Salary">
        <div className="space-y-5 pt-2">

          {/* Generated Salary (read-only) */}
          <div className="bg-muted/40 rounded-xl p-4 border border-border">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Generated Salary</p>
            <p className="text-2xl font-extrabold text-foreground">{formatCurrency(calculatedSalary)}</p>
          </div>

          {/* Previous Due section */}
          {dueMoney > 0 && (
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">Add Previous Due</p>
                  <p className="text-xs text-muted-foreground">Available: {formatCurrency(dueMoney)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAdjAddDue(v => !v)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${adjAddDue ? 'bg-emerald-500' : 'bg-muted'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${adjAddDue ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
              {adjAddDue && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Add Amount (max {formatCurrency(dueMoney)})</label>
                  <input
                    type="number"
                    min={0}
                    max={dueMoney}
                    value={adjDueAmount}
                    onChange={e => setAdjDueAmount(Math.min(Number(e.target.value), dueMoney))}
                    className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}
            </div>
          )}

          {/* Advance Deduction section */}
          {advanceSalary > 0 && (
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">Deduct Advance</p>
                  <p className="text-xs text-muted-foreground">Available: {formatCurrency(advanceSalary)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAdjDeductAdvance(v => !v)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${adjDeductAdvance ? 'bg-amber-500' : 'bg-muted'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${adjDeductAdvance ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
              {adjDeductAdvance && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Deduct Amount (max {formatCurrency(advanceSalary)})</label>
                  <input
                    type="number"
                    min={0}
                    max={advanceSalary}
                    value={adjAdvanceAmount}
                    onChange={e => setAdjAdvanceAmount(Math.min(Number(e.target.value), advanceSalary))}
                    className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}
            </div>
          )}

          {/* Live Final Summary */}
          <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-2">Live Summary</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Generated Salary</span>
              <span className="font-semibold">{formatCurrency(calculatedSalary)}</span>
            </div>
            {adjAddDue && adjDueAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">+ Previous Due</span>
                <span className="font-semibold text-emerald-500">+{formatCurrency(adjDueAmount)}</span>
              </div>
            )}
            {adjDeductAdvance && adjAdvanceAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">- Advance Deduction</span>
                <span className="font-semibold text-rose-500">-{formatCurrency(adjAdvanceAmount)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-indigo-500/20 flex justify-between items-center">
              <span className="font-bold text-foreground text-xs uppercase tracking-widest">Final Payable</span>
              <span className="text-xl font-extrabold text-indigo-500">
                {formatCurrency(Math.max(0,
                  calculatedSalary
                  + (adjAddDue ? adjDueAmount : 0)
                  - (adjDeductAdvance ? adjAdvanceAmount : 0)
                ))}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Button
              type="button"
              className="h-12 bg-indigo-600 hover:bg-indigo-700 font-bold"
              onClick={() => confirmAdjustments('full')}
            >
              Pay Full
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-12 font-bold"
              onClick={() => confirmAdjustments('partial')}
            >
              Pay Partial
            </Button>
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal open={!!paymentType} onClose={() => setPaymentType(null)} title={
        paymentType === 'full' ? 'Pay Full Salary' : 
        paymentType === 'remaining' ? 'Pay Remaining Amount' : 'Pay Partial Salary'
      }>
        <form onSubmit={handleSubmit(onProcessSalary)} className="space-y-4 pt-2">
          {paymentType !== 'full' && (
            <div>
              <label className="text-sm font-semibold text-foreground block mb-2">Amount (₹) *</label>
              <Input type="number" min={1} {...register('amount', { valueAsNumber: true })} className="text-lg h-12" autoFocus />
            </div>
          )}
          {paymentType === 'full' && !isGenerated && (
            <div>
              <label className="text-sm font-semibold text-foreground block mb-2">Bonus (₹) Optional</label>
              <Input type="number" {...register('bonus', { valueAsNumber: true })} className="h-12" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-foreground block mb-2">Date</label>
              <Input type="date" {...register('paymentDate')} className="h-12" />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground block mb-2">Method</label>
              <select {...register('paymentMethod')} className="w-full h-12 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <option value="cash">Cash</option>
                <option value="online">Online</option>
                <option value="upi">UPI</option>
                <option value="bank">Bank Transfer</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">Note (Optional)</label>
            <Input {...register('note')} className="h-12" placeholder="Any remarks?" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1 h-12" onClick={() => setPaymentType(null)}>Cancel</Button>
            <Button type="submit" className="flex-1 h-12" disabled={saving}>
              {saving ? <Spinner className="h-5 w-5" /> : 'Process Salary'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} title="Delete Payment Entry?">
        <div className="pt-2 space-y-4">
          <p className="text-sm text-muted-foreground">This will completely reverse this payment and recalculate the remaining pending amount.</p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-12" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button className="flex-1 h-12 bg-rose-500 hover:bg-rose-600 text-white" onClick={() => handleDeletePayment(deleteConfirmId!)}>Delete Payment</Button>
          </div>
        </div>
      </Modal>
      {/* Delete Salary Record Confirmation Modal */}
      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Salary Record?">
        <div className="pt-2 space-y-5">
          {/* Warning banner */}
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4">
            <p className="text-sm font-bold text-rose-500 mb-1">⚠️ This action will completely rollback:</p>
            <ul className="text-sm text-muted-foreground space-y-1 mt-2">
              <li>• All payment history for this salary will be removed</li>
              <li>• Advance balance will be restored to its original amount</li>
              <li>• Due balance will be recalculated correctly</li>
              <li>• Salary status reset to unpaid — ready to regenerate</li>
            </ul>
          </div>

          {/* Current record summary */}
          {currentRecord && (
            <div className="bg-muted/40 rounded-xl p-4 border border-border space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Month</span>
                <span className="font-bold">{formatMonth(currentMonthStr)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Paid</span>
                <span className="font-bold text-emerald-500">{formatCurrency(currentRecord.totalPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Remaining</span>
                <span className="font-bold text-amber-500">{formatCurrency(currentRecord.remainingDue)}</span>
              </div>
              {(currentRecord.advance || 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Advance to Restore</span>
                  <span className="font-bold text-indigo-500">{formatCurrency(currentRecord.advance || 0)}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-12" onClick={() => setShowDeleteConfirm(false)} disabled={deletingSalary}>
              Cancel
            </Button>
            <Button
              className="flex-1 h-12 bg-rose-500 hover:bg-rose-600 text-white font-bold"
              onClick={handleDeleteSalary}
              disabled={deletingSalary}
            >
              {deletingSalary ? <Spinner className="h-5 w-5" /> : 'Delete & Restore'}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
