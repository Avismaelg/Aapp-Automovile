import { describe, expect, it } from '@jest/globals';

import { sharesWithFriends } from '@/src/lib/party-invites';
import { privacyPolicy } from '@/src/lib/privacy-policy';

// P1-1 (docs/AUDITORIA-PRODUCCION.md): compartir con amigos es un
// consentimiento propio y está desactivado por defecto.
describe('consentimiento de ubicación con amigos', () => {
  it('sin respuesta o con «no» no se comparte; solo con un «sí» explícito', () => {
    expect(sharesWithFriends(null)).toBe(false);
    expect(sharesWithFriends(undefined)).toBe(false);
    expect(sharesWithFriends(false)).toBe(false);
    expect(sharesWithFriends(true)).toBe(true);
  });

  it('la política de privacidad dice lo mismo que el código', () => {
    const text = privacyPolicy()
      .sections.flatMap((section) => section.items)
      .join(' ');
    expect(text).toMatch(/desactivado por defecto|off by default/);
    expect(text).toMatch(/24 horas|24 hours/);
  });
});
