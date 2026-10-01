-- Make manual next/previous controls participate in server-side timing.
create or replace function public.host_set_next_question(
  _room_id uuid,_expected_index integer,_to_index integer
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  _uid uuid:=auth.uid(); _max integer; _duration integer; _media_type text; _image_time integer; _rows integer;
begin
  if _uid is null or not exists(select 1 from public.game_rooms where id=_room_id and host_id=_uid) then
    raise exception 'Only the host can navigate questions';
  end if;

  select coalesce(max(sort_order),-1) into _max from public.questions where room_id=_room_id;
  if _to_index<0 or _to_index>_max+1 then raise exception 'Target question out of range'; end if;

  if _to_index=_max+1 then
    update public.game_rooms
    set status='finished',current_phase='stats',phase_started_at=now(),
        phase_ends_at=now()+interval '5 seconds',phase_duration_seconds=5,
        paused_remaining_ms=null,phase_elapsed_before_pause_ms=0,updated_at=now()
    where id=_room_id and status='playing' and current_question_index=_expected_index;
  else
    select media_type,image_view_time into _media_type,_image_time
    from public.questions where room_id=_room_id and sort_order=_to_index limit 1;
    _duration:=case
      when _media_type='video' then 9999
      when _media_type='image' then greatest(0,coalesce(_image_time,5))
      else 3 end;

    update public.game_rooms
    set current_question_index=_to_index,current_phase='reading',
        phase_started_at=now(),
        phase_ends_at=case when _duration>0 then now()+make_interval(secs=>_duration) else now() end,
        phase_duration_seconds=_duration,status='playing',
        paused_remaining_ms=null,phase_elapsed_before_pause_ms=0,updated_at=now()
    where id=_room_id and status='playing' and current_question_index=_expected_index;
  end if;

  get diagnostics _rows=row_count;
  return _rows>0;
end;
$$;
revoke all on function public.host_set_next_question(uuid,integer,integer) from public,anon;
grant execute on function public.host_set_next_question(uuid,integer,integer) to authenticated,service_role;
