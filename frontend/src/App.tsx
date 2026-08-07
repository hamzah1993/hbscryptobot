import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { TradingEnvironmentProvider } from './trading/TradingEnvironmentContext';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { ExchangeAccountsPage } from './pages/ExchangeAccountsPage';
import { AdminPage } from './pages/AdminPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-300">Loading…</main>;
  return user ? children : <Navigate to="/auth" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-300">Loading…</main>;
  if (!user) return <Navigate to="/auth" replace />;
  return user.role === 'ADMIN' ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <TradingEnvironmentProvider>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/exchange-accounts" element={<ProtectedRoute><ExchangeAccountsPage /></ProtectedRoute>} />
        <Route path="/super/admin/control" element={<AdminRoute><AdminPage /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TradingEnvironmentProvider>
  );
}
