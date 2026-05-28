import { useState, useEffect, useMemo } from "react";
import { format, getDaysInMonth, parseISO } from "date-fns";
import { CheckCircle, XCircle, Clock, CalendarOff, Trash2 } from "lucide-react";
import { Card, CardContent, Skeleton, EmptyState, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { staffService, attendanceService } from "@/services";
import { type Staff, type Attendance, type AttendanceStatus } from "@/types";
import { getCurrentMonth, getInitials, generateAvatarColor } from "@/lib/utils";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; short: string; bg: string; text: string; icon: any }> = {
  present:  { label: "Present",  short: "P", bg: "bg-emerald-500/20", text: "text-emerald-700 dark:text-emerald-400", icon: CheckCircle },
  absent:   { label: "Absent",   short: "A", bg: "bg-red-500/20",     text: "text-red-700 dark:text-red-400", icon: XCircle },
  half_day: { label: "Half Day", short: "H", bg: "bg-amber-500/20",   text: "text-amber-700 dark:text-amber-400", icon: Clock },
  leave:    { label: "Leave",    short: "L", bg: "bg-blue-500/20",    text: "text-blue-700 dark:text-blue-400", icon: CalendarOff },
};

const NEXT_STATUS: Record<string, AttendanceStatus | "clear"> = {
  "undefined": "present",
  "present": "absent",
  "absent": "half_day",
  "half_day": "leave",
  "leave": "clear",
};

