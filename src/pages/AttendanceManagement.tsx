import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { getDaysInMonth, parseISO, format, addMonths, subMonths, getDay } from "date-fns";
import { CheckCircle, XCircle, Clock, CalendarOff, Trash2, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { Card, CardContent, Skeleton, EmptyState, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { staffService, attendanceService, salaryService } from "@/services";
import { normalizeDate } from "@/services/index";
import { type Staff, type Attendance, type AttendanceStatus, type SalaryRecord } from "@/types";
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
  "undefined": "present", 
  "present": "absent",
  "absent": "half_day", 
  "half_day": "leave", 
  "leave": "clear",
  "clear": "present"
};

const STATUS_ENTRIES = Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][];

// ─── Sub-components (memoised to prevent re-renders) ─────────────────────────

/** Single staff card for Daily mobile view */
const DailyStaffCard = memo(function DailyStaffCard({
  staff, status, selectedDate, onSet, updating
}: {
  staff: Staff;
  status: AttendanceStatus | undefined;
  selectedDate: string;
  onSet: (staffId: string, date: string, s: AttendanceStatus | "clear") => void;
  updating: Record<string, boolean>;
}) {
  const key = `${staff.id}-${selectedDate}`;
  const isUpdating = updating[key];
  const isLocked = updating[`${staff.id}-locked`];

  return (
    <div className="flex items-center justify-between p-3 bg-card border rounded-lg">
      <div className="flex items-center gap-3 overflow-hidden">
        <div className={`w-8 h-8 rounded flex items-center justify-center text-white font-bold shrink-0 text-[10px] ${generateAvatarColor(staff.name)}`}>
          {getInitials(staff.name)}
        </div>
        <span className="font-medium text-sm truncate">{staff.name}</span>
      </div>

      <div className={cn("flex items-center gap-1 shrink-0 transition-opacity", (isUpdating || isLocked) && "opacity-50 pointer-events-none")}>
        {STATUS_ENTRIES.map(([keyStatus, c]) => {
          const isActive = status === keyStatus;
          return (
            <button
              key={keyStatus}
              onClick={() => onSet(staff.id!, selectedDate, keyStatus)}
              className={cn(
                "h-8 w-8 rounded flex items-center justify-center text-xs font-bold border transition-colors",
                isActive
                  ? `${c.bg} ${c.text} border-transparent`
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {c.short}
            </button>
          );
        })}
        <button
          onClick={() => onSet(staff.id!, selectedDate, "clear")}
          disabled={!status}
          className={cn(
            "h-8 w-8 rounded flex items-center justify-center border transition-colors",
            status
              ? "bg-muted/50 text-muted-foreground border-border hover:bg-red-500/10 hover:text-red-500"
              : "opacity-30 pointer-events-none bg-muted border-border"
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────
export function AttendanceManagement() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(getCurrentMonth());
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [viewMode, setViewMode] = useState<"daily" | "employee">("employee");
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (staff.length > 0 && !selectedStaffId) {
      setSelectedStaffId(staff[0].id!);
    }
  }, [staff, selectedStaffId]);

  const queryMonth = useMemo(() => {
    if (viewMode === "daily") return selectedDate.substring(0, 7);
    return month;
  }, [month, selectedDate, viewMode]);

  useEffect(() => {
    const unsub = staffService.subscribeAll(data => setStaff(data.filter(s => s.status === "active")));
    return () => unsub();
  }, []);

  // Map Deduplication Listener Merge
  useEffect(() => {
    setLoading(true);
    let active = true;
    const unsub = attendanceService.subscribeByMonth(queryMonth, data => {
      if (active) { 
        setAttendance(prev => {
          const map = new Map<string, Attendance>();
          
          // Apply confirmed data from Firestore
          data.forEach(a => map.set(`${a.staffId}-${a.date}`, a));
          
          // Re-apply in-flight temp entries over it
          prev.forEach(a => {
            if (a.id?.startsWith("temp-")) {
              map.set(`${a.staffId}-${a.date}`, a);
            }
          });

          return Array.from(map.values());
        });
        setLoading(false); 
      }
    });
    return () => { active = false; unsub(); };
  }, [queryMonth]);

  // Salary Lock Logic
  const [qYear, qMonth] = queryMonth.split("-");
  const yearNum = parseInt(qYear, 10);
  const monthNum = parseInt(qMonth, 10);

  useEffect(() => {
    let active = true;
    const unsub = salaryService.subscribeByMonth(monthNum, yearNum, (records) => {
      if (active) setSalaries(records);
    });
    return () => { active = false; unsub(); };
  }, [monthNum, yearNum]);

  const lockedStaffIds = useMemo(() => {
    const set = new Set<string>();
    salaries.forEach(s => {
      set.add(s.staffId);
    });
    return set;
  }, [salaries]);

  useEffect(() => {
    if (viewMode === "daily") setMonth(selectedDate.substring(0, 7));
  }, [selectedDate, viewMode]);

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

  // Handlers with strict Date Normalization and Race Condition protection
  const handleCellClick = useCallback(async (staffId: string, rawDate: string, currentStatus?: AttendanceStatus) => {
    if (lockedStaffIds.has(staffId)) {
      toast({ type: "error", title: "Locked", description: "Attendance cannot be edited after salary is generated." });
      return;
    }
    
    const date = normalizeDate(rawDate);
    const key = `${staffId}-${date}`;
    if (updating[key]) return; // Cell freeze

    setUpdating(prev => ({ ...prev, [key]: true }));
    const nextStatus = NEXT_STATUS[String(currentStatus)] || "present";
    const tempId = `temp-${Date.now()}`;
    
    setAttendance(prev => {
      const filtered = prev.filter(a => !(a.staffId === staffId && a.date === date));
      if (nextStatus === "clear") return filtered;
      return [...filtered, { id: tempId, staffId, date, status: nextStatus as AttendanceStatus, overtimeHours: 0 } as Attendance];
    });

    try {
      if (nextStatus === "clear") await attendanceService.deleteRecord(staffId, date);
      else await attendanceService.upsert({ staffId, date, status: nextStatus as AttendanceStatus, overtimeHours: 0 });
    } catch (err: any) {
      toast({ type: "error", title: "Sync Error", description: err.message || "Failed to update attendance." });
    } finally {
      setUpdating(prev => ({ ...prev, [key]: false }));
      setAttendance(prev => prev.map(a => 
        (a.id === tempId) ? { ...a, id: undefined } : a
      ));
    }
  }, [updating, lockedStaffIds, toast]);

  const setExactStatus = useCallback(async (staffId: string, rawDate: string, status: AttendanceStatus | "clear") => {
    if (lockedStaffIds.has(staffId)) {
      toast({ type: "error", title: "Locked", description: "Attendance cannot be edited after salary is generated." });
      return;
    }

    const date = normalizeDate(rawDate);
    const key = `${staffId}-${date}`;
    if (updating[key]) return;

    setUpdating(prev => ({ ...prev, [key]: true }));
    const tempId = `temp-${Date.now()}`;

    setAttendance(prev => {
      const filtered = prev.filter(a => !(a.staffId === staffId && a.date === date));
      if (status === "clear") return filtered;
      return [...filtered, { id: tempId, staffId, date, status: status as AttendanceStatus, overtimeHours: 0 } as Attendance];
    });

    try {
      if (status === "clear") await attendanceService.deleteRecord(staffId, date);
      else await attendanceService.upsert({ staffId, date, status: status as AttendanceStatus, overtimeHours: 0 });
    } catch (err: any) {
      console.error("[setExactStatus]", err);
      toast({ type: "error", title: "Sync Error", description: err.message || "Failed to update attendance." });
    } finally {
      setUpdating(prev => ({ ...prev, [key]: false }));
      setAttendance(prev => prev.map(a => 
        (a.id === tempId) ? { ...a, id: undefined } : a
      ));
    }
  }, [updating, toast]);

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

  const monthLabel = useMemo(() => format(parseISO(`${month}-01`), "MMMM yyyy"), [month]);
  const selectedDayLabel = useMemo(() => format(new Date(selectedDate + "T00:00:00"), "EEEE, d MMMM"), [selectedDate]);

  return (
    <div className="space-y-4 pb-28 lg:pb-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold text-foreground">Attendance</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Click cells to cycle through statuses</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex bg-muted p-1 rounded-xl gap-1">
          <button
            onClick={() => setViewMode("employee")}
            className={cn(
              "flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all",
              viewMode === "employee" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            Employee View
          </button>
          <button
            onClick={() => setViewMode("daily")}
            className={cn(
              "flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all",
              viewMode === "daily" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            Daily View
          </button>
        </div>

        {viewMode === "daily" ? (
          <div className="flex items-center gap-2">
            <button onClick={() => navigateDay(-1)} className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-accent transition-colors touch-manipulation active:scale-95" aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></button>
            <div className="flex-1 relative">
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring opacity-0 absolute inset-0 cursor-pointer" />
              <div className="h-9 rounded-lg border border-input bg-background px-4 flex items-center justify-center pointer-events-none"><span className="text-xs font-semibold text-foreground">{selectedDayLabel}</span></div>
            </div>
            <button onClick={() => navigateDay(1)} className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-accent transition-colors touch-manipulation active:scale-95" aria-label="Next day"><ChevronRight className="h-4 w-4" /></button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => navigateMonth(-1)} className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-accent transition-colors touch-manipulation active:scale-95" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
            <div className="flex-1 relative">
              <input type="month" value={month} onChange={e => { setMonth(e.target.value); setSelectedDate(`${e.target.value}-01`); }} className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring opacity-0 absolute inset-0 cursor-pointer" />
              <div className="h-9 rounded-lg border border-input bg-background px-4 flex items-center justify-center pointer-events-none"><span className="text-xs font-semibold text-foreground">{monthLabel}</span></div>
            </div>
            <button onClick={() => navigateMonth(1)} className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-accent transition-colors touch-manipulation active:scale-95" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : staff.length === 0 ? (
        <EmptyState icon="👥" title="No active staff" description="Add active staff members first to mark attendance" />
      ) : (
        <>
          {viewMode === "daily" && (
            <div className="flex flex-col gap-3">
              {staff.map(s => (
                <DailyStaffCard
                  key={s.id}
                  staff={s}
                  status={attendanceMap[s.id!]?.[selectedDate]}
                  selectedDate={selectedDate}
                  onSet={setExactStatus}
                  updating={{ ...updating, [`${s.id}-locked`]: lockedStaffIds.has(s.id!) }}
                />
              ))}
            </div>
          )}

          {viewMode === "employee" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="md:hidden space-y-4">
                <div className="relative">
                  <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} className="w-full h-10 pl-3 pr-10 rounded-lg border border-border bg-background text-foreground font-semibold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors appearance-none cursor-pointer hover:bg-muted/50 shadow-sm">
                    <option value="" disabled>Select Employee</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>

                {selectedStaffId && (
                  <Card className="overflow-hidden rounded-xl border">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold text-foreground">{format(parseISO(`${month}-01`), "MMMM yyyy")}</h2>
                        <div className="flex gap-1.5">
                          <button onClick={() => navigateMonth(-1)} className="h-8 w-8 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors"><ChevronLeft className="h-4 w-4" /></button>
                          <button onClick={() => navigateMonth(1)} className="h-8 w-8 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors"><ChevronRight className="h-4 w-4" /></button>
                        </div>
                      </div>

                      <div className="grid grid-cols-7 gap-y-2 gap-x-1.5 justify-items-center">
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                          <div key={day} className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{day}</div>
                        ))}
                        {Array.from({ length: getDay(parseISO(`${month}-01`)) }).map((_, i) => (
                          <div key={`empty-${i}`} className="h-9 w-9" />
                        ))}
                        {days.map((date) => {
                          const dayNum = parseInt(date.split("-")[2], 10);
                          const isToday = date === new Date().toISOString().split("T")[0];
                          const status = attendanceMap[selectedStaffId]?.[date];
                          const cfg = status ? STATUS_CONFIG[status] : null;
                          const key = `${selectedStaffId}-${date}`;
                          const isUpdating = updating[key] || lockedStaffIds.has(selectedStaffId);

                          return (
                            <div key={key} className={cn("flex justify-center relative transition-opacity", isUpdating && "opacity-50 pointer-events-none")}>
                              <button
                                onClick={() => handleCellClick(selectedStaffId, date, status)}
                                className={cn(
                                  "relative z-10 flex items-center justify-center w-9 h-9 rounded-lg transition-colors touch-manipulation select-none border text-xs font-semibold",
                                  cfg
                                    ? `${cfg.bg} ${cfg.text} border-transparent`
                                    : isToday
                                      ? "bg-primary/10 text-primary border-primary/35 font-bold"
                                      : "bg-transparent text-muted-foreground border-transparent hover:bg-muted"
                                )}
                              >
                                <span>{dayNum}</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {selectedStaffId && (
                  <div className="grid grid-cols-4 gap-2">
                    {STATUS_ENTRIES.map(([key, cfg]) => {
                      const st = attendanceMap[selectedStaffId] || {};
                      let count = 0;
                      Object.values(st).forEach(v => { if (v === key) count++; });
                      return (
                        <div key={key} className={cn("p-3 rounded-lg flex flex-col items-center justify-center gap-1 border border-border shadow-sm", cfg.bg, cfg.text)}>
                          <span className="text-xl font-bold leading-none">{count}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider opacity-85">{cfg.short}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Card className="hidden md:block overflow-hidden">
                <div className="overflow-x-auto">
                  <div className="p-4 border-b border-border flex justify-between items-center">
                    <h3 className="font-semibold text-foreground">Attendance Grid</h3>
                    <div className="flex gap-2">
                      <button onClick={() => navigateMonth(-1)} className="h-8 w-8 flex items-center justify-center rounded-lg bg-background border border-border hover:bg-muted text-foreground"><ChevronLeft className="h-4 w-4" /></button>
                      <span className="px-4 py-1.5 font-bold text-sm bg-background rounded-lg border border-border text-foreground">{format(parseISO(`${month}-01`), "MMMM yyyy")}</span>
                      <button onClick={() => navigateMonth(1)} className="h-8 w-8 flex items-center justify-center rounded-lg bg-background border border-border hover:bg-muted text-foreground"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <table className="w-full text-sm text-left border-collapse" style={{ minWidth: `${120 + daysInMonth * 34 + 160}px` }}>
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-4 py-3 font-bold text-muted-foreground text-xs uppercase tracking-wider whitespace-nowrap sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Staff Name</th>
                        {days.map((date, i) => (
                          <th key={`head-${date}`} className={cn("px-1.5 py-3 font-bold text-center min-w-[32px] border-l border-border text-xs", date === new Date().toISOString().split("T")[0] ? "text-primary bg-primary/10" : "text-muted-foreground")}>{i + 1}</th>
                        ))}
                        <th className="px-3 py-3 font-bold text-xs uppercase tracking-wider text-center text-emerald-500 border-l border-border bg-emerald-500/10 min-w-[36px]">P</th>
                        <th className="px-3 py-3 font-bold text-xs uppercase tracking-wider text-center text-red-500 bg-red-500/10 min-w-[36px]">A</th>
                        <th className="px-3 py-3 font-bold text-xs uppercase tracking-wider text-center text-amber-500 bg-amber-500/10 min-w-[36px]">H</th>
                        <th className="px-3 py-3 font-bold text-xs uppercase tracking-wider text-center text-blue-500 bg-blue-500/10 min-w-[36px]">L</th>
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
                          <tr key={s.id} className="hover:bg-muted/30 transition-colors group">
                            <td className="px-4 py-2 whitespace-nowrap sticky left-0 z-10 bg-card border-r border-border group-hover:bg-muted/50 transition-colors shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                              <div className="flex items-center gap-3">
                                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${generateAvatarColor(s.name)} flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm`}>{getInitials(s.name)}</div>
                                <span className="font-semibold text-foreground">{s.name}</span>
                              </div>
                            </td>
                            {days.map(date => {
                              const status = staffAtt[date];
                              const cfg = status ? STATUS_CONFIG[status] : null;
                              const key = `${s.id}-${date}`;
                              const isUpdating = updating[key] || lockedStaffIds.has(s.id!);
                              return (
                                <td key={key} className="px-[2px] py-1 border-l border-border relative">
                                  <button
                                    onClick={() => handleCellClick(s.id!, date, status)}
                                    className={cn(
                                      "w-full h-7 flex items-center justify-center rounded text-xs font-bold transition-all cursor-pointer select-none border",
                                      isUpdating && "opacity-50 pointer-events-none",
                                      cfg ? `${cfg.bg} ${cfg.text} border-transparent hover:bg-opacity-80` : "bg-transparent text-muted-foreground/45 border-transparent hover:bg-muted hover:text-foreground"
                                    )}
                                  >
                                    {cfg ? cfg.short : "·"}
                                  </button>
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 text-center font-bold text-emerald-400 border-l border-border bg-emerald-500/5">{p}</td>
                            <td className="px-3 py-2 text-center font-bold text-red-400 border-l border-border bg-red-500/5">{a}</td>
                            <td className="px-3 py-2 text-center font-bold text-amber-400 border-l border-border bg-amber-500/5">{h}</td>
                            <td className="px-3 py-2 text-center font-bold text-blue-400 border-l border-border bg-blue-500/5">{l}</td>
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

      <div className="flex gap-3 flex-wrap items-center pt-1">
        {STATUS_ENTRIES.map(([status, cfg]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={cn("w-5 h-5 rounded flex items-center justify-center font-bold text-[10px]", cfg.bg, cfg.text)}>{cfg.short}</div>
            <span className="text-xs text-muted-foreground">{cfg.label}</span>
          </div>
        ))}
        <span className="text-xs text-muted-foreground italic ml-auto hidden md:block">Tap a cell to cycle · Long-press to clear</span>
      </div>
    </div>
  );
}
