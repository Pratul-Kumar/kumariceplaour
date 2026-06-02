import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Minus, HandCoins, History, Wallet, User, Calendar } from 'lucide-react';
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

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { amount: 0, note: '' }
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

  const balance = staff.outstandingBalance || 0;
  // Positive balance = Owner is owed money (EMPLOYEE_TO_OWNER) -> Recoverable
  // Negative balance = Employee is owed money (OWNER_TO_EMPLOYEE) -> Payable

  const isRecoverable = balance > 0;
  const isPayable = balance < 0;
  const balanceText = balance === 0 ? '₹0 Pending' : isRecoverable ? `${formatCurrency(balance)} To Collect` : `${formatCurrency(Math.abs(balance))} Payable`;
  const balanceColor = balance === 0 ? 'text-muted-foreground' : isRecoverable ? 'text-amber-500' : 'text-emerald-500';

  const openModal = (type: 'advance' | 'add' | 'subtract' | 'receive') => {
    reset({ amount: 0, note: '' });
    setModalType(type);
  };

  const onSubmit = async (data: any) => {
    if (data.amount <= 0) return toast({ type: 'error', title: 'Invalid Amount', description: 'Enter an amount greater than 0.' });
    setSaving(true);
    try {
      if (modalType === 'advance' || modalType === 'add') {
        // Owner gives money to employee OR adds liability to employee
        await dueService.add({
          staffId: staff.id!,
          type: 'EMPLOYEE_TO_OWNER',
          amount: data.amount,
          remainingAmount: data.amount,
          notes: data.note || (modalType === 'advance' ? 'Advance Paid' : 'Money Added'),
        });
        toast({ type: 'success', title: 'Success', description: `${formatCurrency(data.amount)} added to pending balance.` });
      } else if (modalType === 'receive' || modalType === 'subtract') {
        // Owner receives money from employee OR subtracts liability from employee
        await dueService.add({
          staffId: staff.id!,
          type: 'OWNER_TO_EMPLOYEE',
          amount: data.amount,
          remainingAmount: data.amount,
          notes: data.note || (modalType === 'receive' ? 'Money Received' : 'Money Subtracted/Adjusted'),
        });
        toast({ type: 'success', title: 'Success', description: `${formatCurrency(data.amount)} adjusted in balance.` });
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
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/staff?mode=money')} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm bg-gradient-to-br ${generateAvatarColor(staff.name)}`}>
            {getInitials(staff.name)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">{staff.name}</h1>
            <p className="text-sm text-muted-foreground capitalize">Money Management</p>
          </div>
        </div>
      </div>

      {/* Big Balance Card */}
      <Card className="glass-card border-none bg-gradient-to-br from-card/80 to-muted/30 shadow-lg">
        <CardContent className="p-8 text-center flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl"></div>
          <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-pink-500/10 rounded-full blur-3xl"></div>
          
          <Wallet className="h-10 w-10 text-indigo-500 mb-4 opacity-80" />
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-2">Due Money</p>
          <p className={`text-4xl font-extrabold tracking-tight ${balanceColor}`}>
            {balanceText}
          </p>
          {balance !== 0 && (
            <p className="text-xs text-muted-foreground mt-3 bg-background/50 py-1.5 px-4 rounded-full border border-border/50">
              {isRecoverable ? 'Employee owes you this amount' : 'You owe employee this amount'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 4 Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={() => openModal('advance')} className="h-16 flex-col gap-1.5 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border border-amber-500/20 shadow-none" variant="outline">
          <HandCoins className="h-5 w-5" />
          <span className="font-bold">Pay Advance</span>
        </Button>
        <Button onClick={() => openModal('receive')} className="h-16 flex-col gap-1.5 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20 shadow-none" variant="outline">
          <Wallet className="h-5 w-5" />
          <span className="font-bold">Receive Money</span>
        </Button>
        <Button onClick={() => openModal('add')} className="h-14 flex-col gap-1 text-muted-foreground hover:text-foreground" variant="outline">
          <Plus className="h-4 w-4" />
          <span className="text-xs font-semibold">Add Money</span>
        </Button>
        <Button onClick={() => openModal('subtract')} className="h-14 flex-col gap-1 text-muted-foreground hover:text-foreground" variant="outline">
          <Minus className="h-4 w-4" />
          <span className="text-xs font-semibold">Subtract Money</span>
        </Button>
      </div>

      {/* Chronological History */}
      <div>
        <div className="flex items-center gap-2 mb-4 px-1">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">Money History</h2>
        </div>
        
        <div className="space-y-3">
          {dues.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border rounded-2xl bg-card/30">
              <p className="text-sm font-medium text-muted-foreground">No money history yet.</p>
            </div>
          ) : (
            dues.map((due) => {
              const isEmployeeToOwner = due.type === 'EMPLOYEE_TO_OWNER';
              const isOwnerToEmployee = due.type === 'OWNER_TO_EMPLOYEE';
              
              // In this context, Employee to Owner means owner paid advance (balance increased)
              // Owner to Employee means owner received money or owed salary (balance decreased)
              
              const color = isEmployeeToOwner ? 'text-amber-500' : 'text-emerald-500';
              const sign = isEmployeeToOwner ? '+' : '-';
              
              return (
                <div key={due.id} className="p-4 bg-card border border-border rounded-2xl flex items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{due.notes || (isEmployeeToOwner ? 'Advance / Added' : 'Received / Adjusted')}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <p className="text-xs font-medium text-muted-foreground">{formatDate(due.createdAt)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold tracking-tight ${color}`}>
                      {sign}{formatCurrency(due.amount)}
                    </p>
                    {due.linkedSalaryId && (
                      <Badge variant="secondary" className="text-[9px] mt-1 uppercase tracking-wider">
                        Salary Linked
                      </Badge>
                    )}
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
        modalType === 'receive' ? 'Receive Money' :
        modalType === 'add' ? 'Add Money' : 'Subtract Money'
      }>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">Amount (₹) *</label>
            <Input type="number" min={1} {...register('amount', { valueAsNumber: true })} className="text-lg h-12" placeholder="Enter amount..." autoFocus />
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">Note (Optional)</label>
            <Input {...register('note')} className="h-12" placeholder="Why is this being added?" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1 h-12" onClick={() => setModalType(null)}>Cancel</Button>
            <Button type="submit" className="flex-1 h-12" disabled={saving}>
              {saving ? <Spinner className="h-5 w-5" /> : 'Save Record'}
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
