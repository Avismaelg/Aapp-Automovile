/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Regresión de los P0 de docs/AUDITORIA-PRODUCCION.md, sobre el estado FINAL
// de las migraciones (aplicadas en orden). Son comprobaciones estáticas: la
// prueba contra una base real está en docs/PRUEBAS-PRODUCCION.md.

const migrationsDir = path.join(__dirname, '..', '..', 'supabase', 'migrations');
const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
const statements = files.flatMap((file) =>
  fs
    .readFileSync(path.join(migrationsDir, file), 'utf8')
    .replace(/--[^\n]*/g, '')
    .toLowerCase()
    .split(/;\s*\n/)
    .map((sql) => sql.replace(/\s+/g, ' ').trim()),
);

// Última definición de cada política (drop + create en orden).
function finalPolicies() {
  const policies = new Map<string, string>();
  for (const sql of statements) {
    const drop = sql.match(/^drop policy if exists "?([\w ]+?)"? on (?:public\.)?(\w+)/);
    if (drop) policies.delete(`${drop[2]}.${drop[1]}`);
    const create = sql.match(/^create policy "?([\w ]+?)"? on (?:public\.)?(\w+)(.*)$/);
    if (create) policies.set(`${create[2]}.${create[1]}`, create[3]);
  }
  return policies;
}

// Privilegios finales de tabla y de columna para anon / authenticated.
function finalPrivileges(table: string) {
  const tableLevel = new Map<string, Set<string>>(); // privilegio -> roles
  const columnLevel = new Map<string, Set<string>>(); // privilegio -> columnas
  const roles = (list: string) => list.split(',').map((role) => role.trim());
  for (const sql of statements) {
    const grantCols = sql.match(new RegExp(`^grant (select|update) \\(([^)]*)\\) on public\\.${table} to ([a-z_, ]+)`));
    if (grantCols) {
      const set = columnLevel.get(grantCols[1]) ?? new Set<string>();
      grantCols[2].split(',').forEach((column) => set.add(column.trim()));
      columnLevel.set(grantCols[1], set);
      continue;
    }
    const revoke = sql.match(new RegExp(`^revoke (select|update|all) on public\\.${table} from ([a-z_, ]+)`));
    if (revoke) {
      for (const privilege of revoke[1] === 'all' ? ['select', 'update'] : [revoke[1]]) {
        const set = tableLevel.get(privilege) ?? new Set(['anon', 'authenticated']);
        roles(revoke[2]).forEach((role) => set.delete(role));
        tableLevel.set(privilege, set);
      }
    }
  }
  return {
    // Supabase concede todo a anon/authenticated si nadie lo revoca.
    table: (privilege: string) => tableLevel.get(privilege) ?? new Set(['anon', 'authenticated']),
    columns: (privilege: string) => columnLevel.get(privilege) ?? new Set<string>(),
  };
}

// Columnas de una tabla: create table + add column.
function tableColumns(table: string) {
  const columns = new Set<string>();
  for (const sql of statements) {
    const create = sql.match(new RegExp(`^create table if not exists public\\.${table} \\((.*)\\)$`));
    if (create) {
      for (const part of create[1].split(/,(?![^(]*\))/)) {
        const name = part.trim().match(/^([a-z_]+) /)?.[1];
        if (name && !['primary', 'constraint', 'unique', 'check', 'foreign'].includes(name)) columns.add(name);
      }
    }
    if (new RegExp(`^alter table public\\.${table} `).test(sql)) {
      for (const match of sql.matchAll(/add column if not exists ([a-z_]+)/g)) columns.add(match[1]);
    }
  }
  return columns;
}

// Cuerpo completo de la última versión de private.<name> (hasta su $$;).
const allSql = statements.join(';\n');
const functionBody = (name: string) => {
  const starts = [...allSql.matchAll(new RegExp(`create or replace function private\\.${name}\\(`, 'g'))];
  const start = starts.at(-1)?.index;
  if (start == null) return '';
  const open = allSql.indexOf('$$', start);
  const close = allSql.indexOf('$$', open + 2);
  return allSql.slice(start, close + 2);
};

