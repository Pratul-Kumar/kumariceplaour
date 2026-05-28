import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, CheckCircle, Calculator, FileText, Download, HandCoins } from "lucide-react";
import { Button, Input, Card, CardContent, Badge, EmptyState, Spinner, Skeleton, Select } from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { staffService, salaryService, attendanceService } from "@/services";
import { type Staff, type SalaryRecord, type SalaryPayment, calculateSalary } from "@/types";
import { formatCurrency, formatMonth, getCurrentMonth, formatDate } from "@/lib/utils";
import { generateSalarySlip } from "@/services/pdf/generateSalarySlip";
import { generatePaymentReceipt } from "@/services/pdf/generatePaymentReceipt";

const salarySchema = z.object({
  staffId: z.string().min(1, "Select a staff member"),
  month: z.string().min(1, "Month required"),
  bonus: z.preprocess((v) => Number(v) || 0, z.number().min(0)).default(0),
  advance: z.preprocess((v) => Number(v) || 0, z.number().min(0)).default(0),
  extraDeduction: z.preprocess((v) => Number(v) || 0, z.number().min(0)).default(0),
  note: z.string().optional(),
});

type SalaryFormData = z.infer<typeof salarySchema>;

const paymentSchema = z.object({
  amountPaid: z.preprocess((v) => Number(v) || 0, z.number().min(1, "Enter valid amount")),
  paymentMethod: z.enum(["cash", "upi", "bank", "other"]),
  paymentDate: z.string().min(1, "Date is required"),
  note: z.string().optional(),
});
type PaymentFormData = z.infer<typeof paymentSchema>;

