import { BookOpen, ChartLine, ChevronRight, Gift, KeyRound, LayoutDashboard, LogOut, ShieldCheck, Wallet } from 'lucide-react';
import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { Card, money, usePolling } from './ui';

type Item = { label: string; to: string; icon: ComponentType<{ className?: string }> };

export function MineScreen() {
  const { token, user, logout } = useAuth();
  const { data: billing } = usePolling(() => api.getBilling(token!), 60_000);

  const items: Item[] = [
    { label: 'Assets', to: '/assets', icon: Wallet },
    { label: 'API Binding', to: '/exchange-accounts', icon: KeyRound },
    { label: 'Profit Details', to: '/profits', icon: ChartLine },
    { label: 'Reward Details', to: '/rewards', icon: Gift },
    { label: 'User Guide', to: '/guide', icon: BookOpen },
    { label: 'Full dashboard', to: '/pro', icon: LayoutDashboard },
    ...(user?.role === 'ADMIN' ? [{ label: 'Admin Center', to: '/super/admin/control', icon: ShieldCheck }] : []),
  ];

  return <>
    <header className="sticky top-0 z-20 bg-[#f4f5f7]/95 px-4 py-4 text-center backdrop-blur"><h1 className="text-lg font-semibold">Mine</h1></header>
    <main className="space-y-3 px-3">
      <Card>
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-teal-600 text-lg font-semibold text-white">{(user?.fullName.trim()[0] ?? '?').toUpperCase()}</span>
          <div className="min-w-0 flex-1"><p className="truncate font-semibold">{user?.fullName}</p><p className="truncate text-sm text-slate-500">{user?.email}</p></div>
          {billing && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${billing.membership.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{billing.membership.active ? 'Member' : 'Not a member'}</span>}
        </div>
        {billing && <Link to="/assets" className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-sm text-slate-500">Fuel balance</span>
          <span className="font-semibold">{money(billing.balanceQuote)}</span>
        </Link>}
      </Card>
      <Card className="p-0">
        <ul className="divide-y divide-slate-100">
          {items.map(({ label, to, icon: Icon }) => <li key={label}>
            <Link to={to} className="flex items-center gap-3 px-4 py-3.5"><Icon className="h-5 w-5 text-slate-500" /><span className="flex-1 text-sm">{label}</span><ChevronRight className="h-4 w-4 text-slate-300" /></Link>
          </li>)}
        </ul>
      </Card>
      <button type="button" onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-medium text-rose-600 shadow-sm"><LogOut className="h-4 w-4" />Sign out</button>
    </main>
  </>;
}
