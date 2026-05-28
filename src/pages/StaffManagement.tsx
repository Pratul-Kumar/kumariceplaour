import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit2, Trash2, User, Phone, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Card, CardContent, Badge, EmptyState, Spinner, Skeleton } from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { staffService, settingsService } from "@/services";
import { type Staff, STAFF_ROLES } from "@/types";
import { formatCurrency, formatDate, getInitials, generateAvatarColor } from "@/lib/utils";

const staffSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  role: z.string().min(2, "Role is required"),
  customRole: z.string().optional(),
  phone: z.string().min(10, "Enter valid phone"),
  salaryType: z.enum(["monthly", "daily"]),
  monthlySalary: z.preprocess((v) => Number(v) || 0, z.number().min(0)).default(0),
  dailyWage: z.preprocess((v) => Number(v) || 0, z.number().min(0)).default(0),
  joiningDate: z.string().optional(),
  allowedCasualLeavesPerMonth: z.preprocess((v) => Number(v) || 2, z.number().min(0).max(31)).default(2),
  note: z.string().optional(),
  address: z.string().optional(),
});

type StaffFormData = z.infer<typeof staffSchema>;

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
  const { toast } = useToast();
  const navigate = useNavigate();

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<StaffFormData>({
    resolver: zodResolver(staffSchema),
    defaultValues: { salaryType: "monthly", monthlySalary: 0, dailyWage: 0, allowedCasualLeavesPerMonth: 2 },
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
    reset({ salaryType: "monthly", monthlySalary: 0, dailyWage: 0, allowedCasualLeavesPerMonth: 2, joiningDate: new Date().toISOString().split("T")[0] });
    setModalOpen(true);
  };

  const openEdit = (s: Staff) => {
    setEditItem(s);
    reset({
      name: s.name, role: s.role, phone: s.phone,
      salaryType: s.salaryType, monthlySalary: s.monthlySalary, dailyWage: s.dailyWage,
      joiningDate: s.joiningDate, allowedCasualLeavesPerMonth: s.allowedCasualLeavesPerMonth,
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

      const payload = {
        name: data.name,
        role: finalRole,
        phone: data.phone,
        salaryType: data.salaryType,
        monthlySalary: data.monthlySalary,
        dailyWage: data.dailyWage,
        joiningDate: data.joiningDate || new Date().toISOString().split("T")[0],
        allowedCasualLeavesPerMonth: data.allowedCasualLeavesPerMonth,
        note: data.note,
        address: data.address,
      };

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
          <h1 className="text-xl font-bold text-foreground">Staff Management</h1>
          <p className="text-sm text-muted-foreground">{staff.filter((s) => s.status === "active").length} active members</p>
        </div>
        <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" /> Add Staff</Button>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <Card key={s.id} className="group hover:shadow-lg transition-all duration-200">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${generateAvatarColor(s.name)} flex items-center justify-center text-white font-bold text-sm shadow-lg`}>
                      {getInitials(s.name)}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{s.role}</p>
                    </div>
                  </div>
                  <Badge variant={s.status === "active" ? "success" : "secondary"} className="cursor-pointer" onClick={() => toggleStatus(s)}>
                    {s.status}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm mb-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /><span>{s.phone}</span>
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
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Leaves</span>
                    <span className={`font-medium ${s.leaveCount > s.allowedCasualLeavesPerMonth ? "text-red-400" : "text-foreground"}`}>
                      {s.leaveCount} / {s.allowedCasualLeavesPerMonth} allowed
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => navigate(`/staff/${s.id}`)}>
                    <Eye className="h-3.5 w-3.5" /> View
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => openEdit(s)}>
                    <Edit2 className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <button onClick={() => setDeleteId(s.id!)} className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
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

            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Joining Date *</label>
              <Input type="date" {...register("joiningDate")} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Casual Leaves/Month</label>
              <Input type="number" min={0} max={31} {...register("allowedCasualLeavesPerMonth", { valueAsNumber: true })} placeholder="2" />
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
