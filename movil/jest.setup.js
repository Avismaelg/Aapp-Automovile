/* global jest */
// Las pruebas corren con un teléfono en español de República Dominicana
// (textos en español, km y DOP), sea cual sea el idioma del ordenador.
jest.mock('expo-localization', () => ({
  getLocales: () => [
    { languageCode: 'es', regionCode: 'DO', currencyCode: 'DOP', measurementSystem: 'metric' },
  ],
}));
