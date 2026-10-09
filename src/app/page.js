import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import * as D from '@/lib/data';
import { CATS } from '@/lib/rules';
import { fmtDt, fmtRp, Info } from '@/components/ui';
import Countdown from '@/components/Countdown';
import { one } from '@/lib/db';
import Rennen from '@/components/Rennen';
import Auszeichnungen from '@/components/Auszeichnungen';
import { roundAwards } from '@/lib/auszeichnungen';
import * as HOF from '@/lib/halloffame';

export const maxDuration = 60;
export default async function Tabelle({ searchParams }) {
  const u = await requireUser();
  const all = await D.rounds();
  const played = all.filter(r => r.deadline && new Date(r.deadline) < new Date());
  if (!played.length) return <div className="card"><h2>Noch keine gewertete Runde</h2><p className="mini">Die Tabelle erscheint, sobald die erste Deadline vorbei ist.</p></div>;
  const want = Number(searchParams?.r); const sel = played.some(r => r.number === want) ? want : played[played.length - 1].number;
  const sd = await D.season(sel);
  const cur = sd.upto[sd.upto.length - 1]; const curData = sd.datas[sd.datas.length - 1];
  const prev = sd.history.length > 1 ? sd.history[sd.history.length - 2].table : null;
  const prevRank = {}; if (prev) prev.forEach(r => prevRank[r.manager_id] = r.rank);
  const name = id => sd.base.managerName[id];
  const awards = roundAwards(sd, sd.upto.length - 1);
  // Amtierender Meister (letzte Saison der Hall of Fame) bekommt eine Krone
  let champs = new Set(), champSeason = ''; try { const H = await HOF.all(); const last = H.chrono[H.chrono.length - 1]; if (last) { champs = new Set(last.champions); champSeason = last.season; } } catch (e) { /* ohne Hall of Fame keine Krone */ }
  const crown = id => champs.has(name(id)) ? <span className="crown" title={`Amtierender Meister ${champSeason}`}>👑</span> : null;
  // Mein Stand: eigener Rang, Abstand, offene Runde mit Aufstellungs- und Gebotsstatus
  const me = u.manager_id; const mine = me ? sd.table.find(r => r.manager_id === me) : null; const leader = sd.table[0]; const second = sd.table[1];
  const open = await D.openRound(); const myLu = open && me ? await one('select updated_at, updated_by from lineups where round_id=$1 and manager_id=$2', [open.id, me]) : null;
  const myBid = open && me ? await one("select player_name, price from bids where round_id=$1 and manager_id=$2 and status='sealed'", [open.id, me]) : null;
  const myDelta = mine && prev ? prevRank[me] - mine.rank : 0;
  const rt = curData.totals; const rr = sd.base.managerIds.map(m => ({ m, t: rt[m] })).sort((a, b) => b.t.punkte - a.t.punkte);
  return (<>
    {mine && <div className="card mystand">
      <div><div className="eyebrow">Mein Stand</div><div className="big">{mine.rank}.<small>/{sd.table.length}</small></div></div>
      <div className="facts">
        <span><b>{fmtRp(mine.total)}</b> Rangpunkte{myDelta > 0 && <span className="delta up"> ▲{myDelta}</span>}{myDelta < 0 && <span className="delta down"> ▼{-myDelta}</span>}</span>
        <span>{mine.rank === 1 ? <>Vorsprung <b>{fmtRp(mine.total - (second?.total ?? mine.total))}</b> auf {name(second?.manager_id)}</> : <>Rückstand <b>{fmtRp(leader.total - mine.total)}</b> auf {name(leader.manager_id)}</>}</span>
        {open && <span>{open.label}: <Countdown to={open.deadline} /></span>}
        {open && <span>Aufstellung: <b>{myLu ? 'gespeichert' : 'Vorrunde gilt'}</b> · Gebot: <b>{myBid ? `${myBid.player_name} (${Number(myBid.price)})` : 'keins'}</b></span>}
      </div>
      {open && <div className="cta"><Link className="btn" href="/aufstellung">Aufstellung →</Link><Link className="btn sec" href="/markt">Transfermarkt</Link></div>}
    </div>}
    <div className="card"><div className="row between"><div><div className="eyebrow">Das Rennen</div><h2>Wer holt den Titel?</h2></div><Link className="btn sec sm" href="/prognose">Saisonprognose →</Link></div>
      <Rennen history={sd.history.map(h => ({ label: h.round.label.replace('Spieltag ', 'ST '), table: h.table }))} names={sd.base.managerName} me={u.manager_id} /></div>
    <div className="card"><div className="eyebrow">{cur.label}</div><h2>Auszeichnungen des Spieltags</h2><Auszeichnungen awards={awards} me={u.manager_id} /><Info label="Wie werden die Titel vergeben?">Mindestens fünf Titel pro Runde: zuerst die Leistungen, die klar aus dem Feld herausragen, dann die besten der übrigen. Saisonzähler in der <Link href="/hall-of-fame">Hall of Fame</Link>.</Info></div>
    <div className="card">
      <div className="row between"><div><div className="eyebrow">Rangliste</div><h2>Stand nach {cur.label} {cur.status === 'final' ? <span className="pill ok">final</span> : <span className="pill open">vorläufig</span>}</h2></div>
        <form className="row"><label className="small">Stand nach <select name="r" defaultValue={sel}>{played.map(r => <option key={r.id} value={r.number}>{r.label}{r.status !== 'final' ? ' (vorläufig)' : ''}</option>)}</select></label><button className="sec sm">Anzeigen</button></form></div>
      <div className="rlist mob-only">{sd.table.map(r => { const d = prev ? prevRank[r.manager_id] - r.rank : 0; const best = [...CATS].sort((a, z) => r.rp[z[0]] - r.rp[a[0]])[0]; return (
        <details key={r.manager_id} className={r.manager_id === u.manager_id ? 'me' : ''}><summary><span className="rk">{r.rank}{d > 0 && <span className="delta up">▲{d}</span>}{d < 0 && <span className="delta down">▼{-d}</span>}</span>
          <span><span className="nm">{name(r.manager_id)}</span>{crown(r.manager_id)}<div className="sub">stark in {best[1]} · {fmtRp(r.rp[best[0]])} RP</div></span><span className="tt">{fmtRp(r.total)}<small>RP</small></span></summary>
          <div className="cats">{CATS.map(([c, l]) => <div key={c}>{l}<b>{r.tot[c]}</b>{fmtRp(r.rp[c])} RP</div>)}</div></details>); })}</div>
      <div className="tbl desk-only"><table>
        <thead><tr><th>#</th><th className="l">Manager</th><th>Total</th>{CATS.map(([c, l]) => <th key={c}>{l}</th>)}</tr></thead>
        <tbody>{sd.table.map(r => { const d = prev ? prevRank[r.manager_id] - r.rank : 0; return (
          <tr key={r.manager_id} className={r.manager_id === u.manager_id ? 'me' : ''}><td>{r.rank} {d > 0 && <span className="delta up">▲{d}</span>}{d < 0 && <span className="delta down">▼{-d}</span>}</td><td className="l"><b>{name(r.manager_id)}</b>{crown(r.manager_id)}</td>
            <td><b className="disp" style={{ fontSize: 18 }}>{fmtRp(r.total)}</b></td>{CATS.map(([c]) => <td key={c}>{r.tot[c]}<div className="rp">{fmtRp(r.rp[c])} RP</div></td>)}</tr>); })}</tbody>
      </table></div>
      <Info label="Wie wird gerechnet?">Werte = Saisonsumme · RP = Rangpunkte pro Kategorie (Teilrangpunkte bei Gleichstand, Karten: weniger ist besser, Ziff. 8). Auf dem Handy eine Zeile antippen, um alle Kategorien zu sehen.</Info>
    </div>
    <div className="grid2">
      <div className="card"><div className="eyebrow">{cur.label}</div><h2>Tageswerte</h2>
        <div className="tbl"><table><thead><tr><th className="l">Manager</th>{CATS.map(([c, l]) => <th key={c}>{l}</th>)}</tr></thead><tbody>{rr.map(r => <tr key={r.m} className={r.m === u.manager_id ? 'me' : ''}><td className="l">{name(r.m)}{crown(r.m)}</td>{CATS.map(([c]) => <td key={c}>{r.t[c]}</td>)}</tr>)}</tbody></table></div>
        <div className="kv" style={{ marginTop: 10 }}><b>Deadline</b><span>{fmtDt(cur.deadline)}</span><b>Spiele</b><span>{curData.matches.filter(m => m.finished).length}/{curData.matches.length} beendet</span><b>Team der Runde</b><span>{(cur.tdr || []).join(', ') || '–'}</span><b>Spieler des Tages</b><span>{cur.sdt || '–'}</span>
          {curData.corrections.length > 0 && <><b>Korrekturen</b><span>{curData.corrections.map(k => <div key={k.id}>{name(k.manager_id)}: {k.text}</div>)}</span></>}</div>
        <p className="mini"><Link href={`/runde/${cur.id}`}>Details: Spiele, Aufstellungen, Gebote →</Link></p>
      </div>
    </div>
  </>);
}