describe('P0-1 · convoys', () => {
  const policies = finalPolicies();

  it('nadie se da de alta solo en un convoy ajeno: el alta directa es solo del anfitrión en el suyo', () => {
    const insert = policies.get('party_members.party_members_insert') ?? '';
    expect(insert).toContain("role = 'host'");
    expect(insert).toContain('p.host_id = (select auth.uid())');
  });

  it('cada uno actualiza solo su fila y nunca el rol, el convoy ni la expulsión', () => {
    const update = policies.get('party_members.party_members_update') ?? '';
    expect(update).not.toContain('is_party_host');
    const privileges = finalPrivileges('party_members');
    expect([...privileges.table('update')]).toEqual([]);
    const columns = privileges.columns('update');
    expect(columns.has('last_lat')).toBe(true);
    for (const forbidden of ['role', 'party_id', 'user_id', 'kicked_at', 'joined_at']) {
      expect(columns.has(forbidden)).toBe(false);
    }
  });

  it('volver con el código está cerrado a expulsados y el límite se cuenta con el convoy bloqueado', () => {
    const join = functionBody('join_party');
    expect(join).toContain('for update');
    expect(join).toContain("raise exception 'kicked'");
    expect(functionBody('kick_party_member')).toContain('kicked_at = now()');
    expect(functionBody('accept_party_invite')).toContain('for update');
  });

  it('salir no se deshace desde la app', () => {
    expect(functionBody('party_members_guard')).toContain("raise exception 'rejoin_requires_server'");
  });
});

describe('P0-2 · amistades', () => {
  const policies = finalPolicies();

  it('solo el destinatario responde y solo cambia el estado', () => {
    const update = policies.get('friendships.friendships_update') ?? '';
    expect(update).toContain('addressee_id = (select auth.uid())');
    expect(update).not.toContain('requester_id');
    const privileges = finalPrivileges('friendships');
    expect([...privileges.table('update')]).toEqual([]);
    expect([...privileges.columns('update')].sort()).toEqual(['responded_at', 'status']);
  });

  it('solo de pendiente a aceptada o rechazada, y nunca con un bloqueo de por medio', () => {
    const guard = functionBody('friendships_guard');
    expect(guard).toContain("old.status::text <> 'pending'");
    expect(guard).toContain('private.is_blocked');
    expect(policies.get('friendships.friendships_insert') ?? '').toContain('not private.is_blocked');
  });
});

describe('P0-3 · datos privados', () => {
  it('la matrícula no sale por la API, ni siquiera en vehículos públicos', () => {
    const privileges = finalPrivileges('vehicles');
    expect([...privileges.table('select')]).toEqual([]);
    const columns = privileges.columns('select');
    expect(columns.has('plate')).toBe(false);
    expect(columns.has('make')).toBe(true);
  });

  it('la ubicación de casa no sale con el perfil', () => {
    const privileges = finalPrivileges('profiles');
    expect([...privileges.table('select')]).toEqual([]);
    expect(privileges.columns('select').has('home_location')).toBe(false);
  });

  it('toda columna de vehicles y profiles está concedida o declarada privada (una nueva no se olvida)', () => {
    const privateColumns = { vehicles: ['plate'], profiles: ['home_location'] } as const;
    for (const table of ['vehicles', 'profiles'] as const) {
      const granted = finalPrivileges(table).columns('select');
      const missing = [...tableColumns(table)].filter(
        (column) => !granted.has(column) && !(privateColumns[table] as readonly string[]).includes(column),
      );
      expect({ table, missing }).toEqual({ table, missing: [] });
    }
  });

  it('la app nunca pide todas las columnas de vehicles', () => {
    const root = path.join(__dirname, '..', '..');
    const walk = (dir: string): string[] => {
      const full = path.join(root, dir);
      return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(path.join(dir, entry.name))
          : /\.tsx?$/.test(entry.name)
            ? [path.join(full, entry.name)]
            : [],
      );
    };
    const sources = ['src/hooks', 'src/lib', 'app'].flatMap(walk);
    const offending = sources.filter((file) =>
      /from\('vehicles'\)[^;]{0,200}?\.select\('\*'\)/s.test(fs.readFileSync(file, 'utf8')),
    );
    expect(offending).toEqual([]);
  });
});

