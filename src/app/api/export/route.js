import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { getUser } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* Vollstaendiger Datenabzug als JSON (Admin-Sitzung oder ?key=CRON_SECRET). Zum Pruefen des Spielstands
   ausserhalb der App: Kader, Runden, Aufstellungen, Resultate, Gebote, Transfers, Buchungen. Ohne Passwoerter. */
export async function GET(req) {
  const u = await getUser(); const key = new URL(req.url).searchParams.get('key');
  if (!(u && u.role === 'admin') && !(process.env.CRON_SECRET && key === process.env.CRON_SECRET)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const out = { exportiert: new Date().toISOString(), von: u ? u.email : 'cron' };
  const tables = ['managers', 'clubs', 'players', 'rounds', 'matches', 'lineups', 'results', 'corrections', 'bids', 'trades', 'ledger', 'transfers', 'finance', 'settings', 'squad_log'];
  for (const t of tables) { try { out[t] = await q(`select * from ${t}`); } catch (e) { out[t] = { fehler: e.message }; } }
  out.users = await q('select id, email, name, role, manager_id, must_change_pw, created_at from users');
  out.bl_players = await q('select slug, name, club, pos, squad_pos, played_pos, games, last_matchday from bl_players');
  out.audit = await q('select * from audit order by id desc limit 500');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  return new NextResponse(JSON.stringify(out, null, 1), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="rlb-export-${stamp}.json"` } });
}
