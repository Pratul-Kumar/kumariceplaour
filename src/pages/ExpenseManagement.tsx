import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Search, Edit2, Trash2, Download, Receipt, TrendingDown, TrendingUp, Filter } from "lucide-react";

import {
  Button, Input, Select, Card, CardContent, CardHeader, CardTitle,
  Badge, EmptyState, Spinner, Skeleton
} from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { expenseService, staffService } from "@/services";
import { EXPENSE_CATEGORIES, getCategoryInfo, type Expense, type ExpenseCategory, type Staff } from "@/types";
import { formatCurrency, formatDate, getCurrentMonth } from "@/lib/utils";

const expenseSchema = z.object({
  title: z.string().min(2, "Title required"),
  amount: z.preprocess((v) => Number(v) || 0, z.number().min(1, "Enter a valid amount")),
  category: z.enum(["item_expense","salary","salary_advance","bonus","electricity","rent","internet","transport","maintenance","extra_expense","miscellaneous"] as const),
  date: z.string().min(1, "Date required"),
  note: z.string().optional(),
  staffId: z.string().optional(),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;



export function ExpenseManagement() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth());
  const [sortOrder, setSortOrder] = useState<"latest" | "oldest" | "high" | "low">("latest");
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [categoryTotals, setCategoryTotals] = useState<Record<string, number>>({});
  const { toast } = useToast();

  const { register, handleSubmit, reset, watch, setValue, setError, formState: { errors } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { date: new Date().toISOString().split("T")[0], category: "item_expense" },
  });

  const watchCategory = watch("category");
  const watchStaffId = watch("staffId");

  // Dynamic Title Logic
  useEffect(() => {
    if (editItem) return;
    switch(watchCategory) {
      case "salary_advance":
        const st = staff.find(s => s.id === watchStaffId);
        setValue("title", `Salary Advance${st ? ` - ${st.name}` : ''}`);
        break;
      case "rent": setValue("title", "Shop Rent"); break;
      case "electricity": setValue("title", "Electricity Bill"); break;
      case "internet": setValue("title", "Internet Bill"); break;
      case "transport": setValue("title", "Transport Expense"); break;
      case "maintenance": setValue("title", "Maintenance / Repairs"); break;
      case "bonus": setValue("title", "Employee Bonus"); break;
      case "item_expense":
      case "miscellaneous":
      case "extra_expense":
        setValue("title", ""); 
        break;
    }
  }, [watchCategory, watchStaffId, editItem, setValue, staff]);

  useEffect(() => {
    setLoading(true);
    let unsubExpenses: () => void;
    let unsubStaff: () => void;

    const setup = async () => {
      unsubStaff = staffService.subscribeAll((data) => setStaff(data));
      unsubExpenses = expenseService.subscribeByMonth(filterMonth, (data) => {
        const filteredData = data.filter(e => e.category !== "salary" && e.category !== "salary_advance" && e.category !== "bonus");
        setExpenses(filteredData);
        const totals: Record<string, number> = {};
        filteredData.forEach(e => {
          totals[e.category] = (totals[e.category] || 0) + e.amount;
        });
        setCategoryTotals(totals);
        setLoading(false);
      });
    };
    
    setup();
    return () => {
      if (unsubExpenses) unsubExpenses();
      if (unsubStaff) unsubStaff();
    };
  }, [filterMonth]);

  const filtered = expenses.filter((e) => {
    const matchSearch = e.title.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCategory || e.category === filterCategory;
    return matchSearch && matchCat;
  }).sort((a, b) => {
    if (sortOrder === "latest") return b.date.localeCompare(a.date);
    if (sortOrder === "oldest") return a.date.localeCompare(b.date);
    if (sortOrder === "high") return b.amount - a.amount;
    if (sortOrder === "low") return a.amount - b.amount;
    return 0;
  });

  const monthTotal = filtered.reduce((s, e) => s + e.amount, 0);

  const openAdd = () => {
    setEditItem(null);
    reset({ title: "", amount: 0 as any, date: new Date().toISOString().split("T")[0], category: "item_expense", staffId: "", note: "" });
    setModalOpen(true);
  };

  const openEdit = (e: Expense) => {
    setEditItem(e);
    reset({ title: e.title, amount: e.amount, category: e.category, date: e.date, note: e.note || "", staffId: e.staffId });
    setModalOpen(true);
  };

  const onSubmit = async (data: ExpenseFormData) => {
    if (data.category === "salary_advance" && !data.staffId) {
      setError("staffId", { message: "Staff selection is mandatory for Salary Advance" });
      return;
    }
    setSaving(true);
    try {
      if (editItem?.id) {
        const payload: any = { ...data };
        if (!payload.staffId || payload.category !== "salary_advance") delete payload.staffId;
        await expenseService.update(editItem.id, payload);
        toast({ type: "success", title: "Expense Updated" });
      } else {
        const payload: any = { ...data };
        if (!payload.staffId || payload.category !== "salary_advance") delete payload.staffId;
        await expenseService.add(payload);
        toast({ type: "success", title: "Expense Added", description: `${formatCurrency(data.amount)} recorded.` });
      }
      setModalOpen(false);
    } catch (err: any) {
      console.error("[ExpenseManagement.onSubmit]", err);
      toast({ type: "error", title: "Error saving expense", description: err.message || "Try again." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await expenseService.delete(id);
    toast({ type: "success", title: "Expense Deleted" });
  };

  const exportToExcel = async () => {
    const data = filtered.map((e) => ({
      Title: e.title,
      Amount: e.amount,
      Category: getCategoryInfo(e.category).label,
      Date: formatDate(e.date),
      Note: e.note || "",
    }));
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    XLSX.writeFile(wb, `expenses-${filterMonth}.xlsx`);
    toast({ type: "success", title: "Exported to Excel" });
  };



  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      {/* 1. TOP CONTROLS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financial Ledger</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and track your operational expenses.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="w-full sm:w-44" />
          <Button onClick={openAdd} className="gap-2 shadow-[0_0_20px_rgba(99,102,241,0.3)]"><Plus className="h-4 w-4" /> Record Expense</Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search records by title..." className="pl-9 bg-card/50" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select
          options={[
            { value: "latest", label: "Date: Latest First" },
            { value: "oldest", label: "Date: Oldest First" },
            { value: "high", label: "Amount: High to Low" },
            { value: "low", label: "Amount: Low to High" },
          ]}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as any)}
          className="w-full sm:w-48 bg-card/50"
        />
        <Button variant="outline" onClick={exportToExcel} className="gap-2 hidden sm:flex shrink-0">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {!loading && (
        <Card className="glass-card relative overflow-hidden border-glass-border shadow-2xl mb-6">
          <CardContent className="p-6 flex flex-col items-start gap-1">
             <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Total Spends</p>
             <p className="text-3xl font-black text-foreground drop-shadow-md">{formatCurrency(monthTotal)}</p>
          </CardContent>
        </Card>
      )}

      {/* 3. CATEGORY FILTER PILLS */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide snap-x">
        <button
          onClick={() => setFilterCategory("")}
          className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all snap-start ${!filterCategory ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-[0_4px_20px_rgba(99,102,241,0.4)] scale-105" : "bg-card/40 text-muted-foreground hover:bg-card hover:text-white border border-glass-border"}`}
        >
          <Receipt className="h-4 w-4" /> All Records
          <span className="bg-black/20 px-2 py-0.5 rounded-md text-xs">{expenses.length}</span>
        </button>
        {EXPENSE_CATEGORIES.map((cat) => {
          const count = expenses.filter((e) => e.category === cat.value).length;
          if (count === 0) return null;
          return (
            <button
              key={cat.value}
              onClick={() => setFilterCategory(cat.value === filterCategory ? "" : cat.value)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all snap-start ${filterCategory === cat.value ? "text-white shadow-xl scale-105" : "bg-card/40 text-muted-foreground hover:bg-card hover:text-white border border-glass-border"}`}
              style={filterCategory === cat.value ? { background: `linear-gradient(135deg, ${cat.color}, ${cat.color}cc)`, boxShadow: `0 4px 20px ${cat.color}40`, border: `1px solid ${cat.color}50` } : {}}
            >
              <span className="text-base">{cat.icon}</span> {cat.label}
              <span className="bg-black/20 px-2 py-0.5 rounded-md text-xs">{count}</span>
            </button>
          );
        })}
      </div>

      {/* 4. EXPENSE LIST (TIMELINE) */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="📭"
            title="No records found"
            description={search ? "Adjust your filters to see results" : "Your ledger is clean for this period."}
            action={<Button variant="glow" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Record</Button>}
          />
        ) : (
          filtered.map((exp) => {
            const cat = getCategoryInfo(exp.category);
            return (
              <div key={exp.id} className="group relative flex items-center gap-4 p-4 rounded-2xl bg-card/30 hover:bg-card/80 border border-glass-border hover:border-glass-border transition-all hover:shadow-xl hover:-translate-y-0.5 overflow-hidden">
                <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity bg-gradient-to-r from-[${cat.color}] to-transparent pointer-events-none`} />
                
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 shadow-inner" style={{ backgroundColor: `${cat.color}20`, border: `1px solid ${cat.color}30` }}>
                  {cat.icon}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-base font-bold text-foreground truncate">{exp.title}</p>
                    {exp.category === "salary_advance" && (
                      <Badge variant="warning" className="text-[10px] uppercase tracking-widest py-0 border-warning/30 bg-warning/10 text-warning hidden sm:inline-flex">Linked Advance</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                      {cat.label}
                    </span>
                    <span className="text-xs text-muted-foreground/50">•</span>
                    <span className="text-xs text-muted-foreground">{formatDate(exp.date)}</span>
                    
                    {exp.staffId && (
                      <>
                        <span className="text-xs text-muted-foreground/50">•</span>
                        <span className="text-xs text-emerald-400 font-medium bg-emerald-400/10 px-2 py-0.5 rounded-md">
                          {staff.find(s => s.id === exp.staffId)?.name || "Unknown"}
                        </span>
                      </>
                    )}
                  </div>
                  {exp.note && <p className="text-xs text-muted-foreground/60 truncate mt-2 italic flex items-center gap-1"><span className="text-muted-foreground/40">↳</span> {exp.note}</p>}
                </div>
                
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <p className="text-lg font-black text-foreground tracking-tight drop-shadow-sm">
                    {formatCurrency(exp.amount)}
                  </p>
                  <div className="flex gap-1.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(exp)} className="p-2 rounded-xl bg-accent/50 hover:bg-accent text-foreground transition-colors shadow-sm">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setDeleteId(exp.id!)} className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors shadow-sm">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DYNAMIC WORKFLOW MODAL */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? "Edit Record" : "New Record"} className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-2">
          
          {/* 1. Category Field (First) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Category</label>
            <Select options={EXPENSE_CATEGORIES.filter(c => c.value !== "salary" && c.value !== "salary_advance" && c.value !== "bonus").map((c) => ({ value: c.value, label: `${c.icon} ${c.label}` }))} {...register("category")} className="h-12 bg-card/50" />
          </div>

          {/* 3. Title Field (Auto-generates but editable) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Description Title</label>
            <Input {...register("title")} placeholder="e.g., Office Supplies, Bill Name..." className="h-12 bg-card/50" />
            {errors.title && <p className="text-xs text-red-400">{errors.title.message}</p>}
          </div>
          
          {/* 4. Amount & Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₹</span>
                <Input {...register("amount")} placeholder="0.00" type="number" min={0} step="any" className="pl-7 h-12 bg-card/50 font-bold text-lg" />
              </div>
              {errors.amount && <p className="text-xs text-red-400">{errors.amount.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Date</label>
              <Input {...register("date")} type="date" className="h-12 bg-card/50" />
              {errors.date && <p className="text-xs text-red-400">{errors.date.message}</p>}
            </div>
          </div>
          
          {/* 5. Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Optional Notes</label>
            <textarea {...register("note")} placeholder="Add any additional context or reference numbers here..." className="flex min-h-[80px] w-full rounded-xl border border-glass-border bg-card/50 px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none shadow-inner" />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-glass-border pb-2">
            <Button type="button" variant="outline" className="flex-1 h-12 rounded-xl border-glass-border" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1 h-12 rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.4)]" disabled={saving}>
              {saving ? <Spinner className="h-5 w-5" /> : editItem ? "Save Changes" : "Confirm Record"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="Delete Record"
        description="This financial record will be permanently deleted. If this is a linked salary advance, the system will lose its deduction reference."
        confirmText="Delete Permanently"
      />
    </div>
  );
}
