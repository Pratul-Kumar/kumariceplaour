import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, IndianRupee, HandCoins, Wallet, Clock,
  History, Download, RefreshCw, ChevronRight, Coins
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { Card, CardContent, Button, Skeleton, Badge } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { staffService, dueService } from '@/services';
import { type Staff, type DueRecord, type SalaryRecord, type SalaryPayment } from '@/types';
import { formatCurrency, formatDate, formatMonth, getInitials, generateAvatarColor } from '@/lib/utils';

// ── Unified timeline item ─────────────────────────────────
interface TimelineItem {
  id: string;
  sortKey: string;          // ISO date string for sorting
  displayDate: string;      // human-readable date
  type: 'salary_paid' | 'salary_pending' | 'advance' | 'due' | 'pending_salary' | 'give_money' | 'take_money';
  title: string;
  amount: number;
  remainingAmount?: number;
  method?: string;
  note?: string;
  salaryRecordId?: string;
  salaryMonth?: string;
  status?: string;
}

// ── Type config for visual rendering ─────────────────────
const TYPE_CONFIG: Record<TimelineItem['type'], {
  label: string; bg: string; text: string; border: string; icon: string;
}> = {
  salary_paid:     { label: 'Salary Paid',      bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/20', icon: '💰' },
  salary_pending:  { label: 'Salary Pending',   bg: 'bg-rose-500/10',    text: 'text-rose-600',    border: 'border-rose-500/20',    icon: '⏳' },
  advance:         { label: 'Advance Given',    bg: 'bg-amber-500/10',   text: 'text-amber-600',   border: 'border-amber-500/20',   icon: '🤝' },
  due:             { label: 'Due Added',         bg: 'bg-blue-500/10',    text: 'text-blue-600',    border: 'border-blue-500/20',    icon: '📋' },
  pending_salary:  { label: 'Pending Salary',   bg: 'bg-orange-500/10',  text: 'text-orange-600',  border: 'border-orange-500/20',  icon: '📌' },
  give_money:      { label: 'Give Money',      bg: 'bg-purple-500/10',  text: 'text-purple-600',  border: 'border-purple-500/20',  icon: '➕' },
  take_money:      { label: 'Take Money',      bg: 'bg-pink-500/10',    text: 'text-pink-600',    border: 'border-pink-500/20',    icon: '➖' },
};

export function EmployeeHistory() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [staff,    setStaff]    = useState<Staff | null>(null);
  const [dues,     setDues]     = useState<DueRecord[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Real-time subscriptions ─────────────────────────────
  useEffect(() => {
    if (!id) return;
    const unsubStaff = staffService.subscribeById(id, setStaff);
    const unsubDues  = dueService.subscribeByStaff(id, setDues);
    return () => { unsubStaff(); unsubDues(); };
  }, [id]);

  // ── One-shot fetch: salary records + payments ───────────
  const loadTimeline = useCallback(async () => {
    if (!id) return;
    setRefreshing(true);
    try {
      // Salary records for this staff (all months)
      const salarySnap = await getDocs(
        query(collection(db, 'salaryRecords'), where('staffId', '==', id))
      );
      const salaryRecords = salarySnap.docs.map(d => ({ id: d.id, ...d.data() } as SalaryRecord));

      // Salary payments for this staff
      const paymentSnap = await getDocs(
        query(collection(db, 'salaryPayments'), where('staffId', '==', id))
      );
      const payments = paymentSnap.docs.map(d => ({ id: d.id, ...d.data() } as SalaryPayment));

      setTimeline(buildTimeline(salaryRecords, payments));
    } catch (err: any) {
      toast({ type: 'error', title: 'Load Failed', description: err.message });
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadTimeline(); }, [loadTimeline]);

  // ── Rebuild timeline when dues change ───────────────────
  const fullTimeline = buildFullTimeline(timeline, dues);

  // ── Summary computations from dues ─────────────────────
  const advanceTotal = dues
    .filter(d => d.type === 'EMPLOYEE_TO_OWNER' && d.category !== 'givetake' && !d.isDeleted && (d.status === 'active' || d.status === 'partial'))
    .reduce((s, d) => s + (d.remainingAmount || 0), 0);

  const dueTotal = dues
    .filter(d => d.type === 'OWNER_TO_EMPLOYEE' && d.category !== 'givetake' && !d.isDeleted && !d.linkedSalaryId && (d.status === 'active' || d.status === 'partial'))
    .reduce((s, d) => s + (d.remainingAmount || 0), 0);

  const giveTakeTotal = dues
    .filter(d => d.category === 'givetake' && !d.isDeleted && (d.status === 'active' || d.status === 'partial'))
    .reduce((s, d) => {
      const isGive = d.type === 'EMPLOYEE_TO_OWNER';
      return s + (isGive ? d.remainingAmount : -d.remainingAmount);
    }, 0);

  const pendingSalaryTotal = dues
    .filter(d => d.type === 'OWNER_TO_EMPLOYEE' && !d.isDeleted && !!d.linkedSalaryId && (d.status === 'active' || d.status === 'partial'))
    .reduce((s, d) => s + (d.remainingAmount || 0), 0);

  const totalSalaryPaid = fullTimeline
    .filter(t => t.type === 'salary_paid')
    .reduce((s, t) => s + t.amount, 0);

  // ── PDF download ────────────────────────────────────────
  const handleDownloadSlip = (item: TimelineItem) => {
    if (item.salaryRecordId) {
      navigate(`/salary/${id}`);
    }
  };

  // ── Loading skeleton ────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 max-w-xl mx-auto pb-24">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  }

  if (!staff) {
    return <div className="p-8 text-center text-muted-foreground">Staff not found.</div>;
  }

  return (
    <div className="space-y-5 pb-24 max-w-xl mx-auto">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/staff')} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center justify-between flex-1 min-w-0 gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-12 h-12 rounded-full shrink-0 flex items-center justify-center font-bold text-white shadow-sm bg-gradient-to-br ${generateAvatarColor(staff.name)}`}>
              {getInitials(staff.name)}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground leading-tight truncate">{staff.name}</h1>
              <p className="text-sm text-muted-foreground capitalize">{staff.role} · Complete History</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={loadTimeline} disabled={refreshing} className="shrink-0">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* ── 5 Summary Cards ────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="glass-card border-none bg-gradient-to-br from-emerald-500/10 to-teal-500/5">
          <CardContent className="p-4 text-center">
            <IndianRupee className="h-5 w-5 text-emerald-500 mx-auto mb-1.5 opacity-80" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Salary Paid</p>
            <p className="text-xl font-bold text-emerald-500">{formatCurrency(totalSalaryPaid)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-none bg-gradient-to-br from-amber-500/10 to-orange-500/5">
          <CardContent className="p-4 text-center">
            <HandCoins className="h-5 w-5 text-amber-500 mx-auto mb-1.5 opacity-80" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Advance</p>
            <p className="text-xl font-bold text-amber-500">{formatCurrency(advanceTotal)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-none bg-gradient-to-br from-blue-500/10 to-indigo-500/5">
          <CardContent className="p-4 text-center">
            <Wallet className="h-5 w-5 text-blue-500 mx-auto mb-1.5 opacity-80" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Due</p>
            <p className="text-xl font-bold text-blue-500">{formatCurrency(dueTotal)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-none bg-gradient-to-br from-purple-500/10 to-pink-500/5">
          <CardContent className="p-4 text-center">
            <Coins className="h-5 w-5 text-purple-500 mx-auto mb-1.5 opacity-80" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Give/Take</p>
            <p className="text-xl font-bold text-purple-500">{formatCurrency(giveTakeTotal)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-none bg-gradient-to-br from-rose-500/10 to-pink-500/5 col-span-2 md:col-span-1">
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 text-rose-500 mx-auto mb-1.5 opacity-80" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Pending</p>
            <p className="text-xl font-bold text-rose-500">{formatCurrency(pendingSalaryTotal)}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Quick nav links ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => navigate(`/salary/${id}`)}
          className="flex items-center justify-between p-3 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors text-sm font-semibold text-foreground"
        >
          <span>Salary Management</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          onClick={() => navigate(`/money/${id}`)}
          className="flex items-center justify-between p-3 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors text-sm font-semibold text-foreground"
        >
          <span>Advance / Due</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* ── Unified Timeline ────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4 px-1">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">Complete History</h2>
          <span className="text-xs text-muted-foreground ml-auto">{fullTimeline.length} records</span>
        </div>

        {fullTimeline.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-2xl bg-card/30">
            <p className="text-2xl mb-2">📒</p>
            <p className="text-sm font-semibold text-foreground">No history available</p>
            <p className="text-xs text-muted-foreground mt-1">Records will appear here as you add salary, advance, and due entries.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {fullTimeline.map(item => {
              const cfg = TYPE_CONFIG[item.type];
              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border ${cfg.border} ${cfg.bg} relative`}
                >
                  {/* Type badge + date row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base">{cfg.icon}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${cfg.border} ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                      {item.salaryMonth && (
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {formatMonth(item.salaryMonth)}
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-base font-extrabold ${cfg.text}`}>{formatCurrency(item.amount)}</p>
                      {item.remainingAmount !== undefined && item.remainingAmount !== item.amount && (
                        <p className="text-[10px] text-muted-foreground">
                          Remaining: {formatCurrency(item.remainingAmount)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Details row */}
                  <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">{item.displayDate}</span>
                    {item.method && (
                      <Badge variant="outline" className="text-[9px] uppercase font-bold tracking-wider">
                        {item.method}
                      </Badge>
                    )}
                    {item.status && item.type !== 'salary_paid' && (
                      <Badge
                        variant={item.status === 'paid' ? 'success' : item.status === 'partial' ? 'warning' : 'secondary'}
                        className="text-[9px] uppercase font-bold tracking-wider"
                      >
                        {item.status}
                      </Badge>
                    )}
                    {item.note && (
                      <span className="text-[11px] text-muted-foreground italic truncate max-w-[180px]">{item.note}</span>
                    )}
                  </div>

                  {/* Download slip button for salary items */}
                  {(item.type === 'salary_paid' || item.type === 'salary_pending') && item.salaryRecordId && (
                    <button
                      onClick={() => handleDownloadSlip(item)}
                      className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Download className="h-3 w-3" />
                      Download Salary Slip
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper: build timeline from salary records + payments ──
function buildTimeline(records: SalaryRecord[], payments: SalaryPayment[]): TimelineItem[] {
  const items: TimelineItem[] = [];

  records.forEach(r => {
    const monthStr = `${r.year}-${String(r.month).padStart(2, '0')}`;
    // One item per salary record (shows the overall salary status)
    items.push({
      id:              `salary-${r.id}`,
      sortKey:         r.updatedAt || r.createdAt || '',
      displayDate:     formatDate(r.updatedAt || r.createdAt || ''),
      type:            r.remainingDue > 0 ? 'salary_pending' : 'salary_paid',
      title:           r.remainingDue > 0 ? 'Salary Pending' : 'Salary Paid',
      amount:          r.totalPaid,
      remainingAmount: r.remainingDue,
      salaryRecordId:  r.id!,
      salaryMonth:     monthStr,
      status:          r.status,
    });
  });

  payments.forEach(p => {
    items.push({
      id:             `payment-${p.id}`,
      sortKey:        p.paymentDate,
      displayDate:    formatDate(p.paymentDate),
      type:           'salary_paid',
      title:          'Salary Paid',
      amount:         p.amountPaid,
      method:         p.paymentMethod,
      note:           p.note,
      salaryRecordId: p.salaryRecordId,
    });
  });

  return items;
}

// ── Helper: merge dues into timeline and sort ─────────────
function buildFullTimeline(salaryItems: TimelineItem[], dues: DueRecord[]): TimelineItem[] {
  const items: TimelineItem[] = [...salaryItems];

  dues.filter(d => !d.isDeleted).forEach(d => {
    const isGiveTake = d.category === 'givetake';
    const isAdvance = d.category === 'advance' || (d.type === 'EMPLOYEE_TO_OWNER' && !d.category);
    const hasSalaryLink = !!d.linkedSalaryId;

    let type: TimelineItem['type'] = 'due';
    if (isGiveTake) {
      type = d.type === 'EMPLOYEE_TO_OWNER' ? 'give_money' : 'take_money';
    } else if (isAdvance) {
      type = 'advance';
    } else if (hasSalaryLink) {
      type = 'pending_salary';
    }

    items.push({
      id:              `due-${d.id}`,
      sortKey:         d.date || d.createdAt || '',
      displayDate:     formatDate(d.date || d.createdAt || ''),
      type,
      title:           TYPE_CONFIG[type].label,
      amount:          d.amount,
      remainingAmount: d.remainingAmount,
      method:          d.paymentMethod,
      note:            d.notes,
      status:          d.status,
    });
  });

  // Sort newest first
  items.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  return items;
}
