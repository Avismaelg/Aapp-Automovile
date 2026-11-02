// RNF-20: la marca en un único archivo. Cambiar el nombre, los colores o los
// enlaces aquí cambia la app entera (tema, logotipos, QR, enlaces y PDF).
// El icono y la pantalla de inicio nativos se generan desde assets/ con
// `npm run icons`; el nombre de la tienda y el esquema viven en app.json.

export const BRAND = {
  name: 'Caravana',
  wordmark: 'CARAVANA',
  scheme: 'caravana',
  colors: {
    // Naranja de acento sobre negro OLED (noche) y su versión de día.
    accent: '#FF6A33',
    accentDay: '#C2410C',
    background: '#000000',
  },
  webUrl: 'https://caravana.app',
  inviteUrl: 'https://avismaelg.github.io/Aapp-Automovile',
  supportEmail: 'avismael.eg@gmail.com',
} as const;
