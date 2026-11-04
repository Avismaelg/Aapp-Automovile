# Política de privacidad — borrador para revisión legal

**Caravana** usa datos de cuenta, vehículo, ubicación y contenido social para
proporcionar el mapa, rutas, parties, voz, eventos y récords. Este documento es
un borrador técnico y debe revisarse con la jurisdicción y la identidad legal
del operador antes de publicarse en App Store o Google Play.

## Datos que se procesan

- Cuenta: correo, nombre, usuario, avatar y ciudad.
- Garaje: marca, modelo, color, foto, consumo, mantenimiento y QR.
- Ubicación: posición GPS durante el uso del mapa, parties y tracking opcional
  en segundo plano, también con la app cerrada si el usuario lo permite. Las
  rutas locales se guardan en el dispositivo.
- Social: publicaciones, fotos, comentarios, likes, amistades, eventos y
  retos.
- Voz: audio en tiempo real mediante LiveKit mientras se pulsa el botón de
  hablar o con manos libres; no se graba.
- Avisos y fallos: token del dispositivo para avisos push e informes de cierres
  (modelo y versión, con el id de la cuenta; sin nombre ni correo).

## Finalidad y visibilidad

- La ubicación es privada salvo en dos casos: los miembros de la party la ven
  mientras el usuario está en ella, y sus amigos la ven solo si activa
  «compartir con amigos» (desactivado por defecto). Al desactivarlo se borra la
  última posición. Las parties se borran a las 24 horas.
- Los eventos públicos, perfiles públicos y récords públicos pueden ser vistos
  por otras personas.
- La foto y datos del vehículo respetan la configuración de privacidad del
  vehículo.
- El tracking en segundo plano requiere consentimiento explícito del sistema y
  puede pausarse desde Perfil/Actividad.

## Proveedores

Supabase (cuenta y datos), LiveKit (voz), Google Maps Platform (búsqueda y
rutas con tráfico), Mapbox, OpenStreetMap, Photon, OSRM/GraphHopper (mapas y
rutas), Google Firebase (avisos y fallos), Apple (avisos en iPhone) y
proveedores de almacenamiento configurados por el operador.
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
