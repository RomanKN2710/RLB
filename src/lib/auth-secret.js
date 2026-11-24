/* Schlüssel für die Sitzungs-Cookies. AUTH_SECRET aus den Umgebungsvariablen; fehlt es, wird NICHT mehr ein im Quelltext
   stehender Wert benutzt, sondern einer, der sich aus einem anderen Geheimnis des Projekts ergibt (Datenbank-Zugang).
   So kann niemand mit Kenntnis des Quelltexts eine Sitzung fälschen. Läuft auch im Middleware (Edge). */
export const authSecretMissing = () => !(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16);
export function authSecret() {
  const s = process.env.AUTH_SECRET;
  const v = s && s.length >= 16 ? s : 'rlb-sitzung|' + (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.CRON_SECRET || 'nur-lokal-ohne-geheimnis');
  return new TextEncoder().encode(v);
}
