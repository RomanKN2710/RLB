/* Saisonweite Prüfung der Grundregeln, unabhängig von einer einzelnen Runde:
   Kaufbudget nicht negativ, 22 aktive Spieler je Manager, kein Spieler in zwei Kadern, keine fremden Spieler in offenen Aufstellungen. */
import { q } from './db';
import * as R from './rules';

export async function integrityCheck(b, D) {
  const out = [];
  const budgets = await D.budgetsAll(b.managerIds);
  for (const m of b.managers) if (budgets[m.id] < 0) out.push(`${m.name}: Kaufbudget ${budgets[m.id]} (negativ, Ziff. 7.4)`);
  const aktive = b.playersArr.filter(p => p.status === 'active');
  for (const m of b.managers) { const n = aktive.filter(p => p.manager_id === m.id).length; if (n > R.KADER_SIZE) out.push(`${m.name}: ${n} aktive Spieler statt ${R.KADER_SIZE} (Ziff. 7.1)`); else if (n < R.KADER_SIZE) out.push(`Hinweis: ${m.name} hat ${n} aktive Spieler (nach einem Abgang zulässig, bis nachgekauft ist)`); }
  // derselbe Spieler in zwei Kadern: gleiche kicker-Kennung, sonst gleicher Name im selben Verein
  const seen = {}; for (const p of aktive) { const key = p.kicker_slug ? 'k:' + p.kicker_slug : 'n:' + R.norm(p.name) + '|' + R.norm(p.club || ''); (seen[key] ||= []).push(p); }
  for (const list of Object.values(seen)) { const mgr = [...new Set(list.map(p => p.manager_id))]; if (mgr.length > 1) out.push(`${list[0].name} (${list[0].club}) steht in zwei Kadern: ${mgr.map(id => b.managerName[id]).join(' und ')}`); }
  // offene Runden: Aufstellung mit Spielern, die dem Manager nicht (mehr) gehören
  const lus = await q("select l.manager_id, l.entries, r.label from lineups l join rounds r on r.id=l.round_id where r.status<>'final'");
  for (const l of lus) { const fremd = Object.keys(l.entries || {}).filter(pid => { const p = b.players[pid]; return !p || p.manager_id !== l.manager_id || p.status !== 'active'; });
    if (fremd.length) out.push(`${b.managerName[l.manager_id]}, ${l.label}: ${fremd.map(pid => b.players[pid]?.name || pid).join(', ')} in der Aufstellung, aber nicht (mehr) im Kader`); }
  return out;
}
