import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit2, Trash2, Phone, ChevronDown, ChevronUp, IndianRupee, HandCoins, Wallet, Clock } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input, Card, CardContent, Badge, EmptyState, Spinner, Skeleton } from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { staffService, settingsService, dueService } from "@/services";
import { type Staff, STAFF_ROLES, type DueRecord, type SalaryRecord, type SalaryPayment } from "@/types";
import { formatCurrency, formatDate, formatMonth, getInitials, generateAvatarColor } from "@/lib/utils";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/firebase/config";

const staffSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  role: z.string().min(2, "Role is required"),
  customRole: z.string().optional(),
  phone: z.string().min(10, "Enter valid phone"),
  salaryType: z.enum(["monthly", "daily"]),
  monthlySalary: z.preprocess((v) => Number(v) || 0, z.number().min(0)).default(0),
  dailyWage: z.preprocess((v) => Number(v) || 0, z.number().min(0)).default(0),
  joiningDate: z.string().optional(),
  note: z.string().optional(),
  address: z.string().optional(),
});

type StaffFormData = z.infer<typeof staffSchema>;

// ── Inline expanded history panel ─────────────────────────────────
interface TItem {
  sortKey: string; displayDate: string; icon: string;
  label: string; sub?: string; amount: number; color: string; remaining?: number;
}

