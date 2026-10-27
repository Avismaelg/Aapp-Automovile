import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { eventId, type AppEvent, type EventRoute } from '@/src/lib/events';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';
import { useLocalEvents } from '@/src/store/events';

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string | null;
  host_name: string | null;
  location_label: string | null;
  latitude: number | null;
  longitude: number | null;
  route: [number, number][] | null;
  route_distance_m: number | string | null;
  route_time_ms: number | string | null;
  created_at: string;
};

function mapRow(row: EventRow): AppEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    hostName: row.host_name?.trim() || 'Piloto',
    latitude: row.latitude,
    longitude: row.longitude,
    locationLabel: row.location_label,
    route:
      Array.isArray(row.route) && row.route.length >= 2
        ? {
            coordinates: row.route,
            distanceM: Number(row.route_distance_m ?? 0),
            timeMs: Number(row.route_time_ms ?? 0),
          }
        : null,
    createdAt: row.created_at,
    isLocal: false,
  };
}

function insertPayload(event: AppEvent, hostId: string) {
  return {
    id: event.id,
    host_id: hostId,
    host_name: event.hostName,
    title: event.title,
    description: event.description,
    starts_at: event.startsAt,
    is_public: true,
    location_label: event.locationLabel,
    latitude: event.latitude,
    longitude: event.longitude,
    route: event.route?.coordinates ?? null,
    route_distance_m: event.route?.distanceM ?? null,
    route_time_ms: event.route?.timeMs ?? null,
  };
}

export function useEvents() {
  const account = useAuth((state) => state.account);
  const demo = account?.mode === 'demo' || !isSupabaseConfigured || !supabase;
  const localEvents = useLocalEvents((state) => state.events);
  const markSynced = useLocalEvents((state) => state.markSynced);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['events'],
    enabled: !demo,
    queryFn: async (): Promise<AppEvent[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('events')
        .select(
          'id, title, description, starts_at, host_name, location_label, latitude, longitude, route, route_distance_m, route_time_ms, created_at',
        )
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return ((data ?? []) as EventRow[]).map(mapRow);
    },
  });

  // Reintenta publicar los eventos que quedaron pendientes (por ejemplo, antes
  // de aplicar la migración o sin conexión). Si la tabla no existe, se detiene
  // hasta el siguiente cambio local.
  useEffect(() => {
    if (demo || !supabase || !account) return;
    const pending = localEvents.filter((event) => event.pendingSync);
    if (pending.length === 0) return;

    let cancelled = false;
    void (async () => {
      for (const event of pending) {
        const { error } = await supabase!.from('events').insert(insertPayload(event, account.id));
        if (cancelled) return;
        if (error) return;
        markSynced(event.id);
      }
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    })();

    return () => {
      cancelled = true;
    };
  }, [account, demo, localEvents, markSynced, queryClient]);

  const events = useMemo(() => {
    const byId = new Map<string, AppEvent>();
    for (const event of localEvents) byId.set(event.id, event);
    for (const event of query.data ?? []) byId.set(event.id, event);
    return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [localEvents, query.data]);

  return {
    events,
    isLoading: !demo && query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    remoteAvailable: !demo && !query.isError,
    isDemo: demo,
    refetch: query.refetch,
  };
}

export function useEvent(id: string | undefined) {
  const { events, isLoading, isDemo, refetch } = useEvents();
  return {
    event: id ? (events.find((item) => item.id === id) ?? null) : null,
    isLoading,
    isDemo,
    refetch,
  };
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = account?.mode === 'demo' || !isSupabaseConfigured || !supabase;
  const addLocal = useLocalEvents((state) => state.addEvent);
  const markSynced = useLocalEvents((state) => state.markSynced);

  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string | null;
      latitude: number | null;
      longitude: number | null;
      locationLabel: string | null;
      route: EventRoute | null;
    }): Promise<AppEvent> => {
      const event: AppEvent = {
        id: eventId(),
        title: input.title.trim(),
        description: input.description?.trim() || null,
        startsAt: null,
        hostName: account?.displayName ?? 'Piloto',
        latitude: input.latitude,
        longitude: input.longitude,
        locationLabel: input.locationLabel,
        route: input.route,
        createdAt: new Date().toISOString(),
        isLocal: true,
        pendingSync: true,
      };

      if (demo || !supabase || !account) {
        addLocal({ ...event, pendingSync: false });
        return { ...event, pendingSync: false };
      }

      const { error } = await supabase.from('events').insert(insertPayload(event, account.id));

      if (error) {
        // Sin tabla remota o sin conexión: el evento queda en el dispositivo.
        addLocal(event);
        return event;
      }

      markSynced(event.id);
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      return { ...event, pendingSync: false, isLocal: false };
    },
  });
}
