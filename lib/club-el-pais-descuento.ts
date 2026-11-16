const UY_TZ_OFFSET_HOURS = -3;

// Día del Club: Club El País da 30% (el 10% extra lo reintegra Itaú, no se descuenta en la tienda).
const DIA_DEL_CLUB = { desde: "2026-11-19", hasta: "2026-11-20", porcentaje: 30 };

const DIAS_REGULARES = [1, 2, 3]; // lunes, martes, miércoles (0=domingo)
const PORCENTAJE_REGULAR = 20;

/** Porcentaje de descuento vigente hoy en Uruguay, o null si hoy no hay descuento. */
export function porcentajeDescuentoVigenteUY(ahora: number = Date.now()): number | null {
  const ahoraUY = new Date(ahora + UY_TZ_OFFSET_HOURS * 60 * 60 * 1000);
  const fecha = ahoraUY.toISOString().slice(0, 10);

  if (fecha >= DIA_DEL_CLUB.desde && fecha <= DIA_DEL_CLUB.hasta) return DIA_DEL_CLUB.porcentaje;
  if (DIAS_REGULARES.includes(ahoraUY.getUTCDay())) return PORCENTAJE_REGULAR;
  return null;
}
