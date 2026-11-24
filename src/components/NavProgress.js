'use client';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/* Ladebalken oben beim Seitenwechsel. Bewusst kein «loading.js»: das liesse die Seite nach jeder Aktion neu aufbauen,
   und Meldungen wie «gespeichert» sowie aufgeklappte Karten gingen verloren. Der Balken zeigt nur, dass der Tipp
   angekommen ist, bis der Server geantwortet hat. */
export default function NavProgress() {
  const path = usePathname(); const search = useSearchParams(); const [on, setOn] = useState(false);
  useEffect(() => { setOn(false); }, [path, search]);
  useEffect(() => {
    const click = e => { const a = e.target.closest && e.target.closest('a[href]'); if (!a || a.target === '_blank' || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey || e.defaultPrevented) return;
      let u; try { u = new URL(a.href, location.href); } catch { return; }
      if (u.origin !== location.origin || u.pathname.startsWith('/api/') || (u.pathname === location.pathname && u.search === location.search)) return;
      setOn(true); };
    document.addEventListener('click', click); return () => document.removeEventListener('click', click);
  }, []);
  // Sicherheitsnetz: nach 20 s ausblenden, falls der Seitenwechsel nicht zustande kam
  useEffect(() => { if (!on) return; const t = setTimeout(() => setOn(false), 20000); return () => clearTimeout(t); }, [on]);
  return on ? <div className="navprogress" role="progressbar" aria-label="Seite wird geladen" /> : null;
}
