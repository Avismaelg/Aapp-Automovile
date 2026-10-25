import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#06080B" />
        <meta
          name="description"
          content="Caravana: la red social del coche. Registra tus rutas, sal en party con amigos, habla por walkie-talkie y controla tu combustible."
        />
        <title>Caravana — la red social del coche</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
body {
  background-color: #06080B;
  color: #F3F6FA;
}
#root {
  background-color: #06080B;
  min-height: 100vh;
}
`;
