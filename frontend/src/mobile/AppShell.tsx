import { Home, Newspaper, Repeat, User, Users } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const tabs = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/strategy', label: 'Strategy', icon: Repeat },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/news', label: 'News', icon: Newspaper },
  { to: '/mine', label: 'Mine', icon: User },
];
const tabPaths = new Set(tabs.map((tab) => tab.to));

/** Mobile-first app frame: a phone-width column with a floating bottom tab bar on the main tabs. */
export function AppShell() {
  const { pathname } = useLocation();
  const showTabs = tabPaths.has(pathname);
  return <div className="min-h-screen bg-slate-200/60 text-slate-900" style={{ colorScheme: 'light' }}>
    <div className={`relative mx-auto min-h-screen max-w-[480px] bg-[#f4f5f7] ${showTabs ? 'pb-28' : 'pb-8'}`}>
      <Outlet />
      {showTabs && <nav aria-label="Main" className="fixed inset-x-0 bottom-3 z-30 mx-auto w-[calc(100%-24px)] max-w-[456px]">
        <ul className="grid grid-cols-5 rounded-[28px] bg-white/95 p-1.5 shadow-lg shadow-slate-900/10 backdrop-blur">
          {tabs.map(({ to, label, icon: Icon, end }) => <li key={to}>
            <NavLink to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-1 rounded-[22px] py-2 text-xs font-medium ${isActive ? 'bg-teal-50 text-teal-700' : 'text-slate-600'}`}>
              <Icon className="h-6 w-6" strokeWidth={1.8} />{label}
            </NavLink>
          </li>)}
        </ul>
      </nav>}
    </div>
  </div>;
}
