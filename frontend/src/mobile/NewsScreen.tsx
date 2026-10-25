import { Pin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { NEWS_SEEN_KEY } from './HomeScreen';
import { Card, Empty, ErrorNote, usePolling } from './ui';

export function NewsScreen() {
  const { token } = useAuth();
  const { data, error } = usePolling(() => api.listAnnouncements(token!), 60_000);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    try { localStorage.setItem(NEWS_SEEN_KEY, String(Date.now())); } catch { /* storage unavailable */ }
  }, [data]);

  return <>
    <header className="sticky top-0 z-20 bg-[#f4f5f7]/95 px-4 py-4 text-center backdrop-blur"><h1 className="text-lg font-semibold">News</h1></header>
    <main className="space-y-3 px-3">
      <ErrorNote message={error} />
      {data && data.length === 0 && <Card><Empty>No announcements yet.</Empty></Card>}
      {data?.map((item) => <Card key={item.id}>
        <button type="button" onClick={() => setOpen(open === item.id ? null : item.id)} className="w-full text-left">
          <div className="flex items-start gap-2">
            {item.pinned && <Pin className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />}
            <h2 className="flex-1 font-semibold">{item.title}</h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : ''}</p>
          <p className={`mt-2 whitespace-pre-line text-sm leading-6 text-slate-600 ${open === item.id ? '' : 'line-clamp-2'}`}>{item.body}</p>
        </button>
      </Card>)}
    </main>
  </>;
}
