import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';

import { isDemoMode } from '@/src/lib/demo';
import {
  defaultPartyName,
  INVITE_TTL_MS,
  inviteErrorMessage,
  type SentInvite,
} from '@/src/lib/party-invites';
import { mapProfileRow, PROFILE_COLUMNS, type ProfileRow, type UserProfile } from '@/src/lib/profile-db';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';
import { uniqueTopic } from '@/src/lib/shared-subscription';

export type IncomingPartyInvite = {
  id: string;
  partyId: string;
  partyName: string;
  destinationLabel: string | null;
  inviter: UserProfile | null;
  // Solo en el simulador (sin perfil real).
  inviterName?: string;
  createdAt: string;
};

type InviteRow = {
  id: string;
  party_id: string;
  inviter_id: string;
  invitee_id: string;
  party_name: string;
  destination_label: string | null;
  status: SentInvite['status'];
  created_at: string;
};

// Invitaciones que te llegan. Se actualizan al momento por tiempo real.
export function useIncomingPartyInvites() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);
  const channelId = useId().replace(/:/g, '');
  const enabled = Boolean(account) && !demo && Boolean(supabase);

  const query = useQuery({
    queryKey: ['party-invites', 'incoming', account?.id ?? 'guest'],
    enabled,
    // Sin migración aplicada la tabla no existe: no insistir.
    retry: false,
    queryFn: async (): Promise<IncomingPartyInvite[]> => {
      if (!account || !supabase) return [];
      const since = new Date(Date.now() - INVITE_TTL_MS).toISOString();
      const { data, error } = await supabase
        .from('party_invites')
        .select('id, party_id, inviter_id, invitee_id, party_name, destination_label, status, created_at')
        .eq('invitee_id', account.id)
        .eq('status', 'pending')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) return [];
      const rows = (data ?? []) as InviteRow[];
      if (rows.length === 0) return [];

      const inviterIds = [...new Set(rows.map((row) => row.inviter_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .in('id', inviterIds);
      const profileMap = new Map(
        ((profiles ?? []) as ProfileRow[]).map((row) => [row.id, mapProfileRow(row)]),
      );
      return rows.map((row) => ({
        id: row.id,
        partyId: row.party_id,
        partyName: row.party_name,
        destinationLabel: row.destination_label,
        inviter: profileMap.get(row.inviter_id) ?? null,
        createdAt: row.created_at,
      }));
    },
  });

  useEffect(() => {
    if (!enabled || !account || !supabase) return;
    const client = supabase;
    const channel = client
      .channel(uniqueTopic(`party-invites-${account.id}-${channelId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'party_invites',
          filter: `invitee_id=eq.${account.id}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: ['party-invites', 'incoming'] }),
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [account, channelId, enabled, queryClient]);

  return { invites: query.data ?? [], refetch: query.refetch };
}

// Invitaciones que ya mandaste en esta party (para marcar «Invitado»).
export function useSentPartyInvites(partyId: string | undefined) {
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  const query = useQuery({
    queryKey: ['party-invites', 'sent', partyId ?? 'none'],
    enabled: Boolean(partyId) && Boolean(account) && !demo,
    retry: false,
    refetchInterval: 15_000,
    queryFn: async (): Promise<SentInvite[]> => {
      if (!partyId || !supabase) return [];
      const { data, error } = await supabase
        .from('party_invites')
        .select('invitee_id, status')
        .eq('party_id', partyId);
      if (error) return [];
      return ((data ?? []) as { invitee_id: string; status: SentInvite['status'] }[]).map(
        (row) => ({ inviteeId: row.invitee_id, status: row.status }),
      );
    },
  });

  return query.data ?? [];
}

// Crea tu party si no tienes ninguna. Entrar en una nueva te saca de la
// anterior (solo hay una party activa a la vez).
async function createQuickParty(accountId: string, name: string) {
  if (!supabase) throw new Error('Supabase no está configurado.');
  const now = new Date().toISOString();
  await supabase
    .from('party_members')
    .update({ left_at: now, last_lat: null, last_lng: null })
    .eq('user_id', accountId)
    .is('left_at', null);

  const { data, error } = await supabase
    .from('parties')
    .insert({
      host_id: accountId,
      name,
      status: 'live',
      starts_at: now,
      max_members: 50,
      is_private: true,
    })
    .select('id, invite_code')
    .single();
  if (error) throw new Error('No pudimos crear la party. Inténtalo de nuevo.');

  const { error: memberError } = await supabase.from('party_members').insert({
    party_id: data.id,
    user_id: accountId,
    role: 'host',
    last_seen_at: now,
  });
  if (memberError) {
    await supabase.from('parties').delete().eq('id', data.id);
    throw new Error('No pudimos unirte como anfitrión de la party.');
  }
  return { id: data.id as string, code: data.invite_code as string };
}

// Invitar con un toque. Si aún no tienes party, la crea («Convoy de Ana»).
export function useInviteToParty() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  return useMutation({
    mutationFn: async ({
      partyId,
      userIds,
      myName,
    }: {
      partyId: string | null;
      userIds: string[];
      myName: string;
    }) => {
      if (demo) throw new Error('Las invitaciones reales requieren una cuenta conectada.');
      if (!supabase || !account) throw new Error('Inicia sesión para invitar.');
      const targetParty = partyId ?? (await createQuickParty(account.id, defaultPartyName(myName))).id;

      const results = await Promise.all(
        userIds.map((userId) =>
          supabase!.rpc('invite_to_party', { p_party_id: targetParty, p_user_id: userId }),
        ),
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) throw new Error(inviteErrorMessage(failed.error.message));
      return { partyId: targetParty, created: !partyId };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['party'] });
      void queryClient.invalidateQueries({ queryKey: ['party-invites', 'sent'] });
    },
  });
}

export function useAcceptPartyInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      if (!supabase) throw new Error('Supabase no está configurado.');
      const { error } = await supabase.rpc('accept_party_invite', { p_invite_id: inviteId });
      if (error) throw new Error(inviteErrorMessage(error.message));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['party'] });
      void queryClient.invalidateQueries({ queryKey: ['party-invites'] });
    },
  });
}

export function useDeclinePartyInvite() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  return useMutation({
    mutationFn: async (inviteId: string) => {
      if (!supabase || !account) return;
      await supabase
        .from('party_invites')
        .update({ status: 'declined', responded_at: new Date().toISOString() })
        .eq('id', inviteId)
        .eq('invitee_id', account.id);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['party-invites', 'incoming'] });
    },
  });
}
