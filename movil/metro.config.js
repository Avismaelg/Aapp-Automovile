const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metro en Windows puede fallar al resolver el campo "exports" de
// livekit-client (.mjs). Apuntamos directamente al bundle ESM que usa el SDK.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'livekit-client') {
    return {
      filePath: path.resolve(
        __dirname,
        'node_modules/livekit-client/dist/livekit-client.esm.mjs',
      ),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
