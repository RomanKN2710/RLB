import Link from 'next/link';
export default function NotFound() {
  return <div className="card"><div className="eyebrow">404</div><h2>Seite nicht gefunden</h2><p className="mini">Diese Seite gibt es nicht (mehr).</p><p><Link href="/">Zur Tabelle →</Link></p></div>;
}
