import { getLanguage } from '@/src/i18n';
import { BRAND } from '@/src/brand';

// OTR-01 / REF-06: texto de la política de privacidad que se muestra en la app
// (basado en docs/politica-privacidad-borrador.md). El texto largo va por
// idioma aquí en lugar de en el diccionario de t().

type Policy = {
  updated: string;
  intro: string;
  sections: { title: string; items: string[] }[];
};

const ES: Policy = {
  updated: 'Versión 0.2 · 4 de noviembre de 2026 · Borrador pendiente de revisión legal',
  intro:
    'Caravana trata tus datos conforme a la Ley 172-13 de Protección de Datos de Carácter Personal de la República Dominicana. Aquí explicamos qué datos usamos, para qué y cómo puedes borrarlos.',
  sections: [
    {
      title: 'Datos que usamos',
      items: [
        'Cuenta: correo, nombre, @usuario, foto y ciudad.',
        'Garaje: marca, modelo, color, foto, consumo, mantenimiento y QR de cada vehículo.',
        'Ubicación: tu posición GPS mientras usas el mapa, una party o el registro automático de viajes, también con la app en segundo plano o cerrada si lo permites. Los viajes se guardan en tu teléfono.',
        'Social: publicaciones, fotos, comentarios, «me gusta», amistades, eventos y retos.',
        'Voz: audio en tiempo real solo mientras mantienes pulsado el botón de hablar o tienes activado el modo manos libres. No se graba.',
        'Avisos y fallos: un identificador del teléfono para enviarte avisos (invitaciones, retos, solicitudes de amistad) y los informes de cierres de la app, con el modelo del teléfono y la versión, sin tu nombre ni tu correo.',
      ],
    },
    {
      title: 'Para qué y quién lo ve',
      items: [
        'Tu ubicación es privada salvo en dos casos: los miembros de tu party la ven mientras estás en ella, y tus amigos la ven en su mapa solo si activas «compartir con amigos» (desactivado por defecto). Al desactivarlo (el ojo del mapa o Perfil) se borra tu última posición. Las parties se borran a las 24 horas.',
        'Los QR solo contienen un enlace público a tu perfil o a tu vehículo; nunca tu teléfono ni tu ubicación.',
        'Los perfiles, vehículos, eventos y récords públicos pueden verlos otras personas. Si tu perfil es privado, solo se ve una tarjeta mínima.',
        'Los retos miden la llegada respetando las normas de tránsito; nunca premian la velocidad.',
      ],
    },
    {
      title: 'Proveedores',
      items: [
        'Supabase (cuenta, datos y archivos), LiveKit (voz), Google Maps Platform (búsqueda de lugares y rutas con tráfico), Mapbox, OpenStreetMap, Photon, OSRM y GraphHopper (mapas y rutas), Google Firebase (avisos e informes de fallos) y Apple (avisos en iPhone).',
      ],
    },
    {
      title: 'Tus derechos',
      items: [
        'Puedes acceder a tus datos, corregirlos y cambiar la privacidad desde Perfil.',
        'Puedes eliminar tu cuenta y todos tus datos y archivos de forma definitiva desde Perfil › Eliminar cuenta.',
        `Para cualquier otra solicitud escribe a ${BRAND.supportEmail}.`,
      ],
    },
  ],
};

const EN: Policy = {
  updated: 'Version 0.2 · November 4, 2026 · Draft pending legal review',
  intro:
    "Caravana processes your data under the Dominican Republic's Personal Data Protection Law 172-13. This explains what data we use, why, and how you can delete it.",
  sections: [
    {
      title: 'Data we use',
      items: [
        'Account: email, name, @username, photo and city.',
        "Garage: each vehicle's make, model, color, photo, consumption, maintenance and QR.",
        'Location: your GPS position while you use the map, a party or automatic trip recording, also with the app in the background or closed if you allow it. Trips are saved on your phone.',
        'Social: posts, photos, comments, likes, friendships, events and challenges.',
        'Voice: real-time audio only while you hold the talk button or have hands-free mode on. It is not recorded.',
        'Alerts and crashes: a device identifier to send you alerts (invites, challenges, friend requests) and app crash reports with the phone model and version, without your name or email.',
      ],
    },
    {
      title: 'Why and who sees it',
      items: [
        'Your location is private except in two cases: your party members see it while you are in the party, and your friends see it on their map only if you turn on "share with friends" (off by default). Turning it off (the eye on the map or Profile) deletes your last position. Parties are deleted after 24 hours.',
        'QR codes only contain a public link to your profile or vehicle; never your phone number or location.',
        'Public profiles, vehicles, events and records can be seen by others. If your profile is private, only a minimal card is shown.',
        'Challenges measure arrival while obeying traffic rules; they never reward speed.',
      ],
    },
    {
      title: 'Providers',
      items: [
        'Supabase (account, data and files), LiveKit (voice), Google Maps Platform (place search and traffic-aware routes), Mapbox, OpenStreetMap, Photon, OSRM and GraphHopper (maps and routes), Google Firebase (alerts and crash reports) and Apple (alerts on iPhone).',
      ],
    },
    {
      title: 'Your rights',
      items: [
        'You can access and correct your data and change your privacy from Profile.',
        'You can permanently delete your account and all your data and files from Profile › Delete account.',
        `For any other request write to ${BRAND.supportEmail}.`,
      ],
    },
  ],
};

export function privacyPolicy(): Policy {
  return getLanguage() === 'es' ? ES : EN;
}
