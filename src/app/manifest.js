/* Damit sich die App auf dem Handy wie eine App auf den Startbildschirm legen lässt (Name, Symbol, Farbe, ohne Browserleiste). */
export default function manifest() {
  return {
    name: 'RLB Managerspiel', short_name: 'RLB', description: 'Rotissery League Bundesliga', lang: 'de-CH',
    start_url: '/', scope: '/', display: 'standalone', background_color: '#F2F4F0', theme_color: '#1E6B3B',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
