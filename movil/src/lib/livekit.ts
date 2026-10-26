import { registerGlobals } from '@livekit/react-native';

let initialized = false;

export function initializeLiveKit() {
  if (initialized) return;
  registerGlobals();
  initialized = true;
}

export { AudioSession } from '@livekit/react-native';
export { ConnectionState, Room, RoomEvent, Track } from 'livekit-client';
