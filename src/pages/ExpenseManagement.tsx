import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Search, Edit2, Trash2, Filter, Download, TrendingDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  Button, Input, Select, Card, CardContent, CardHeader, CardTitle,
  Badge, EmptyState, Spinner, Skeleton
} from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { expenseService, staffService } from "@/services";
import { EXPENSE_CATEGORIES, getCategoryInfo, type Expense, type ExpenseCategory, type Staff } from "@/types";
import { formatCurrency, formatDate, getCurrentMonth } from "@/lib/utils";
// XLSX loaded dynamically on export click (saves 208KB gzip on initial load)

const expenseSchema = z.object({
  title: z.string().min(2, "Title required"),
  amount: z.preprocess((v) => Number(v) || 0, z.number().min(1, "Enter a valid amount")),
  category: z.enum(["item_expense","salary","bonus","electricity","rent","internet","transport","maintenance","extra_expense","miscellaneous"] as const),
  date: z.string().min(1, "Date required"),
  note: z.string().optional(),
  staffId: z.string().optional(),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-sm">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-primary font-semibold">{formatCurrency(payload[0].value)}</p>
    </div>
  );
};

export function ExpenseManagement() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth());
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [categoryTotals, setCategoryTotals] = useState<Record<string, number>>({});
  const { toast } = useToast();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { date: new Date().toISOString().split("T")[0], category: "item_expense" },
  });

  useEffect(() => {
    setLoading(true);
    let unsubExpenses: () => void;
    let unsubStaff: () => void;

    const setup = async () => {
      // We can compute category totals on the fly from the expenses array
      unsubStaff = staffService.subscribeAll((data) => setStaff(data));
      unsubExpenses = expenseService.subscribeByMonth(filterMonth, (data) => {
        setExpenses(data);
        
        // Compute category totals
        const totals: Record<string, number> = {};
        data.forEach(e => {
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
  });

  const monthTotal = filtered.reduce((s, e) => s + e.amount, 0);

  const openAdd = () => {
    setEditItem(null);
    reset({ date: new Date().toISOString().split("T")[0], category: "item_expense" });
    setModalOpen(true);
  };

  const openEdit = (e: Expense) => {
    setEditItem(e);
    reset({ title: e.title, amount: e.amount, category: e.category, date: e.date, note: e.note || "", staffId: e.staffId });
    setModalOpen(true);
  };

  const onSubmit = async (data: ExpenseFormData) => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (editItem?.id) {
        const payload: any = { ...data };
        if (!payload.staffId) delete payload.staffId;
        await expenseService.update(editItem.id, payload);
        toast({ type: "success", title: "Expense Updated" });
      } else {
        const payload: any = { ...data, date: data.date };
        if (!payload.staffId) delete payload.staffId;
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

  const chartData = Object.entries(categoryTotals).map(([cat, amt]) => ({
    name: getCategoryInfo(cat as ExpenseCategory).label.split(" ")[0],
    amount: amt,
    color: getCategoryInfo(cat as ExpenseCategory).color,
  }));

  return (
    <div className="space-y-5 pb-20 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Expenses</h1>
          <p className="text-sm text-muted-foreground">Total: <span className="text-red-400 font-semibold">{formatCurrency(monthTotal)}</span></p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportToExcel} className="gap-2 hidden sm:flex">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" /> Add</Button>
        </div>
      </div>

      {/* Month Selector + Search */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="sm:w-44" />
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search expenses..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select
          options={EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
          placeholder="All Categories"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="sm:w-44"
        />
      </div>

      {/* Category Summary */}
      {!loading && chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} barSize={28}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <rect key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Category Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilterCategory("")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${!filterCategory ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
        >
          All ({expenses.length})
        </button>
        {EXPENSE_CATEGORIES.map((cat) => {
          const count = expenses.filter((e) => e.category === cat.value).length;
          if (count === 0) return null;
          return (
            <button
              key={cat.value}
              onClick={() => setFilterCategory(cat.value === filterCategory ? "" : cat.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${filterCategory === cat.value ? "text-white shadow-md" : "bg-muted text-muted-foreground hover:bg-accent"}`}
              style={filterCategory === cat.value ? { backgroundColor: cat.color } : {}}
            >
              {cat.icon} {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Expense List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="💸"
          title="No expenses found"
          description={search ? "Try different filters" : "Add your first expense"}
          action={<Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Expense</Button>}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((exp) => {
            const cat = getCategoryInfo(exp.category);
            return (
              <Card key={exp.id} className="group hover:shadow-md transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: `${cat.color}20` }}>
                      {cat.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{exp.title}</p>
                      <p className="text-xs text-muted-foreground">{cat.label} · {formatDate(exp.date)}</p>
                      {exp.note && <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{exp.note}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-base font-bold text-red-400">- {formatCurrency(exp.amount)}</p>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(exp)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setDeleteId(exp.id!)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? "Edit Expense" : "Add Expense"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Title *</label>
            <Input {...register("title")} placeholder="Expense description" />
            {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Staff Relation (Optional)</label>
              <select {...register("staffId")} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">None</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Amount *</label>
              <Input {...register("amount")} placeholder="0" type="number" min={0} />
              {errors.amount && <p className="text-xs text-red-400 mt-1">{errors.amount.message}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Date *</label>
              <Input {...register("date")} type="date" />
              {errors.date && <p className="text-xs text-red-400 mt-1">{errors.date.message}</p>}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Category *</label>
            <Select options={EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: `${c.icon} ${c.label}` }))} {...register("category")} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Note</label>
            <Input {...register("note")} placeholder="Optional note..." />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : editItem ? "Update" : "Add Expense"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="Delete Expense"
        description="This expense record will be permanently deleted."
        confirmText="Delete"
      />
    </div>
  );
}
