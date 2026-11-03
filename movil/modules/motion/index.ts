import { requireOptionalNativeModule } from 'expo';

export type MotionEvent = {
  type: 'vehicle' | 'foot' | 'still';
  transition: 'enter' | 'exit';
  at: number;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  fixAt?: number;
};

type MotionNative = {
  hasPermission(): boolean;
  requestPermission(): Promise<boolean>;
  start(): Promise<boolean>;
  getEvents(sinceMs: number): MotionEvent[];
  isIgnoringBatteryOptimizations(): boolean;
  requestIgnoreBatteryOptimizations(): boolean;
  restartApp(): boolean;
  setAutoDriving(enabled: boolean): void;
  setDrivingTexts(texts: Record<string, string>): void;
  startDriving(reason: DrivingReason): boolean;
  stopDriving(reason: DrivingReason): void;
  isDriving(): boolean;
};

export type DrivingReason = 'vehicle' | 'convoy' | 'voice';

// Solo existe en Android; en iOS y web no hay sensor de actividad y la
// detección de aparcamiento usa solo el GPS.
const native = requireOptionalNativeModule<MotionNative>('Motion');

export const motionAvailable = native != null;

export function hasMotionPermission() {
  try {
    return native?.hasPermission() ?? false;
  } catch {
    return false;
  }
}

export async function requestMotionPermission() {
  if (!native) return false;
  return native.requestPermission().catch(() => false);
}

export async function startMotionUpdates() {
  if (!native) return false;
  return native.start().catch(() => false);
}

export function getMotionEvents(sinceMs: number): MotionEvent[] {
  if (!native) return [];
  try {
    return native.getEvents(sinceMs);
  } catch {
    return [];
  }
}

// true también donde no aplica (iOS/web): no hay nada que pedir.
export function isIgnoringBatteryOptimizations() {
  if (!native) return true;
  try {
    return native.isIgnoringBatteryOptimizations();
  } catch {
    return true;
  }
}

export function requestIgnoreBatteryOptimizations() {
  if (!native) return false;
  try {
    return native.requestIgnoreBatteryOptimizations();
  } catch {
    return false;
  }
}

// Reinicia la app (Android). Devuelve false si no se pudo (iOS, web).
export function restartApp() {
  try {
    return native?.restartApp() ?? false;
  } catch {
    return false;
  }
}

// Notificación de «registrando tu ruta» solo mientras conduces o estás en una
// party en vivo (Android). Parado, la ubicación se registra sin notificación.
export function setAutoDriving(enabled: boolean) {
  try {
    native?.setAutoDriving(enabled);
  } catch {
    // Sin módulo nativo (iOS, web).
  }
}

export function setDrivingTexts(texts: {
  channel: string;
  drivingTitle: string;
  drivingBody: string;
  convoyTitle: string;
  convoyBody: string;
  voiceTitle?: string;
  voiceBody?: string;
}) {
  try {
    native?.setDrivingTexts(texts);
  } catch {
    // Sin módulo nativo (iOS, web).
  }
}

export function startDriving(reason: DrivingReason) {
  try {
    return native?.startDriving(reason) ?? false;
  } catch {
    return false;
  }
}

export function stopDriving(reason: DrivingReason) {
  try {
    native?.stopDriving(reason);
  } catch {
    // Sin módulo nativo (iOS, web).
  }
}

export function isDriving() {
  try {
    return native?.isDriving() ?? false;
  } catch {
    return false;
  }
}
