/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

import { suggestMakes, suggestModels } from '@/src/data/vehicle-makes';
import {
  confirmError,
  emailError,
  maxVehicleYear,
  nameError,
  nicknameError,
  normalizeNickname,
  passwordError,
  passwordStrength,
  stepForServerError,
  yearError,
} from '@/src/lib/signup-validation';

describe('REG-01 / REG-02: nombre, apellido y apodo', () => {
  it('nombre y apellido son obligatorios', () => {
    expect(nameError('', 'first')).not.toBeNull();
    expect(nameError(' A ', 'last')).not.toBeNull();
    expect(nameError('Ana', 'first')).toBeNull();
  });

  it('el apodo: 3–20, letras, números, «_» y «.», en minúscula', () => {
    expect(normalizeNickname(' @Ana.Rd ')).toBe('ana.rd');
    expect(nicknameError('ana.rd')).toBeNull();
    expect(nicknameError('ana_rd_2026')).toBeNull();
    expect(nicknameError('ab')).not.toBeNull();
    expect(nicknameError('a'.repeat(21))).not.toBeNull();
    expect(nicknameError('ana-rd')).not.toBeNull();
    expect(nicknameError('.ana')).not.toBeNull();
    expect(nicknameError('ana.')).not.toBeNull();
    expect(nicknameError('an..a')).not.toBeNull();
  });
});

describe('REG-03 / REG-04: correo y contraseña', () => {
  it('valida el formato del correo', () => {
    expect(emailError('ana@correo.com')).toBeNull();
    expect(emailError('ana@correo')).not.toBeNull();
    expect(emailError('ana correo.com')).not.toBeNull();
  });

  it('la contraseña pide 8 caracteres con una letra y un número', () => {
    expect(passwordError('corta1')).not.toBeNull();
    expect(passwordError('soloLetras')).not.toBeNull();
    expect(passwordError('12345678')).not.toBeNull();
    expect(passwordError('caravana26')).toBeNull();
    expect(confirmError('caravana26', 'caravana25')).not.toBeNull();
    expect(confirmError('caravana26', 'caravana26')).toBeNull();
  });

  it('el medidor sube con longitud y variedad', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abc1')).toBeLessThanOrEqual(1);
    expect(passwordStrength('Caravana-2026-Santo')).toBe(4);
    expect(passwordStrength('caravana26')).toBeLessThan(passwordStrength('Caravana-2026-Santo'));
  });

  it('un error del servidor lleva al paso del dato rechazado', () => {
    expect(stepForServerError('Ese correo ya tiene una cuenta. Inicia sesión.')).toBe(1);
    expect(stepForServerError('User already registered')).toBe(1);
    expect(stepForServerError('Password should be at least 8 characters')).toBe(2);
    expect(stepForServerError('Network request failed')).toBe(3);
  });
});

describe('REG-05: vehículo', () => {
  it('el año va de 1950 al año que viene', () => {
    const now = new Date('2026-11-03T12:00:00Z');
    expect(maxVehicleYear(now)).toBe(2027);
    expect(yearError('2027', now)).toBeNull();
    expect(yearError('1950', now)).toBeNull();
    expect(yearError('1949', now)).not.toBeNull();
    expect(yearError('2028', now)).not.toBeNull();
    expect(yearError('20', now)).not.toBeNull();
  });

  it('autocompleta marcas y modelos sin impedir texto libre', () => {
    expect(suggestMakes('toy')).toContain('Toyota');
    expect(suggestMakes('ya', 'motorcycle')[0]).toBe('Yamaha');
    expect(suggestMakes('Toyota')).not.toContain('Toyota');
    expect(suggestModels('toyota', 'cor')).toContain('Corolla');
    expect(suggestModels('Marca Rara', 'x')).toEqual([]);
  });
});

describe('REG-07: alta atómica en el servidor', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/20261103100000_signup_with_vehicle.sql'),
    'utf8',
  );

  it('el trigger del alta crea perfil con nombre y apellido y el vehículo principal', () => {
    expect(sql).toContain('first_name, last_name');
    expect(sql).toContain("meta->'vehicle'");
    expect(sql).toMatch(/insert into public\.vehicles[\s\S]*is_primary\)/);
    expect(sql).toContain('v_year < 1950');
  });

  it('el apodo es único sin distinguir mayúsculas y se comprueba en vivo', () => {
    expect(sql).toContain('profiles_username_lower_idx on public.profiles (lower(username))');
    expect(sql).toContain('function public.username_available');
    expect(sql).toContain('function public.email_registered');
  });

  it('el borrador del registro nunca guarda la contraseña', () => {
    const draft = fs.readFileSync(path.join(__dirname, '../store/signup-draft.ts'), 'utf8');
    expect(draft).not.toMatch(/password/i);
  });
});