describe('P0-4 · sin velocidad pública', () => {
  const policies = finalPolicies();

  it('nadie lee las velocidades de otros ni añade nuevas', () => {
    expect(policies.has('speed_records.speed_records_read_public')).toBe(false);
    expect(policies.get('speed_records.speed_records_read_own') ?? '').toContain('user_id = (select auth.uid())');
    expect(policies.has('speed_records.speed_records_insert_own')).toBe(false);
  });

  it('la app ni lee ni envía speed_records', () => {
    const root = path.join(__dirname, '..', '..');
    const walk = (dir: string): string[] =>
      fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(path.join(dir, entry.name))
          : /\.tsx?$/.test(entry.name)
            ? [path.join(root, dir, entry.name)]
            : [],
      );
    const users = ['src/hooks', 'src/lib', 'src/components', 'app']
      .flatMap(walk)
      .filter((file) => fs.readFileSync(file, 'utf8').includes("'speed_records'"));
    expect(users).toEqual([]);
  });
});

describe('P0-5 · retos', () => {
  const policies = finalPolicies();

  it('solo el anfitrión inscribe y nadie se pone puesto ni avance a mano', () => {
    expect(policies.get('challenge_participants.challenge_participants_insert') ?? '').toContain(
      'private.is_challenge_host(challenge_id)',
    );
    const privileges = finalPrivileges('challenge_participants');
    expect([...privileges.table('update')]).toEqual([]);
    const columns = privileges.columns('update');
    for (const forbidden of ['finish_rank', 'progress_pct', 'elapsed_s', 'arrival_verified', 'user_id']) {
      expect(columns.has(forbidden)).toBe(false);
    }
    const guard = functionBody('challenge_participants_guard');
    expect(guard).toContain("old.status = 'invited' and new.status in ('accepted', 'declined')");
    expect(guard).toContain("raise exception 'invalid_participant_transition'");
  });

  it('la llegada se comprueba contra la meta y distingue verificada de autodeclarada', () => {
    const report = functionBody('report_challenge_progress');
    expect(report).toContain('p_lat double precision default null');
    expect(report).toContain("raise exception 'not_at_finish'");
    expect(report).toContain('arrival_verified = v_verified');
    // Fase 2 · 2.2: con meta, sin posición o en un tiempo imposible no se gana.
    expect(report).toContain("raise exception 'position_required'");
    expect(report).toContain("raise exception 'impossible_time'");
    expect(report).not.toMatch(/if p_lat is not null and p_lng is not null and v_challenge\.end_lat/);
    // La versión de 3 argumentos (que confiaba en p_arrived) ya no existe.
    expect(allSql).toContain('drop function if exists private.report_challenge_progress(uuid, numeric, boolean)');
  });
});

describe('fase 2 · auditoría de seguridad', () => {
  const functionsDir = path.join(__dirname, '..', '..', 'supabase', 'functions');
  const app = path.join(__dirname, '..', '..', 'app');

  it('nadie averigua qué correos tienen cuenta', () => {
    expect(allSql).toContain('revoke all on function public.email_registered(text) from public, anon, authenticated');
    expect(allSql).toContain('revoke all on function private.email_registered(text) from public, anon, authenticated');
    const signUp = fs.readFileSync(path.join(app, '(auth)', 'sign-up.tsx'), 'utf8');
    expect(signUp).not.toContain('isEmailRegistered');
    expect(signUp).not.toContain('email_registered');
  });

  it('los topes de Google los fija el servidor y el cupo propio va antes que el total', () => {
    for (const [name, userCap, globalCap] of [
      ['bump_place_search', 300, 300],
      ['bump_route_quota', 60, 150],
    ] as const) {
      const body = functionBody(name);
      expect(body).toContain(`v_user_cap constant integer := ${userCap}`);
      expect(body).toContain(`v_global_cap constant integer := ${globalCap}`);
      expect(body).not.toMatch(/p_(global_)?limit\)/);
      expect(body.indexOf('if v_count > v_user_cap then return false')).toBeLessThan(
        body.indexOf(name === 'bump_place_search' ? 'place_search_global (day' : 'values (v_day, v_global'),
      );
    }
  });

  it('nadie se hace owner/admin de un club ni entra en uno privado', () => {
    const insert = finalPolicies().get('club_members.club_members_insert') ?? '';
    expect(insert).toContain("role = 'member'");
    expect(insert).toContain("c.privacy = 'public'");
    expect(insert).toContain('c.owner_id = (select auth.uid())');
  });

  it('el secreto de los avisos se compara en tiempo constante', () => {
    for (const name of ['push', 'livekit-revoke']) {
      const source = fs.readFileSync(path.join(functionsDir, name, 'index.ts'), 'utf8');
      expect(source).toContain("crypto.subtle.digest('SHA-256'");
      expect(source).toContain('diff |= a[i] ^ b[i]');
      expect(source).not.toMatch(/x-push-secret'\) !==/);
    }
  });
});

