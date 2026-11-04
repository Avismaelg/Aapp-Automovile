/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Permisos de la base de datos tras aplicar TODAS las migraciones en orden.
// Nace de un fallo real: una migración quitó el uso del esquema private a los
// usuarios y dejó sin funcionar salir / terminar el convoy y las políticas que
// llaman a private.are_friends. Estas pruebas reproducen grants y revokes en
// orden y fallan si el estado final rompe algo que la app usa.

const migrationsDir = path.join(__dirname, '..', '..', 'supabase', 'migrations');
const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
// Sin comentarios para no leer como SQL lo que solo se explica.
const statements = files.flatMap((file) =>
  fs
    .readFileSync(path.join(migrationsDir, file), 'utf8')
    .replace(/--[^\n]*/g, '')
    .toLowerCase()
    .split(/;\s*\n/)
    .map((sql) => ({ file, sql: sql.replace(/\s+/g, ' ').trim() })),
);

const roles = (list: string) =>
  list
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);

// Estado final de USAGE por esquema y rol.
function schemaUsage() {
  const usage = new Map<string, Set<string>>();
  for (const { sql } of statements) {
    const grant = sql.match(/^grant (?:usage|all)(?: privileges)? on schema ([a-z_]+) to ([a-z_, ]+)/);
    if (grant) {
      const set = usage.get(grant[1]) ?? new Set<string>();
      roles(grant[2]).forEach((role) => set.add(role));
      usage.set(grant[1], set);
    }
    const revoke = sql.match(/^revoke (?:usage|all)(?: privileges)? on schema ([a-z_]+) from ([a-z_, ]+)/);
    if (revoke) {
      const set = usage.get(revoke[1]) ?? new Set<string>();
      roles(revoke[2]).forEach((role) => set.delete(role));
      usage.set(revoke[1], set);
    }
  }
  return usage;
}

// Estado final de EXECUTE por función private.x (sin mirar argumentos).
function functionExecute() {
  const execute = new Map<string, Set<string>>();
  for (const { sql } of statements) {
    const grant = sql.match(/^grant (?:execute|all) on function (private\.[a-z_]+)\([^)]*\) to ([a-z_, ]+)/);
    if (grant) {
      const set = execute.get(grant[1]) ?? new Set<string>();
      roles(grant[2]).forEach((role) => set.add(role));
      execute.set(grant[1], set);
    }
    const revoke = sql.match(/^revoke (?:execute|all) on function (private\.[a-z_]+)\([^)]*\) from ([a-z_, ]+)/);
    if (revoke) {
      const set = execute.get(revoke[1]) ?? new Set<string>();
      roles(revoke[2]).forEach((role) => set.delete(role));
      execute.set(revoke[1], set);
    }
  }
  return execute;
}

// Funciones private.x que se ejecutan con los permisos del usuario: las que
// llaman las políticas RLS y los envoltorios public.* «security invoker».
function privateCalledByUsers() {
  const called = new Set<string>();
  for (const { sql } of statements) {
    const fromPolicy = /^create policy /.test(sql);
    const fromInvokerWrapper =
      /^create (?:or replace )?function public\./.test(sql) && /security invoker/.test(sql);
    if (!fromPolicy && !fromInvokerWrapper) continue;
    for (const match of sql.matchAll(/(private\.[a-z_]+)\(/g)) called.add(match[1]);
  }
  return called;
}

describe('permisos de la base de datos tras todas las migraciones', () => {
  it('los usuarios conservan el uso del esquema private (políticas y funciones lo necesitan)', () => {
    const usage = schemaUsage().get('private') ?? new Set<string>();
    expect([...usage].sort()).toEqual(expect.arrayContaining(['anon', 'authenticated', 'service_role']));
  });

  it('ninguna migración quita a los usuarios el uso de public o private', () => {
    const offending = statements.filter(({ sql }) =>
      /^revoke (?:usage|all)(?: privileges)? on schema (public|private) from [a-z_, ]*(anon|authenticated)/.test(sql),
    );
    expect(offending.map(({ file }) => file)).toEqual([]);
  });

  it('toda función private que llaman políticas o envoltorios se puede ejecutar como usuario', () => {
    const execute = functionExecute();
    const called = privateCalledByUsers();
    expect(called.size).toBeGreaterThan(5);
    const blocked = [...called].filter((fn) => {
      const granted = execute.get(fn);
      // Sin grants ni revokes explícitos vale el permiso por defecto (PUBLIC).
      if (!granted) return false;
      return !granted.has('authenticated') && !granted.has('public');
    });
    expect(blocked).toEqual([]);
  });

  it('las funciones internas de los avisos no las puede llamar un usuario', () => {
    const execute = functionExecute();
    for (const fn of ['private.send_push', 'private.push_party_invite']) {
      expect(execute.get(fn)?.has('authenticated') ?? false).toBe(false);
    }
  });
});
