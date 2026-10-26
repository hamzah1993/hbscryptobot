import { useCallback, useEffect, useState } from 'react';
import { api, type AdminAnnouncement } from '../lib/api';

type Form = { id: string | null; title: string; body: string; pinned: boolean; published: boolean };
const input = 'mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-400/40';

export function AdminAnnouncementsPanel({ token, adminSessionToken }: { token: string; adminSessionToken: string }) {
  const [items, setItems] = useState<AdminAnnouncement[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setItems(await api.listAdminAnnouncements(token, adminSessionToken)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load announcements'); }
  }, [token, adminSessionToken]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await action(); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Request failed'); }
    finally { setBusy(false); }
  }

  return <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-xl font-semibold">Announcements</h2><p className="mt-1 text-sm text-slate-400">Shown on the app's Home screen and News tab. Pinned items stay on top.</p></div>
      <button type="button" onClick={() => setForm({ id: null, title: '', body: '', pinned: false, published: true })} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950">New announcement</button>
    </div>
    {error && <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

    {form && <div className="mt-5 space-y-3 rounded-xl border border-white/10 bg-slate-950/30 p-4">
      <label className="block text-sm text-slate-300">Title<input value={form.title} maxLength={120} onChange={(event) => setForm({ ...form, title: event.target.value })} className={input} /></label>
      <label className="block text-sm text-slate-300">Message<textarea rows={5} value={form.body} maxLength={5000} onChange={(event) => setForm({ ...form, body: event.target.value })} className={input} /></label>
      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} />Published</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.pinned} onChange={(event) => setForm({ ...form, pinned: event.target.checked })} />Pinned</label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={() => setForm(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm">Cancel</button>
        <button type="button" disabled={busy} onClick={() => void run(async () => {
          await api.saveAdminAnnouncement(token, adminSessionToken, form.id, { title: form.title, body: form.body, pinned: form.pinned, published: form.published });
          setForm(null);
        })} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>}

    <div className="mt-5 space-y-2">
      {items.map((item) => <div key={item.id} className="flex flex-col gap-2 rounded-xl bg-slate-950/30 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate font-semibold">{item.pinned ? '📌 ' : ''}{item.title}</p>
          <p className="text-xs text-slate-500">{item.published ? `Published ${item.publishedAt ? new Date(item.publishedAt).toLocaleString() : ''}` : 'Draft'}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setForm({ id: item.id, title: item.title, body: item.body, pinned: item.pinned, published: item.published })} className="rounded-lg border border-white/10 px-3 py-1.5">Edit</button>
          <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Delete "${item.title}"?`)) void run(() => api.deleteAdminAnnouncement(token, adminSessionToken, item.id)); }} className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-rose-200">Delete</button>
        </div>
      </div>)}
      {items.length === 0 && <p className="py-3 text-sm text-slate-500">No announcements yet.</p>}
    </div>
  </section>;
}
