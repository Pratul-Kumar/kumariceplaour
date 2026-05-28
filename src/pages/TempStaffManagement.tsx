import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit2, Trash2, HardHat, Download } from "lucide-react";
import {
  Button, Input, Card, CardContent, CardHeader, CardTitle,
  Badge, EmptyState, Spinner, Skeleton
} from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { tempStaffService } from "@/services";
import { type TemporaryStaff } from "@/types";
import { formatCurrency, formatDate, getCurrentMonth } from "@/lib/utils";
import * as XLSX from "xlsx";

const tempStaffSchema = z.object({
  workerName: z.string().min(2, "Name required"),
  workType: z.string().min(2, "Work type required"),
  amount: z.preprocess((v) => Number(v) || 0, z.number().min(1, "Enter a valid amount")),
  date: z.string().min(1, "Date required"),
  note: z.string().optional(),
});

type TempStaffFormData = z.infer<typeof tempStaffSchema>;

export function TempStaffManagement() {
  const [records, setRecords] = useState<TemporaryStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth());
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<TemporaryStaff | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<TempStaffFormData>({
    resolver: zodResolver(tempStaffSchema),
    defaultValues: { date: new Date().toISOString().split("T")[0] },
  });

  const loadData = async () => {
    setLoading(true);
    const data = await tempStaffService.getByMonth(filterMonth);
    setRecords(data.reverse());
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [filterMonth]);

  const openAdd = () => {
    setEditItem(null);
    reset({ date: new Date().toISOString().split("T")[0] });
    setModalOpen(true);
  };

  const openEdit = (r: TemporaryStaff) => {
    setEditItem(r);
    reset({ workerName: r.workerName, workType: r.workType, amount: r.amount, date: r.date, note: r.note || "" });
    setModalOpen(true);
  };

  const onSubmit = async (data: TempStaffFormData) => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (editItem?.id) {
        await tempStaffService.update(editItem.id, data);
        toast({ type: "success", title: "Updated Successfully" });
      } else {
        await tempStaffService.add({ ...data, createdAt: now, updatedAt: now });
        toast({ type: "success", title: "Labor Expense Added", description: `${formatCurrency(data.amount)} recorded.` });
      }
      setModalOpen(false);
      loadData();
    } catch {
      toast({ type: "error", title: "Error saving record" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    await tempStaffService.delete(id);
    toast({ type: "success", title: "Record Deleted" });
    loadData();
  };

  const exportExcel = () => {
    const data = records.map((r) => ({
      "Worker Name": r.workerName,
      "Work Type": r.workType,
      Amount: r.amount,
      Date: formatDate(r.date),
      Note: r.note || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Temp Staff");
    XLSX.writeFile(wb, `temp-staff-${filterMonth}.xlsx`);
    toast({ type: "success", title: "Exported to Excel" });
  };

  const totalAmount = records.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-5 pb-20 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Temp / Daily Labor</h1>
          <p className="text-sm text-muted-foreground">Total: <span className="text-red-400 font-semibold">{formatCurrency(totalAmount)}</span></p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel} className="gap-2 hidden sm:flex">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" /> Add</Button>
        </div>
      </div>

      <Input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="w-44" />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Payments</p>
            <p className="text-lg font-bold text-foreground mt-1">{records.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Amount</p>
            <p className="text-lg font-bold text-red-400 mt-1">{formatCurrency(totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Avg/Day</p>
            <p className="text-lg font-bold text-foreground mt-1">
              {records.length > 0 ? formatCurrency(Math.round(totalAmount / records.length)) : "₹0"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Records */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : records.length === 0 ? (
        <EmptyState
          icon="👷"
          title="No labor records"
          description="Track daily worker payments here"
          action={<Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Payment</Button>}
        />
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <Card key={r.id} className="group hover:shadow-md transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center text-orange-400 shrink-0">
                    <HardHat className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{r.workerName}</p>
                    <p className="text-xs text-muted-foreground">{r.workType} · {formatDate(r.date)}</p>
                    {r.note && <p className="text-xs text-muted-foreground/70 truncate">{r.note}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-base font-bold text-red-400">- {formatCurrency(r.amount)}</p>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteId(r.id!)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? "Edit Record" : "Add Labor Expense"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Worker Name *</label>
              <Input {...register("workerName")} placeholder="Worker name" />
              {errors.workerName && <p className="text-xs text-red-400 mt-1">{errors.workerName.message}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Work Type *</label>
              <Input {...register("workType")} placeholder="e.g. Loading, Cleaning" />
              {errors.workType && <p className="text-xs text-red-400 mt-1">{errors.workType.message}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Amount *</label>
              <Input type="number" min={0} {...register("amount")} placeholder="0" />
              {errors.amount && <p className="text-xs text-red-400 mt-1">{errors.amount.message}</p>}
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Date *</label>
              <Input type="date" {...register("date")} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Note</label>
              <Input {...register("note")} placeholder="Optional note..." />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : editItem ? "Update" : "Add Record"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="Delete Record"
        description="This labor expense record will be permanently deleted."
        confirmText="Delete"
      />
    </div>
  );
}
