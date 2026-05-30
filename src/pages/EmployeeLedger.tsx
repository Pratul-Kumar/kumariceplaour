import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, Search, Edit2, Trash2, Download, TrendingUp, TrendingDown,
  Scale, Calendar, User, FileText, ChevronRight, CheckCircle2, AlertCircle, RefreshCw
} from "lucide-react";
import {
  Button, Input, Select, Card, CardContent, CardHeader, CardTitle,
  Badge, EmptyState, Spinner, Skeleton, Label
} from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { employeeLedgerService, staffService } from "@/services";
import { type EmployeeLedgerEntry, type Staff } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";

const ledgerSchema = z.object({
  staffId: z.string().min(1, "Staff selection is required"),
  type: z.enum(["repayment", "manual_adjustment"]),
  amount: z.preprocess((v) => Number(v) || 0, z.number().min(1, "Amount must be at least ₹1")),
  direction: z.enum(["employee_owes", "store_owes"]),
  notes: z.string().optional(),
});

type LedgerFormData = z.infer<typeof ledgerSchema>;

export function EmployeeLedger() {
  const [entries, setEntries] = useState<EmployeeLedgerEntry[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStaff, setFilterStaff] = useState("");
  const [filterType, setFilterType] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { toast } = useToast();
  const { user } = useAuthStore();

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<LedgerFormData>({
    resolver: zodResolver(ledgerSchema),
    defaultValues: { type: "repayment", direction: "store_owes", amount: 0 },
  });

  const watchType = watch("type");

  // Adjust direction automatically based on type selection
  useEffect(() => {
    if (watchType === "repayment") {
      setValue("direction", "store_owes");
    }
  }, [watchType, setValue]);

  useEffect(() => {
    setLoading(true);
    let unsubEntries: () => void;
    let unsubStaff: () => void;

    const setup = () => {
      unsubStaff = staffService.subscribeAll(setStaffList);
      unsubEntries = employeeLedgerService.subscribeAll((data) => {
        setEntries(data);
        setLoading(false);
      });
    };

    setup();
    return () => {
      if (unsubEntries) unsubEntries();
      if (unsubStaff) unsubStaff();
    };
  }, []);

  // Compute stats
  const stats = useMemo(() => {
    let totalOutstanding = 0; // Net employee dues
    let recoveredThisMonth = 0;
    let pendingDuesCount = 0;

    const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM

    // Map to track per-staff balance
    const staffBalances: Record<string, number> = {};

    entries.forEach((e) => {
      const amt = e.amount;
      const change = e.direction === "employee_owes" ? amt : -amt;
      staffBalances[e.staffId] = (staffBalances[e.staffId] || 0) + change;

      // Recovered this month: repayments or deductions
      const isRecovery = e.type === "repayment" || e.type === "salary_deduction";
      if (isRecovery && e.createdAt.startsWith(currentMonthStr)) {
        recoveredThisMonth += e.amount;
      }
    });

    Object.values(staffBalances).forEach((bal) => {
      if (bal > 0) {
        totalOutstanding += bal;
        pendingDuesCount++;
      }
    });

    return {
      totalOutstanding,
      recoveredThisMonth,
      pendingDuesCount,
      staffBalances
    };
  }, [entries]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const staff = staffList.find((s) => s.id === e.staffId);
      const staffName = staff ? staff.name.toLowerCase() : "";
      const matchSearch = staffName.includes(search.toLowerCase()) || (e.notes && e.notes.toLowerCase().includes(search.toLowerCase()));
      const matchStaff = !filterStaff || e.staffId === filterStaff;
      const matchType = !filterType || e.type === filterType;
      return matchSearch && matchStaff && matchType;
    });
  }, [entries, staffList, search, filterStaff, filterType]);

  const openAdd = () => {
    reset({ staffId: "", type: "repayment", direction: "store_owes", amount: 0 as any, notes: "" });
    setModalOpen(true);
  };

  const onSubmit = async (data: LedgerFormData) => {
    setSaving(true);
    try {
      // Repayments are settled instantly. Manual adjustments are pending by default.
      const status = data.type === "repayment" ? "settled" : "pending";

      await employeeLedgerService.add({
        staffId: data.staffId,
        type: data.type,
        amount: data.amount,
        direction: data.direction,
        status,
        notes: data.notes || (data.type === "repayment" ? "Staff Repayment" : "Manual Adjustment"),
        createdBy: user?.email || "system",
      });

      toast({
        type: "success",
        title: "Ledger Entry Added",
        description: `Successfully added ${data.type.replace("_", " ")} of ${formatCurrency(data.amount)}`
      });
      setModalOpen(false);
    } catch (err: any) {
      console.error("[EmployeeLedger.onSubmit]", err);
      toast({ type: "error", title: "Failed to save entry", description: err.message || "Try again." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await employeeLedgerService.delete(id);
      toast({ type: "success", title: "Entry Deleted" });
      setDeleteId(null);
    } catch (err: any) {
      toast({ type: "error", title: "Deletion Failed", description: err.message });
      setDeleteId(null);
    }
  };

  const exportToExcel = async () => {
    const data = filteredEntries.map((e) => {
      const staff = staffList.find((s) => s.id === e.staffId);
      return {
        Employee: staff ? staff.name : "Unknown",
        Type: e.type.replace("_", " ").toUpperCase(),
        Amount: e.amount,
        Direction: e.direction === "employee_owes" ? "Employee Owes" : "Store Owes",
        Status: e.status.toUpperCase(),
        Creator: e.createdBy,
        Date: formatDate(e.createdAt),
        Notes: e.notes || "",
      };
    });
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employee_Ledger");
    XLSX.writeFile(wb, "employee_financial_ledger.xlsx");
    toast({ type: "success", title: "Exported to Excel" });
  };

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" /> Employee Financial Ledger
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ERP-grade system to reconcile salary advances, repayments, and payroll deductions.
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={openAdd} className="gap-2 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
            <Plus className="h-4 w-4" /> Record Ledger Entry
          </Button>
        </div>
      </div>

      {/* RECOVERY SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card border-glass-border">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Total Outstanding Recoveries</p>
              <h3 className="text-3xl font-black text-foreground mt-2">{formatCurrency(stats.totalOutstanding)}</h3>
              <p className="text-xs text-muted-foreground mt-1">{stats.pendingDuesCount} employees with outstanding balances</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <TrendingUp className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-glass-border">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Recovered This Month</p>
              <h3 className="text-3xl font-black text-emerald-400 mt-2">{formatCurrency(stats.recoveredThisMonth)}</h3>
              <p className="text-xs text-muted-foreground mt-1">From employee repayments and salary deductions</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <TrendingDown className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-glass-border">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Store Net Balance Position</p>
              <h3 className={`text-3xl font-black mt-2 ${stats.totalOutstanding > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {stats.totalOutstanding > 0 ? `+${formatCurrency(stats.totalOutstanding)} Receivables` : "Balanced"}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">Reconciled employee accounts</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Scale className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FILTER PANEL */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search notes or employee..."
            className="pl-9 bg-card/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          options={[
            { value: "", label: "All Staff" },
            ...staffList.map((s) => ({ value: s.id || "", label: s.name })),
          ]}
          value={filterStaff}
          onChange={(e) => setFilterStaff(e.target.value)}
          className="w-full sm:w-48 bg-card/50"
        />
        <Select
          options={[
            { value: "", label: "All Types" },
            { value: "salary_advance", label: "Salary Advance" },
            { value: "repayment", label: "Repayment" },
            { value: "manual_adjustment", label: "Manual Adjustment" },
            { value: "salary_deduction", label: "Salary Deduction" },
          ]}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="w-full sm:w-48 bg-card/50"
        />
        <Button variant="outline" onClick={exportToExcel} className="gap-2 shrink-0">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* TABLE */}
      <Card className="glass-card border-glass-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-glass-border bg-glass-bg/50">
                <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Staff Member</th>
                <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Direction</th>
                <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Amount</th>
                <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Creator</th>
                <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Notes</th>
                <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="border-b border-glass-border/30">
                    <td colSpan={9} className="p-4"><Skeleton className="h-6 w-full" /></td>
                  </tr>
                ))
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8">
                    <EmptyState
                      icon="📭"
                      title="No Ledger Records"
                      description="No financial transactions match your current search filters."
                    />
                  </td>
                </tr>
              ) : (
                filteredEntries.map((e) => {
                  const staff = staffList.find((s) => s.id === e.staffId);
                  
                  // Color codes
                  let typeColor = "muted";
                  if (e.type === "salary_advance") typeColor = "destructive";
                  else if (e.type === "repayment") typeColor = "success";
                  else if (e.type === "salary_deduction") typeColor = "info";
                  else if (e.type === "manual_adjustment") typeColor = "warning";

                  const directionBadge = e.direction === "employee_owes" ? (
                    <Badge variant="destructive" className="gap-1"><TrendingUp className="h-3 w-3" /> Employee Owes</Badge>
                  ) : (
                    <Badge variant="success" className="gap-1"><TrendingDown className="h-3 w-3" /> Store Owes</Badge>
                  );

                  return (
                    <tr key={e.id} className="border-b border-glass-border/40 hover:bg-glass-bg/20 transition-colors">
                      <td className="p-4 text-xs font-medium text-muted-foreground">{formatDate(e.createdAt)}</td>
                      <td className="p-4 text-sm font-bold text-foreground">{staff ? staff.name : "Unknown"}</td>
                      <td className="p-4">
                        <Badge variant={typeColor as any} className="uppercase text-[10px] tracking-wider">
                          {e.type.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="p-4">{directionBadge}</td>
                      <td className="p-4 text-sm font-black text-right text-foreground">{formatCurrency(e.amount)}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${
                          e.status === "settled" ? "bg-emerald-500/10 text-emerald-400" :
                          e.status === "partial" ? "bg-amber-500/10 text-amber-400" :
                          "bg-rose-500/10 text-rose-400"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            e.status === "settled" ? "bg-emerald-400" :
                            e.status === "partial" ? "bg-amber-400" :
                            "bg-rose-400"
                          }`} />
                          {e.status}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-muted-foreground">{e.createdBy.split("@")[0]}</td>
                      <td className="p-4 text-xs text-muted-foreground max-w-[200px] truncate" title={e.notes}>{e.notes || "-"}</td>
                      <td className="p-4 text-center">
                        {e.status !== "settled" || e.type !== "salary_deduction" ? (
                          <button
                            onClick={() => setDeleteId(e.id || null)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                            title="Delete Ledger Entry"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground/40 italic">Settled</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* RECORD LEDGER MODAL */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record Ledger Entry">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Staff Member</Label>
            <Select
              options={[
                { value: "", label: "Select Employee..." },
                ...staffList.map((s) => ({ value: s.id || "", label: s.name })),
              ]}
              {...register("staffId")}
              className="w-full bg-card"
            />
            {errors.staffId && <p className="text-xs text-red-400 mt-1">{errors.staffId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Entry Type</Label>
            <Select
              options={[
                { value: "repayment", label: "Employee Repayment (reduces debt)" },
                { value: "manual_adjustment", label: "Manual Balance Adjustment" },
              ]}
              {...register("type")}
              className="w-full bg-card"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Transaction Direction</Label>
            {watchType === "repayment" ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <p className="text-xs text-emerald-400 font-bold">Store Owes (Reduces employee debt outstanding)</p>
              </div>
            ) : (
              <Select
                options={[
                  { value: "employee_owes", label: "Employee Owes (Store paid out / Adjust up)" },
                  { value: "store_owes", label: "Store Owes (Employee paid in / Adjust down)" },
                ]}
                {...register("direction")}
                className="w-full bg-card"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Amount (₹)</Label>
            <Input
              type="number"
              placeholder="Enter amount..."
              className="bg-card"
              {...register("amount")}
            />
            {errors.amount && <p className="text-xs text-red-400 mt-1">{errors.amount.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Notes / Explanation</Label>
            <Input
              placeholder="e.g. Returned advance, manual payroll correction..."
              className="bg-card"
              {...register("notes")}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : "Save Entry"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM DELETE DIALOG */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="Delete Ledger Entry"
        description="Are you sure you want to delete this financial ledger record? This will alter outstanding employee balance reconciliation statistics. Settled entries cannot be recovered if deleted."
      />
    </div>
  );
}
