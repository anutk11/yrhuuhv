-- Host-controlled start: put room into a server-ticked idle state.
create or replace function public.host_start_game(_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare _uid uuid:=auth.uid(); _n integer;
begin
  if _uid is null or not exists(select 1 from public.game_rooms where id=_room_id and host_id=_uid) then
    raise exception 'Only the host can start the game';
  end if;
  if not exists(select 1 from public.questions where room_id=_room_id) then
    raise exception 'No questions in game';
  end if;

  update public.game_rooms
  set status='playing',
      current_question_index=-1,
      current_phase='idle',
      phase_started_at=now(),
      phase_ends_at=now(),
      phase_duration_seconds=0,
      phase_elapsed_before_pause_ms=0,
      paused_remaining_ms=null,
      updated_at=now()
  where id=_room_id and status in ('waiting','paused');

  get diagnostics _n=row_count;
  return _n>0;
end;
$$;
revoke all on function public.host_start_game(uuid) from public,anon;
grant execute on function public.host_start_game(uuid) to authenticated,service_role;
