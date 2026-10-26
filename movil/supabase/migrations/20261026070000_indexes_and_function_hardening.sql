-- Índices de cobertura para claves foráneas señaladas por Supabase Advisors.
create index if not exists blocks_blocked_id_idx on public.blocks (blocked_id);
create index if not exists challenge_participants_vehicle_id_idx on public.challenge_participants (vehicle_id);
create index if not exists club_members_user_id_idx on public.club_members (user_id);
create index if not exists clubs_owner_id_idx on public.clubs (owner_id);
create index if not exists comments_user_id_idx on public.comments (user_id);
create index if not exists device_tokens_user_id_idx on public.device_tokens (user_id);
create index if not exists drive_passengers_user_id_idx on public.drive_passengers (user_id);
create index if not exists friendships_requester_id_idx on public.friendships (requester_id);
create index if not exists likes_user_id_idx on public.likes (user_id);
create index if not exists meet_attendees_user_id_idx on public.meet_attendees (user_id);
create index if not exists meets_club_id_idx on public.meets (club_id);
create index if not exists meets_host_id_idx on public.meets (host_id);
create index if not exists party_messages_user_id_idx on public.party_messages (user_id);
create index if not exists posts_drive_id_idx on public.posts (drive_id);
create index if not exists posts_party_id_idx on public.posts (party_id);
create index if not exists posts_vehicle_id_idx on public.posts (vehicle_id);
create index if not exists qr_scans_scanner_id_idx on public.qr_scans (scanner_id);
create index if not exists reports_reporter_id_idx on public.reports (reporter_id);
create index if not exists saves_user_id_idx on public.saves (user_id);
create index if not exists vehicle_maintenance_owner_id_idx on public.vehicle_maintenance (owner_id);

-- Funciones internas que no deben ser RPC públicas.
revoke execute on function public.generate_username() from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.join_party(text) from public;
grant execute on function public.join_party(text) to authenticated;

-- Las funciones de RLS (are_friends, can_view_*, is_*) se mantienen ejecutables
-- porque las políticas las invocan; su diseño SECURITY DEFINER es intencional.