describe('fase 5 · voz', () => {
  const functionsDir = path.join(__dirname, '..', '..', 'supabase', 'functions');
  const token = fs.readFileSync(path.join(functionsDir, 'livekit-token', 'index.ts'), 'utf8');

  it('token corto, solo para convoys vigentes y sin datos del correo', () => {
    expect(token).toContain("ttl: '15m'");
    expect(token).toContain(".gt('expires_at'");
    expect(token).not.toMatch(/email\?*\.split/);
  });

  it('salir o ser expulsado echa de la sala de voz al momento', () => {
    expect(allSql).toContain('create trigger party_members_voice_revoke');
    const revoke = fs.readFileSync(path.join(functionsDir, 'livekit-revoke', 'index.ts'), 'utf8');
    expect(revoke).toContain("validSecret(Deno.env.get('PUSH_WEBHOOK_SECRET'), request.headers.get('x-push-secret'))");
    expect(revoke).toContain('removeParticipant');
  });
});

describe('fase 7 · borrado de cuenta', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'supabase', 'functions', 'delete-account', 'index.ts'),
    'utf8',
  );

  it('no responde «todo borrado» si quedan archivos', () => {
    expect(source).not.toMatch(/return json\(\{ ok: true \}\)/);
    expect(source).toContain("storage: 'partial'");
    expect(source).toContain("rpc('queue_storage_cleanup'");
  });

  it('pagina las carpetas y reintenta lo pendiente', () => {
    expect(source).toMatch(/list\(folder, \{ limit: PAGE, offset \}\)/);
    expect(source).toContain("rpc('next_storage_cleanup'");
  });

  it('la cola no la toca la app', () => {
    expect(allSql).toContain('revoke all on function public.queue_storage_cleanup(jsonb) from public, anon, authenticated');
    expect(allSql).toContain('revoke all on private.storage_cleanup from public, anon, authenticated');
  });
});

describe('fase 10 · páginas web de las tiendas', () => {
  const site = path.join(__dirname, '..', '..', '..', 'infra', 'invite-page');

  it('la página de borrado existe y solo lleva la clave pública anon', () => {
    const page = fs.readFileSync(path.join(site, 'borrar-cuenta', 'index.html'), 'utf8');
    expect(page).toContain("functions.invoke('delete-account'");
    // Nunca una clave secreta (formato nuevo).
    expect(page).not.toMatch(/sb_secret_/);
    const jwts = page.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? [];
    const publishable = page.match(/sb_publishable_[A-Za-z0-9_-]+/g) ?? [];
    // Una sola clave: la anon (JWT, formato antiguo) o la publishable (nuevo).
    expect(jwts.length + publishable.length).toBe(1);
    for (const jwt of jwts) {
      const claims = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8'));
      expect(claims.role).toBe('anon');
    }
  });

  it('la política de privacidad pública dice lo mismo que la app', () => {
    const page = fs.readFileSync(path.join(site, 'privacidad', 'index.html'), 'utf8');
    expect(page).toContain('lo está por defecto');
    expect(page).toContain('../borrar-cuenta/');
  });
});
