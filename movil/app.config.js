// Completa app.json para las compilaciones en la nube (EAS). Los archivos de
// Firebase no van a git: en EAS llegan como variables de tipo archivo
// (GOOGLE_SERVICES_JSON, GOOGLE_SERVICE_INFO_PLIST, con la ruta al archivo);
// en local se usan los de la carpeta del proyecto.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
  ios: {
    ...config.ios,
    googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST ?? config.ios.googleServicesFile,
  },
});
