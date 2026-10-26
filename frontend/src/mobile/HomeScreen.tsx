import { BookOpen, ChartLine, Gift, KeyRound, LayoutGrid, Megaphone, ShieldCheck, UserPlus, Wallet, Bell, ChevronRight } from 'lucide-react';
import { useEffect, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { MarketList } from './MarketList';
import { BrandMark, usePolling } from './ui';

export const NEWS_SEEN_KEY = 'hbs_news_seen_at';

const slides = [
  { title: 'Pick a plan, we run the bots', body: 'Managed packages trade on your own Binance account.', cta: 'View packages', to: '/strategy', className: 'from-teal-600 to-emerald-500' },
  { title: 'Invite friends, earn rewards', body: 'Get a share of the fees your team pays, up to three levels.', cta: 'Invite now', to: '/team', className: 'from-indigo-600 to-sky-500' },
  { title: 'Your keys, your funds', body: 'Trading funds never leave your exchange. Withdrawals stay disabled.', cta: 'How it works', to: '/guide', className: 'from-slate-800 to-slate-600' },
];

const actions: Array<{ label: string; to: string; icon: ComponentType<{ className?: string }>; tint: string }> = [
  { label: 'API Binding', to: '/exchange-accounts', icon: KeyRound, tint: 'bg-sky-100 text-sky-600' },
  { label: 'Profit Details', to: '/profits', icon: ChartLine, tint: 'bg-rose-100 text-rose-600' },
  { label: 'Reward Details', to: '/rewards', icon: Gift, tint: 'bg-emerald-100 text-emerald-600' },
  { label: 'Assets', to: '/assets', icon: Wallet, tint: 'bg-amber-100 text-amber-600' },
  { label: 'Invite Friends', to: '/team', icon: UserPlus, tint: 'bg-orange-100 text-orange-600' },
  { label: 'User Guide', to: '/guide', icon: BookOpen, tint: 'bg-violet-100 text-violet-600' },
  { label: 'More', to: '/pro', icon: LayoutGrid, tint: 'bg-teal-100 text-teal-700' },
];

function readSeen() {
  try { return Number(localStorage.getItem(NEWS_SEEN_KEY) ?? 0); } catch { return 0; }
}

export function HomeScreen() {
  const { token } = useAuth();
  const [slide, setSlide] = useState(0);
  const [profitIndex, setProfitIndex] = useState(0);
  const { data: announcements } = usePolling(() => api.listAnnouncements(token!), 60_000);
  const { data: profits } = usePolling(() => api.listRecentProfits(token!), 60_000);
  const { data: billing } = usePolling(() => api.getBilling(token!), 60_000);

  useEffect(() => {
    const timer = window.setInterval(() => setSlide((current) => (current + 1) % slides.length), 5_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!profits?.length) return;
    const timer = window.setInterval(() => setProfitIndex((current) => (current + 1) % profits.length), 3_500);
    return () => window.clearInterval(timer);
  }, [profits]);

  const latestNews = announcements?.[0];
  const unread = Boolean(announcements?.some((item) => item.publishedAt && new Date(item.publishedAt).getTime() > readSeen()));
  const profit = profits?.length ? profits[profitIndex % profits.length] : null;
  const current = slides[slide];

  return <>
    <header className="sticky top-0 z-20 flex items-center justify-between bg-[#f4f5f7]/95 px-4 py-3 backdrop-blur">
      <BrandMark />
      <h1 className="text-lg font-semibold">Home</h1>
      <div className="flex items-center gap-1 rounded-full bg-white px-2 py-1 shadow-sm">
        <Link to="/assets" aria-label="Trading status" className="relative grid h-9 w-9 place-items-center rounded-full">
          <ShieldCheck className="h-5 w-5" />
          {billing && !billing.trading.allowed && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />}
        </Link>
        <Link to="/news" aria-label="News" className="relative grid h-9 w-9 place-items-center rounded-full">
          <Bell className="h-5 w-5" />
          {unread && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />}
        </Link>
      </div>
    </header>

    <main className="space-y-3 px-3">
      <Link to={current.to} className={`relative block overflow-hidden rounded-2xl bg-gradient-to-br ${current.className} p-5 text-white shadow-sm`}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">HBS Trading</p>
        <h2 className="mt-2 max-w-[75%] text-2xl font-bold leading-tight">{current.title}</h2>
        <p className="mt-2 max-w-[75%] text-sm text-white/80">{current.body}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold">{current.cta} <ChevronRight className="h-4 w-4" /></span>
        <div className="absolute bottom-3 right-4 flex gap-1.5">
          {slides.map((item, index) => <button key={item.title} type="button" aria-label={`Slide ${index + 1}`} onClick={(event) => { event.preventDefault(); setSlide(index); }} className={`h-1.5 rounded-full ${index === slide ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`} />)}
        </div>
      </Link>

      {billing && !billing.trading.allowed && <Link to="/assets" className="flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <ShieldCheck className="h-5 w-5 shrink-0" /><span className="flex-1">{billing.trading.reason}</span><ChevronRight className="h-4 w-4" />
      </Link>}

      <Link to="/news" className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
        <Megaphone className="h-5 w-5 shrink-0 text-slate-500" />
        <span className="flex-1 truncate text-sm">{latestNews ? latestNews.title : 'No announcements yet'}</span>
        <ChevronRight className="h-4 w-4 text-slate-400" />
      </Link>

      <section className="grid grid-cols-4 gap-y-4 rounded-2xl bg-white px-2 py-4 shadow-sm">
        {actions.map(({ label, to, icon: Icon, tint }) => <Link key={label} to={to} className="flex flex-col items-center gap-2 text-center">
          <span className={`grid h-12 w-12 place-items-center rounded-2xl ${tint}`}><Icon className="h-6 w-6" /></span>
          <span className="text-xs leading-tight text-slate-600">{label}</span>
        </Link>)}
      </section>

      {profit && <section className="flex items-center gap-2 overflow-hidden rounded-2xl bg-white px-4 py-3 text-sm shadow-sm" aria-live="polite">
        <span className="font-semibold">{profit.symbol}</span>
        <span className="text-slate-500">profited</span>
        <span className="font-semibold text-emerald-600">{profit.profitPercent.toFixed(2)}%</span>
        <span className="ml-auto text-slate-400">{profit.user}</span>
      </section>}

      <MarketList token={token!} />
    </main>
  </>;
}
