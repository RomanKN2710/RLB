'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
const ITEMS = [['/', 'Tabelle'], ['/aufstellung', 'Aufstellung'], ['/markt', 'Transfermarkt'], ['/kader', 'Kader & Trades'], ['/statistik', 'Statistik'], ['/potential', 'Potential'], ['/prognose', 'Prognose'], ['/bericht', 'Bericht'], ['/abrechnung', 'Abrechnung'], ['/archiv', 'Archiv'], ['/hall-of-fame', 'Hall of Fame'], ['/regeln', 'Regeln'], ['/konto', 'Konto']];
/** Hauptnavigation; markiert die aktive Seite und scrollt sie auf dem Handy ins Bild. */
export default function Nav({ admin }) {
  const path = usePathname() || '/'; const ref = useRef(null);
  const items = admin ? [...ITEMS, ['/admin', 'Admin']] : ITEMS;
  const isOn = h => h === '/' ? path === '/' : path === h || path.startsWith(h + '/') || (h === '/' && path.startsWith('/runde'));
  useEffect(() => { const el = ref.current?.querySelector('a.on'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [path]);
  return <nav ref={ref}>{items.map(([h, l]) => <Link key={h} href={h} className={isOn(h) ? 'on' : ''} aria-current={isOn(h) ? 'page' : undefined}>{l}</Link>)}</nav>;
}
