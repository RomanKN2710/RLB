'use client';
import { useEffect, useState } from 'react';
/** Restzeit bis zur Deadline, minütlich aktualisiert; unter 24 Stunden rot. */
export default function Countdown({ to }) {
  const [now, setNow] = useState(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  if (!to) return null; if (now == null) return <span className="countdown">…</span>;
  const ms = new Date(to).getTime() - now; if (ms <= 0) return <span className="countdown soon">Deadline vorbei</span>;
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
  return <span className={`countdown ${ms < 864e5 ? 'soon' : ''}`}>noch {d ? `${d} T ` : ''}{h} Std {d ? '' : `${m} Min`}</span>;
}
