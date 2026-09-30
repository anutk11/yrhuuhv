CREATE OR REPLACE FUNCTION public.snapshot_game_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _rankings jsonb;
  _qcount integer;
  _pcount integer;
BEGIN
  IF NEW.status = 'finished' AND (OLD.status IS DISTINCT FROM 'finished') THEN
    SELECT COUNT(*) INTO _qcount FROM public.questions WHERE room_id = NEW.id;

    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t.score) DESC), '[]'::jsonb), COUNT(*)
      INTO _rankings, _pcount
    FROM (
      SELECT rp.user_id, rp.score, p.display_name, p.nickname
      FROM public.room_players rp
      LEFT JOIN public.profiles p ON p.user_id = rp.user_id
      WHERE rp.room_id = NEW.id
    ) t;

    INSERT INTO public.game_history
      (room_id, room_name, room_code, host_id, questions_count, players_count, rankings, finished_at)
    VALUES
      (NEW.id, NEW.room_name, NEW.room_code, NEW.host_id, _qcount, COALESCE(_pcount, 0), COALESCE(_rankings, '[]'::jsonb), now());
  END IF;
  RETURN NEW;
END;
$function$;