function ExpandedStaffPanel({ staffId }: { staffId: string }) {
  const navigate = useNavigate();
  const [dues,    setDues]    = useState<DueRecord[]>([]);
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [payments,setPayments]= useState<SalaryPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = dueService.subscribeByStaff(staffId, setDues);
    return () => unsub();
  }, [staffId]);

  useEffect(() => {
    const load = async () => {
      const [sr, pr] = await Promise.all([
        getDocs(query(collection(db, 'salaryRecords'),  where('staffId', '==', staffId))),
        getDocs(query(collection(db, 'salaryPayments'), where('staffId', '==', staffId))),
      ]);
      setRecords( sr.docs.map(d => ({ id: d.id, ...d.data() } as SalaryRecord)));
      setPayments(pr.docs.map(d => ({ id: d.id, ...d.data() } as SalaryPayment)));
      setLoading(false);
    };
    load();
  }, [staffId]);

  const advanceTotal = dues
    .filter(d => d.type === 'EMPLOYEE_TO_OWNER' && !d.isDeleted && (d.status === 'active' || d.status === 'partial'))
    .reduce((s, d) => s + (d.remainingAmount || 0), 0);
  const dueTotal = dues
    .filter(d => d.type === 'OWNER_TO_EMPLOYEE' && !d.isDeleted && !d.linkedSalaryId && (d.status === 'active' || d.status === 'partial'))
    .reduce((s, d) => s + (d.remainingAmount || 0), 0);
  const pendingTotal = dues
    .filter(d => d.type === 'OWNER_TO_EMPLOYEE' && !d.isDeleted && !!d.linkedSalaryId && (d.status === 'active' || d.status === 'partial'))
    .reduce((s, d) => s + (d.remainingAmount || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + p.amountPaid, 0);

  // Build timeline
  const items: TItem[] = [];
  records.forEach(r => {
    const mo = `${r.year}-${String(r.month).padStart(2, '0')}`;
    items.push({
      sortKey: r.updatedAt || r.createdAt || '',
      displayDate: formatDate(r.updatedAt || r.createdAt || ''),
      icon: r.remainingDue > 0 ? '⏳' : '💰',
      label: r.remainingDue > 0 ? 'Salary Pending' : 'Salary Paid',
      sub: formatMonth(mo),
      amount: r.totalPaid,
      color: r.remainingDue > 0 ? 'text-rose-500' : 'text-emerald-500',
      remaining: r.remainingDue > 0 ? r.remainingDue : undefined,
    });
  });
  dues.filter(d => !d.isDeleted).forEach(d => {
    const isAdv = d.type === 'EMPLOYEE_TO_OWNER';
    items.push({
      sortKey: d.date || d.createdAt || '',
      displayDate: formatDate(d.date || d.createdAt || ''),
      icon: isAdv ? '🤝' : d.linkedSalaryId ? '📌' : '📋',
      label: isAdv ? 'Advance Given' : d.linkedSalaryId ? 'Pending Salary' : 'Due Added',
      sub: d.notes,
      amount: d.amount,
      color: isAdv ? 'text-amber-500' : d.linkedSalaryId ? 'text-orange-500' : 'text-blue-500',
      remaining: (d.remainingAmount ?? d.amount) !== d.amount ? (d.remainingAmount ?? d.amount) : undefined,
    });
  });
  items.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  return (
    <div className="pt-4 border-t border-border mt-3">
      {/* 4 Summary Cards */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-emerald-500/10 rounded-xl p-2.5 text-center">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Salary Paid</p>
          <p className="text-sm font-bold text-emerald-500">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-amber-500/10 rounded-xl p-2.5 text-center">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Advance</p>
          <p className="text-sm font-bold text-amber-500">{formatCurrency(advanceTotal)}</p>
        </div>
        <div className="bg-blue-500/10 rounded-xl p-2.5 text-center">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Due</p>
          <p className="text-sm font-bold text-blue-500">{formatCurrency(dueTotal)}</p>
        </div>
        <div className="bg-rose-500/10 rounded-xl p-2.5 text-center">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Pending</p>
          <p className="text-sm font-bold text-rose-500">{formatCurrency(pendingTotal)}</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="flex justify-between mb-3">
        <button onClick={() => navigate(`/salary/${staffId}`)} className="text-[11px] font-semibold text-indigo-500 hover:underline">→ Salary</button>
        <button onClick={() => navigate(`/money/${staffId}`)}  className="text-[11px] font-semibold text-indigo-500 hover:underline">Advance / Due →</button>
      </div>

      {/* Timeline */}
      {loading ? (
        <p className="text-[11px] text-center text-muted-foreground py-2">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-[11px] text-center text-muted-foreground py-3">No history yet.</p>
      ) : (
        <div className="space-y-0">
          {items.map((t, i) => (
            <div key={i} className="flex items-start justify-between gap-2 py-2 border-b border-border/40 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-xs">{t.icon}</span>
                  <span className="text-xs font-semibold text-foreground">{t.label}</span>
                  {t.sub && <span className="text-[10px] text-muted-foreground truncate">{t.sub}</span>}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t.displayDate}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-xs font-bold ${t.color}`}>{formatCurrency(t.amount)}</p>
                {t.remaining !== undefined && (
                  <p className="text-[9px] text-muted-foreground">Rem: {formatCurrency(t.remaining)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StaffManagement() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Staff | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [customRoles, setCustomRoles] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode");

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<StaffFormData>({
    resolver: zodResolver(staffSchema),
    defaultValues: { salaryType: "monthly", monthlySalary: 0, dailyWage: 0 },
  });

  const salaryType = watch("salaryType");
  const selectedRole = watch("role");

  useEffect(() => {
    setLoading(true);
    
    // Fetch custom roles
    settingsService.getCustomRoles().then(setCustomRoles);

    const unsubscribe = staffService.subscribeAll((data) => {
      setStaff(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filtered = staff.filter((s) => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.role.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === "all" || s.role === filterRole;
    const matchStatus = filterStatus === "all" || s.status === filterStatus;
    return matchSearch && matchRole && matchStatus;
  });

  const openAdd = () => {
    setEditItem(null);
    reset({ salaryType: "monthly", monthlySalary: 0, dailyWage: 0, joiningDate: new Date().toISOString().split("T")[0] });
    setModalOpen(true);
  };

  const openEdit = (s: Staff) => {
    setEditItem(s);
    reset({
      name: s.name, role: s.role, phone: s.phone,
      salaryType: s.salaryType, monthlySalary: s.monthlySalary, dailyWage: s.dailyWage,
      joiningDate: s.joiningDate,
      note: s.note || "", address: s.address || "",
    });
    setModalOpen(true);
  };

  const onSubmit = async (data: StaffFormData) => {
    setSaving(true);
    try {
      let finalRole = data.role;
      if (data.role === "other" && data.customRole) {
        finalRole = data.customRole.trim().toLowerCase();
        await settingsService.addCustomRole(finalRole);
        if (!customRoles.includes(finalRole)) {
          setCustomRoles([...customRoles, finalRole]);
        }
      }

      const rawPayload = {
        name: data.name,
        role: finalRole,
        phone: data.phone,
        salaryType: data.salaryType,
        monthlySalary: data.monthlySalary,
        dailyWage: data.dailyWage,
        joiningDate: data.joiningDate || new Date().toISOString().split("T")[0],
        note: data.note || "",
        address: data.address || "",
      };

      // Remove any undefined/null-ish values Firestore cannot handle
      const payload = Object.fromEntries(
        Object.entries(rawPayload).filter(([, v]) => v !== undefined && v !== null)
      ) as typeof rawPayload;

      if (editItem?.id) {
        await staffService.update(editItem.id, payload);
        toast({ type: "success", title: "Staff Updated" });
      } else {
        await staffService.add({
          ...payload,
          leaveCount: 0,
          status: "active",
        } as any);
        toast({ type: "success", title: "Staff Added", description: `${payload.name} added successfully.` });
      }
      setModalOpen(false);
    } catch (err: any) {
      console.error("[StaffManagement.onSubmit]", err);
      toast({
        type: "error",
        title: "Failed to save staff",
        description: err?.message || "Check your internet connection and try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await staffService.delete(id);
    toast({ type: "success", title: "Staff Deleted" });
  };

  const toggleStatus = async (s: Staff) => {
    await staffService.update(s.id!, { status: s.status === "active" ? "inactive" : "active" });
  };

  return (
    <div className="space-y-5 pb-20 lg:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
          {mode === "salary" ? "Select Staff for Salary" : mode === "money" ? "Select Staff for Money" : mode === "history" ? "Select Staff to View History" : "Staff Management"}
          </h1>
          <p className="text-sm text-muted-foreground">{staff.filter((s) => s.status === "active").length} active members</p>
        </div>
        {!mode && <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" /> Add Staff</Button>}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="flex h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="all">All Roles</option>
          {STAFF_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          {customRoles.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="flex h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="👥" title="No staff found" description="Add your first staff member to get started" action={<Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Staff</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          {filtered.map((s) => (
            <Card
              key={s.id}
              className={`overflow-hidden transition-shadow duration-200 cursor-pointer hover:shadow-md ${
                expandedId === s.id ? 'ring-2 ring-indigo-500/30' : ''
              }`}
              onClick={() => !mode && setExpandedId(prev => prev === s.id ? null : s.id!)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3.5">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${generateAvatarColor(s.name)} flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm`}>
                      {getInitials(s.name)}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm leading-tight">{s.name}</p>
                      <p className="text-[11px] text-muted-foreground capitalize mt-0.5">{s.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.status === "active" ? "success" : "secondary"} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleStatus(s); }}>
                      {s.status}
                    </Badge>
                    {!mode && (
                      expandedId === s.id
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 text-xs mb-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3 w-3" /><span>{s.phone}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Salary</span>
                    <span className="font-semibold text-foreground">
                      {s.salaryType === "monthly"
                        ? `${formatCurrency(s.monthlySalary)}/mo`
                        : `${formatCurrency(s.dailyWage)}/day`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Since</span>
                    <span className="text-foreground">{formatDate(s.joiningDate)}</span>
                  </div>
                </div>

                {mode ? (
                  <Button variant="default" size="sm" className="w-full h-9" onClick={(e) => { e.stopPropagation(); navigate(`/${mode}/${s.id}`); }}>
                    Select
                  </Button>
                ) : (
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button variant="secondary" size="sm" className="flex-1 gap-1.5 h-8" onClick={() => openEdit(s)}>
                      <Edit2 className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <button onClick={() => setDeleteId(s.id!)} className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <div
                  style={{
                    maxHeight: expandedId === s.id ? '1200px' : '0px',
                    opacity: expandedId === s.id ? 1 : 0,
                    overflow: 'hidden',
                    transition: 'max-height 0.35s ease, opacity 0.25s ease',
                  }}
                >
                  {expandedId === s.id && <ExpandedStaffPanel staffId={s.id!} />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? "Edit Staff" : "Add New Staff"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Full Name *</label>
              <Input {...register("name")} placeholder="Staff name" />
              {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Role *</label>
              <select {...register("role")} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Select Role</option>
                {STAFF_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                {customRoles.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
                <option value="other">Other</option>
              </select>
              {errors.role && <p className="text-xs text-red-400 mt-1">{errors.role.message}</p>}
            </div>

            {selectedRole === "other" && (
              <div className="col-span-2 sm:col-span-1">
                <label className="text-sm font-medium text-foreground block mb-1.5">Custom Role *</label>
                <Input {...register("customRole")} placeholder="e.g. Machine Operator" required />
                {errors.customRole && <p className="text-xs text-red-400 mt-1">{errors.customRole.message}</p>}
              </div>
            )}
            
            <div className={selectedRole === "other" ? "col-span-2 sm:col-span-1" : ""}>
              <label className="text-sm font-medium text-foreground block mb-1.5">Phone *</label>
              <Input {...register("phone")} placeholder="9876543210" />
              {errors.phone && <p className="text-xs text-red-400 mt-1">{errors.phone.message}</p>}
            </div>

            {/* Salary Type Toggle */}
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Salary Type *</label>
              <div className="flex rounded-lg bg-muted p-1 gap-1">
                <label className={`flex-1 text-center py-2 text-sm rounded-md cursor-pointer transition-all ${salaryType === "monthly" ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"}`}>
                  <input type="radio" {...register("salaryType")} value="monthly" className="sr-only" />
                  📅 Monthly
                </label>
                <label className={`flex-1 text-center py-2 text-sm rounded-md cursor-pointer transition-all ${salaryType === "daily" ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"}`}>
                  <input type="radio" {...register("salaryType")} value="daily" className="sr-only" />
                  📆 Daily
                </label>
              </div>
            </div>

            {salaryType === "monthly" && (
              <div className="col-span-2">
                <label className="text-sm font-medium text-foreground block mb-1.5">Monthly Salary (₹) *</label>
                <Input type="number" min={0} {...register("monthlySalary", { valueAsNumber: true })} placeholder="15000" />
              </div>
            )}
            {salaryType === "daily" && (
              <div className="col-span-2">
                <label className="text-sm font-medium text-foreground block mb-1.5">Daily Wage (₹) *</label>
                <Input type="number" min={0} {...register("dailyWage", { valueAsNumber: true })} placeholder="450" />
              </div>
            )}

            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Joining Date *</label>
              <Input type="date" {...register("joiningDate")} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground block mb-1.5">Note</label>
              <Input {...register("note")} placeholder="Optional note..." />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : editItem ? "Update Staff" : "Add Staff"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="Delete Staff Member"
        description="This will permanently remove this staff member and all their records."
        confirmText="Delete"
      />
    </div>
  );
}
