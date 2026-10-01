-- Realtime authorization and presence update hardening.
drop policy if exists "authenticated room members can receive broadcasts" on realtime.messages;

create policy "room hosts admins and members can receive broadcasts"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1
    from public.game_rooms gr
    where ('room:' || gr.id::text) = realtime.topic()
      and (
        gr.host_id = (select auth.uid())
        or public.has_role((select auth.uid()), 'admin')
        or exists (
          select 1
          from public.room_players rp
          where rp.room_id = gr.id
            and rp.user_id = (select auth.uid())
        )
      )
  )
);

drop trigger if exists trg_broadcast_room_player_event on public.room_players;
create trigger trg_broadcast_room_player_event
after insert or update of is_connected or delete on public.room_players
for each row execute function public.broadcast_room_player_event();

-- The phone path uses service_role and may update presence frequently.
create index if not exists idx_room_players_room_connected
  on public.room_players(room_id,is_connected,last_seen desc);
