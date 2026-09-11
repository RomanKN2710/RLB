import { NextResponse } from 'next/server';
import { q, one, getSetting, schemaReady, dbHint } from '@/lib/db';
import { base, openRound, pendingRounds, lastFinalRound } from '@/lib/data';
import { rlbLeavers } from '@/lib/squads';
import { playerMatches } from '@/lib/kicker';
import { norm } from '@/lib/rules';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Neon-Kaltstart einrechnen

const age = at => at ? Math.round((Date.now() - new Date(at).getTime()) / 60000) : null;

/** Kurzbericht für die tägliche Prüfung: /api/status?key=CRON_SECRET */
export async function GET(req) {
  const key = new URL(req.url).searchParams.get('key'); const auth = req.headers.get('authorization') || '';
  if (!process.env.CRON_SECRET || (key !== process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const out = { at: new Date().toISOString(), warnungen: [] };
  if (!await schemaReady()) return NextResponse.json({ ...out, ok: false, schema: false, warnungen: ['Die Datenbank ist noch nicht eingerichtet – /api/setup?key=CRON_SECRET aufrufen'] });
  out.schema = true;
  try {
    const [lastSync, lastCur, squads] = [await getSetting('last_sync'), await getSetting('last_sync_current'), await getSetting('squads_sync')];
    out.sync = {
      spielplan: lastSync ? { at: lastSync.at, minuten_her: age(lastSync.at), spiele: lastSync.matches } : null,
      aktueller_spieltag: lastCur ? { at: lastCur.at, minuten_her: age(lastCur.at), spiele: lastCur.matches } : null,
      kicker_kader: squads ? { at: squads.at, minuten_her: age(squads.at), quelle: squads.source, vereine: squads.clubs, spieler: squads.players, aenderungen: squads.changes } : null,
    };
    if (!squads) out.warnungen.push('Noch kein kicker-Kaderimport gelaufen');
    else if (age(squads.at) > 60 * 36) out.warnungen.push(`kicker-Kaderimport ist ${Math.round(age(squads.at) / 60)} h alt`);
    if (!lastSync) out.warnungen.push('Noch kein Spielplan-Sync gelaufen');

    const b = await base();
    const offen = await openRound();
    out.naechste_deadline = offen ? { runde: offen.label, nummer: offen.number, deadline: offen.deadline, stunden_bis: Math.round((new Date(offen.deadline).getTime() - Date.now()) / 36e5) } : null;
    if (!offen) out.warnungen.push('Keine offene Runde mit Deadline in der Zukunft');

    if (offen) {
      const hat = new Set((await q('select manager_id from lineups where round_id=$1', [offen.id])).map(r => r.manager_id));
      out.aufstellungen_fehlen = b.managers.filter(m => !hat.has(m.id)).map(m => m.name);
    }

    const pend = await pendingRounds();
    out.resultate_offen = pend.map(r => ({ runde: r.label, nummer: r.number, deadline: r.deadline }));
    if (pend.length) out.warnungen.push(`${pend.length} Runde(n) mit abgelaufener Deadline noch nicht abgeschlossen`);

    const letzte = await lastFinalRound();
    out.letzte_gewertete_runde = letzte ? { runde: letzte.label, nummer: letzte.number } : null;

    const leavers = await rlbLeavers(b);
    out.offene_abgaenge = leavers.map(l => ({ spieler: l.player.name, verein: l.player.club, manager: b.managerName[l.player.manager_id], seit: l.since }));
    if (leavers.length) out.warnungen.push(`${leavers.length} offene(r) Abgang/Abgänge zu buchen`);

    // Kaderspieler, zu denen es im kicker-Pool keinen Eintrag gibt. Meist ein Tippfehler im
    // Namen – und der ist teuer: der Spieler taucht dann im Transfermarkt als frei auf,
    // obwohl er jemandem gehört.
    const bl = await q('select slug, name, club from bl_players where in_squad');
    const aktive = b.playersArr.filter(p => p.status === 'active');
    out.kader_ohne_kicker = aktive
      .filter(p => !bl.some(x => playerMatches(x.slug, x.name, p.name) || norm(x.name) === norm(p.name)))
      .map(p => ({ spieler: p.name, verein: p.club, manager: b.managerName[p.manager_id] }));
    if (out.kader_ohne_kicker.length) out.warnungen.push(`${out.kader_ohne_kicker.length} Kaderspieler ohne kicker-Zuordnung (Schreibweise prüfen – sie erscheinen sonst als frei im Transfermarkt)`);

    const geboteOffen = await one("select count(*)::int as n from bids where status='sealed'");
    out.gebote_versiegelt = geboteOffen.n;
    out.spielerpool = (await one('select count(*)::int as n from bl_players where in_squad')).n;
    out.ok = out.warnungen.length === 0;
    return NextResponse.json(out);
  } catch (e) { return NextResponse.json({ ...out, ok: false, error: dbHint(e) }, { status: 500 }); }
}
