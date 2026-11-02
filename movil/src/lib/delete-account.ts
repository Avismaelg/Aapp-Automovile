// RF-03 / UI-06: la cuenta solo se elimina si se escribe exactamente esta
// palabra (sin minúsculas ni espacios de más).
export const DELETE_CONFIRMATION = 'ELIMINAR';

export function isDeleteConfirmed(text: string) {
  return text === DELETE_CONFIRMATION;
}
