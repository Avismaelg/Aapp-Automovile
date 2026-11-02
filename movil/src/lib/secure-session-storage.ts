import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// SW-01 / RNF-08: la sesión de Supabase (JWT y token de refresco) se guarda en
// el almacenamiento seguro del sistema (Keychain / Keystore), no en
// AsyncStorage en claro. SecureStore admite unos 2 KB por valor y una sesión
// ocupa más, así que se guarda en trozos. En web no hay almacenamiento seguro:
// se usa el del navegador.

const CHUNK_SIZE = 1800;

// SecureStore solo acepta claves con letras, números, «.», «-» y «_».
function safeKey(key: string) {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function readSecure(key: string): Promise<string | null> {
  const base = safeKey(key);
  const count = Number(await SecureStore.getItemAsync(`${base}.n`));
  if (!Number.isInteger(count) || count <= 0) return null;
  const parts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const part = await SecureStore.getItemAsync(`${base}.${index}`);
    if (part == null) return null;
    parts.push(part);
  }
  return parts.join('');
}

async function removeSecure(key: string) {
  const base = safeKey(key);
  const count = Number(await SecureStore.getItemAsync(`${base}.n`));
  await SecureStore.deleteItemAsync(`${base}.n`);
  if (Number.isInteger(count)) {
    for (let index = 0; index < count; index += 1) {
      await SecureStore.deleteItemAsync(`${base}.${index}`);
    }
  }
}

async function writeSecure(key: string, value: string) {
  await removeSecure(key);
  const base = safeKey(key);
  const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
  for (let index = 0; index < count; index += 1) {
    await SecureStore.setItemAsync(`${base}.${index}`, value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE));
  }
  // El contador va al final: una escritura a medias no deja una sesión rota.
  await SecureStore.setItemAsync(`${base}.n`, String(count));
}

export const secureSessionStorage = {
  async getItem(key: string) {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    const stored = await readSecure(key);
    if (stored != null) return stored;
    // Sesiones guardadas por versiones anteriores en AsyncStorage: se mueven al
    // almacenamiento seguro y se borran, sin cerrar la sesión del usuario.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy == null) return null;
    await writeSecure(key, legacy);
    await AsyncStorage.removeItem(key);
    return legacy;
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') return AsyncStorage.setItem(key, value);
    await writeSecure(key, value);
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(key);
    await removeSecure(key);
    await AsyncStorage.removeItem(key);
  },
};
