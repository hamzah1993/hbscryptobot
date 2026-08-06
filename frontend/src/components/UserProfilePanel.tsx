import { FormEvent, useState } from 'react';
import { api, type AuthUser } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

type Props = {
  user: AuthUser;
  onLogout: () => void;
};

function initials(fullName: string) {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function UserProfilePanel({ user, onLogout }: Props) {
  const { token } = useAuth();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const memberSince = user.createdAt
    ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(user.createdAt))
    : null;

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError('');
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      if (!token) throw new Error('Your session has expired. Please sign in again.');
      await api.changePassword(token, currentPassword, newPassword);
      onLogout();
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Could not change password');
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <section className="mx-auto mt-6 max-w-3xl">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
        <div className="border-b border-white/10 bg-gradient-to-r from-cyan-400/10 via-transparent to-violet-400/10 p-5 sm:p-7">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-cyan-400 text-xl font-bold text-slate-950 shadow-lg shadow-cyan-950/30">
              {initials(user.fullName) || 'HB'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Account profile</p>
              <h3 className="mt-1 truncate text-xl font-semibold sm:text-2xl">{user.fullName}</h3>
              <p className="mt-1 truncate text-sm text-slate-400">{user.email}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-7">
          <ProfileField label="Full name" value={user.fullName} />
          <ProfileField label="Email address" value={user.email} />
          <ProfileField label="Account role" value={user.role} />
          <ProfileField label="Member since" value={memberSince ?? 'Account active'} />
        </div>

        <div className="border-t border-white/10 p-5 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-200">Password &amp; security</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Changing your password signs out all existing sessions.</p>
            </div>
            <button type="button" onClick={() => setShowPasswordForm((value) => !value)} className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-200">
              {showPasswordForm ? 'Cancel' : 'Change password'}
            </button>
          </div>
          {showPasswordForm && (
            <form onSubmit={changePassword} className="mt-5 grid gap-3 sm:grid-cols-2">
              <input type="password" minLength={8} required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none focus:border-cyan-400/50" />
              <div />
              <input type="password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none focus:border-cyan-400/50" />
              <input type="password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none focus:border-cyan-400/50" />
              {passwordError && <p className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200 sm:col-span-2">{passwordError}</p>}
              <button disabled={changingPassword} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60">
                {changingPassword ? 'Changing…' : 'Update password'}
              </button>
            </form>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <p className="text-xs leading-5 text-slate-500">You are signed in to HBS Trading Control Center.</p>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/20"
          >
            Log out
          </button>
        </div>
      </div>
    </section>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/20 px-4 py-3.5">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1.5 break-words text-sm font-medium text-slate-200">{value}</p>
    </div>
  );
}
