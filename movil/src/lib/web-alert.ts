import { Alert, Platform, type AlertButton } from 'react-native';

// react-native-web deja Alert.alert vacío: en web ningún aviso ni
// confirmación llegaba al usuario. Se sustituye por los diálogos del
// navegador; con dos o más botones, Aceptar ejecuta el botón que no es
// "cancel" y Cancelar el de cancelar.
export function installWebAlert() {
  if (Platform.OS !== 'web' || typeof globalThis.alert !== 'function') return;

  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = message ? `${title}\n\n${message}` : title;
    const cancel = buttons?.find((button) => button.style === 'cancel');
    const actions = buttons?.filter((button) => button !== cancel) ?? [];

    if (!buttons || buttons.length <= 1 || actions.length === 0) {
      globalThis.alert(text);
      (actions[0] ?? cancel)?.onPress?.();
      return;
    }

    // Varias acciones (p. ej. Activar / Ajustes): el diálogo del navegador
    // solo admite una, así que se usa la primera.
    if (globalThis.confirm(`${text}\n\n${actions[0].text ?? 'Aceptar'}?`)) actions[0].onPress?.();
    else cancel?.onPress?.();
  };
}
