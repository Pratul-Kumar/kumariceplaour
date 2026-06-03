import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Minus, HandCoins, History, Wallet, User, Calendar, Coins } from 'lucide-react';
import { Card, CardContent, Button, Input, Badge, Skeleton, Spinner } from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { staffService, dueService } from '@/services';
import { type Staff, type DueRecord } from '@/types';
import { formatCurrency, formatDate, getInitials, generateAvatarColor } from '@/lib/utils';
import { useForm } from 'react-hook-form';

export function MoneyProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [staff, setStaff] = useState<Staff | null>(null);
  const [dues, setDues] = useState<DueRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [modalType, setModalType] = useState<'advance' | 'add' | 'subtract' | 'receive' | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { amount: 0, note: '', paymentMethod: 'cash', paymentDate: new Date().toISOString().split('T')[0] }
  });

  useEffect(() => {
    if (!id) return;
    const unsubStaff = staffService.subscribeById(id, setStaff);
    const unsubDues = dueService.subscribeByStaff(id, setDues);
    
    // Simulate loading for smooth entry
    setTimeout(() => setLoading(false), 300);

    return () => {
      unsubStaff();
      unsubDues();
    };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!staff) {
    return <div className="p-8 text-center text-muted-foreground">Staff member not found.</div>;
  }

  // ── Compute each side SEPARATELY from the raw dues collection (never mix)
  const advanceTotal = dues
    .filter(d => (d.category === 'advance' || (d.type === 'EMPLOYEE_TO_OWNER' && !d.category)) && !d.isDeleted && (d.status === 'active' || d.status === 'partial'))
    .reduce((sum, d) => sum + (d.remainingAmount || 0), 0);

  const dueTotal = dues
    .filter(d => (d.category === 'due' || (d.type === 'OWNER_TO_EMPLOYEE' && !d.category)) && !d.isDeleted && (d.status === 'active' || d.status === 'partial'))
    .reduce((sum, d) => sum + (d.remainingAmount || 0), 0);

  const giveTakeTotal = dues
    .filter(d => d.category === 'givetake' && d.type === 'EMPLOYEE_TO_OWNER' && !d.isDeleted && (d.status === 'active' || d.status === 'partial'))
    .reduce((sum, d) => sum + (d.remainingAmount || 0), 0);

  const openModal = (type: 'advance' | 'add' | 'subtract' | 'receive') => {
    reset({ amount: 0, note: '', paymentMethod: 'cash', paymentDate: new Date().toISOString().split('T')[0] });
    setModalType(type);
  };

  const handleDelete = async (id: string) => {
    if (!id) return;
    try {
      await dueService.deleteEntry(id);
      toast({ type: 'success', title: 'Deleted', description: 'History entry deleted successfully.' });
    } catch (e: any) {
      toast({ type: 'error', title: 'Error', description: e.message });
    }
    setDeleteConfirmId(null);
  };

  const onSubmit = async (data: any) => {
    if (data.amount <= 0) return toast({ type: 'error', title: 'Invalid Amount', description: 'Enter an amount greater than 0.' });
    setSaving(true);
    try {
      if (modalType === 'advance') {
        await dueService.add({
          staffId: staff.id!,
          type: 'EMPLOYEE_TO_OWNER',
          category: 'advance',
          amount: data.amount,
          remainingAmount: data.amount,
          notes: data.note || 'Advance Paid',
          date: data.paymentDate,
          paymentMethod: data.paymentMethod
        });
        toast({ type: 'success', title: 'Success', description: `${formatCurrency(data.amount)} added to pending advance.` });
      } else if (modalType === 'receive') {
        await dueService.add({
          staffId: staff.id!,
          type: 'OWNER_TO_EMPLOYEE',
          category: 'due',
          amount: data.amount,
          remainingAmount: data.amount,
          notes: data.note || 'Due Owed',
          date: data.paymentDate,
          paymentMethod: data.paymentMethod
        });
        toast({ type: 'success', title: 'Success', description: `${formatCurrency(data.amount)} added to pending dues.` });
      } else if (modalType === 'add') {
        // Give Money: Owner gave extra money to employee
        await dueService.add({
          staffId: staff.id!,
          type: 'EMPLOYEE_TO_OWNER',
          category: 'givetake',
          amount: data.amount,
          remainingAmount: data.amount,
          notes: data.note || 'Give Money',
          date: data.paymentDate,
          paymentMethod: data.paymentMethod
        });
        toast({ type: 'success', title: 'Success', description: `${formatCurrency(data.amount)} added to Give/Take balance.` });
      } else if (modalType === 'subtract') {
        // Take Money: Owner received money back from employee
        await dueService.add({
          staffId: staff.id!,
          type: 'OWNER_TO_EMPLOYEE',
          category: 'givetake',
          amount: data.amount,
          remainingAmount: data.amount,
          notes: data.note || 'Take Money',
          date: data.paymentDate,
          paymentMethod: data.paymentMethod
        });
        toast({ type: 'success', title: 'Success', description: `${formatCurrency(data.amount)} adjusted in Give/Take balance.` });
      }
      setModalType(null);
    } catch (e: any) {
      toast({ type: 'error', title: 'Action Failed', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-24 max-w-lg mx-auto">
      {/* Header — standardized layout */}
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/staff?mode=money')} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center justify-between flex-1 min-w-0 gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-12 h-12 rounded-full shrink-0 flex items-center justify-center font-bold text-white shadow-sm bg-gradient-to-br ${generateAvatarColor(staff.name)}`}>
              {getInitials(staff.name)}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground leading-tight truncate">{staff.name}</h1>
              <p className="text-sm text-muted-foreground">Money Management</p>
            </div>
          </div>
        </div>
      </div>

      {/* Three Separate Balance Cards */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="glass-card border-none bg-gradient-to-br from-amber-500/10 to-orange-500/5">
          <CardContent className="p-3 text-center">
            <HandCoins className="h-5 w-5 text-amber-500 mx-auto mb-1 opacity-80" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Advance</p>
            <p className="text-lg font-bold text-amber-500">{formatCurrency(advanceTotal)}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">Employee owes</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-none bg-gradient-to-br from-emerald-500/10 to-teal-500/5">
          <CardContent className="p-3 text-center">
            <Wallet className="h-5 w-5 text-emerald-500 mx-auto mb-1 opacity-80" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Due</p>
            <p className="text-lg font-bold text-emerald-500">{formatCurrency(dueTotal)}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">You owe</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-none bg-gradient-to-br from-purple-500/10 to-pink-500/5">
          <CardContent className="p-3 text-center">
            <Coins className="h-5 w-5 text-purple-500 mx-auto mb-1 opacity-80" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Give/Take</p>
            <p className="text-lg font-bold text-purple-500">{formatCurrency(giveTakeTotal)}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">Extra balance</p>
          </CardContent>
        </Card>
      </div>

      {/* 4 Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={() => openModal('advance')} className="h-14 flex-col gap-1 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border border-amber-500/20 shadow-none" variant="outline">
          <HandCoins className="h-4 w-4" />
          <span className="text-xs font-bold">Pay Advance</span>
        </Button>
        <Button onClick={() => openModal('receive')} className="h-14 flex-col gap-1 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20 shadow-none" variant="outline">
          <Wallet className="h-4 w-4" />
          <span className="text-xs font-bold">Dues</span>
        </Button>
        <Button onClick={() => openModal('add')} className="h-14 flex-col gap-1 bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 border border-purple-500/20 shadow-none" variant="outline">
          <Plus className="h-4 w-4" />
          <span className="text-xs font-bold">Give Money</span>
        </Button>
        <Button onClick={() => openModal('subtract')} className="h-14 flex-col gap-1 bg-pink-500/10 text-pink-600 hover:bg-pink-500/20 border border-pink-500/20 shadow-none" variant="outline">
          <Minus className="h-4 w-4" />
          <span className="text-xs font-bold">Take Money</span>
        </Button>
      </div>

      {/* Chronological History */}
      <div>
        <div className="flex items-center gap-2 mb-4 px-1">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">History</h2>
        </div>
        
        <div className="space-y-3">
          {dues.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border rounded-2xl bg-card/30">
              <p className="text-sm font-medium text-muted-foreground">No history yet.</p>
            </div>
          ) : (
            dues.map((due) => {
              const isGiveTake = due.category === 'givetake';
              const isAdvance = due.category === 'advance' || (due.type === 'EMPLOYEE_TO_OWNER' && !due.category);

              let badge = 'Due';
              let color = 'text-emerald-500';
              let badgeColor = 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
              let label = due.notes || 'Due';

              if (isGiveTake) {
                const isGive = due.type === 'EMPLOYEE_TO_OWNER';
                badge = isGive ? 'Give Money' : 'Take Money';
                color = isGive ? 'text-purple-500' : 'text-pink-500';
                badgeColor = isGive
                  ? 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                  : 'bg-pink-500/10 text-pink-600 border-pink-500/20';
                label = due.notes || (isGive ? 'Give Money' : 'Take Money');
              } else if (isAdvance) {
                badge = 'Advance';
                color = 'text-amber-500';
                badgeColor = 'bg-amber-500/10 text-amber-600 border-amber-500/20';
                label = due.notes || 'Advance';
              }

              return (
                <div key={due.id} className="p-4 bg-card border border-border rounded-2xl flex items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow relative group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${badgeColor}`}>{badge}</span>
                      {due.linkedSalaryId && <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded border bg-indigo-500/10 text-indigo-500 border-indigo-500/20">Salary</span>}
                    </div>
                    <p className="text-sm font-bold text-foreground truncate">{label}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-0.5 rounded text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span className="text-[10px] font-medium">{formatDate(due.date || due.createdAt)}</span>
                      </div>
                      {due.paymentMethod && (
                        <Badge variant="outline" className="text-[9px] uppercase font-bold tracking-wider">
                          {due.paymentMethod}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <p className={`text-lg font-bold tracking-tight ${color}`}>
                      {formatCurrency(due.remainingAmount ?? due.amount)}
                    </p>
                    {(due.remainingAmount ?? due.amount) !== due.amount && (
                      <p className="text-[10px] text-muted-foreground">of {formatCurrency(due.amount)}</p>
                    )}
                  </div>

                  {/* Delete Button — hover */}
                  <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:bg-rose-500/10" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(due.id!); }}>
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Shared Action Modal */}
      <Modal open={!!modalType} onClose={() => setModalType(null)} title={
        modalType === 'advance' ? 'Pay Advance' :
        modalType === 'receive' ? 'Dues' :
        modalType === 'add' ? 'Give Money' : 'Take Money'
      }>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">Amount (₹) *</label>
            <Input type="number" min={1} {...register('amount', { valueAsNumber: true })} className="text-lg h-12" placeholder="Enter amount..." autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-foreground block mb-2">Date</label>
              <Input type="date" {...register('paymentDate')} className="h-12" />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground block mb-2">Method</label>
              <select {...register('paymentMethod')} className="w-full h-12 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <option value="cash">Cash</option>
                <option value="online">Online</option>
                <option value="upi">UPI</option>
                <option value="bank">Bank Transfer</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">Note (Optional)</label>
            <Input {...register('note')} className="h-12" placeholder={
              modalType === 'add' ? 'e.g. Festival help, Personal emergency...' :
              modalType === 'subtract' ? 'e.g. Returned Amount' :
              'Why is this being added?'
            } />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1 h-12" onClick={() => setModalType(null)}>Cancel</Button>
            <Button type="submit" className="flex-1 h-12" disabled={saving}>
              {saving ? <Spinner className="h-5 w-5" /> : 'Save Record'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} title="Delete this history entry?">
        <div className="pt-2 space-y-4">
          <p className="text-sm text-muted-foreground">This action will rollback any balance changes associated with this entry. This cannot be undone.</p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-12" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button className="flex-1 h-12 bg-rose-500 hover:bg-rose-600 text-white" onClick={() => handleDelete(deleteConfirmId!)}>Delete Entry</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
