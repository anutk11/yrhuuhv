
-- Claude Code security/scale hardening for yrhuuhv.
-- New migration: never edit previous migrations.

create extension if not exists pg_cron with schema pg_catalog;

-- =========================================================
-- STEP 1-4: room access, presence, privacy, codes, rate limits
-- =========================================================

alter table public.game_rooms
  add column if not exists phase_ends_at timestamptz,
  add column if not exists paused_remaining_ms integer,
  add column if not exists phase_elapsed_before_pause_ms integer not null default 0;

update public.game_rooms
set settings = settings || jsonb_build_object('allow_late_press', coalesce((settings->>'allow_late_press')::boolean, true))
where not (settings ? 'allow_late_press');

alter table public.game_rooms
  drop constraint if exists game_rooms_room_code_format_check;

alter table public.game_rooms
  add constraint game_rooms_room_code_format_check
  check (room_code ~ '^[0-9]{5,6}$');

create or replace function public.generate_room_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _code text;
begin
  loop
    _code := lpad((floor(random() * 1000000))::integer::text, 6, '0');
    exit when not exists(select 1 from public.game_rooms where room_code=_code);
  end loop;
  return _code;
end;
$$;

revoke all on function public.generate_room_code() from public, anon;
grant execute on function public.generate_room_code() to authenticated, service_role;

create or replace function public.create_game_room(_room_name text, _settings jsonb default '{}'::jsonb)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  _row public.game_rooms;
  _uid uuid := auth.uid();
  _settings jsonb;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  _settings := jsonb_build_object(
    'correctness_weight', 60,
    'show_leaderboard_every', 2,
    'default_time_limit', 15,
    'result_display_seconds', 5,
    'leaderboard_display_seconds', 5,
    'allow_late_press', true
  ) || coalesce(_settings, '{}'::jsonb);

  insert into public.game_rooms(room_code, host_id, room_name, settings)
  values(public.generate_room_code(), _uid, coalesce(nullif(trim(_room_name),''),'משחק חדש'), _settings)
  returning * into _row;

  return _row;
end;
$$;

revoke all on function public.create_game_room(text,jsonb) from public, anon;
grant execute on function public.create_game_room(text,jsonb) to authenticated;

drop policy if exists "Rooms viewable by authenticated" on public.game_rooms;
drop policy if exists "Rooms viewable by room members" on public.game_rooms;
create policy "Rooms viewable by room members"
on public.game_rooms for select to authenticated
using (
  host_id = (select auth.uid())
  or public.is_room_member(id, (select auth.uid()))
  or public.has_role((select auth.uid()), 'admin')
);

drop policy if exists "Admins can create rooms" on public.game_rooms;
create policy "Authenticated users can create own rooms"
on public.game_rooms for insert to authenticated
with check (
  host_id = (select auth.uid())
  or public.has_role((select auth.uid()), 'admin')
);

revoke insert on public.game_rooms from anon, authenticated;
grant insert on public.game_rooms to authenticated; -- RPC uses definer privileges; retained for backward-compatible tooling.
revoke all on public.game_rooms from anon;

create table if not exists public.room_join_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_start timestamptz not null,
  attempts integer not null default 0,
  primary key(user_id,bucket_start)
);
alter table public.room_join_rate_limits enable row level security;
revoke all on public.room_join_rate_limits from public, anon, authenticated;
grant all on public.room_join_rate_limits to service_role;

