
-- Integrity follow-up: room rows are created through the server-generated-code RPC.
revoke insert on public.game_rooms from authenticated;
drop policy if exists "Authenticated users can create own rooms" on public.game_rooms;

-- Keep an explicit RLS policy for the RPC's execution context if tooling temporarily
-- performs a direct insert through a privileged session.
create policy "Hosts can create own rooms"
on public.game_rooms for insert to authenticated
with check ((select auth.uid()) = host_id);

-- Ensure central/raw question correctness is not exposed to normal room members.
drop policy if exists "Room members can view questions" on public.questions;
drop policy if exists "Questions viewable by authenticated" on public.questions;
create policy "Hosts can view raw questions"
on public.questions for select to authenticated
using (
  exists (
    select 1 from public.game_rooms gr
    where gr.id=questions.room_id
      and (gr.host_id=(select auth.uid()) or public.has_role((select auth.uid()),'admin'))
  )
);
