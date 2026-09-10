'use client';
import { useState, useTransition } from 'react';
import { setPaidAction } from '@/actions';
export default function PaidForm({ managerId, paid }) {
  const [v, setV] = useState(paid); const [p, start] = useTransition(); const [ok, setOk] = useState(false);
  return <span className="row" style={{ gap: 4 }}><input type="number" step="0.5" value={v} onChange={e => setV(e.target.value)} style={{ width: 72 }} /><button className="sm sec" disabled={p} onClick={() => start(async () => { await setPaidAction(managerId, v); setOk(true); })}>{ok ? '✓' : 'ok'}</button></span>;
}
