import { useState, useEffect } from "react";
import { format, getDaysInMonth, startOfMonth, parseISO } from "date-fns";
import { CheckCircle, XCircle, Clock, CalendarOff, Save, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Skeleton, EmptyState, Select } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { staffService, attendanceService } from "@/services";
import { type Staff, type Attendance, type AttendanceStatus } from "@/types";
import { getCurrentMonth, getInitials, generateAvatarColor, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; short: string; bg: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
  present:  { label: "Present",  short: "P",  bg: "bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30", text: "text-emerald-400", icon: CheckCircle },
  absent:   { label: "Absent",   short: "A",  bg: "bg-red-500/15 hover:bg-red-500/25 border-red-500/30",           text: "text-red-400",     icon: XCircle },
  half_day: { label: "Half Day", short: "H",  bg: "bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30",     text: "text-amber-400",   icon: Clock },
  leave:    { label: "Leave",    short: "L",  bg: "bg-blue-500/15 hover:bg-blue-500/25 border-blue-500/30",        text: "text-blue-400",    icon: CalendarOff },
};

// Daily attendance marking screen
function DailyAttendance({ staff, month }: { staff: Staff[]; month: string }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [attendance, setAttendance] = useState<Record<number, Attendance>>({});
  const [overtimeMap, setOvertimeMap] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadAttendance(selectedDate);
  }, [selectedDate]);

  const loadAttendance = async (date: string) => {
    const records = await attendanceService.getByDate(date);
    const map: Record<number, Attendance> = {};
    const otMap: Record<number, number> = {};
    for (const r of records) {
      if (r.staffId) { map[r.staffId] = r; otMap[r.staffId] = r.overtimeHours; }
    }
    setAttendance(map);
    setOvertimeMap(otMap);
  };

  const setStatus = (staffId: number, status: AttendanceStatus) => {
    const now = new Date().toISOString();
    setAttendance((prev) => ({
      ...prev,
      [staffId]: {
        ...(prev[staffId] || { staffId, date: selectedDate, overtimeHours: 0, createdAt: now, updatedAt: now }),
        status,
        updatedAt: now,
      },
    }));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      for (const staffId of staff.map((s) => s.id!)) {
        const att = attendance[staffId];
        if (!att) continue;
        await attendanceService.upsert({
          staffId, date: selectedDate,
          status: att.status,
          overtimeHours: overtimeMap[staffId] || 0,
          notes: att.notes,
          createdAt: att.createdAt || now,
          updatedAt: now,
        });
      }
      toast({ type: "success", title: "Attendance Saved", description: `Attendance for ${formatDate(selectedDate)} saved.` });
    } catch {
      toast({ type: "error", title: "Error saving attendance" });
    } finally {
      setSaving(false);
    }
  };

  const markAll = (status: AttendanceStatus) => {
    const now = new Date().toISOString();
    const newMap: Record<number, Attendance> = {};
    for (const s of staff) {
      newMap[s.id!] = { staffId: s.id!, date: selectedDate, status, overtimeHours: overtimeMap[s.id!] || 0, createdAt: now, updatedAt: now };
    }
    setAttendance(newMap);
  };

  const presentCount = Object.values(attendance).filter((a) => a.status === "present").length;
  const absentCount = Object.values(attendance).filter((a) => a.status === "absent").length;

  return (
    <div className="space-y-4">
      {/* Date + Quick Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground block mb-1">Select Date</label>
          <input
            type="date"
            value={selectedDate}
            max={new Date().toISOString().split("T")[0]}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => markAll("present")} className="text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10">
            <CheckCircle className="h-3.5 w-3.5 mr-1" /> All Present
          </Button>
          <Button variant="outline" size="sm" onClick={() => markAll("absent")} className="text-red-400 border-red-500/30 hover:bg-red-500/10">
            <XCircle className="h-3.5 w-3.5 mr-1" /> All Absent
          </Button>
          <Button size="sm" onClick={saveAll} disabled={saving} className="gap-2">
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Summary Pills */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-medium">
          <CheckCircle className="h-3.5 w-3.5" /> Present: {presentCount}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/15 text-red-400 text-xs font-medium">
          <XCircle className="h-3.5 w-3.5" /> Absent: {absentCount}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
          <Users className="h-3.5 w-3.5" /> Total: {staff.length}
        </div>
      </div>

      {/* Staff Attendance List */}
      <div className="space-y-2">
        {staff.map((s) => {
          const att = attendance[s.id!];
          const currentStatus = att?.status;
          return (
            <Card key={s.id} className="group">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${generateAvatarColor(s.name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {getInitials(s.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{s.role} · {s.salaryType === "monthly" ? `₹${s.monthlySalary.toLocaleString()}/mo` : `₹${s.dailyWage}/day`}</p>
                  </div>
                  {/* Status Buttons */}
                  <div className="flex gap-1 shrink-0">
                    {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([status, cfg]) => (
                      <button
                        key={status}
                        onClick={() => setStatus(s.id!, status)}
                        title={cfg.label}
                        className={cn(
                          "w-9 h-9 rounded-lg border text-xs font-bold transition-all duration-200",
                          currentStatus === status
                            ? `${cfg.bg} ${cfg.text} border-opacity-100 scale-110 shadow-md`
                            : "bg-muted/50 text-muted-foreground border-border hover:border-primary/30"
                        )}
                      >
                        {cfg.short}
                      </button>
                    ))}
                  </div>
                  {/* Overtime (show only if present) */}
                  {currentStatus === "present" && (
                    <div className="flex items-center gap-1 shrink-0 hidden sm:flex">
                      <span className="text-xs text-muted-foreground">OT hrs:</span>
                      <input
                        type="number"
                        min={0}
                        max={8}
                        step={0.5}
                        value={overtimeMap[s.id!] || 0}
                        onChange={(e) => setOvertimeMap((prev) => ({ ...prev, [s.id!]: parseFloat(e.target.value) || 0 }))}
                        className="w-14 h-7 text-xs text-center rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// Monthly Calendar View
function MonthlyCalendar({ staff, month }: { staff: Staff[]; month: string }) {
  const [selectedStaff, setSelectedStaff] = useState<number>(staff[0]?.id || 0);
  const [records, setRecords] = useState<Record<string, Attendance>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedStaff) return;
    setLoading(true);
    attendanceService.getByStaffAndMonth(selectedStaff, month).then((recs) => {
      const map: Record<string, Attendance> = {};
      for (const r of recs) map[r.date] = r;
      setRecords(map);
      setLoading(false);
    });
  }, [selectedStaff, month]);

  const daysInMonth = getDaysInMonth(parseISO(`${month}-01`));
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = String(i + 1).padStart(2, "0");
    return `${month}-${d}`;
  });

  const summary = {
    present: Object.values(records).filter((r) => r.status === "present").length,
    absent: Object.values(records).filter((r) => r.status === "absent").length,
    half_day: Object.values(records).filter((r) => r.status === "half_day").length,
    leave: Object.values(records).filter((r) => r.status === "leave").length,
  };

  return (
    <div className="space-y-4">
      <Select
        options={staff.map((s) => ({ value: String(s.id), label: s.name }))}
        value={String(selectedStaff)}
        onChange={(e) => setSelectedStaff(Number(e.target.value))}
      />

      {/* Summary */}
      <div className="grid grid-cols-4 gap-2">
        {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([status, cfg]) => (
          <div key={status} className={`p-2 rounded-lg text-center border ${cfg.bg}`}>
            <p className={`text-lg font-bold ${cfg.text}`}>{summary[status]}</p>
            <p className="text-xs text-muted-foreground">{cfg.label}</p>
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
          ))}
          {/* Empty cells for first day of month */}
          {Array.from({ length: new Date(`${month}-01`).getDay() }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {days.map((date) => {
            const rec = records[date];
            const day = parseInt(date.slice(8));
            const cfg = rec ? STATUS_CONFIG[rec.status] : null;
            const isToday = date === new Date().toISOString().split("T")[0];
            return (
              <div
                key={date}
                className={cn(
                  "aspect-square flex items-center justify-center rounded-lg text-xs font-semibold border transition-all",
                  cfg ? `${cfg.bg} ${cfg.text}` : "bg-muted/30 text-muted-foreground border-transparent",
                  isToday && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                )}
              >
                {day}
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-3 flex-wrap">
        {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([status, cfg]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-4 h-4 rounded border ${cfg.bg}`} />
            <span className="text-xs text-muted-foreground">{cfg.short} = {cfg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AttendanceManagement() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"daily" | "calendar">("daily");
  const [month, setMonth] = useState(getCurrentMonth());

  useEffect(() => {
    staffService.getActive().then((s) => { setStaff(s); setLoading(false); });
  }, []);

  return (
    <div className="space-y-5 pb-20 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Attendance</h1>
          <p className="text-sm text-muted-foreground">{staff.length} active staff members</p>
        </div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="flex h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-40" />
      </div>

      {/* Tab Toggle */}
      <div className="flex rounded-xl bg-muted p-1 gap-1">
        <button
          onClick={() => setTab("daily")}
          className={cn("flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200", tab === "daily" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          📋 Daily Marking
        </button>
        <button
          onClick={() => setTab("calendar")}
          className={cn("flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200", tab === "calendar" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          📅 Calendar View
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : staff.length === 0 ? (
        <EmptyState icon="👥" title="No staff found" description="Add staff members first to mark attendance" />
      ) : tab === "daily" ? (
        <DailyAttendance staff={staff} month={month} />
      ) : (
        <MonthlyCalendar staff={staff} month={month} />
      )}
    </div>
  );
}
