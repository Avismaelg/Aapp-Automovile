import { describe, expect, it } from '@jest/globals';

import { DRIVING_IDLE_MS, nextDrivingState, type DrivingTracker } from '@/src/lib/driving-state';

const idle: DrivingTracker = { active: false, lastMovingAt: null };

describe('notificación de conducción solo en movimiento', () => {
  it('se enciende al ir en vehículo y no al caminar', () => {
    expect(nextDrivingState(idle, 6, 0).action).toBeNull();
    expect(nextDrivingState(idle, 30, 0).action).toBe('start');
  });

  it('un semáforo o un atasco no la apagan', () => {
    let state = nextDrivingState(idle, 40, 0).state;
    const stopped = nextDrivingState(state, 0, 60_000);
    expect(stopped.action).toBeNull();
    state = nextDrivingState(stopped.state, 8, 120_000).state;
    expect(nextDrivingState(state, 0, 120_000 + DRIVING_IDLE_MS - 1).action).toBeNull();
  });

  it('se apaga tras unos minutos parado', () => {
    const state = nextDrivingState(idle, 40, 0).state;
    expect(nextDrivingState(state, 0, DRIVING_IDLE_MS).action).toBe('stop');
    expect(nextDrivingState(state, null, DRIVING_IDLE_MS + 1).action).toBe('stop');
  });

  it('no repite la orden si ya está encendida o apagada', () => {
    const on = nextDrivingState(idle, 40, 0).state;
    expect(nextDrivingState(on, 50, 1_000).action).toBeNull();
    expect(nextDrivingState(idle, 0, DRIVING_IDLE_MS * 2).action).toBeNull();
  });
});
