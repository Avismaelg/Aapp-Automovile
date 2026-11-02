/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

import { PARTY_FREE_MEMBERS, PARTY_MAX_MEMBERS } from '@/src/lib/party-invites';

// Comprobaciones del SRS sobre el backend y los secretos, leyendo el propio
// repositorio: así una migración o un cambio que las rompa falla en CI.

const root = path.join(__dirname, '..', '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const migrations = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
const allSql = migrations.join('\n').toLowerCase();

function walk(dir: string, out: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '__tests__'].includes(entry.name)) walk(full, out);
    } else if (/\.(ts|tsx|js|json)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('SRS — backend y secretos', () => {
  it('RNF-07 / R-02: todas las tablas creadas tienen RLS activado', () => {
    const tables = new Set(
      [...allSql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)/g)].map((m) => m[1]),
    );
    const withRls = new Set(
      [...allSql.matchAll(/alter table (?:if exists )?(?:public\.)?([a-z_]+) enable row level security/g)].map(
        (m) => m[1],
      ),
    );
    const missing = [...tables].filter((table) => !withRls.has(table));
    expect(tables.size).toBeGreaterThan(20);
    expect(missing).toEqual([]);
  });

  it('R-03 / RNF-09: la clave service_role no aparece en la app ni en variables públicas', () => {
    const files = [
      ...walk(path.join(root, 'app')),
      ...walk(path.join(root, 'src')),
      path.join(root, 'app.json'),
    ];
    const leaks = files.filter((file) => /service_role|SERVICE_ROLE/.test(fs.readFileSync(file, 'utf8')));
    expect(leaks).toEqual([]);
    const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    expect(example).not.toMatch(/SERVICE_ROLE|LIVEKIT_API_SECRET/);
  });

  it('RNF-05: parties de 5 miembros (plan gratuito) y 10 como máximo, impuesto en la BD', () => {
    expect(PARTY_FREE_MEMBERS).toBe(5);
    expect(PARTY_MAX_MEMBERS).toBe(10);
    const last = migrations.filter((sql) => /parties_max_members_check/.test(sql)).pop() ?? '';
    expect(last).toMatch(/check \(max_members between 2 and 10\)/);
    expect(last).toMatch(/max_members set default 5/);
  });
});
