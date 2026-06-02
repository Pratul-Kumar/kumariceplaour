import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, IndianRupee, HandCoins, Wallet, Clock, Calculator, History } from 'lucide-react';
import { Card, CardContent, Button, Input, Skeleton, Spinner, Badge } from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { staffService, attendanceService, salaryService } from '@/services';
import { type Staff, calculateSalary, type SalaryRecord } from '@/types';
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

  // Modals
  const [paymentType, setPaymentType] = useState<'full' | 'partial' | null>(null);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, reset, watch, setValue } = useForm({
    defaultValues: { amount: 0, bonus: 0, note: '' }
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

  // Final Payable (Before any manual partial override)
  // Total Salary + Bonus - Advance Salary (owed to owner)
  // We do NOT add dueMoney here, money and salary flows are separate
  const finalPayableCalc = Math.max(0, calculatedSalary - advanceSalary);

  const openPaymentModal = (type: 'full' | 'partial') => {
    setPaymentType(type);
    if (type === 'full') {
      setValue('amount', finalPayableCalc);
    } else {
      setValue('amount', 0);
    }
  };

  const onProcessSalary = async (data: any) => {
    setSaving(true);
    try {
      if (isGenerated) throw new Error("Salary already processed for this month.");
      
      const [yrStr, moStr] = currentMonthStr.split('-');
      const year = Number(yrStr);
      const month = Number(moStr);

      const actualDeduct = Math.min(advanceSalary, calculatedSalary);
      const actualPayable = calculatedSalary - actualDeduct;
      const paymentAmount = paymentType === 'full' ? actualPayable : data.amount;

      if (paymentAmount > actualPayable) {
        throw new Error(`Cannot pay more than final payable of ${formatCurrency(actualPayable)}`);
      }

      await salaryService.addRecord({
        staffId: staff.id!,
        month,
        year,
        baseSalary: staff.salaryType === 'monthly' ? staff.monthlySalary : staff.dailyWage,
        bonus: data.bonus,
        advance: actualDeduct, // Auto-deduct advance
        leaveDeduction: 0,
        extraDeduction: 0,
        overtime: 0,
        grossSalary: calculatedSalary,
        finalSalary: calculatedSalary,
        previousDue: 0, // removed auto merging
        totalPaid: 0, 
        remainingDue: Math.max(0, actualPayable - paymentAmount),
        status: 'pending',
        note: data.note || (paymentType === 'full' ? 'Full Settlement' : 'Partial Settlement'),
        updatedAt: new Date().toISOString(),
      } as any, [], paymentAmount > 0 ? {
        amountPaid: paymentAmount,
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
        note: data.note || 'Salary Payout'
      } : undefined);

      toast({ type: 'success', title: 'Salary Processed', description: 'Salary processed and recorded successfully.' });
      setPaymentType(null);
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
      generateSalarySlip(staff, record, payments, { workingDays, presentDays, absentDays: 0, leaveDays: 0, halfDays: 0 });
    } catch {
      toast({ type: "error", title: "Could not generate slip", description: "Try again." });
    }
  };

  return (
    <div className="space-y-5 pb-24 max-w-xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/staff?mode=salary')} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center justify-between flex-1">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm bg-gradient-to-br ${generateAvatarColor(staff.name)}`}>
              {getInitials(staff.name)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground leading-tight">{staff.name}</h1>
              <p className="text-sm text-muted-foreground capitalize">Salary Management</p>
            </div>
          </div>
          <input
            type="month"
            value={currentMonthStr}
            onChange={e => setCurrentMonthStr(e.target.value)}
            className="h-10 rounded-xl border border-input bg-card px-3 py-1 text-sm shadow-sm"
          />
        </div>
      </div>

      {/* 4 Essential Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Card 1: Salary */}
        <Card className="glass-card border-none bg-gradient-to-br from-blue-500/10 to-indigo-500/5">
          <CardContent className="p-5 text-center">
            <IndianRupee className="h-6 w-6 text-blue-500 mx-auto mb-2 opacity-80" />
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Generated Salary</p>
            <p className="text-2xl font-bold text-blue-500">{formatCurrency(calculatedSalary)}</p>
          </CardContent>
        </Card>

        {/* Card 2: Advance Salary */}
        <Card className="glass-card border-none bg-gradient-to-br from-amber-500/10 to-orange-500/5">
          <CardContent className="p-5 text-center">
            <HandCoins className="h-6 w-6 text-amber-500 mx-auto mb-2 opacity-80" />
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Advance Salary</p>
            <p className="text-2xl font-bold text-amber-500">{formatCurrency(advanceSalary)}</p>
          </CardContent>
        </Card>

        {/* Card 3: Due Money */}
        <Card className="glass-card border-none bg-gradient-to-br from-emerald-500/10 to-teal-500/5">
          <CardContent className="p-5 text-center">
            <Wallet className="h-6 w-6 text-emerald-500 mx-auto mb-2 opacity-80" />
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Due Money</p>
            <p className="text-2xl font-bold text-emerald-500">{formatCurrency(dueMoney)}</p>
          </CardContent>
        </Card>

        {/* Card 4: Present Days */}
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
                <span className="font-bold text-amber-500">{formatCurrency(currentRecord.remainingDue)}</span>
              </div>
            </div>
            <Button className="w-full h-12" variant="outline" onClick={() => downloadSlip(currentRecord)}>
              Download Salary Slip
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card border-border overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                <Calculator className="h-5 w-5 text-indigo-500" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">Final Calculation</h3>
                <p className="text-xs text-muted-foreground">Advance automatically deducted</p>
              </div>
            </div>
            
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Generated Salary</span>
                <span className="font-medium text-foreground">{formatCurrency(calculatedSalary)}</span>
              </div>
              {advanceSalary > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Advance Deduction</span>
                  <span className="font-medium text-rose-500">-{formatCurrency(Math.min(advanceSalary, calculatedSalary))}</span>
                </div>
              )}
              <div className="pt-3 border-t border-border flex justify-between items-center">
                <span className="font-bold text-foreground uppercase tracking-widest text-xs">Total Payable</span>
                <span className="text-xl font-bold text-indigo-500">{formatCurrency(finalPayableCalc)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button onClick={() => openPaymentModal('full')} className="h-12 bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/20" disabled={finalPayableCalc === 0}>
                Pay Full Salary
              </Button>
              <Button onClick={() => openPaymentModal('partial')} className="h-12" variant="secondary">
                Pay Partial
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Modal */}
      <Modal open={!!paymentType} onClose={() => setPaymentType(null)} title={paymentType === 'full' ? 'Pay Full Salary' : 'Pay Partial Salary'}>
        <form onSubmit={handleSubmit(onProcessSalary)} className="space-y-4 pt-2">
          {/* Note: Bonus input included as requested by PDF fields requirement */}
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">Bonus (₹) Optional</label>
            <Input type="number" min={0} {...register('bonus', { valueAsNumber: true })} className="h-12" placeholder="0" />
            <p className="text-xs text-muted-foreground mt-1">Updates live calculated payable in background.</p>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">Payment Amount (₹) *</label>
            <Input 
              type="number" 
              min={0} 
              max={finalPayableCalc + watchedBonus}
              {...register('amount', { valueAsNumber: true })} 
              className="text-lg h-12" 
              placeholder="Enter amount..." 
              autoFocus 
              readOnly={paymentType === 'full'}
              autoComplete="off"
            />
            {paymentType === 'partial' && (
              <p className="text-xs text-amber-500 mt-2 font-medium">
                Remaining unpaid amount will become Due Money.
              </p>
            )}
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

    </div>
  );
}
