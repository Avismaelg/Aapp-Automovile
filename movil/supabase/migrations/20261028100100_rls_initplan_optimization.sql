-- Evalúa auth.uid() una vez por consulta, no una vez por fila.
do $$
declare
  policy_row record;
  role_sql text;
  command_sql text;
  using_sql text;
  check_sql text;
  statement text;
begin
  for policy_row in
    select schemaname, tablename, policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%')
  loop
    role_sql := array_to_string(policy_row.roles, ', ');
    command_sql := case policy_row.cmd
      when 'SELECT' then 'SELECT'
      when 'INSERT' then 'INSERT'
      when 'UPDATE' then 'UPDATE'
      when 'DELETE' then 'DELETE'
      else 'ALL'
    end;
    using_sql := replace(policy_row.qual, 'auth.uid()', '(select auth.uid())');
    check_sql := replace(policy_row.with_check, 'auth.uid()', '(select auth.uid())');

    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
    statement := format(
      'create policy %I on %I.%I for %s to %s',
      policy_row.policyname, policy_row.schemaname, policy_row.tablename, command_sql, role_sql
    );
    if using_sql is not null then statement := statement || ' using (' || using_sql || ')'; end if;
    if check_sql is not null then statement := statement || ' with check (' || check_sql || ')'; end if;
    execute statement;
  end loop;
end $$;

-- meet_attendees tenía una política ALL y otra SELECT que se evaluaban juntas.
drop policy if exists meet_attendees_all on public.meet_attendees;
drop policy if exists meet_attendees_select on public.meet_attendees;
create policy meet_attendees_select on public.meet_attendees for select using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.meets m
    where m.id = meet_attendees.meet_id
      and (m.privacy = 'public'::public.privacy_level or m.host_id = (select auth.uid()) or (m.club_id is not null and private.is_club_member(m.club_id)))
  )
);
create policy meet_attendees_insert on public.meet_attendees for insert with check (user_id = (select auth.uid()));
create policy meet_attendees_update on public.meet_attendees for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy meet_attendees_delete on public.meet_attendees for delete using (user_id = (select auth.uid()));
