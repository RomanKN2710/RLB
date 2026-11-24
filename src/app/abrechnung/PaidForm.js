'use client';
import { useState, useTransition } from 'react';
import { setPaidAction } from '@/actions';
export default function PaidForm({ managerId, paid }) {
  const [v, setV] = useState(paid); const [p, start] = useTransition(); const [res, setRes] = useState(null);
  return <span className="row" style={{ gap: 4 }}><input type="number" inputMode="decimal" aria-label="Bezahlt (CHF)" step="0.5" value={v} onChange={e => { setV(e.target.value); setRes(null); }} style={{ width: 72 }} />
    <button className="sm sec" disabled={p} onClick={() => start(async () => setRes(await setPaidAction(managerId, v)))}>{p ? '…' : res?.ok ? '✓' : 'ok'}</button>{res && !res.ok && <span className="mini delta down">{res.msg}</span>}</span>;
}
