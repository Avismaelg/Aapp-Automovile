import { describe, expect, it } from '@jest/globals';

import { sharesWithFriends } from '@/src/lib/party-invites';
import { privacyPolicy } from '@/src/lib/privacy-policy';

// Compartir con amigos: activado por defecto (decisión de producto del
// 2026-11-04); un «no» explícito o el modo fantasma lo apagan.
describe('consentimiento de ubicación con amigos', () => {
  it('se comparte salvo un «no» explícito', () => {
    expect(sharesWithFriends(null)).toBe(true);
    expect(sharesWithFriends(undefined)).toBe(true);
    expect(sharesWithFriends(true)).toBe(true);
    expect(sharesWithFriends(false)).toBe(false);
  });

  it('la política de privacidad dice lo mismo que el código', () => {
    const text = privacyPolicy()
      .sections.flatMap((section) => section.items)
      .join(' ');
    expect(text).toMatch(/lo está por defecto|it is on by default/);
    expect(text).toMatch(/24 horas|24 hours/);
  });
});
