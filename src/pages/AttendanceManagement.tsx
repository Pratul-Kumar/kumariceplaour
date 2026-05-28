import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { getDaysInMonth, parseISO, format, addMonths, subMonths, getDay } from "date-fns";
import { CheckCircle, XCircle, Clock, CalendarOff, Trash2, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { Card, CardContent, Skeleton, EmptyState, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { staffService, attendanceService } from "@/services";
import { type Staff, type Attendance, type AttendanceStatus } from "@/types";
import { getCurrentMonth, getInitials, generateAvatarColor } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ─── Constants ───────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<AttendanceStatus, { label: string; short: string; bg: string; text: string; ring: string; icon: any }> = {
  present:  { label: "Present",  short: "P", bg: "bg-emerald-500/20", text: "text-emerald-700 dark:text-emerald-400", ring: "ring-emerald-500", icon: CheckCircle },
  absent:   { label: "Absent",   short: "A", bg: "bg-red-500/20",     text: "text-red-700 dark:text-red-400",         ring: "ring-red-500",     icon: XCircle },
  half_day: { label: "Half Day", short: "H", bg: "bg-amber-500/20",   text: "text-amber-700 dark:text-amber-400",     ring: "ring-amber-500",   icon: Clock },
  leave:    { label: "Leave",    short: "L", bg: "bg-blue-500/20",    text: "text-blue-700 dark:text-blue-400",       ring: "ring-blue-500",    icon: CalendarOff },
};

const NEXT_STATUS: Record<string, AttendanceStatus | "clear"> = {
  "undefined": "present", "present": "absent",
  "absent": "half_day", "half_day": "leave", "leave": "clear",
};

const STATUS_ENTRIES = Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][];

// ─── Sub-components (memoised to prevent re-renders) ─────────────────────────

/** Single staff card for Daily mobile view */
const DailyStaffCard = memo(function DailyStaffCard({
  staff, status, selectedDate, onSet,
}: {
  staff: Staff;
  status: AttendanceStatus | undefined;
  selectedDate: string;
  onSet: (staffId: string, date: string, s: AttendanceStatus | "clear") => void;
}) {
  const cfg = status ? STATUS_CONFIG[status] : null;
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        {/* Staff info row */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${generateAvatarColor(staff.name)} flex items-center justify-center text-white font-bold shrink-0 shadow-inner text-sm`}>
            {getInitials(staff.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{staff.name}</p>
            <p className="text-xs text-muted-foreground">{staff.role || "Staff"}</p>
          </div>
          {cfg ? (
            <Badge variant="outline" className={cn("border-0 text-xs font-semibold px-2.5 py-1 shrink-0", cfg.bg, cfg.text)}>
              {cfg.label}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs px-2.5 py-1 shrink-0 text-muted-foreground">
              Not marked
            </Badge>
          )}
        </div>

        {/* Status buttons — large touch targets (min 48px tall) */}
        <div className="grid grid-cols-5 gap-2">
          {STATUS_ENTRIES.map(([key, c]) => {
            const isActive = status === key;
            return (
              <button
                key={key}
                onClick={() => onSet(staff.id!, selectedDate, key)}
                className={cn(
                  "h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 select-none touch-manipulation",
                  isActive
                    ? `${c.bg} ${c.text} ring-2 ${c.ring} ring-offset-1 ring-offset-background shadow-sm`
                    : "bg-muted/70 text-muted-foreground"
                )}
              >
                <span className="text-base font-bold leading-none">{c.short}</span>
              </button>
            );
          })}
          {/* Clear button */}
          <button
            onClick={() => onSet(staff.id!, selectedDate, "clear")}
            disabled={!status}
            className={cn(
              "h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 touch-manipulation",
              status
                ? "bg-muted/70 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                : "opacity-30 pointer-events-none bg-muted/30"
            )}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
});

/** Monthly summary chip for a single staff */
const SummaryChip = memo(function SummaryChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={cn("flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold", color)}>
      <span>{value}</span>
      <span className="font-medium opacity-80">{label}</span>
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────
export function AttendanceManagement() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(getCurrentMonth());
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [viewMode, setViewMode] = useState<"daily" | "employee">("employee"); // Default employee
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    if (staff.length > 0 && !selectedStaffId) {
      setSelectedStaffId(staff[0].id!);
    }
  }, [staff, selectedStaffId]);

  // Derive query month — viewMode is display-only, doesn't change query
  const queryMonth = useMemo(() => {
    if (viewMode === "daily") return selectedDate.substring(0, 7);
    return month;
  }, [month, selectedDate, viewMode]);

  // Staff subscription — stable mount
  useEffect(() => {
    const unsub = staffService.subscribeAll(data => setStaff(data.filter(s => s.status === "active")));
    return () => unsub();
  }, []);

  // Attendance subscription — re-fires only when month changes
  useEffect(() => {
    setLoading(true);
    let active = true;
    const unsub = attendanceService.subscribeByMonth(queryMonth, data => {
      if (active) { setAttendance(data); setLoading(false); }
    });
    return () => { active = false; unsub(); };
  }, [queryMonth]);

  // Sync month picker when date changes in daily mode
  useEffect(() => {
    if (viewMode === "daily") setMonth(selectedDate.substring(0, 7));
  }, [selectedDate, viewMode]);

  // Month navigation helpers
  const navigateMonth = useCallback((dir: 1 | -1) => {
    const current = parseISO(`${month}-01`);
    const next = dir === 1 ? addMonths(current, 1) : subMonths(current, 1);
    const nextMonth = format(next, "yyyy-MM");
    setMonth(nextMonth);
    if (viewMode === "daily") setSelectedDate(`${nextMonth}-${selectedDate.slice(8)}`);
  }, [month, viewMode, selectedDate]);

  const navigateDay = useCallback((dir: 1 | -1) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + dir);
    const next = d.toISOString().split("T")[0];
    setSelectedDate(next);
  }, [selectedDate]);

  // Handlers
  const handleCellClick = useCallback(async (staffId: string, date: string, currentStatus?: AttendanceStatus) => {
    const nextStatus = NEXT_STATUS[String(currentStatus)] || "present";
    try {
      if (nextStatus === "clear") await attendanceService.deleteRecord(staffId, date);
      else await attendanceService.upsert({ staffId, date, status: nextStatus, overtimeHours: 0 });
    } catch (err: any) {
      toast({ type: "error", title: "Sync Error", description: err.message || "Failed to update attendance." });
    }
  }, [toast]);

  const setExactStatus = useCallback(async (staffId: string, date: string, status: AttendanceStatus | "clear") => {
    try {
      if (status === "clear") await attendanceService.deleteRecord(staffId, date);
      else await attendanceService.upsert({ staffId, date, status, overtimeHours: 0 });
    } catch (err: any) {
      console.error("[setExactStatus]", err);
      toast({ type: "error", title: "Sync Error", description: err.message || "Failed to update attendance." });
    }
  }, [toast]);

  // Computed values
  const daysInMonth = getDaysInMonth(parseISO(`${month}-01`));
  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
    [month, daysInMonth]
  );

  const attendanceMap = useMemo(() => {
    const map: Record<string, Record<string, AttendanceStatus>> = {};
    staff.forEach(s => { map[s.id!] = {}; });
    attendance.forEach(a => { if (map[a.staffId]) map[a.staffId][a.date] = a.status; });
    return map;
  }, [attendance, staff]);

  const monthLabel = useMemo(
    () => format(parseISO(`${month}-01`), "MMMM yyyy"),
    [month]
  );

  const selectedDayLabel = useMemo(
    () => format(new Date(selectedDate + "T00:00:00"), "EEEE, d MMMM"),
    [selectedDate]
  );

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-28 lg:pb-6">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Attendance</h1>
        <p className="text-sm text-muted-foreground mt-0.5 hidden md:block">
          Click any cell to cycle through statuses
        </p>
      </div>

      {/* ── View Toggle + Date Controls ─────────────────────────── */}
      <div className="flex flex-col gap-3">
        {/* View Mode Toggle (full width on mobile) */}
        <div className="flex bg-muted p-1 rounded-xl gap-1">
          <button
            onClick={() => setViewMode("employee")}
            className={cn(
              "flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all",
              viewMode === "employee"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            )}
          >
            Employee View
          </button>
          <button
            onClick={() => setViewMode("daily")}
            className={cn(
              "flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all",
              viewMode === "daily"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            )}
          >
            Daily View
          </button>
        </div>

        {/* Date Navigation */}
        {viewMode === "daily" ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateDay(-1)}
              className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border border-border bg-background hover:bg-accent transition-colors touch-manipulation active:scale-95"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 relative">
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring opacity-0 absolute inset-0 cursor-pointer"
              />
              <div className="h-11 rounded-xl border border-input bg-background px-4 flex items-center justify-center pointer-events-none">
                <span className="text-sm font-semibold text-foreground">{selectedDayLabel}</span>
              </div>
            </div>
            <button
              onClick={() => navigateDay(1)}
              className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border border-border bg-background hover:bg-accent transition-colors touch-manipulation active:scale-95"
              aria-label="Next day"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateMonth(-1)}
              className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border border-border bg-background hover:bg-accent transition-colors touch-manipulation active:scale-95"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 relative">
              <input
                type="month"
                value={month}
                onChange={e => { setMonth(e.target.value); setSelectedDate(`${e.target.value}-01`); }}
                className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring opacity-0 absolute inset-0 cursor-pointer"
              />
              <div className="h-11 rounded-xl border border-input bg-background px-4 flex items-center justify-center pointer-events-none">
                <span className="text-sm font-semibold text-foreground">{monthLabel}</span>
              </div>
            </div>
            <button
              onClick={() => navigateMonth(1)}
              className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border border-border bg-background hover:bg-accent transition-colors touch-manipulation active:scale-95"
              aria-label="Next month"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : staff.length === 0 ? (
        <EmptyState icon="👥" title="No active staff" description="Add active staff members first to mark attendance" />
      ) : (
        <>
          {/* ──────────────── DAILY VIEW ──────────────────────────── */}
          {viewMode === "daily" && (
            <div className="flex flex-col gap-3">
              {staff.map(s => (
                <DailyStaffCard
                  key={s.id}
                  staff={s}
                  status={attendanceMap[s.id!]?.[selectedDate]}
                  selectedDate={selectedDate}
                  onSet={setExactStatus}
                />
              ))}
            </div>
          )}

          {/* ──────────────── EMPLOYEE VIEW ────────────────────────── */}
          {viewMode === "employee" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              <div className="md:hidden space-y-4">
                {/* Employee Selection Dropdown */}
                <div className="relative">
                  <select
                    value={selectedStaffId}
                    onChange={(e) => setSelectedStaffId(e.target.value)}
                    className="w-full h-14 pl-4 pr-10 rounded-2xl border-2 border-transparent bg-muted/50 text-foreground font-semibold text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary transition-all appearance-none cursor-pointer hover:bg-muted/80 shadow-sm"
                  >
                    <option value="" disabled>Select Employee</option>
                    {staff.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
                </div>

                {/* Calendar Card */}
                {selectedStaffId && (
                  <Card className="overflow-hidden border-0 shadow-md rounded-3xl bg-card">
                    <CardContent className="p-5 sm:p-6">
                      {/* Header: Month & Year */}
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-foreground">
                          {format(parseISO(`${month}-01`), "MMMM yyyy")}
                        </h2>
                        <div className="flex gap-2">
                          <button
                            onClick={() => navigateMonth(-1)}
                            className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full border border-border bg-background hover:bg-accent transition-colors touch-manipulation active:scale-95 shadow-sm"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => navigateMonth(1)}
                            className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full border border-border bg-background hover:bg-accent transition-colors touch-manipulation active:scale-95 shadow-sm"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </div>
                      </div>

                      {/* Calendar Grid */}
                      <div className="grid grid-cols-7 gap-y-4 gap-x-2">
                        {/* Weekday Headers */}
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                          <div key={day} className="text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            {day}
                          </div>
                        ))}

                        {/* Blank cells for start of month */}
                        {Array.from({ length: getDay(parseISO(`${month}-01`)) }).map((_, i) => (
                          <div key={`empty-${i}`} className="h-10 sm:h-12 w-full" />
                        ))}

                        {/* Date Cells */}
                        {days.map((date) => {
                          const dayNum = parseInt(date.split("-")[2], 10);
                          const isToday = date === new Date().toISOString().split("T")[0];
                          const status = attendanceMap[selectedStaffId]?.[date];
                          const cfg = status ? STATUS_CONFIG[status] : null;

                          return (
                            <div key={date} className="flex justify-center relative">
                              <button
                                onClick={() => handleCellClick(selectedStaffId, date, status)}
                                className={cn(
                                  "relative flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-all active:scale-90 touch-manipulation select-none",
                                  cfg
                                    ? `${cfg.bg} ${cfg.text} shadow-sm`
                                    : isToday
                                      ? "bg-primary/10 text-primary ring-2 ring-primary ring-offset-2 ring-offset-background font-bold"
                                      : "bg-transparent text-foreground hover:bg-muted"
                                )}
                              >
                                <span className={cn(
                                  "text-sm sm:text-base font-semibold",
                                  !cfg && !isToday && "text-muted-foreground"
                                )}>
                                  {dayNum}
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Employee Summary Stats */}
                {selectedStaffId && (
                  <div className="grid grid-cols-4 gap-2">
                    {STATUS_ENTRIES.map(([key, cfg]) => {
                      const st = attendanceMap[selectedStaffId] || {};
                      let count = 0;
                      Object.values(st).forEach(v => { if (v === key) count++; });
                      return (
                        <div key={key} className={cn("p-3 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-sm", cfg.bg)}>
                          <span className={cn("text-lg font-bold leading-none", cfg.text)}>{count}</span>
                          <span className={cn("text-[10px] font-bold uppercase tracking-wider", cfg.text, "opacity-80")}>{cfg.short}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Desktop: full table */}
              <Card className="hidden md:block overflow-hidden border-border shadow-sm">
                <div className="overflow-x-auto">
                  <div className="p-4 bg-muted/50 border-b flex justify-between items-center">
                    <h3 className="font-semibold text-foreground">Attendance Grid</h3>
                    <div className="flex gap-2">
                      <button onClick={() => navigateMonth(-1)} className="h-8 w-8 flex items-center justify-center rounded border bg-background hover:bg-accent"><ChevronLeft className="h-4 w-4" /></button>
                      <span className="px-3 py-1 font-medium">{format(parseISO(`${month}-01`), "MMMM yyyy")}</span>
                      <button onClick={() => navigateMonth(1)} className="h-8 w-8 flex items-center justify-center rounded border bg-background hover:bg-accent"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <table className="w-full text-sm text-left border-collapse" style={{ minWidth: `${120 + daysInMonth * 34 + 160}px` }}>
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="px-4 py-3 font-semibold text-foreground whitespace-nowrap sticky left-0 z-10 bg-muted/95 backdrop-blur shadow-[1px_0_0_0_theme(colors.border)]">
                          Staff Name
                        </th>
                        {days.map((date, i) => {
                          const isToday = date === new Date().toISOString().split("T")[0];
                          return (
                            <th key={date} className={cn(
                              "px-1.5 py-3 font-semibold text-center min-w-[32px] border-l border-border/50 text-xs",
                              isToday ? "text-primary bg-primary/5" : "text-muted-foreground"
                            )}>
                              {i + 1}
                            </th>
                          );
                        })}
                        <th className="px-3 py-3 font-semibold text-center text-emerald-600 border-l border-border bg-emerald-500/5 min-w-[36px]">P</th>
                        <th className="px-3 py-3 font-semibold text-center text-red-600 bg-red-500/5 min-w-[36px]">A</th>
                        <th className="px-3 py-3 font-semibold text-center text-amber-600 bg-amber-500/5 min-w-[36px]">H</th>
                        <th className="px-3 py-3 font-semibold text-center text-blue-600 bg-blue-500/5 min-w-[36px]">L</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {staff.map(s => {
                        const staffAtt = attendanceMap[s.id!] || {};
                        let p = 0, a = 0, h = 0, l = 0;
                        days.forEach(date => {
                          const st = staffAtt[date];
                          if (st === "present") p++;
                          else if (st === "absent") a++;
                          else if (st === "half_day") h++;
                          else if (st === "leave") l++;
                        });
                        return (
                          <tr key={s.id} className="hover:bg-accent/50 transition-colors group">
                            <td className="px-4 py-2 whitespace-nowrap sticky left-0 z-10 bg-card group-hover:bg-accent/95 shadow-[1px_0_0_0_theme(colors.border)] transition-colors">
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${generateAvatarColor(s.name)} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                                  {getInitials(s.name)}
                                </div>
                                <span className="font-medium text-foreground">{s.name}</span>
                              </div>
                            </td>
                            {days.map(date => {
                              const status = staffAtt[date];
                              const cfg = status ? STATUS_CONFIG[status] : null;
                              return (
                                <td key={date} className="px-[2px] py-1 border-l border-border/50">
                                  <button
                                    onClick={() => handleCellClick(s.id!, date, status)}
                                    className={cn(
                                      "w-full h-8 flex items-center justify-center rounded text-xs font-bold transition-all cursor-pointer select-none",
                                      cfg ? `${cfg.bg} ${cfg.text} hover:opacity-80 shadow-sm` : "bg-transparent text-muted-foreground hover:bg-muted"
                                    )}
                                  >
                                    {cfg ? cfg.short : "·"}
                                  </button>
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 text-center font-bold text-emerald-600 border-l border-border bg-emerald-500/5">{p}</td>
                            <td className="px-3 py-2 text-center font-bold text-red-600 bg-red-500/5">{a}</td>
                            <td className="px-3 py-2 text-center font-bold text-amber-600 bg-amber-500/5">{h}</td>
                            <td className="px-3 py-2 text-center font-bold text-blue-600 bg-blue-500/5">{l}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {/* ── Legend ─────────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap items-center pt-1">
        {STATUS_ENTRIES.map(([status, cfg]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={cn("w-5 h-5 rounded flex items-center justify-center font-bold text-[10px]", cfg.bg, cfg.text)}>
              {cfg.short}
            </div>
            <span className="text-xs text-muted-foreground">{cfg.label}</span>
          </div>
        ))}
        <span className="text-xs text-muted-foreground italic ml-auto hidden md:block">
          Tap a cell to cycle · Long-press to clear
        </span>
      </div>
    </div>
  );
}
