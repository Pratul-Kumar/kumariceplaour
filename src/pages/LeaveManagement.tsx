import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, CalendarOff, Download } from "lucide-react";
import { Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, EmptyState, Spinner, Skeleton } from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { staffService, leaveService } from "@/services";
import { type Staff, type LeaveRecord, type LeaveType, LEAVE_TYPES } from "@/types";
import { formatCurrency, formatDate, getCurrentMonth } from "@/lib/utils";
import * as XLSX from "xlsx";

const leaveSchema = z.object({
  staffId: z.string().min(1, "Select a staff member"),
  leaveDate: z.string().min(1, "Date required"),
  leaveType: z.enum(["casual", "paid", "unpaid", "sick"]),
  reason: z.string().optional(),
  approved: z.boolean().optional().default(true),
});

type LeaveFormData = z.infer<typeof leaveSchema>;

const LEAVE_COLORS: Record<LeaveType, string> = {
  casual:  "bg-blue-500/15 text-blue-400 border-blue-500/30",
  paid:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  unpaid:  "bg-red-500/15 text-red-400 border-red-500/30",
  sick:    "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export function LeaveManagement() {
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth());
  const [filterStaff, setFilterStaff] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<LeaveFormData>({
    resolver: zodResolver(leaveSchema),
    defaultValues: { leaveType: "casual", approved: true, leaveDate: new Date().toISOString().split("T")[0] },
  });

  useEffect(() => {
    let active = true;
    staffService.getActive().then((data) => {
      if (active) setStaffList(data);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    let active = true;
    const unsubscribe = leaveService.subscribeByMonth(filterMonth, (data) => {
      if (active) {
        setRecords([...data].reverse());
        setLoading(false);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [filterMonth]);

  const filtered = filterStaff === "all" ? records : records.filter((r) => r.staffId === filterStaff);

  const onSubmit = async (data: LeaveFormData) => {
    setSaving(true);
    try {
      await leaveService.add({ ...data, staffId: data.staffId });
      toast({ type: "success", title: "Leave Recorded" });
      setModalOpen(false);
      reset();
    } catch {
      toast({ type: "error", title: "Error recording leave" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await leaveService.delete(id);
    toast({ type: "success", title: "Leave Deleted" });
  };

  const exportExcel = () => {
    const data = filtered.map((r) => {
      const s = staffList.find((st) => st.id === r.staffId);
      return { "Staff": s?.name, "Date": formatDate(r.leaveDate), "Type": r.leaveType, "Reason": r.reason || "", "Approved": r.approved ? "Yes" : "No" };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leaves");
    XLSX.writeFile(wb, `leaves-${filterMonth}.xlsx`);
    toast({ type: "success", title: "Exported" });
  };

  // Summary per staff
  const staffSummary = staffList.map((s) => ({
    ...s,
    leavesThisMonth: records.filter((r) => r.staffId === s.id).length,
    overLimit: records.filter((r) => r.staffId === s.id).length > s.allowedCasualLeavesPerMonth,
  }));

  return (
    <div className="space-y-5 pb-20 lg:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Leave Management</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} records for selected period</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel} className="gap-2 hidden sm:flex">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button onClick={() => { reset({ leaveType: "casual", approved: true, leaveDate: new Date().toISOString().split("T")[0] }); setModalOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Add Leave
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="flex h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-40" />
        <select value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)} className="flex h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex-1 min-w-32">
          <option value="all">All Staff</option>
          {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Staff Leave Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {staffSummary.map((s) => (
          <div key={s.id} className={`p-3 rounded-xl border ${s.overLimit ? "bg-red-500/10 border-red-500/30" : "bg-muted/50 border-border"}`}>
            <p className="text-xs font-medium text-foreground truncate">{s.name}</p>
            <p className={`text-lg font-bold mt-1 ${s.overLimit ? "text-red-400" : "text-foreground"}`}>{s.leavesThisMonth}</p>
            <p className="text-xs text-muted-foreground">of {s.allowedCasualLeavesPerMonth} allowed</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🏖️" title="No leave records" description="No leaves recorded for this period" action={<Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Leave</Button>} />
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const s = staffList.find((st) => st.id === r.staffId);
            return (
              <Card key={r.id} className="group hover:shadow-md transition-all">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`px-2.5 py-1 rounded-lg border text-xs font-semibold capitalize ${LEAVE_COLORS[r.leaveType]}`}>
                      {r.leaveType}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{s?.name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(r.leaveDate)}{r.reason && ` · ${r.reason}`}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={r.approved ? "success" : "warning"}>{r.approved ? "Approved" : "Pending"}</Badge>
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record Leave">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Staff Member *</label>
              <select {...register("staffId", { valueAsNumber: true })} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Select staff...</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {errors.staffId && <p className="text-xs text-red-400 mt-1">{errors.staffId.message}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Leave Type *</label>
              <select {...register("leaveType")} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Date *</label>
              <Input type="date" {...register("leaveDate")} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Reason</label>
              <Input {...register("reason")} placeholder="Optional reason..." />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="approved" {...register("approved")} className="rounded" defaultChecked />
              <label htmlFor="approved" className="text-sm text-foreground">Mark as Approved</label>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : "Record Leave"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="Delete Leave Record"
        description="This leave record will be deleted and the staff leave count will be updated."
        confirmText="Delete"
      />
    </div>
  );
}
