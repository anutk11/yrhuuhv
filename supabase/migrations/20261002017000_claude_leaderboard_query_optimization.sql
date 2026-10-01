-- Optimize leaderboard name lookup: rank/count over indexed room rows,
-- then join only the rows actually returned to display.
create or replace function public.get_leaderboard(_room_id uuid,_limit integer default 10)
returns table(user_id uuid,display_name text,score integer,rank integer,total_players integer,is_me boolean)
language plpgsql security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not public.is_room_member(_room_id,auth.uid()) then
    raise exception 'Not a room member';
  end if;

  return query
  with ranked as (
    select
      rp.user_id,
      rp.score,
      row_number() over(order by rp.score desc,rp.joined_at asc) as rnk,
      count(*) over()::integer as total
    from public.room_players rp
    where rp.room_id=_room_id
  ),
  wanted as (
    select * from ranked
    where rnk<=greatest(1,least(coalesce(_limit,10),100))
       or user_id=auth.uid()
  )
  select
    w.user_id,
    coalesce(nullif(trim(p.display_name),''),nullif(trim(p.nickname),''),'שחקן') as display_name,
    w.score,
    w.rnk::integer,
    w.total,
    (w.user_id=auth.uid()) as is_me
  from wanted w
  left join public.profiles p on p.user_id=w.user_id
  order by w.rnk;
end;
$$;

revoke all on function public.get_leaderboard(uuid,integer) from public,anon;
grant execute on function public.get_leaderboard(uuid,integer) to authenticated,service_role;
