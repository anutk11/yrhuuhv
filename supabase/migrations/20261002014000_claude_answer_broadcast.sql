-- Broadcast an answer-count event without exposing answer data.
create or replace function public.broadcast_answer_count_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform realtime.send('{}'::jsonb,'answer_count','room:'||new.room_id::text,true);
  return new;
end;
$$;
drop trigger if exists trg_broadcast_answer_count on public.game_answers;
create trigger trg_broadcast_answer_count
after insert on public.game_answers
for each row execute function public.broadcast_answer_count_event();
revoke all on function public.broadcast_answer_count_event() from public,anon,authenticated;
grant execute on function public.broadcast_answer_count_event() to service_role;
