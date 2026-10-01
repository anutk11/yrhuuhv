-- PII hardening: roster contains raw phone numbers and is never a general-user table.
drop policy if exists "Authenticated can view roster" on public.player_roster;
drop policy if exists "Admins can view roster" on public.player_roster;
create policy "Admins can view roster"
on public.player_roster for select to authenticated
using (public.has_role((select auth.uid()),'admin'));