export function AttendanceManagement() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [month, setMonth] = useState(getCurrentMonth());
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]); // YYYY-MM-DD
  const [viewMode, setViewMode] = useState<"daily" | "monthly">("monthly"); // For mobile override (unused on desktop)
  
  const { toast } = useToast();

  // Derive the query month ONLY from data that actually changes the Firestore query.
  // viewMode is a display toggle — it must NOT trigger a re-subscription.
  const queryMonth = useMemo(() => {
    if (viewMode === "daily") return selectedDate.substring(0, 7);
    return month;
  }, [month, selectedDate, viewMode]);

  // Staff subscription — stable, only mounts once
  useEffect(() => {
    const unsubStaff = staffService.subscribeAll((data) => {
      setStaff(data.filter(s => s.status === "active"));
    });
    return () => unsubStaff();
  }, []);

  // Attendance subscription — only re-fires when the actual month changes
  useEffect(() => {
    setLoading(true);
    let active = true;
    const unsubAtt = attendanceService.subscribeByMonth(queryMonth, (data) => {
      if (active) {
        setAttendance(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      unsubAtt();
    };
  }, [queryMonth]);

  // Sync month picker when date picker changes in daily mode
  useEffect(() => {
    if (selectedDate && viewMode === "daily") {
      setMonth(selectedDate.substring(0, 7));
    }
  }, [selectedDate, viewMode]);

  const handleCellClick = async (staffId: string, date: string, currentStatus?: AttendanceStatus) => {
    const nextStatus = NEXT_STATUS[String(currentStatus)] || "present";
    
    try {
      if (nextStatus === "clear") {
        await attendanceService.deleteRecord(staffId, date);
      } else {
        await attendanceService.upsert({ staffId, date, status: nextStatus, overtimeHours: 0 });
      }
    } catch (e) {
      toast({ type: "error", title: "Sync Error", description: "Failed to update attendance." });
    }
  };

  const setExactStatus = async (staffId: string, date: string, status: AttendanceStatus | "clear") => {
    try {
      if (status === "clear") {
        await attendanceService.deleteRecord(staffId, date);
      } else {
        await attendanceService.upsert({ staffId, date, status, overtimeHours: 0 });
      }
    } catch (e) {
      toast({ type: "error", title: "Sync Error", description: "Failed to update attendance." });
    }
  };

  const daysInMonth = getDaysInMonth(parseISO(`${month}-01`));
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    return `${month}-${String(i + 1).padStart(2, "0")}`;
  });

  const getAttendanceMap = useMemo(() => {
    const map: Record<string, Record<string, AttendanceStatus>> = {};
    staff.forEach(s => map[s.id!] = {});
    attendance.forEach(a => {
      if (map[a.staffId]) {
        map[a.staffId][a.date] = a.status;
      }
    });
    return map;
  }, [attendance, staff]);

  return (
    <div className="space-y-5 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Attendance</h1>
          <p className="text-sm text-muted-foreground hidden md:block">Click on any cell to quickly toggle attendance</p>
          <p className="text-sm text-muted-foreground md:hidden">Mark daily attendance for your staff</p>
        </div>
        
        {/* Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Mobile View Toggle */}
          <div className="flex bg-muted p-1 rounded-lg md:hidden w-full max-w-[200px]">
            <button
              onClick={() => setViewMode("daily")}
              className={cn("flex-1 text-xs py-1.5 px-3 rounded-md font-medium transition-colors", viewMode === "daily" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}
            >
              Daily
            </button>
            <button
              onClick={() => setViewMode("monthly")}
              className={cn("flex-1 text-xs py-1.5 px-3 rounded-md font-medium transition-colors", viewMode === "monthly" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}
            >
              Monthly
            </button>
          </div>

          <input 
            type="month" 
            value={month} 
            onChange={(e) => {
              setMonth(e.target.value);
              setSelectedDate(`${e.target.value}-01`); // Reset to 1st of month when changing month
            }} 
            className={cn(
              "flex h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full sm:w-40",
              viewMode === "daily" ? "hidden md:flex" : "flex"
            )} 
          />
          <input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)} 
            className={cn(
              "flex h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full",
              viewMode === "daily" ? "flex md:hidden" : "hidden"
            )} 
          />
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[400px] w-full rounded-xl" />
      ) : staff.length === 0 ? (
        <EmptyState icon="👥" title="No active staff" description="Add active staff members first to mark attendance" />
      ) : (
        <>
          {/* MOBILE DAILY VIEW */}
          <div className={cn("flex flex-col gap-3", viewMode === "daily" ? "md:hidden" : "hidden")}>
            {staff.map((s) => {
              const status = getAttendanceMap[s.id!]?.[selectedDate];
              return (
                <Card key={s.id} className="overflow-hidden">
                  <CardContent className="p-4 flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${generateAvatarColor(s.name)} flex items-center justify-center text-white font-bold shrink-0 shadow-inner`}>
                        {getInitials(s.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate text-base">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.role || "Staff"}</p>
                      </div>
                      {status && (
                        <Badge variant="outline" className={cn("border-0 text-xs px-2.5 py-1", STATUS_CONFIG[status].bg, STATUS_CONFIG[status].text)}>
                          {STATUS_CONFIG[status].label}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-5 gap-2">
                      {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([key, cfg]) => {
                        const isActive = status === key;
                        return (
                          <button
                            key={key}
                            onClick={() => setExactStatus(s.id!, selectedDate, key)}
                            className={cn(
                              "h-12 rounded-lg flex flex-col items-center justify-center gap-1 transition-all",
                              isActive ? `${cfg.bg} ${cfg.text} ring-2 ring-current ring-offset-1 ring-offset-background` : "bg-muted text-muted-foreground hover:bg-muted/80"
                            )}
                          >
                            <span className="text-sm font-bold">{cfg.short}</span>
                          </button>
                        );
                      })}
                      <button
                        onClick={() => setExactStatus(s.id!, selectedDate, "clear")}
                        className={cn(
                          "h-12 rounded-lg flex flex-col items-center justify-center gap-1 transition-all bg-muted text-muted-foreground hover:bg-red-500/10 hover:text-red-500",
                          !status && "opacity-50 pointer-events-none"
                        )}
                        title="Clear"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* DESKTOP / MONTHLY VIEW */}
          <Card className={cn("overflow-hidden border-border shadow-sm", viewMode === "monthly" ? "block" : "hidden md:block")}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-4 py-3 font-semibold text-foreground whitespace-nowrap sticky left-0 z-10 bg-muted/95 backdrop-blur shadow-[1px_0_0_0_theme(colors.border)]">
                      Staff Name
                    </th>
                    {days.map((date, i) => (
                      <th key={date} className="px-1.5 py-3 font-semibold text-center text-muted-foreground min-w-[32px] border-l border-border/50 text-xs">
                        {i + 1}
                      </th>
                    ))}
                    <th className="px-3 py-3 font-semibold text-center text-emerald-600 border-l border-border bg-emerald-500/5">P</th>
                    <th className="px-3 py-3 font-semibold text-center text-red-600 bg-red-500/5">A</th>
                    <th className="px-3 py-3 font-semibold text-center text-amber-600 bg-amber-500/5">H</th>
                    <th className="px-3 py-3 font-semibold text-center text-blue-600 bg-blue-500/5">L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {staff.map((s) => {
                    const staffAtt = getAttendanceMap[s.id!] || {};
                    
                    // Precompute totals for this staff member to avoid render-phase mutation side-effects
                    let p = 0, a = 0, h = 0, l = 0;
                    days.forEach((date) => {
                      const status = staffAtt[date];
                      if (status === "present") p++;
                      else if (status === "absent") a++;
                      else if (status === "half_day") h++;
                      else if (status === "leave") l++;
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
                        {days.map((date) => {
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
        </>
      )}

      {/* Legend */}
      <div className="flex gap-4 flex-wrap px-1">
        {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([status, cfg]) => (
          <div key={status} className="flex items-center gap-2">
            <div className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] ${cfg.bg} ${cfg.text}`}>
              {cfg.short}
            </div>
            <span className="text-sm text-muted-foreground">{cfg.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 ml-auto hidden md:flex">
          <span className="text-sm text-muted-foreground italic">Tip: Click a cell repeatedly to cycle statuses.</span>
        </div>
      </div>
    </div>
  );
}
