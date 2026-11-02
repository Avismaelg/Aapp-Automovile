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
  updated: 'Versión 0.1 · 2 de noviembre de 2026 · Borrador pendiente de revisión legal',
  intro:
    'Caravana trata tus datos conforme a la Ley 172-13 de Protección de Datos de Carácter Personal de la República Dominicana. Aquí explicamos qué datos usamos, para qué y cómo puedes borrarlos.',
  sections: [
    {
      title: 'Datos que usamos',
      items: [
        'Cuenta: correo, nombre, @usuario, foto y ciudad.',
        'Garaje: marca, modelo, color, foto, consumo, mantenimiento y QR de cada vehículo.',
        'Ubicación: tu posición GPS mientras usas el mapa, una party o el registro automático de viajes. Los viajes se guardan en tu teléfono.',
        'Social: publicaciones, fotos, comentarios, «me gusta», amistades, eventos y retos.',
        'Voz: audio en tiempo real solo mientras mantienes pulsado el botón de hablar.',
      ],
    },
    {
      title: 'Para qué y quién lo ve',
      items: [
        'Tu ubicación solo se comparte con los miembros de una party mientras está activa; al salir o terminarla se deja de enviar.',
        'Los QR solo contienen un enlace público a tu perfil o a tu vehículo; nunca tu teléfono ni tu ubicación.',
        'Los perfiles, vehículos, eventos y récords públicos pueden verlos otras personas. Si tu perfil es privado, solo se ve una tarjeta mínima.',
        'Los retos miden la llegada respetando las normas de tránsito; nunca premian la velocidad.',
      ],
    },
    {
      title: 'Proveedores',
      items: [
        'Supabase (cuenta, datos y archivos), LiveKit (voz), OpenStreetMap, Mapbox, Photon, OSRM y GraphHopper (mapas, búsqueda y rutas).',
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
  updated: 'Version 0.1 · November 2, 2026 · Draft pending legal review',
  intro:
    "Caravana processes your data under the Dominican Republic's Personal Data Protection Law 172-13. This explains what data we use, why, and how you can delete it.",
  sections: [
    {
      title: 'Data we use',
      items: [
        'Account: email, name, @username, photo and city.',
        "Garage: each vehicle's make, model, color, photo, consumption, maintenance and QR.",
        'Location: your GPS position while you use the map, a party or automatic trip recording. Trips are saved on your phone.',
        'Social: posts, photos, comments, likes, friendships, events and challenges.',
        'Voice: real-time audio only while you hold the talk button.',
      ],
    },
    {
      title: 'Why and who sees it',
      items: [
        'Your location is only shared with the members of a party while it is active; it stops when you leave or end it.',
        'QR codes only contain a public link to your profile or vehicle; never your phone number or location.',
        'Public profiles, vehicles, events and records can be seen by others. If your profile is private, only a minimal card is shown.',
        'Challenges measure arrival while obeying traffic rules; they never reward speed.',
      ],
    },
    {
      title: 'Providers',
      items: [
        'Supabase (account, data and files), LiveKit (voice), OpenStreetMap, Mapbox, Photon, OSRM and GraphHopper (maps, search and routes).',
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
