/**
 * Fetch con límite de tiempo y cancelación cooperativa.
 *
 * Las APIs públicas que usa la app pueden tardar indefinidamente cuando el
 * teléfono cambia de red. Un timeout evita dejar spinners o estados de ruta
 * bloqueados y mantiene el AbortController del llamador funcionando.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();

  if (init.signal?.aborted) controller.abort();
  else init.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', onAbort);
  }
}
