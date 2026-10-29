// Datos del vehículo propio (color y tipo). Solo declara funciones, que usan
// el estado de MAP_SCRIPT_CORE por estar en la misma IIFE.
export const MAP_VEHICLE_SCRIPT = `  function normalizeColor(value) {
    var color = typeof value === 'string' ? value.trim() : '';
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    if (/^#[0-9a-f]{3}$/i.test(color)) {
      return '#' + color.charAt(1) + color.charAt(1) + color.charAt(2) + color.charAt(2) + color.charAt(3) + color.charAt(3);
    }
    if (/^[0-9a-f]{6}$/i.test(color)) return '#' + color;
    return '#ff5a1f';
  }

  function normalizeKind(value) {
    var kinds = ['car', 'motorcycle', 'ev', 'truck'];
    return kinds.indexOf(value) >= 0 ? value : 'car';
  }

  function setVehicleInput(input) {
    state.vehicleColor = normalizeColor(input && input.color);
    state.vehicleKind = normalizeKind(input && input.kind);
    if (vehicleMarker) vehicleMarker.getElement().style.setProperty('--car-color', state.vehicleColor);
  }
`;