export function SalaryManagement() {
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth());
  
  // Modals
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<SalaryRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  const [saving, setSaving] = useState(false);
  const [previewCalc, setPreviewCalc] = useState<ReturnType<typeof calculateSalary> | null>(null);
  const [paymentsMap, setPaymentsMap] = useState<Record<string, SalaryPayment[]>>({});
  const { toast } = useToast();

  const { register: regGen, handleSubmit: handleGenSubmit, reset: resetGen, watch: watchGen, formState: { errors: errGen } } = useForm<SalaryFormData>({
    resolver: zodResolver(salarySchema),
    defaultValues: { month: getCurrentMonth(), bonus: 0, advance: 0, extraDeduction: 0 },
  });

  const { register: regPay, handleSubmit: handlePaySubmit, reset: resetPay, formState: { errors: errPay } } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { paymentMethod: "cash", paymentDate: new Date().toISOString().split('T')[0] },
  });

  const watchedStaffId = watchGen("staffId");
  const watchedMonth = watchGen("month");
  const watchedBonus = watchGen("bonus");
  const watchedAdvance = watchGen("advance");
  const watchedExtra = watchGen("extraDeduction");

  useEffect(() => {
    setLoading(true);
    let active = true;

    const unsubStaff = staffService.subscribeAll((data) => {
      if (active) setStaffList(data);
    });
    
    const [yearStr, monthStr] = filterMonth.split("-");
    const unsubRecords = salaryService.subscribeByMonth(Number(monthStr), Number(yearStr), async (data) => {
      if (!active) return;
      setRecords(data);
      
      const pm: Record<string, SalaryPayment[]> = {};
      try {
        await Promise.all(
          data.map(async (r) => {
            const payments = await salaryService.getPaymentsForRecord(r.id!);
            pm[r.id!] = payments;
          })
        );
      } catch (err) {
        console.error("Failed to load salary payments", err);
      }

      if (active) {
        setPaymentsMap(pm);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubStaff();
      unsubRecords();
    };
  }, [filterMonth]);

  // Live salary preview
  useEffect(() => {
    if (!watchedStaffId || !watchedMonth) return;
    const staff = staffList.find((s) => s.id === watchedStaffId);
    if (!staff) return;
    attendanceService.getByStaffAndMonth(watchedStaffId, watchedMonth).then((attRecords) => {
      const daysInMonth = new Date(parseInt(watchedMonth.slice(0, 4)), parseInt(watchedMonth.slice(5, 7)), 0).getDate();
      const result = calculateSalary({
        staff, attendanceRecords: attRecords,
        workingDaysInMonth: daysInMonth,
        bonus: Number(watchedBonus) || 0,
        advance: Number(watchedAdvance) || 0,
        extraDeduction: Number(watchedExtra) || 0,
      });
      setPreviewCalc(result);
    });
  }, [watchedStaffId, watchedMonth, watchedBonus, watchedAdvance, watchedExtra, staffList]);

  const openGenerate = () => {
    setPreviewCalc(null);
    resetGen({ month: filterMonth, bonus: 0, advance: 0, extraDeduction: 0 });
    setGenerateModalOpen(true);
  };

  const openPayment = (record: SalaryRecord) => {
    setSelectedRecord(record);
    resetPay({ paymentMethod: "cash", paymentDate: new Date().toISOString().split('T')[0], amountPaid: record.remainingDue });
    setPaymentModalOpen(true);
  };

  const onGenerate = async (data: SalaryFormData) => {
    setSaving(true);
    try {
      const staff = staffList.find((s) => s.id === data.staffId);
      if (!staff) throw new Error("Staff not found");
      const [yearStr, monthStr] = data.month.split("-");
      const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
      
      const attRecords = await attendanceService.getByStaffAndMonth(data.staffId, data.month);
      const calc = calculateSalary({ staff, attendanceRecords: attRecords, workingDaysInMonth: daysInMonth, bonus: data.bonus, advance: data.advance, extraDeduction: data.extraDeduction });

      // Determine previous due from earlier records
      const allPastRecords = await salaryService.getByStaff(staff.id!);
      const previousDue = allPastRecords.length > 0 ? allPastRecords[0].remainingDue : 0;

      const record: Omit<SalaryRecord, "id" | "createdAt" | "updatedAt"> = {
        staffId: data.staffId, 
        month: Number(monthStr), 
        year: Number(yearStr),
        baseSalary: staff.salaryType === "monthly" ? staff.monthlySalary : staff.dailyWage,
        bonus: data.bonus,
        advance: data.advance,
        leaveDeduction: calc.leaveDeductionAmount,
        extraDeduction: data.extraDeduction, 
        overtime: calc.overtimeAmount,
        finalSalary: calc.finalSalary,
        previousDue: previousDue,
        totalPaid: 0,
        remainingDue: calc.finalSalary + previousDue,
        status: "pending",
        note: data.note,
      } as any; // Temporary fix for 'note' missing if it's missing in type

      await salaryService.addRecord(record);
      toast({ type: "success", title: "Salary Generated", description: `${formatCurrency(calc.finalSalary)} for ${staff.name}` });
      setGenerateModalOpen(false);
    } catch (e: any) {
      toast({ type: "error", title: "Error", description: e.message });
    } finally { setSaving(false); }
  };

  const onPayment = async (data: PaymentFormData) => {
    if (!selectedRecord) return;
    setSaving(true);
    try {
      if (data.amountPaid > selectedRecord.remainingDue) {
        throw new Error(`Amount cannot exceed remaining due (${formatCurrency(selectedRecord.remainingDue)})`);
      }
      
      const newTotalPaid = selectedRecord.totalPaid + data.amountPaid;
      const newRemainingDue = selectedRecord.remainingDue - data.amountPaid;
      const newStatus = newRemainingDue <= 0 ? "paid" : "partial";

      await salaryService.addPayment({
        salaryRecordId: selectedRecord.id!,
        staffId: selectedRecord.staffId,
        amountPaid: data.amountPaid,
        paymentDate: data.paymentDate,
        paymentMethod: data.paymentMethod,
        note: data.note
      });

      await salaryService.updateRecord(selectedRecord.id!, {
        totalPaid: newTotalPaid,
        remainingDue: newRemainingDue,
        status: newStatus
      });

      toast({ type: "success", title: "Payment Recorded", description: formatCurrency(data.amountPaid) });
      setPaymentModalOpen(false);
    } catch (e: any) {
      toast({ type: "error", title: "Error", description: e.message });
    } finally { setSaving(false); }
  };

  const downloadSlip = async (record: SalaryRecord) => {
    const staff = staffList.find(s => s.id === record.staffId);
    if (!staff) return;
    const payments = await salaryService.getPaymentsForRecord(record.id!);
    const monthStr = `${record.year}-${record.month.toString().padStart(2, '0')}`;
    const attRecords = await attendanceService.getByStaffAndMonth(staff.id!, monthStr);
    
    let w = 0, p = 0, a = 0, l = 0, h = 0;
    w = new Date(record.year, record.month, 0).getDate();
    attRecords.forEach(att => {
      if (att.status === 'present') p++;
      else if (att.status === 'absent') a++;
      else if (att.status === 'leave') l++;
      else if (att.status === 'half_day') h++;
    });

    generateSalarySlip(staff, record, payments, { workingDays: w, presentDays: p, absentDays: a, leaveDays: l, halfDays: h });
  };

  const downloadReceipt = async (record: SalaryRecord, payment: SalaryPayment) => {
    const staff = staffList.find(s => s.id === record.staffId);
    if (!staff) return;
    generatePaymentReceipt(staff, record, payment);
  };

  const totalPaid = records.reduce((s, r) => s + r.totalPaid, 0);
  const totalDue = records.reduce((s, r) => s + r.remainingDue, 0);

  return (
    <div className="space-y-5 pb-20 lg:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Salary Ledger</h1>
          <p className="text-sm text-muted-foreground">{records.length} records for {formatMonth(filterMonth)}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openGenerate} className="gap-2"><Plus className="h-4 w-4" /> Generate</Button>
        </div>
      </div>

      <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="flex h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-44" />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Total Paid</p>
          <p className="text-lg font-bold text-emerald-400">{formatCurrency(totalPaid)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Remaining Due</p>
          <p className="text-lg font-bold text-amber-400">{formatCurrency(totalDue)}</p>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      ) : records.length === 0 ? (
        <EmptyState icon="💰" title="No salary records" description="Generate salary for staff members" action={<Button onClick={openGenerate}><Plus className="h-4 w-4 mr-2" />Generate Salary</Button>} />
      ) : (
        <div className="space-y-4">
          {records.map((r) => {
            const s = staffList.find((st) => st.id === r.staffId);
            const rPayments = paymentsMap[r.id!] || [];
            
            return (
              <Card key={r.id} className="group hover:shadow-md transition-all">
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-border pb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-lg font-bold text-foreground">{s?.name || "Unknown"}</p>
                        <Badge variant={r.status === "paid" ? "success" : r.status === "partial" ? "warning" : "destructive"}>
                          {r.status.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Base Salary</p>
                          <p className="font-semibold">{formatCurrency(r.baseSalary)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Net (+Previous Due)</p>
                          <p className="font-semibold">{formatCurrency(r.finalSalary + r.previousDue)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground text-emerald-500">Total Paid</p>
                          <p className="font-semibold text-emerald-600">{formatCurrency(r.totalPaid)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground text-amber-500">Remaining</p>
                          <p className="font-semibold text-amber-600">{formatCurrency(r.remainingDue)}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                      {r.status !== "paid" && (
                        <Button size="sm" onClick={() => openPayment(r)} className="gap-2 w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90">
                          <HandCoins className="h-4 w-4" /> Pay
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => downloadSlip(r)} className="gap-2 w-full sm:w-auto">
                        <FileText className="h-4 w-4" /> Slip
                      </Button>
                      <button onClick={() => setDeleteId(r.id!)} className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors hidden sm:block">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Payment History Sub-table */}
                  {rPayments.length > 0 && (
                    <div className="pt-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Payment History</p>
                      <div className="space-y-1.5">
                        {rPayments.map(p => (
                          <div key={p.id} className="flex justify-between items-center text-sm p-2 bg-muted/30 rounded-lg">
                            <div>
                              <p className="font-medium">{formatCurrency(p.amountPaid)} <span className="text-muted-foreground font-normal text-xs uppercase ml-1">({p.paymentMethod})</span></p>
                              <p className="text-xs text-muted-foreground">{formatDate(p.paymentDate)}</p>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => downloadReceipt(r, p)} className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground">
                              <Download className="h-3 w-3" /> Receipt
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Generate Salary Modal */}
      <Modal open={generateModalOpen} onClose={() => setGenerateModalOpen(false)} title="Generate Salary">
        <form onSubmit={handleGenSubmit(onGenerate)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Staff Member *</label>
              <select {...regGen("staffId")} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Select staff...</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {errGen.staffId && <p className="text-xs text-red-400 mt-1">{errGen.staffId.message}</p>}
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Month *</label>
              <input type="month" {...regGen("month")} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Bonus (₹)</label>
              <Input type="number" min={0} {...regGen("bonus", { valueAsNumber: true })} placeholder="0" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Advance (₹)</label>
              <Input type="number" min={0} {...regGen("advance", { valueAsNumber: true })} placeholder="0" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Extra Deduction (₹)</label>
              <Input type="number" min={0} {...regGen("extraDeduction", { valueAsNumber: true })} placeholder="0" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Note</label>
              <Input {...regGen("note")} placeholder="Optional note..." />
            </div>
          </div>

          {/* Live Preview */}
          {previewCalc && (
            <div className="bg-muted/50 rounded-xl p-4 space-y-1.5 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <Calculator className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Salary Preview</p>
              </div>
              {previewCalc.breakdown.map((b, i) => (
                <p key={i} className="text-xs text-muted-foreground">{b}</p>
              ))}
              <div className="border-t border-border pt-2 mt-2">
                <p className="text-sm font-bold text-primary">Final: {formatCurrency(previewCalc.finalSalary)}</p>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setGenerateModalOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : "Generate"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Make Payment Modal */}
      <Modal open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} title="Record Payment">
        <form onSubmit={handlePaySubmit(onPayment)} className="space-y-4">
          <div className="bg-amber-500/10 text-amber-600 p-3 rounded-lg text-sm font-medium mb-2 border border-amber-500/20">
            Remaining Due: {selectedRecord ? formatCurrency(selectedRecord.remainingDue) : '₹0'}
          </div>
          
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Amount to Pay (₹) *</label>
              <Input type="number" min={1} max={selectedRecord?.remainingDue || 0} {...regPay("amountPaid", { valueAsNumber: true })} />
              {errPay.amountPaid && <p className="text-xs text-red-400 mt-1">{errPay.amountPaid.message}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Payment Method *</label>
              <select {...regPay("paymentMethod")} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank">Bank Transfer</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Date *</label>
              <Input type="date" {...regPay("paymentDate")} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Note</label>
              <Input {...regPay("note")} placeholder="Transaction ID, remarks..." />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setPaymentModalOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-primary" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4 text-white" /> : "Confirm Payment"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && salaryService.deleteRecord(deleteId).then(() => { toast({ type: "success", title: "Deleted" }); setDeleteId(null); })}
        title="Delete Salary Record"
        description="This salary record and its payments will be permanently deleted."
        confirmText="Delete"
      />
    </div>
  );
}
