# Política de privacidad — borrador para revisión legal

**Caravana** usa datos de cuenta, vehículo, ubicación y contenido social para
proporcionar el mapa, rutas, parties, voz, eventos y récords. Este documento es
un borrador técnico y debe revisarse con la jurisdicción y la identidad legal
del operador antes de publicarse en App Store o Google Play.

## Datos que se procesan

- Cuenta: correo, nombre, usuario, avatar y ciudad.
- Garaje: marca, modelo, color, foto, consumo, mantenimiento y QR.
- Ubicación: posición GPS durante el uso del mapa, parties y tracking opcional
  en segundo plano. Las rutas locales se guardan en el dispositivo.
- Social: publicaciones, fotos, comentarios, likes, amistades, eventos y
  retos.
- Voz: audio en tiempo real mediante LiveKit cuando el usuario activa el PTT.

## Finalidad y visibilidad

- La ubicación solo se comparte con miembros de una party mientras la party
  está activa.
- Los eventos públicos, perfiles públicos y récords públicos pueden ser vistos
  por otras personas.
- La foto y datos del vehículo respetan la configuración de privacidad del
  vehículo.
- El tracking en segundo plano requiere consentimiento explícito del sistema y
  puede pausarse desde Perfil/Actividad.

## Proveedores

Supabase (cuenta y datos), LiveKit (voz), OpenStreetMap/OpenFreeMap, Photon,
OSRM/GraphHopper y proveedores de almacenamiento configurados por el operador.
Cada proveedor debe figurar con su finalidad, región y base legal en la versión
final publicada.

## Derechos y borrado

La persona puede cerrar sesión, borrar la cuenta desde **Perfil → Eliminar
cuenta**, y solicitar acceso, rectificación o eliminación adicional a través
del canal de soporte que se publique en la ficha de la app.

## Pendiente antes de publicar

- Completar identidad legal, correo de privacidad, país/región, retención y
  subencargados.
- Publicar esta política en una URL HTTPS estable y enlazarla desde la app y las
  fichas de las tiendas.
- Añadir consentimiento granular para ubicación en segundo plano, voz y récords
  públicos.
