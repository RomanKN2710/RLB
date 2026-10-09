'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/* Navigation: oben die volle Leiste (Desktop), auf dem Handy eine Tab-Leiste unten mit fünf Einträgen,
   «Mehr» öffnet ein Blatt mit den übrigen Seiten. Markiert jeweils die aktive Seite. */
const MAIN = [['/', 'Tabelle', 'table'], ['/aufstellung', 'Aufstellung', 'pitch'], ['/markt', 'Markt', 'tag'], ['/kader', 'Kader', 'people']];
const MORE = [['/statistik', 'Statistik'], ['/potential', 'Potential'], ['/prognose', 'Prognose'], ['/hall-of-fame', 'Hall of Fame'], ['/bericht', 'Bericht'], ['/abrechnung', 'Abrechnung'], ['/archiv', 'Archiv'], ['/regeln', 'Regeln'], ['/konto', 'Konto']];
const FULL = [['/', 'Tabelle'], ['/aufstellung', 'Aufstellung'], ['/markt', 'Transfermarkt'], ['/kader', 'Kader & Trades'], ...MORE];

const ICON = {
  table: <><path d="M4 6h16M4 12h16M4 18h16" /><path d="M8 6v12" /></>,
  pitch: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 12h16" /><circle cx="12" cy="12" r="3" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8" r="1.5" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c2.9.4 5 2.8 5 5.8" /></>,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
};
const Icon = ({ n }) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[n]}</svg>;

export default function Nav({ admin }) {
  const path = usePathname() || '/'; const ref = useRef(null); const [sheet, setSheet] = useState(false);
  const isOn = h => h === '/' ? (path === '/' || path.startsWith('/runde')) : (path === h || path.startsWith(h + '/'));
  const full = admin ? [...FULL, ['/admin', 'Admin']] : FULL; const more = admin ? [...MORE, ['/admin', 'Admin']] : MORE;
  const moreOn = more.some(([h]) => isOn(h));
  useEffect(() => { setSheet(false); const el = ref.current?.querySelector('a.on'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [path]);
  useEffect(() => { if (!sheet) return; const k = e => { if (e.key === 'Escape') setSheet(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [sheet]);
  return (<>
    <nav ref={ref} className="topnav">{full.map(([h, l]) => <Link key={h} href={h} className={isOn(h) ? 'on' : ''} aria-current={isOn(h) ? 'page' : undefined}>{l}</Link>)}</nav>
    <nav className="tabbar" aria-label="Hauptnavigation">
      {MAIN.map(([h, l, ic]) => <Link key={h} href={h} className={isOn(h) ? 'on' : ''} aria-current={isOn(h) ? 'page' : undefined}><Icon n={ic} /><span>{l}</span></Link>)}
      <button type="button" className={moreOn || sheet ? 'on' : ''} aria-expanded={sheet} onClick={() => setSheet(s => !s)}><Icon n="more" /><span>Mehr</span></button>
    </nav>
    {sheet && <div className="sheet-backdrop" onClick={() => setSheet(false)}><div className="sheet" role="dialog" aria-label="Weitere Seiten" onClick={e => e.stopPropagation()}>
      <div className="sheet-grip" />
      <div className="sheet-grid">{more.map(([h, l]) => <Link key={h} href={h} className={isOn(h) ? 'on' : ''} onClick={() => setSheet(false)}>{l}</Link>)}</div>
    </div></div>}
  </>);
}
