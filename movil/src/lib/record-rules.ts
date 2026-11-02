// R-06 / OTR-02 (D-05): solo cuentan las pasadas que respetan el límite del
// tramo; así la clasificación nunca premia ir más rápido de lo permitido.
export function countsAsRecord(maxSpeedKmh: number | null, limitKmh: number | null | undefined): maxSpeedKmh is number {
  if (maxSpeedKmh == null) return false;
  if (limitKmh == null || !(limitKmh > 0)) return false;
  return maxSpeedKmh <= limitKmh;
}