create or replace function public.join_room(_room_code text)
returns table(room_id uuid,status text,room_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _room public.game_rooms;
  _bucket timestamptz := date_trunc('minute', now());
  _attempts integer;
  _exists boolean;
  _capacity integer;
  _count integer;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if _room_code is null or trim(_room_code) !~ '^[0-9]{5,6}$' then
    raise exception 'ROOM_CODE_INVALID';
  end if;

  insert into public.room_join_rate_limits(user_id,bucket_start,attempts)
  values(_uid,_bucket,1)
  on conflict(user_id,bucket_start) do update
    set attempts=public.room_join_rate_limits.attempts+1;
  select attempts into _attempts
  from public.room_join_rate_limits
  where user_id=_uid and bucket_start=_bucket;
  if _attempts > 20 then raise exception 'ROOM_RATE_LIMIT'; end if;

  select * into _room
  from public.game_rooms
  where lower(trim(room_code)) = lower(trim(_room_code))
    and status in ('waiting','playing','paused')
  limit 1
  for update;

  if _room.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  if _room.status = 'finished' then raise exception 'ROOM_CLOSED'; end if;

  select exists(
    select 1 from public.room_players
    where room_id=_room.id and user_id=_uid
  ) into _exists;

  _capacity := greatest(1, coalesce(nullif((_room.settings->>'max_players')::integer,0),500));
  select count(*) into _count from public.room_players where room_id=_room.id;
  if not _exists and _count >= _capacity then raise exception 'ROOM_FULL'; end if;

  insert into public.room_players(room_id,user_id,is_connected,last_seen)
  values(_room.id,_uid,true,now())
  on conflict(room_id,user_id) do update
    set is_connected=true,last_seen=now();

  return query select _room.id,_room.status,_room.room_name;
end;
$$;

revoke all on function public.join_room(text) from public, anon;
grant execute on function public.join_room(text) to authenticated;

create or replace function public.set_my_presence(_room_id uuid,_connected boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare _uid uuid:=auth.uid(); _n integer;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  update public.room_players
  set is_connected=coalesce(_connected,false),last_seen=now()
  where room_id=_room_id and user_id=_uid;
  get diagnostics _n=row_count;
  return _n>0;
end;
$$;
revoke all on function public.set_my_presence(uuid,boolean) from public,anon;
grant execute on function public.set_my_presence(uuid,boolean) to authenticated;

-- Keep legacy helper but expand the accepted code width.
create or replace function public.find_room_by_code(_room_code text)
returns table(id uuid,room_code text,room_name text,status text)
language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if _room_code is null or trim(_room_code) !~ '^[0-9]{5,6}$' then return; end if;
  return query
  select gr.id,gr.room_code,gr.room_name,gr.status
  from public.game_rooms gr
  where lower(trim(gr.room_code))=lower(trim(_room_code))
    and gr.status in ('waiting','playing','paused')
  limit 1;
end;
$$;
revoke all on function public.find_room_by_code(text) from public,anon;
grant execute on function public.find_room_by_code(text) to authenticated,service_role;

-- Profiles must not be cross-readable.
drop policy if exists "Profiles viewable by authenticated" on public.profiles;
drop policy if exists "Profiles viewable by room members" on public.profiles;
create policy "Users view own profile or admins"
on public.profiles for select to authenticated
using ((select auth.uid())=user_id or public.has_role((select auth.uid()),'admin'));

update public.profiles
set display_name='שחקן '||right(replace(user_id::text,'-',''),4),
    nickname='שחקן '||right(replace(user_id::text,'-',''),4)
where display_name ilike '%@%'
   or nickname ilike '%@%';

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path=public
as $$
declare _display text; _nick text;
begin
  _display := nullif(trim(NEW.raw_user_meta_data->>'display_name'),'');
  _nick := nullif(trim(NEW.raw_user_meta_data->>'nickname'),'');
  if _display is null or _display ilike '%@%' then _display := 'שחקן '||right(replace(NEW.id::text,'-',''),4); end if;
  if _nick is null or _nick ilike '%@%' then _nick := _display; end if;

  insert into public.profiles(user_id,display_name,nickname)
  values(NEW.id,_display,_nick)
  on conflict(user_id) do update
    set display_name=excluded.display_name,nickname=excluded.nickname;

  insert into public.user_roles(user_id,role)
  values(NEW.id,'user')
  on conflict do nothing;
  return NEW;
end;
$$;
revoke all on function public.handle_new_user() from public,anon,authenticated;

create or replace function public.get_room_players(_room_id uuid)
returns table(
  user_id uuid,
  display_name text,
  nickname text,
  is_connected boolean,
  is_phone boolean,
  score integer,
  phone_number text
)
language plpgsql security definer set search_path=public
as $$
declare _uid uuid:=auth.uid(); _host boolean;
begin
  if _uid is null or not public.is_room_member(_room_id,_uid) then raise exception 'Not a room member'; end if;
  select host_id=_uid or public.has_role(_uid,'admin') into _host from public.game_rooms where id=_room_id;

  return query
  select rp.user_id,
    case
      when p.user_id is not null then coalesce(nullif(trim(p.display_name),''),nullif(trim(p.nickname),''),'שחקן')
      when roster.player_name is not null then roster.player_name
      else '••••'||right(split_part(rp.user_id::text,'-',5),4)
    end as display_name,
    case
      when p.user_id is not null then coalesce(nullif(trim(p.nickname),''),nullif(trim(p.display_name),''),'')
      when roster.player_name is not null then roster.player_name
      else '••••'||right(split_part(rp.user_id::text,'-',5),4)
    end as nickname,
    rp.is_connected,
    (p.user_id is null and split_part(rp.user_id::text,'-',5) ~ '^[0-9]{12}$') as is_phone,
    rp.score,
    case when _host then roster.phone_number else null end as phone_number
  from public.room_players rp
  left join public.profiles p on p.user_id=rp.user_id
  left join lateral (
    select pr.phone_number,pr.player_name
    from public.player_roster pr
    where right(regexp_replace(pr.phone_number,'\D','','g'),12)=right(split_part(rp.user_id::text,'-',5),12)
    order by pr.updated_at desc
    limit 1
  ) roster on true
  where rp.room_id=_room_id
  order by rp.joined_at asc;
end;
$$;
revoke all on function public.get_room_players(uuid) from public,anon;
grant execute on function public.get_room_players(uuid) to authenticated,service_role;

drop policy if exists "Room players viewable by authenticated" on public.room_players;
drop policy if exists "Room players viewable by room members" on public.room_players;
create policy "Room players viewable by room members"
on public.room_players for select to authenticated
using (user_id=(select auth.uid()) or public.is_room_member(room_id,(select auth.uid())));
drop policy if exists "Users can join rooms" on public.room_players;
drop policy if exists "Users can update own presence" on public.room_players;
revoke insert,update from anon,authenticated on public.room_players;
revoke delete from anon;
grant delete on public.room_players to authenticated;
drop policy if exists "Hosts can delete players" on public.room_players;
create policy "Hosts can delete players"
on public.room_players for delete to authenticated
using (exists(select 1 from public.game_rooms gr where gr.id=room_id and (gr.host_id=(select auth.uid()) or public.has_role((select auth.uid()),'admin'))));

-- =========================================================
-- STEP 2 + 6: answer privacy and atomic scoring
-- =========================================================

drop policy if exists "Players can view own answers" on public.game_answers;
drop policy if exists "Answers viewable by room members" on public.game_answers;
drop policy if exists "Answers viewable by room participants" on public.game_answers;
create policy "Players can view own answers or host can view"
on public.game_answers for select to authenticated
using (
  user_id=(select auth.uid())
  or exists(select 1 from public.game_rooms gr where gr.id=room_id and (gr.host_id=(select auth.uid()) or public.has_role((select auth.uid()),'admin')))
);
revoke insert,update,delete on public.game_answers from anon,authenticated;

create or replace function public.get_answer_counts(_room_id uuid,_question_id uuid)
returns table(selected_index integer,count bigint)
language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null or not public.is_room_member(_room_id,auth.uid()) then raise exception 'Not a room member'; end if;
  if not exists(select 1 from public.questions where id=_question_id and room_id=_room_id) then raise exception 'Invalid question'; end if;
  return query
  select ga.selected_index,count(*)::bigint
  from public.game_answers ga
  join public.game_rooms gr on gr.id=ga.room_id
  where ga.room_id=_room_id and ga.question_id=_question_id
    and (gr.current_phase in ('result','survey-result','leaderboard','stats') or gr.status='finished')
  group by ga.selected_index
  order by ga.selected_index;
end;
$$;
revoke all on function public.get_answer_counts(uuid,uuid) from public,anon;
grant execute on function public.get_answer_counts(uuid,uuid) to authenticated,service_role;

create or replace function public.record_game_answer(
  _room_id uuid,_question_id uuid,_user_id uuid,_selected_index integer,_allow_late boolean default false
)
returns table(ok boolean,score integer,is_correct boolean,duplicate boolean,answer_time_ms integer)
language plpgsql security definer set search_path=public
as $$
declare
  r public.game_rooms;
  q public.questions;
  existing public.game_answers;
  _time integer;
  _score integer:=0;
  _cw integer;
  _speed numeric;
  _correct boolean:=false;
  _allow boolean:=false;
  _options integer;
begin
  if _room_id is null or _question_id is null or _user_id is null then raise exception 'Missing answer identifiers'; end if;
  if _selected_index < 0 or _selected_index > 3 then raise exception 'Invalid answer index'; end if;

  select * into r from public.game_rooms where id=_room_id for update;
  if r.id is null or r.status<>'playing' then raise exception 'Room not active'; end if;
  if not exists(select 1 from public.room_players where room_id=_room_id and user_id=_user_id)
    then raise exception 'Player is not in room'; end if;
  select * into q from public.questions where id=_question_id and room_id=_room_id;
  if q.id is null then raise exception 'Invalid question'; end if;
  _options:=jsonb_array_length(coalesce(q.options,'[]'::jsonb));
  if _selected_index>=_options then raise exception 'Invalid answer index'; end if;

  select * into existing from public.game_answers
  where room_id=_room_id and question_id=_question_id and user_id=_user_id
  limit 1;
  if existing.id is not null then
    return query select true,existing.score,existing.is_correct,true,existing.answer_time_ms;
    return;
  end if;

  _allow := _allow_late and coalesce((r.settings->>'allow_late_press')::boolean,true);
  if q.sort_order <> r.current_question_index and not _allow then raise exception 'Question not active'; end if;
  if not _allow and r.current_phase not in ('reading','answering') then raise exception 'Phase closed'; end if;
  if _allow and q.sort_order > r.current_question_index then raise exception 'Future question not allowed'; end if;

  if q.sort_order < r.current_question_index then
    _time:=greatest(0,coalesce(q.time_limit,15)*1000);
  elsif r.current_phase='reading' then
    _time:=0;
  else
    _time:=least(
      greatest(0,coalesce(r.phase_elapsed_before_pause_ms,0)+
        round(extract(epoch from(now()-coalesce(r.phase_started_at,now())))*1000)::integer),
      greatest(1,coalesce(q.time_limit,15))*1000
    );
  end if;

  _correct := q.question_type='trivia' and _selected_index=q.correct_index;
  _cw:=greatest(0,least(100,coalesce((r.settings->>'correctness_weight')::integer,60)));
  if _correct then
    _speed:=greatest(0,1-(_time::numeric/(greatest(1,coalesce(q.time_limit,15))*1000)));
    _score:=round((_cw/100.0)*1000+((100-_cw)/100.0)*1000*_speed)::integer;
  end if;

  insert into public.game_answers(room_id,question_id,user_id,selected_index,answer_time_ms,score,is_correct)
  values(_room_id,_question_id,_user_id,_selected_index,_time,_score,_correct);

  return query select true,_score,_correct,false,_time;
end;
$$;

revoke all on function public.record_game_answer(uuid,uuid,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.record_game_answer(uuid,uuid,uuid,integer,boolean) to service_role;

create or replace function public.add_answer_score()
returns trigger
language plpgsql security definer set search_path=public
as $$
begin
  update public.room_players
  set score=score+new.score,last_seen=now(),is_connected=true
  where room_id=new.room_id and user_id=new.user_id;
  return new;
end;
$$;
drop trigger if exists trg_game_answer_add_score on public.game_answers;
create trigger trg_game_answer_add_score
after insert on public.game_answers
for each row execute function public.add_answer_score();
revoke all on function public.add_answer_score() from public,anon,authenticated;
grant execute on function public.add_answer_score() to service_role;

-- keep the existing stats RPC, but make sure it uses aggregated counts only pre-reveal
create or replace function public.get_question_answer_stats(_room_id uuid,_question_id uuid)
returns table(answered bigint,correct bigint,wrong bigint,vote_counts jsonb)
language plpgsql security definer set search_path=public
as $$
declare _phase text;
begin
  if auth.uid() is null or not public.is_room_member(_room_id,auth.uid()) then raise exception 'Not a room member'; end if;
  select current_phase into _phase from public.game_rooms where id=_room_id;
  select count(*)::bigint,
    case when _phase in('result','survey-result','leaderboard','stats') then count(*) filter(where is_correct)::bigint else 0 end,
    case when _phase in('result','survey-result','leaderboard','stats') then count(*) filter(where not is_correct)::bigint else 0 end
  into answered,correct,wrong
  from public.game_answers where room_id=_room_id and question_id=_question_id;
  select coalesce(jsonb_agg(cnt order by idx),'[]'::jsonb) into vote_counts
  from (
    select gs.idx,count(ga.id)::integer cnt
    from generate_series(0,3) gs(idx)
    left join public.game_answers ga
      on ga.room_id=_room_id and ga.question_id=_question_id and ga.selected_index=gs.idx
    group by gs.idx
  ) s;
  if _phase not in('result','survey-result','leaderboard','stats') then vote_counts='[0,0,0,0]'::jsonb; end if;
end;
$$;
revoke all on function public.get_question_answer_stats(uuid,uuid) from public,anon;
grant execute on function public.get_question_answer_stats(uuid,uuid) to authenticated,service_role;

-- =========================================================
-- STEP 4: AI quotas + webhook failed-code throttling
-- =========================================================

create table if not exists public.ai_generation_rate_limits(
  user_id uuid primary key references auth.users(id) on delete cascade,
  hour_start timestamptz not null,
  hour_count integer not null default 0,
  day_start date not null,
  day_count integer not null default 0
);
alter table public.ai_generation_rate_limits enable row level security;
revoke all on public.ai_generation_rate_limits from public,anon,authenticated;
grant all on public.ai_generation_rate_limits to service_role;

create or replace function public.consume_ai_generation_quota(_user_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare r public.ai_generation_rate_limits; _hour timestamptz:=date_trunc('hour',now()); _day date:=current_date;
begin
  if not exists(select 1 from public.user_roles where user_id=_user_id and role='admin')
     and not exists(select 1 from public.game_rooms where host_id=_user_id) then
    return false;
  end if;
  insert into public.ai_generation_rate_limits(user_id,hour_start,hour_count,day_start,day_count)
  values(_user_id,_hour,1,_day,1)
  on conflict(user_id) do update
    set hour_start=case when public.ai_generation_rate_limits.hour_start<>_hour then _hour else public.ai_generation_rate_limits.hour_start end,
        hour_count=case when public.ai_generation_rate_limits.hour_start<>_hour then 1 else public.ai_generation_rate_limits.hour_count+1 end,
        day_start=case when public.ai_generation_rate_limits.day_start<>_day then _day else public.ai_generation_rate_limits.day_start end,
        day_count=case when public.ai_generation_rate_limits.day_start<>_day then 1 else public.ai_generation_rate_limits.day_count+1 end
  returning * into r;
  return r.hour_count<=10 and r.day_count<=50;
end;
$$;
revoke all on function public.consume_ai_generation_quota(uuid) from public,anon,authenticated;
grant execute on function public.consume_ai_generation_quota(uuid) to service_role;

create table if not exists public.phone_failed_login_limits(
  phone_hash text not null,
  bucket_start timestamptz not null,
  attempts integer not null default 0,
  primary key(phone_hash,bucket_start)
);
alter table public.phone_failed_login_limits enable row level security;
revoke all on public.phone_failed_login_limits from public,anon,authenticated;
grant all on public.phone_failed_login_limits to service_role;

create or replace function public.allow_phone_login_attempt(_phone text)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare _bucket timestamptz:=date_trunc('minute',now()); _hash text:=md5(regexp_replace(coalesce(_phone,''),'\D','','g')); _n integer;
begin
  insert into public.phone_failed_login_limits(phone_hash,bucket_start,attempts)
  values(_hash,_bucket,1)
  on conflict(phone_hash,bucket_start) do update
    set attempts=public.phone_failed_login_limits.attempts+1;
  select attempts into _n from public.phone_failed_login_limits where phone_hash=_hash and bucket_start=_bucket;
  return _n<=10;
end;
$$;
revoke all on function public.allow_phone_login_attempt(text) from public,anon,authenticated;
grant execute on function public.allow_phone_login_attempt(text) to service_role;

-- =========================================================
-- STEP 5: server-driven phase machine + broadcast
-- =========================================================

create or replace function public.server_now()
returns timestamptz
language sql stable
security definer
set search_path=public
as $$ select now(); $$;
revoke all on function public.server_now() from public,anon;
grant execute on function public.server_now() to authenticated,service_role;

create or replace function public.room_reading_duration(_question public.questions)
returns integer
language sql stable
as $$
  select case
    when coalesce(_question.media_type,'')='video' and coalesce(_question.media_url,'')<>'' then 9999
    when coalesce(_question.media_type,'')='image' and coalesce(_question.media_url,'')<>'' then greatest(0,coalesce(_question.image_view_time,5))
    else 3
  end;
$$;
revoke all on function public.room_reading_duration(public.questions) from public,anon,authenticated;
grant execute on function public.room_reading_duration(public.questions) to service_role;

create or replace function public.advance_room_phase_locked(_room_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare
  r public.game_rooms;
  q public.questions;
  nq public.questions;
  d integer;
  next_idx integer;
  every_n integer;
  qnum integer;
begin
  select * into r from public.game_rooms where id=_room_id for update;
  if r.id is null or r.status<>'playing' or (r.phase_ends_at is not null and r.phase_ends_at>now()) then return false; end if;

  if r.current_phase='idle' then
    select * into q from public.questions where room_id=_room_id order by sort_order limit 1;
    if q.id is null then return false; end if;
    d:=public.room_reading_duration(q);
    update public.game_rooms set current_question_index=q.sort_order,current_phase='reading',
      phase_started_at=now(),phase_ends_at=now()+make_interval(secs=>d),phase_duration_seconds=d,
      phase_elapsed_before_pause_ms=0,paused_remaining_ms=null,updated_at=now()
    where id=_room_id;
    return true;
  end if;

  select * into q from public.questions where room_id=_room_id and sort_order=r.current_question_index limit 1;
  if q.id is null then return false; end if;

  if r.current_phase='reading' then
    d:=greatest(1,coalesce(q.time_limit,15));
    update public.game_rooms set current_phase='answering',phase_started_at=now(),
      phase_ends_at=now()+make_interval(secs=>d),phase_duration_seconds=d,
      phase_elapsed_before_pause_ms=0,paused_remaining_ms=null,updated_at=now()
    where id=_room_id;
    return true;
  end if;

  if r.current_phase='answering' then
    d:=case when q.question_type='survey' then coalesce((r.settings->>'result_display_seconds')::integer,6)
            else coalesce((r.settings->>'result_display_seconds')::integer,5) end;
    update public.game_rooms set current_phase=case when q.question_type='survey' then 'survey-result' else 'result' end,
      phase_started_at=now(),phase_ends_at=now()+make_interval(secs=>greatest(0,d)),
      phase_duration_seconds=greatest(0,d),phase_elapsed_before_pause_ms=0,paused_remaining_ms=null,updated_at=now()
    where id=_room_id;
    return true;
  end if;

  if r.current_phase in ('result','survey-result') then
    select count(*) into qnum from public.questions where room_id=_room_id and sort_order<=r.current_question_index;
    select * into nq from public.questions where room_id=_room_id and sort_order>r.current_question_index order by sort_order limit 1;
    if nq.id is null then
      d:=5;
      update public.game_rooms set current_phase='stats',phase_started_at=now(),
        phase_ends_at=now()+make_interval(secs=>d),phase_duration_seconds=d,
        phase_elapsed_before_pause_ms=0,paused_remaining_ms=null,updated_at=now();
    else
      every_n:=greatest(1,coalesce((r.settings->>'show_leaderboard_every')::integer,2));
      if mod(qnum,every_n)=0 then
        d:=coalesce((r.settings->>'leaderboard_display_seconds')::integer,5);
        update public.game_rooms set current_phase='leaderboard',phase_started_at=now(),
          phase_ends_at=now()+make_interval(secs=>greatest(0,d)),phase_duration_seconds=greatest(0,d),
          phase_elapsed_before_pause_ms=0,paused_remaining_ms=null,updated_at=now();
      else
        d:=public.room_reading_duration(nq);
        update public.game_rooms set current_question_index=nq.sort_order,current_phase='reading',
          phase_started_at=now(),phase_ends_at=now()+make_interval(secs=>d),phase_duration_seconds=d,
          phase_elapsed_before_pause_ms=0,paused_remaining_ms=null,updated_at=now();
      end if;
    end if;
    return true;
  end if;

  if r.current_phase='leaderboard' then
    select * into nq from public.questions where room_id=_room_id and sort_order>r.current_question_index order by sort_order limit 1;
    if nq.id is null then
      d:=5;
      update public.game_rooms set current_phase='stats',phase_started_at=now(),
        phase_ends_at=now()+make_interval(secs=>d),phase_duration_seconds=d,
        phase_elapsed_before_pause_ms=0,paused_remaining_ms=null,updated_at=now();
    else
      d:=public.room_reading_duration(nq);
      update public.game_rooms set current_question_index=nq.sort_order,current_phase='reading',
        phase_started_at=now(),phase_ends_at=now()+make_interval(secs=>d),phase_duration_seconds=d,
        phase_elapsed_before_pause_ms=0,paused_remaining_ms=null,updated_at=now();
    end if;
    return true;
  end if;

  if r.current_phase='stats' then
    update public.game_rooms set status='finished',phase_ends_at=null,phase_duration_seconds=0,
      updated_at=now() where id=_room_id;
    return true;
  end if;

  return false;
end;
$$;
revoke all on function public.advance_room_phase_locked(uuid) from public,anon,authenticated;
grant execute on function public.advance_room_phase_locked(uuid) to service_role;

create or replace function public.tick_rooms()
returns integer
language plpgsql security definer set search_path=public
as $$
declare _id uuid; _n integer:=0;
begin
  for _id in
    select id from public.game_rooms
    where status='playing' and phase_ends_at is not null and phase_ends_at<=now()
    order by phase_ends_at
    for update skip locked
    limit 100
  loop
    if public.advance_room_phase_locked(_id) then _n:=_n+1; end if;
  end loop;
  return _n;
end;
$$;
revoke all on function public.tick_rooms() from public,anon,authenticated;
grant execute on function public.tick_rooms() to service_role;

create or replace function public.sync_room_phase(
  _room_id uuid,_expected_question_index integer,_expected_phase text,_next_phase text,
  _phase_duration_seconds integer,_next_question_index integer default null,_next_status text default null
)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare
  _uid uuid:=auth.uid(); _n integer; _duration integer:=greatest(0,_phase_duration_seconds);
begin
  if _uid is null or not exists(select 1 from public.game_rooms where id=_room_id and host_id=_uid) then raise exception 'Only the host can change the game phase'; end if;
  if _next_phase not in('idle','reading','answering','result','survey-result','leaderboard','stats') then raise exception 'Invalid phase'; end if;
  update public.game_rooms
  set current_phase=_next_phase,
      current_question_index=coalesce(_next_question_index,current_question_index),
      status=coalesce(_next_status,status),
      phase_started_at=now(),
      phase_ends_at=case when _duration>0 then now()+make_interval(secs=>_duration) else now() end,
      phase_duration_seconds=_duration,
      phase_elapsed_before_pause_ms=0,paused_remaining_ms=null,updated_at=now()
  where id=_room_id and current_question_index=_expected_question_index
    and current_phase=_expected_phase and status='playing';
  get diagnostics _n=row_count;
  return _n>0;
end;
$$;
revoke all on function public.sync_room_phase(uuid,integer,text,text,integer,integer,text) from public,anon;
grant execute on function public.sync_room_phase(uuid,integer,text,text,integer,integer,text) to authenticated,service_role;

create or replace function public.host_set_game_status(_room_id uuid,_status text)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare r public.game_rooms; _remaining integer;
begin
  select * into r from public.game_rooms where id=_room_id for update;
  if r.id is null or r.host_id<>(select auth.uid()) then raise exception 'Only the host can change game status'; end if;
  if _status='paused' then
    if r.status<>'playing' then return false; end if;
    _remaining:=greatest(0,coalesce(round(extract(epoch from(r.phase_ends_at-now()))*1000)::integer, r.phase_duration_seconds*1000));
    update public.game_rooms
    set status='paused',paused_remaining_ms=_remaining,
      phase_elapsed_before_pause_ms=coalesce(r.phase_elapsed_before_pause_ms,0)+
        case when r.phase_started_at is not null then greatest(0,round(extract(epoch from(now()-r.phase_started_at))*1000)::integer) else 0 end,
      phase_ends_at=null,updated_at=now();
    return true;
  elsif _status='playing' then
    if r.status<>'paused' then return false; end if;
    _remaining:=greatest(0,coalesce(r.paused_remaining_ms,0));
    update public.game_rooms
    set status='playing',phase_started_at=now(),
      phase_ends_at=case when _remaining>0 then now()+make_interval(secs=>(_remaining/1000.0)) else now() end,
      phase_duration_seconds=ceil(_remaining/1000.0)::integer,
      paused_remaining_ms=null,updated_at=now();
    return true;
  else
    raise exception 'Invalid game status';
  end if;
end;
$$;
revoke all on function public.host_set_game_status(uuid,text) from public,anon;
grant execute on function public.host_set_game_status(uuid,text) to authenticated,service_role;

create or replace function public.video_ended(_room_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare _uid uuid:=auth.uid(); _q public.questions; _n integer; _d integer;
begin
  if _uid is null or not public.is_room_member(_room_id,_uid) then raise exception 'Not a room member'; end if;
  select q.* into _q from public.questions q join public.game_rooms gr on gr.id=q.room_id
  where q.room_id=_room_id and q.sort_order=gr.current_question_index and gr.current_phase='reading' and gr.status='playing';
  if _q.id is null or coalesce(_q.media_type,'')<>'video' then return false; end if;
  _d:=greatest(1,coalesce(_q.time_limit,15));
  update public.game_rooms set current_phase='answering',phase_started_at=now(),
    phase_ends_at=now()+make_interval(secs=>_d),phase_duration_seconds=_d,
    phase_elapsed_before_pause_ms=0,paused_remaining_ms=null,updated_at=now()
  where id=_room_id and status='playing' and current_phase='reading';
  get diagnostics _n=row_count;
  return _n>0;
end;
$$;
revoke all on function public.video_ended(uuid) from public,anon;
grant execute on function public.video_ended(uuid) to authenticated,service_role;

create index if not exists idx_game_rooms_active_phase_end
  on public.game_rooms(phase_ends_at)
  where status='playing' and phase_ends_at is not null;

create index if not exists idx_questions_room_sort on public.questions(room_id,sort_order);
create index if not exists idx_game_answers_room on public.game_answers(room_id);
create index if not exists idx_room_players_user_joined on public.room_players(user_id,joined_at desc);
create index if not exists idx_room_players_room_score on public.room_players(room_id,score desc);
create index if not exists idx_game_rooms_host on public.game_rooms(host_id);

drop index if exists public.room_players_room_user_unique;

-- Realtime: private Broadcast only. Public access must be disabled in Dashboard.
create or replace function public.broadcast_game_room_state()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'status',new.status,
      'phase',new.current_phase,
      'question_index',new.current_question_index,
      'phase_started_at',new.phase_started_at,
      'phase_ends_at',new.phase_ends_at,
      'phase_duration_seconds',new.phase_duration_seconds
    ),
    'room_state',
    'room:'||new.id::text,
    true
  );
  return new;
end;
$$;
drop trigger if exists trg_broadcast_game_room_state on public.game_rooms;
create trigger trg_broadcast_game_room_state
after update on public.game_rooms
for each row execute function public.broadcast_game_room_state();
revoke all on function public.broadcast_game_room_state() from public,anon,authenticated;

create or replace function public.broadcast_room_player_event()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  perform realtime.send('{}'::jsonb,'room_presence','room:'||coalesce(new.room_id,old.room_id)::text,true);
  return coalesce(new,old);
end;
$$;
drop trigger if exists trg_broadcast_room_player_event on public.room_players;
create trigger trg_broadcast_room_player_event
after insert or delete on public.room_players
for each row execute function public.broadcast_room_player_event();
revoke all on function public.broadcast_room_player_event() from public,anon,authenticated;

do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_rooms') then
      execute 'alter publication supabase_realtime drop table public.game_rooms';
    end if;
    if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_players') then
      execute 'alter publication supabase_realtime drop table public.room_players';
    end if;
    if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_answers') then
      execute 'alter publication supabase_realtime drop table public.game_answers';
    end if;
    if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='questions') then
      execute 'alter publication supabase_realtime drop table public.questions';
    end if;
    if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_answer_events') then
      execute 'alter publication supabase_realtime drop table public.game_answer_events';
    end if;
  end if;
end $$;

drop policy if exists "authenticated can receive broadcasts" on realtime.messages;
create policy "authenticated room members can receive broadcasts"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension='broadcast'
  and exists(
    select 1 from public.room_players rp
    where rp.user_id=(select auth.uid())
      and ('room:'||rp.room_id::text)=(select realtime.topic())
  )
);

drop policy if exists "authenticated can send broadcasts" on realtime.messages;
revoke all on realtime.messages from anon;

-- Cron jobs: one-second phase tick when pg_cron supports 6-field schedules.
do $block$
begin
  if not exists(select 1 from cron.job where jobname='quiz-tick-rooms') then
    perform cron.schedule('quiz-tick-rooms','* * * * * *',$job$select public.tick_rooms();$job$);
  end if;
  if not exists(select 1 from cron.job where jobname='quiz-retention') then
    perform cron.schedule('quiz-retention','15 3 * * *',$job$
      delete from public.phone_call_state where updated_at < now() - interval '24 hours';
      delete from public.room_join_rate_limits where bucket_start < now() - interval '2 hours';
      delete from public.phone_failed_login_limits where bucket_start < now() - interval '2 hours';
      delete from public.ai_generation_rate_limits where day_start < current_date - 7;
    $job$);
  end if;
exception when undefined_table then
  null;
end
$block$;

-- =========================================================
-- STEP 6: leaderboard + set-based history snapshot
-- =========================================================

create or replace function public.get_leaderboard(_room_id uuid,_limit integer default 10)
returns table(user_id uuid,display_name text,score integer,rank integer,total_players integer,is_me boolean)
language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null or not public.is_room_member(_room_id,auth.uid()) then raise exception 'Not a room member'; end if;
  return query
  with ranked as (
    select rp.user_id,rp.score,row_number() over(order by rp.score desc,rp.joined_at asc) as rnk,
           count(*) over()::integer as total
    from public.room_players rp
    where rp.room_id=_room_id
  ),
  names as (
    select * from public.get_room_players(_room_id)
  )
  select r.user_id,coalesce(n.display_name,'שחקן'),r.score,r.rnk::integer,r.total,(r.user_id=auth.uid())
  from ranked r
  left join names n on n.user_id=r.user_id
  where r.rnk<=greatest(1,least(coalesce(_limit,10),100))
     or r.user_id=auth.uid()
  order by r.rnk;
end;
$$;
revoke all on function public.get_leaderboard(uuid,integer) from public,anon;
grant execute on function public.get_leaderboard(uuid,integer) to authenticated,service_role;

create or replace function public.snapshot_game_history()
returns trigger
language plpgsql security definer set search_path=public
as $$
declare _hid uuid;
begin
  if new.status='finished' and old.status is distinct from 'finished' then
    select id into _hid from public.game_history where room_id=new.id order by finished_at desc limit 1;
    if _hid is null then
      insert into public.game_history(room_id,room_name,room_code,host_id,questions_count,players_count,rankings,finished_at)
      select new.id,new.room_name,new.room_code,new.host_id,
        (select count(*) from public.questions where room_id=new.id)::integer,
        count(*)::integer,
        coalesce(jsonb_agg(jsonb_build_object('user_id',rp.user_id,'score',rp.score,'display_name',coalesce(p.display_name,''),'nickname',coalesce(p.nickname,'')) order by rp.score desc,rp.joined_at asc),'[]'::jsonb),
        now()
      from public.room_players rp
      left join public.profiles p on p.user_id=rp.user_id
      where rp.room_id=new.id
      returning id into _hid;

      insert into public.game_history_players(history_id,user_id,display_name,nickname,score,joined_at,is_phone)
      select _hid,rp.user_id,coalesce(p.display_name,''),coalesce(p.nickname,''),rp.score,rp.joined_at,
             (p.user_id is null)
      from public.room_players rp left join public.profiles p on p.user_id=rp.user_id
      where rp.room_id=new.id on conflict do nothing;

      insert into public.game_history_questions(history_id,question_id,sort_order,question_text,options,correct_index,question_type,time_limit,media_url,media_type,image_view_time,keep_image)
      select _hid,q.id,q.sort_order,q.question_text,q.options,q.correct_index,q.question_type,q.time_limit,q.media_url,q.media_type,q.image_view_time,q.keep_image
      from public.questions q where q.room_id=new.id on conflict do nothing;

      insert into public.game_history_answers(history_id,question_id,user_id,selected_index,answer_time_ms,score,is_correct,created_at)
      select _hid,ga.question_id,ga.user_id,ga.selected_index,ga.answer_time_ms,ga.score,ga.is_correct,ga.created_at
      from public.game_answers ga where ga.room_id=new.id on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_snapshot_game_history on public.game_rooms;
create trigger trg_snapshot_game_history after update on public.game_rooms
for each row execute function public.snapshot_game_history();
revoke all on function public.snapshot_game_history() from public,anon,authenticated;
grant execute on function public.snapshot_game_history() to service_role;

-- Host rewind now remains one atomic RPC, and score subtraction is paired with answer deletion.
create or replace function public.rewind_question(_room_id uuid,_question_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare _uid uuid:=auth.uid(); _target integer; _media text; _img integer; _total integer;
begin
  if _uid is null or not exists(select 1 from public.game_rooms where id=_room_id and host_id=_uid) then raise exception 'Only the host can rewind questions'; end if;
  select sort_order,media_type,image_view_time into _target,_media,_img
  from public.questions where id=_question_id and room_id=_room_id;
  if _target is null then raise exception 'Question not found'; end if;

  update public.room_players rp
  set score=greatest(0,rp.score-coalesce(a.total_score,0))
  from (
    select user_id,sum(score)::integer total_score
    from public.game_answers where room_id=_room_id and question_id=_question_id group by user_id
  ) a
  where rp.room_id=_room_id and rp.user_id=a.user_id;

  delete from public.game_answers where room_id=_room_id and question_id=_question_id;

  _total:=case when _media='video' then 9999 when _media='image' then greatest(0,coalesce(_img,5)) else 3 end;
  update public.game_rooms set current_question_index=_target,current_phase='reading',status='playing',
    phase_started_at=now(),phase_ends_at=now()+make_interval(secs=>_total),phase_duration_seconds=_total,
    phase_elapsed_before_pause_ms=0,paused_remaining_ms=null,updated_at=now()
  where id=_room_id;
  return true;
end;
$$;
revoke all on function public.rewind_question(uuid,uuid) from public,anon;
grant execute on function public.rewind_question(uuid,uuid) to authenticated,service_role;

-- =========================================================
-- STEP 7: active-room phone lookup in one DB call
-- =========================================================

create or replace function public.phone_poll_state(_user_id uuid)
returns table(
  room_id uuid,status text,current_question_index integer,current_phase text,
  phase_started_at timestamptz,phase_ends_at timestamptz,phase_duration_seconds integer,
  player_score integer,pending_param text,answered_current boolean
)
language plpgsql security definer set search_path=public
as $$
begin
  return query
  with membership as (
    select rp.room_id,rp.score,rp.joined_at
    from public.room_players rp
    where rp.user_id=_user_id
    order by rp.joined_at desc
    limit 5
  ),
  active as (
    select gr.*,m.score
    from membership m join public.game_rooms gr on gr.id=m.room_id
    where gr.status in('waiting','playing','paused')
    order by m.joined_at desc
    limit 1
  )
  select a.id,a.status,a.current_question_index,a.current_phase,a.phase_started_at,a.phase_ends_at,
         a.phase_duration_seconds,a.score,pcs.pending_param,
         exists(
           select 1 from public.questions q join public.game_answers ga on ga.question_id=q.id
           where q.room_id=a.id and q.sort_order=a.current_question_index and ga.room_id=a.id and ga.user_id=_user_id
         )
  from active a
  left join public.phone_call_state pcs on pcs.room_id=a.id and pcs.user_id=_user_id;
end;
$$;
revoke all on function public.phone_poll_state(uuid) from public,anon,authenticated;
grant execute on function public.phone_poll_state(uuid) to service_role;

-- Ensure the room/player hot paths have useful indexes.
create index if not exists idx_game_answers_room_question_user
  on public.game_answers(room_id,question_id,user_id);

-- =========================================================
-- Safety comments/documentation for the phone-id collision risk.
-- The client currently derives a synthetic UUID from the last 12 digits.
-- This is intentionally not migrated here because roster mapping depends on it.
-- =========================================================
comment on function public.phone_poll_state(uuid) is
  'Single-round-trip active room lookup for IVR. Synthetic phone UUID still uses last 12 digits; migrate only with roster-compatible mapping.';
