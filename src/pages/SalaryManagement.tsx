import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit2, Trash2, Download, CheckCircle, XCircle, Calculator } from "lucide-react";
import { Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, EmptyState, Spinner, Skeleton } from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { staffService, salaryService, attendanceService } from "@/services";
import { type Staff, type SalaryRecord, calculateSalary } from "@/types";
import { formatCurrency, formatMonth, getCurrentMonth } from "@/lib/utils";
import * as XLSX from "xlsx";

const salarySchema = z.object({
  staffId: z.preprocess((v) => Number(v), z.number().min(1, "Select a staff member")),
  month: z.string().min(1, "Month required"),
  bonus: z.preprocess((v) => Number(v) || 0, z.number().min(0)).default(0),
  advance: z.preprocess((v) => Number(v) || 0, z.number().min(0)).default(0),
  extraDeduction: z.preprocess((v) => Number(v) || 0, z.number().min(0)).default(0),
  note: z.string().optional(),
});

type SalaryFormData = z.infer<typeof salarySchema>;

export function SalaryManagement() {
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth());
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<SalaryRecord | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewCalc, setPreviewCalc] = useState<ReturnType<typeof calculateSalary> | null>(null);
  const { toast } = useToast();

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<SalaryFormData>({
    resolver: zodResolver(salarySchema),
    defaultValues: { month: getCurrentMonth(), bonus: 0, advance: 0, extraDeduction: 0 },
  });

  const watchedStaffId = watch("staffId");
  const watchedMonth = watch("month");
  const watchedBonus = watch("bonus");
  const watchedAdvance = watch("advance");
  const watchedExtra = watch("extraDeduction");

  useEffect(() => {
    staffService.getActive().then(setStaffList);
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await salaryService.getByMonth(filterMonth);
    setRecords(data);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [filterMonth]);

  // Live salary preview
  useEffect(() => {
    if (!watchedStaffId || !watchedMonth) return;
    const staff = staffList.find((s) => s.id === Number(watchedStaffId));
    if (!staff) return;
    attendanceService.getByStaffAndMonth(Number(watchedStaffId), watchedMonth).then((attRecords) => {
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

  const openAdd = () => {
    setEditItem(null);
    setPreviewCalc(null);
    reset({ month: filterMonth, bonus: 0, advance: 0, extraDeduction: 0 });
    setModalOpen(true);
  };

  const onSubmit = async (data: SalaryFormData) => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const staff = staffList.find((s) => s.id === Number(data.staffId));
      if (!staff) throw new Error("Staff not found");
      const daysInMonth = new Date(parseInt(data.month.slice(0, 4)), parseInt(data.month.slice(5, 7)), 0).getDate();
      const attRecords = await attendanceService.getByStaffAndMonth(Number(data.staffId), data.month);
      const calc = calculateSalary({ staff, attendanceRecords: attRecords, workingDaysInMonth: daysInMonth, bonus: data.bonus, advance: data.advance, extraDeduction: data.extraDeduction });

      const record: Omit<SalaryRecord, "id"> = {
        staffId: Number(data.staffId), month: data.month, salaryType: staff.salaryType,
        baseSalary: staff.salaryType === "monthly" ? staff.monthlySalary : staff.dailyWage,
        workingDays: daysInMonth, presentDays: calc.presentDays, absentDays: calc.absentDays,
        leaveDays: calc.leaveDays, deductedLeaves: calc.deductedLeaves,
        leaveDeductionAmount: calc.leaveDeductionAmount, bonus: data.bonus,
        overtimeAmount: calc.overtimeAmount, advance: data.advance,
        extraDeduction: data.extraDeduction, finalSalary: calc.finalSalary,
        paid: false, note: data.note, createdAt: now, updatedAt: now,
      };

      if (editItem?.id) {
        await salaryService.update(editItem.id, record);
        toast({ type: "success", title: "Salary Record Updated" });
      } else {
        await salaryService.add(record);
        toast({ type: "success", title: "Salary Generated", description: `${formatCurrency(calc.finalSalary)} for ${staff.name}` });
      }
      setModalOpen(false);
      loadData();
    } catch (e: unknown) {
      toast({ type: "error", title: "Error", description: (e as Error).message });
    } finally { setSaving(false); }
  };

  const handleMarkPaid = async (id: number) => {
    await salaryService.markPaid(id);
    toast({ type: "success", title: "Marked as Paid" });
    loadData();
  };

  const exportExcel = () => {
    const data = records.map((r) => {
      const s = staffList.find((st) => st.id === r.staffId);
      return {
        "Staff": s?.name || r.staffId,
        "Month": formatMonth(r.month),
        "Type": r.salaryType,
        "Base": r.baseSalary,
        "Present": r.presentDays,
        "Absent": r.absentDays,
        "Leave Deduction": r.leaveDeductionAmount,
        "Bonus": r.bonus,
        "Advance": r.advance,
        "Final Salary": r.finalSalary,
        "Status": r.paid ? "Paid" : "Pending",
        "Paid Date": r.paidDate || "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Salary");
    XLSX.writeFile(wb, `salary-${filterMonth}.xlsx`);
    toast({ type: "success", title: "Exported to Excel" });
  };

  const totalPaid = records.filter((r) => r.paid).reduce((s, r) => s + r.finalSalary, 0);
  const totalPending = records.filter((r) => !r.paid).reduce((s, r) => s + r.finalSalary, 0);

  return (
    <div className="space-y-5 pb-20 lg:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Salary</h1>
          <p className="text-sm text-muted-foreground">{records.length} records for {formatMonth(filterMonth)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel} className="gap-2 hidden sm:flex">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" /> Generate</Button>
        </div>
      </div>

      <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="flex h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-44" />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="text-lg font-bold text-emerald-400">{formatCurrency(totalPaid)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Pending</p>
          <p className="text-lg font-bold text-amber-400">{formatCurrency(totalPending)}</p>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : records.length === 0 ? (
        <EmptyState icon="💰" title="No salary records" description="Generate salary for staff members" action={<Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Generate Salary</Button>} />
      ) : (
        <div className="space-y-2">
          {records.map((r) => {
            const s = staffList.find((st) => st.id === r.staffId);
            return (
              <Card key={r.id} className="group hover:shadow-md transition-all">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{s?.name || "Unknown"}</p>
                        <Badge variant="secondary" className="text-xs capitalize">{r.salaryType}</Badge>
                        <Badge variant={r.paid ? "success" : "warning"}>{r.paid ? "Paid" : "Pending"}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Present: {r.presentDays}d · Absent: {r.absentDays}d
                        {r.leaveDeductionAmount > 0 && ` · Leave -${formatCurrency(r.leaveDeductionAmount)}`}
                        {r.bonus > 0 && ` · Bonus +${formatCurrency(r.bonus)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <p className="text-base font-bold text-foreground">{formatCurrency(r.finalSalary)}</p>
                      {!r.paid && (
                        <Button size="sm" variant="outline" onClick={() => handleMarkPaid(r.id!)} className="gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10">
                          <CheckCircle className="h-3.5 w-3.5" /> Pay
                        </Button>
                      )}
                      <button onClick={() => setDeleteId(r.id!)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Generate Salary">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Staff Member *</label>
              <select {...register("staffId", { valueAsNumber: true })} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Select staff...</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.salaryType === "monthly" ? `₹${s.monthlySalary}/mo` : `₹${s.dailyWage}/day`})</option>)}
              </select>
              {errors.staffId && <p className="text-xs text-red-400 mt-1">{errors.staffId.message}</p>}
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Month *</label>
              <input type="month" {...register("month")} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Bonus (₹)</label>
              <Input type="number" min={0} {...register("bonus", { valueAsNumber: true })} placeholder="0" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Advance (₹)</label>
              <Input type="number" min={0} {...register("advance", { valueAsNumber: true })} placeholder="0" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Extra Deduction (₹)</label>
              <Input type="number" min={0} {...register("extraDeduction", { valueAsNumber: true })} placeholder="0" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Note</label>
              <Input {...register("note")} placeholder="Optional note..." />
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
            <Button type="button" variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : "Generate Salary"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && salaryService.delete(deleteId).then(() => { toast({ type: "success", title: "Deleted" }); loadData(); setDeleteId(null); })}
        title="Delete Salary Record"
        description="This salary record will be permanently deleted."
        confirmText="Delete"
      />
    </div>
  );
}
