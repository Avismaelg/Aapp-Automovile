import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Location from 'expo-location';

import { setAutoDriving } from '@/modules/motion';
import { resumeTracking, startTracking } from '@/src/lib/tracking';

jest.mock('expo-location', () => ({
  Accuracy: { High: 4, BestForNavigation: 6 },
  ActivityType: { AutomotiveNavigation: 1 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  getBackgroundPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-task-manager', () => ({
  isTaskDefined: jest.fn(() => true),
  defineTask: jest.fn(),
}));

jest.mock('@/modules/motion', () => ({
  setAutoDriving: jest.fn(),
  setDrivingTexts: jest.fn(),
  startDriving: jest.fn(),
  stopDriving: jest.fn(),
}));

jest.mock('@/src/lib/background-points', () => ({ saveBackgroundBatch: jest.fn(async () => undefined) }));
jest.mock('@/src/lib/background-alerts', () => ({ checkBackgroundAlerts: jest.fn(async () => undefined) }));
jest.mock('@/src/lib/location-consent', () => ({ askLocationConsent: jest.fn(async () => true) }));
jest.mock('@/src/lib/live-share', () => ({ pushLivePosition: jest.fn(async () => undefined) }));

describe('B11 · autoDriving solo con el servicio de ubicación en marcha', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Location.hasStartedLocationUpdatesAsync).mockReset();
    jest.mocked(Location.startLocationUpdatesAsync).mockReset();
    jest.mocked(Location.stopLocationUpdatesAsync).mockReset();
    jest.mocked(Location.hasStartedLocationUpdatesAsync).mockResolvedValue(false);
    jest.mocked(Location.startLocationUpdatesAsync).mockResolvedValue(undefined);
    jest.mocked(Location.stopLocationUpdatesAsync).mockResolvedValue(undefined);
  });

  it('startTracking no lo enciende si el servicio no arranca', async () => {
    jest.mocked(Location.startLocationUpdatesAsync).mockRejectedValueOnce(new Error('sin GPS'));

    await expect(startTracking()).rejects.toThrow('sin GPS');
    expect(jest.mocked(setAutoDriving)).toHaveBeenLastCalledWith(false);
    expect(jest.mocked(setAutoDriving)).not.toHaveBeenCalledWith(true);
  });

  it('startTracking lo enciende cuando el servicio arranca', async () => {
    await expect(startTracking()).resolves.toBeUndefined();
    expect(jest.mocked(setAutoDriving)).toHaveBeenLastCalledWith(true);
  });

  it('resumeTracking no lo deja encendido si el reinicio falla tras parar el servicio', async () => {
    jest.mocked(Location.hasStartedLocationUpdatesAsync).mockResolvedValueOnce(true);
    jest.mocked(Location.startLocationUpdatesAsync).mockRejectedValueOnce(new Error('sin GPS'));

    await expect(resumeTracking()).resolves.toBe('error');
    expect(jest.mocked(setAutoDriving)).toHaveBeenLastCalledWith(false);
    expect(jest.mocked(setAutoDriving)).not.toHaveBeenCalledWith(true);
  });

  it('resumeTracking lo enciende cuando el servicio arranca', async () => {
    await expect(resumeTracking()).resolves.toBe('running');
    expect(jest.mocked(setAutoDriving)).toHaveBeenLastCalledWith(true);
  });
});
