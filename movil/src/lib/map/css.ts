// Estilos del documento del mapa (marcadores, HUD interno y capas).
export const MAP_CSS = `  * { box-sizing: border-box; }
  html, body { height: 100%; width: 100%; margin: 0; overflow: hidden; background: #e9edf1; }
  body[data-theme='night'] { background: #0b0f14; }
  body[data-theme='night'] .member-name { color: #e8edf4; background: rgba(6,8,11,0.8); border-color: rgba(255,255,255,0.14); }
  #map { position: fixed; inset: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
  .vehicle, .dest { pointer-events: none; }
  .member { pointer-events: auto; cursor: pointer; }
  .vehicle { --car-color: #ff5a1f; position: relative; width: 64px; height: 64px; transition: opacity 0.3s ease; }
  .vehicle-halo {
    position: absolute; left: 14px; top: 14px; width: 36px; height: 36px; border-radius: 50%;
    background: var(--car-color); animation: halo 2s ease-out infinite;
  }
  .vehicle-arrow { position: absolute; left: 0; top: 0; width: 64px; height: 64px; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35)); }
  .vehicle-arrow path { fill: var(--car-color); stroke: #ffffff; stroke-width: 4; stroke-linejoin: round; }
  .parking { pointer-events: none; display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .parking-badge {
    width: 38px; height: 38px; border-radius: 50%; background: #4de1ff;
    border: 2px solid #06080b; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 14px rgba(0,0,0,0.5);
  }
  .parking-badge svg { width: 21px; height: 21px; fill: none; stroke: #06131a; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .parking-label {
    white-space: nowrap; background: #06131a; color: #4de1ff; font-size: 9px; font-weight: 800;
    padding: 2px 6px; border-radius: 5px; border: 1px solid rgba(77,225,255,0.5);
  }
  .person { pointer-events: none; position: relative; width: 54px; height: 54px; }
  .person-halo {
    position: absolute; left: 9px; top: 9px; width: 36px; height: 36px; border-radius: 50%;
    background: rgba(77,225,255,0.4); animation: halo 2s ease-out infinite;
  }
  .person-badge {
    position: absolute; left: 12px; top: 12px; width: 30px; height: 30px; border-radius: 50%;
    background: #4de1ff; border: 2px solid #06080b; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }
  .person-badge svg { width: 18px; height: 18px; fill: none; stroke: #06131a; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .member { position: relative; width: 44px; height: 44px; }
  .member-dot {
    position: absolute; left: 3px; top: 3px; width: 38px; height: 38px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #071016; font-weight: 800; font-size: 11px; letter-spacing: -0.3px;
    border: 2px solid rgba(6,8,11,0.9); box-shadow: 0 4px 14px rgba(0,0,0,0.5);
  }
  .member.talking .member-dot { animation: talk 1.4s ease-out infinite; }
  .member-name {
    position: absolute; top: 44px; left: 50%; transform: translateX(-50%); white-space: nowrap;
    color: #1b2430; font-size: 9px; font-weight: 700;
    background: rgba(255,255,255,0.92); border: 1px solid rgba(20,30,45,0.15);
    padding: 2px 5px; border-radius: 5px;
  }
  .dest { position: relative; width: 44px; height: 44px; }
  .dest-icon {
    position: absolute; left: 5px; top: 5px; width: 34px; height: 34px; border-radius: 11px;
    background: #c9ff4d; border: 2px solid #06080b;
    display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.5);
  }
  .dest-icon svg { width: 18px; height: 18px; fill: none; stroke: #101603; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  .dest-label {
    position: absolute; top: 42px; left: 50%; transform: translateX(-50%); white-space: nowrap;
    max-width: 160px; overflow: hidden; text-overflow: ellipsis;
    color: #101603; background: #c9ff4d; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 5px;
  }
  @keyframes halo {
    0% { transform: scale(0.8); opacity: 0.45; }
    100% { transform: scale(2.4); opacity: 0; }
  }
  @keyframes talk {
    0% { box-shadow: 0 0 0 0 rgba(255,90,31,0.55); }
    100% { box-shadow: 0 0 0 14px rgba(255,90,31,0); }
  }`;
