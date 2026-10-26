# GraphHopper para Caravana

Servidor de rutas por carretera, open source, para sustituir la línea recta del
mapa por una ruta real.

## 1. Levantar el motor

Requisitos: Docker Desktop y ~4 GB de RAM libres.

```bash
cd infra/graphhopper

# Extracto de Haití + República Dominicana (~89 MB)
curl -L -o data/region.osm.pbf \
  https://download.geofabrik.de/central-america/haiti-and-domrep-latest.osm.pbf

docker compose up --build
```

El primer arranque importa el mapa y puede tardar varios minutos. Cuando el log
muestre `Server - Started`, comprueba:

```bash
curl http://localhost:8989/health
```

Prueba una ruta Santo Domingo → Constanza:

```bash
curl "http://localhost:8989/route?point=18.4861,-69.9312&point=18.9095,-70.743&profile=car&points_encoded=false"
```

## 2. Conectar la app

En `movil/.env`:

```env
# Servidor local
EXPO_PUBLIC_GRAPHHOPPER_URL=http://localhost:8989
EXPO_PUBLIC_GRAPHHOPPER_PROFILE=car
```

Dependiendo del dispositivo:

| Dispositivo | URL |
|---|---|
| Web / iOS Simulator | `http://localhost:8989` |
| Android Emulator | `http://10.0.2.2:8989` |
| Teléfono físico | `http://IP_DE_TU_PC:8989` en la misma red |

Si usas un teléfono físico, abre el puerto 8989 en el firewall.

> Para producción no uses HTTP local. Pon GraphHopper detrás de HTTPS (Caddy,
> Nginx o un túnel) o usa la API cloud de GraphHopper.

## 3. API cloud

Alternativa sin servidor:

```env
EXPO_PUBLIC_GRAPHHOPPER_API_KEY=tu_api_key
# No definas EXPO_PUBLIC_GRAPHHOPPER_URL
```

La key se incluye en el bundle de Expo. Para producción conviene proxyficarla en
una Edge Function y no exponerla.

## 4. Cómo funciona en la app

- `src/lib/graphhopper.ts` construye la petición `/route` y convierte las
  coordenadas `[lng, lat]` de GraphHopper a `[lat, lng]`.
- `src/hooks/useGraphHopperRoute.ts` recalcula cuando:
  - cambia el destino;
  - el usuario se mueve más de 250 m;
  - pasan más de 2 minutos.
- El mapa recibe la ruta por `postMessage` y dibuja una línea por carretera con
  casing oscuro.
- Si GraphHopper no está configurado o falla, se usa una línea directa y se
  avisa en Party.

## 5. Perfiles

El `config-example.yml` de GraphHopper 11.1 incluye el perfil `car`. Para moto,
camión o EV habría que añadir perfiles personalizados en una copia propia de
`config.yml` y reiniciar el import.

## 6. Notas

- El extracto completo de Haití + RD se importa en memoria; ajusta `JAVA_OPTS`
  según tu equipo.
- El directorio `data/` está ignorado por Git.
- Para actualizar el mapa, reemplaza el `.pbf` y borra `data/graph-cache/`.
- La app no necesita GraphHopper para arrancar: el fallback funciona sin motor.
