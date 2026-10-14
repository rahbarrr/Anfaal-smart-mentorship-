import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { getBin, restoreBinItem } from '../lib/api';

type BinItem = { type: string; id: string; label: string; deletedAt?: string; deletedBy?: string; deletionReason?: string };

function labelForType(type: string) {
  return type.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}

export function AdminBinPage() {
  const token = localStorage.getItem('anfaal-token') ?? '';
  const [items, setItems] = useState<BinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const result = await getBin(token); setItems(result.items ?? []); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to load Bin.'); }
    finally { setLoading(false); }
  }, [token]);

  // This effect intentionally synchronizes the initial Bin view with the API.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const restore = async (item: BinItem) => {
    setRestoring(`${item.type}:${item.id}`); setError('');
    try { await restoreBinItem(token, item.type, item.id); setItems((current) => current.filter((entry) => entry.id !== item.id || entry.type !== item.type)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to restore record.'); }
    finally { setRestoring(''); }
  };

  return <div style={{ display: 'grid', gap: 18 }}>
    <div className="page-header"><div><div className="eyebrow">Data recovery</div><h2 className="page-title">Bin</h2><p className="page-subtitle">Deleted records stay in the database and can be restored by an administrator.</p></div><button className="btn-secondary" type="button" onClick={() => void load()}><RefreshCw size={16} /> Refresh</button></div>
    {error && <div className="alert-banner alert-error" role="alert">{error}</div>}
    {loading ? <div className="empty-state">Loading deleted records…</div> : items.length === 0 ? <div className="empty-state"><Trash2 size={34} /><h3>Bin is empty</h3><p>Deleted records will appear here.</p></div> : <div className="summary-card" style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Record</th><th>Type</th><th>Deleted</th><th>Reason</th><th>Action</th></tr></thead><tbody>{items.map((item) => { const key = `${item.type}:${item.id}`; return <tr key={key}><td>{item.label}</td><td>{labelForType(item.type)}</td><td>{item.deletedAt ? new Date(item.deletedAt).toLocaleString('en-IN') : '—'}</td><td>{item.deletionReason || '—'}</td><td><button className="btn-secondary" type="button" disabled={restoring === key} onClick={() => void restore(item)}><RotateCcw size={15} /> {restoring === key ? 'Restoring…' : 'Restore'}</button></td></tr>; })}</tbody></table></div>}
  </div>;
}
