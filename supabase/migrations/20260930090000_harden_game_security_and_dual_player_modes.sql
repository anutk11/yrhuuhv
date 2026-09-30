-- Improved TriviaLive security/atomicity migration.
ALTER TABLE public.room_players DROP CONSTRAINT IF EXISTS room_players_user_id_fkey;
ALTER TABLE public.room_players DROP CONSTRAINT IF EXISTS room_players_user_id_profiles_fkey;
ALTER TABLE public.game_answers DROP CONSTRAINT IF EXISTS game_answers_user_id_fkey;
ALTER TABLE public.game_answers DROP CONSTRAINT IF EXISTS game_answers_user_id_profiles_fkey;

DROP POLICY IF EXISTS "Rooms viewable by authenticated" ON public.game_rooms;
DROP POLICY IF EXISTS "Rooms viewable by room members" ON public.game_rooms;
CREATE POLICY "Rooms viewable by room members"
ON public.game_rooms FOR SELECT TO authenticated
USING (host_id = auth.uid() OR public.is_room_member(id, auth.uid()));

CREATE OR REPLACE FUNCTION public.find_room_by_code(_room_code text)
RETURNS TABLE(id uuid, room_code text, room_name text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _room_code IS NULL OR _room_code !~ '^[0-9]{5}$' THEN RETURN; END IF;
  RETURN QUERY
  SELECT gr.id,gr.room_code,gr.room_name,gr.status
  FROM public.game_rooms gr
  WHERE gr.room_code=_room_code AND gr.status IN ('waiting','playing','paused')
  LIMIT 1;
END; $$;
REVOKE ALL ON FUNCTION public.find_room_by_code(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.find_room_by_code(text) TO authenticated,service_role;

DROP POLICY IF EXISTS "Questions viewable by authenticated" ON public.questions;
DROP POLICY IF EXISTS "Room members can view questions" ON public.questions;
CREATE POLICY "Hosts can view raw questions"
ON public.questions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.game_rooms gr
  WHERE gr.id=questions.room_id AND gr.host_id=auth.uid()
));

DROP VIEW IF EXISTS public.public_questions;
CREATE VIEW public.public_questions WITH (security_invoker=off) AS
SELECT q.id,q.room_id,q.question_text,q.options,q.question_type,q.time_limit,
       q.sort_order,q.media_url,q.media_type,q.image_view_time,q.keep_image,q.created_at,
       CASE
         WHEN gr.host_id=auth.uid() THEN q.correct_index
         WHEN gr.status='finished' THEN q.correct_index
         WHEN gr.current_question_index>q.sort_order THEN q.correct_index
         WHEN gr.current_question_index=q.sort_order
              AND gr.current_phase IN ('result','survey-result','leaderboard','stats')
           THEN q.correct_index
         ELSE NULL::integer
       END AS correct_index
FROM public.questions q
JOIN public.game_rooms gr ON gr.id=q.room_id
WHERE gr.host_id=auth.uid()
   OR EXISTS (
      SELECT 1 FROM public.room_players rp
      WHERE rp.room_id=gr.id AND rp.user_id=auth.uid()
   );
REVOKE ALL ON public.public_questions FROM anon;
GRANT SELECT ON public.public_questions TO authenticated,service_role;

DROP POLICY IF EXISTS "Users can update own presence" ON public.room_players;
CREATE OR REPLACE FUNCTION public.touch_room_presence(_room_id uuid,_is_connected boolean DEFAULT true)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _updated integer:=0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.room_players
  SET is_connected=COALESCE(_is_connected,true), last_seen=now()
  WHERE room_id=_room_id AND user_id=_uid;
  GET DIAGNOSTICS _updated=ROW_COUNT;
  RETURN _updated>0;
END; $$;
REVOKE ALL ON FUNCTION public.touch_room_presence(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.touch_room_presence(uuid,boolean) TO authenticated;

DROP POLICY IF EXISTS "Users can join rooms" ON public.room_players;
CREATE POLICY "Users can join rooms"
ON public.room_players FOR INSERT TO authenticated
WITH CHECK (
  auth.uid()=user_id
  AND EXISTS (
    SELECT 1 FROM public.game_rooms gr
    WHERE gr.id=room_id AND gr.status IN ('waiting','playing','paused')
  )
);

DROP POLICY IF EXISTS "Players can insert own answers" ON public.game_answers;
DROP POLICY IF EXISTS "Answers viewable by room participants" ON public.game_answers;
CREATE POLICY "Players can view own answers"
ON public.game_answers FOR SELECT TO authenticated
USING (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.game_answer_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.game_answer_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Room members can view answer events" ON public.game_answer_events;
CREATE POLICY "Room members can view answer events"
ON public.game_answer_events FOR SELECT TO authenticated
USING (public.is_room_member(room_id,auth.uid()));
REVOKE ALL ON public.game_answer_events FROM PUBLIC,anon;
GRANT SELECT ON public.game_answer_events TO authenticated;
GRANT ALL ON public.game_answer_events TO service_role;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_answer_events;

CREATE INDEX IF NOT EXISTS idx_game_answers_room_question ON public.game_answers(room_id,question_id);
CREATE INDEX IF NOT EXISTS idx_game_answers_user_question ON public.game_answers(user_id,question_id);
CREATE INDEX IF NOT EXISTS idx_room_players_room_connected ON public.room_players(room_id,is_connected);

CREATE OR REPLACE FUNCTION public.record_game_answer(
  _room_id uuid,_question_id uuid,_user_id uuid,_selected_index integer,_allow_late boolean DEFAULT false
)
RETURNS TABLE(ok boolean,score integer,is_correct boolean,duplicate boolean,answer_time_ms integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _room public.game_rooms%ROWTYPE;
  _question public.questions%ROWTYPE;
  _existing public.game_answers%ROWTYPE;
  _time_ms integer;
  _score integer:=0;
  _cw integer;
  _speed_factor numeric;
  _is_correct boolean:=false;
  _option_count integer;
BEGIN
  IF _room_id IS NULL OR _question_id IS NULL OR _user_id IS NULL THEN RAISE EXCEPTION 'Missing answer identifiers'; END IF;
  IF _selected_index<0 OR _selected_index>3 THEN RAISE EXCEPTION 'Invalid answer index'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.room_players WHERE room_id=_room_id AND user_id=_user_id)
    THEN RAISE EXCEPTION 'Player is not in room'; END IF;

  SELECT * INTO _room FROM public.game_rooms WHERE id=_room_id FOR UPDATE;
  IF _room.id IS NULL OR _room.status<>'playing' THEN RAISE EXCEPTION 'Room not active'; END IF;

  SELECT * INTO _question FROM public.questions WHERE id=_question_id AND room_id=_room_id;
  IF _question.id IS NULL THEN RAISE EXCEPTION 'Invalid question'; END IF;

  _option_count:=jsonb_array_length(COALESCE(_question.options,'[]'::jsonb));
  IF _selected_index>=_option_count THEN RAISE EXCEPTION 'Invalid answer index'; END IF;

  SELECT * INTO _existing
  FROM public.game_answers
  WHERE room_id=_room_id AND question_id=_question_id AND user_id=_user_id
  LIMIT 1;
  IF _existing.id IS NOT NULL THEN
    RETURN QUERY SELECT true,_existing.score,_existing.is_correct,true,_existing.answer_time_ms;
    RETURN;
  END IF;

  IF COALESCE(_question.sort_order,-1)<>COALESCE(_room.current_question_index,-1) AND NOT _allow_late
    THEN RAISE EXCEPTION 'Question not active'; END IF;
  IF NOT _allow_late AND COALESCE(_room.current_phase,'') NOT IN ('reading','answering')
    THEN RAISE EXCEPTION 'Phase closed'; END IF;
  IF _allow_late AND COALESCE(_question.sort_order,-1)>COALESCE(_room.current_question_index,-1)
    THEN RAISE EXCEPTION 'Future question not allowed'; END IF;

  IF COALESCE(_question.sort_order,-1)<COALESCE(_room.current_question_index,-1) THEN
    _time_ms:=GREATEST(0,COALESCE(_question.time_limit,15)*1000);
  ELSIF COALESCE(_room.current_phase,'')='reading' THEN
    _time_ms:=0;
  ELSE
    _time_ms:=LEAST(
      GREATEST(0,ROUND(EXTRACT(EPOCH FROM(now()-COALESCE(_room.phase_started_at,now())))*1000)::integer),
      GREATEST(1,COALESCE(_question.time_limit,15))*1000
    );
  END IF;

  _is_correct:=_question.question_type='trivia' AND _selected_index=_question.correct_index;
  _cw:=GREATEST(0,LEAST(100,COALESCE((_room.settings->>'correctness_weight')::integer,60)));

  IF _is_correct THEN
    _speed_factor:=GREATEST(
      0,
      1-(_time_ms::numeric/(GREATEST(1,COALESCE(_question.time_limit,15))*1000))
    );
    _score:=ROUND(
      (_cw/100.0)*1000+((100-_cw)/100.0)*1000*_speed_factor
    )::integer;
  END IF;

  INSERT INTO public.game_answers(
    room_id,question_id,user_id,selected_index,answer_time_ms,score,is_correct
  ) VALUES(_room_id,_question_id,_user_id,_selected_index,_time_ms,_score,_is_correct);

  UPDATE public.room_players
  SET score=score+_score,last_seen=now(),is_connected=true
  WHERE room_id=_room_id AND user_id=_user_id;

  INSERT INTO public.game_answer_events(room_id,question_id) VALUES(_room_id,_question_id);

  RETURN QUERY SELECT true,_score,_is_correct,false,_time_ms;
END; $$;

REVOKE ALL ON FUNCTION public.record_game_answer(uuid,uuid,uuid,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_game_answer(uuid,uuid,uuid,integer,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.get_question_answer_stats(_room_id uuid,_question_id uuid)
RETURNS TABLE(answered bigint,correct bigint,wrong bigint,vote_counts jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _phase text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_room_member(_room_id,auth.uid()) THEN
    RAISE EXCEPTION 'Not a room member';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.questions WHERE id=_question_id AND room_id=_room_id)
    THEN RAISE EXCEPTION 'Invalid question'; END IF;

  SELECT current_phase INTO _phase FROM public.game_rooms WHERE id=_room_id;

  SELECT COUNT(*)::bigint,
    CASE WHEN _phase IN('result','survey-result','leaderboard','stats')
      THEN COUNT(*) FILTER(WHERE is_correct)::bigint ELSE 0::bigint END,
    CASE WHEN _phase IN('result','survey-result','leaderboard','stats')
      THEN COUNT(*) FILTER(WHERE NOT is_correct)::bigint ELSE 0::bigint END
  INTO answered,correct,wrong
  FROM public.game_answers
  WHERE room_id=_room_id AND question_id=_question_id;

  IF _phase IN('result','survey-result','leaderboard','stats') THEN
    SELECT COALESCE(jsonb_agg(cnt ORDER BY idx),'[]'::jsonb)
    INTO vote_counts
    FROM (
      SELECT gs.idx,COUNT(ga.id)::integer cnt
      FROM generate_series(0,3) gs(idx)
      LEFT JOIN public.game_answers ga
        ON ga.room_id=_room_id AND ga.question_id=_question_id AND ga.selected_index=gs.idx
      GROUP BY gs.idx
    ) s;
  ELSE
    vote_counts='[0,0,0,0]'::jsonb;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.get_question_answer_stats(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_question_answer_stats(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_game_summary(_room_id uuid)
RETURNS TABLE(
  user_id uuid,display_name text,nickname text,score integer,correct_answers bigint,
  total_answers bigint,total_time_ms bigint,fastest_ms bigint,best_streak bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_room_member(_room_id,auth.uid())
    THEN RAISE EXCEPTION 'Not a room member'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.game_rooms WHERE id=_room_id AND status='finished')
    THEN RAISE EXCEPTION 'Game is not finished'; END IF;

  RETURN QUERY
  WITH ordered_answers AS(
    SELECT ga.user_id,q.sort_order,ga.is_correct,ga.answer_time_ms
    FROM public.game_answers ga JOIN public.questions q ON q.id=ga.question_id
    WHERE ga.room_id=_room_id
  ),
  grouped AS(
    SELECT oa.*,
      SUM(CASE WHEN oa.is_correct THEN 0 ELSE 1 END)
      OVER(PARTITION BY oa.user_id ORDER BY oa.sort_order ROWS UNBOUNDED PRECEDING) wrong_group
    FROM ordered_answers oa
  ),
  streak_lengths AS(
    SELECT user_id,wrong_group,COUNT(*) FILTER(WHERE is_correct)::bigint streak_len
    FROM grouped GROUP BY user_id,wrong_group
  ),
  answer_agg AS(
    SELECT user_id,
      COUNT(*) FILTER(WHERE is_correct)::bigint correct_answers,
      COUNT(*)::bigint total_answers,
      COALESCE(SUM(answer_time_ms),0)::bigint total_time_ms,
      COALESCE(MIN(answer_time_ms),0)::bigint fastest_ms
    FROM ordered_answers GROUP BY user_id
  ),
  streak_agg AS(
    SELECT user_id,COALESCE(MAX(streak_len),0)::bigint best_streak
    FROM streak_lengths GROUP BY user_id
  )
  SELECT rp.user_id,COALESCE(p.display_name,'')::text,COALESCE(p.nickname,'')::text,rp.score,
         COALESCE(aa.correct_answers,0)::bigint,COALESCE(aa.total_answers,0)::bigint,
         COALESCE(aa.total_time_ms,0)::bigint,COALESCE(aa.fastest_ms,0)::bigint,
         COALESCE(sa.best_streak,0)::bigint
  FROM public.room_players rp
  LEFT JOIN public.profiles p ON p.user_id=rp.user_id
  LEFT JOIN answer_agg aa ON aa.user_id=rp.user_id
  LEFT JOIN streak_agg sa ON sa.user_id=rp.user_id
  WHERE rp.room_id=_room_id
  ORDER BY rp.score DESC,rp.joined_at ASC;
END; $$;
REVOKE ALL ON FUNCTION public.get_game_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_game_summary(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rewind_question(_room_id uuid,_question_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _uid uuid:=auth.uid(); _host_id uuid; _target_index integer; _duration integer;
  _media_type text; _image_time integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT host_id INTO _host_id FROM public.game_rooms WHERE id=_room_id FOR UPDATE;
  IF _host_id IS NULL OR _host_id<>_uid THEN RAISE EXCEPTION 'Only the host can rewind questions'; END IF;

  SELECT sort_order,media_type,image_view_time
  INTO _target_index,_media_type,_image_time
  FROM public.questions WHERE id=_question_id AND room_id=_room_id;
  IF _target_index IS NULL THEN RAISE EXCEPTION 'Question not found'; END IF;

  FOR ans IN SELECT user_id,score FROM public.game_answers
    WHERE room_id=_room_id AND question_id=_question_id LOOP
    UPDATE public.room_players
    SET score=GREATEST(0,score-ans.score)
    WHERE room_id=_room_id AND user_id=ans.user_id;
  END LOOP;

  DELETE FROM public.game_answers WHERE room_id=_room_id AND question_id=_question_id;

  _duration:=CASE
    WHEN _media_type='video' THEN 9999
    WHEN _media_type='image' THEN GREATEST(0,COALESCE(_image_time,5))
    ELSE 3 END;

  UPDATE public.game_rooms
  SET current_question_index=_target_index,current_phase='reading',
      phase_started_at=now(),phase_duration_seconds=_duration,status='playing',updated_at=now()
  WHERE id=_room_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.rewind_question(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rewind_question(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.host_set_next_question(
  _room_id uuid,_expected_index integer,_to_index integer
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _uid uuid:=auth.uid(); _count integer; _duration integer; _media_type text; _image_time integer; _rows integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.game_rooms WHERE id=_room_id AND host_id=_uid)
    THEN RAISE EXCEPTION 'Only the host can navigate questions'; END IF;

  SELECT COUNT(*) INTO _count FROM public.questions WHERE room_id=_room_id;
  IF _to_index<0 OR _to_index>_count THEN RAISE EXCEPTION 'Target question out of range'; END IF;

  IF _to_index=_count THEN
    UPDATE public.game_rooms SET status='finished',current_phase='stats',
      phase_started_at=now(),phase_duration_seconds=0,updated_at=now()
    WHERE id=_room_id AND status='playing' AND current_question_index=_expected_index;
  ELSE
    SELECT media_type,image_view_time INTO _media_type,_image_time
    FROM public.questions WHERE room_id=_room_id AND sort_order=_to_index LIMIT 1;
    _duration:=CASE
      WHEN _media_type='video' THEN 9999
      WHEN _media_type='image' THEN GREATEST(0,COALESCE(_image_time,5))
      ELSE 3 END;
    UPDATE public.game_rooms
    SET current_question_index=_to_index,current_phase='reading',
        phase_started_at=now(),phase_duration_seconds=_duration,status='playing',updated_at=now()
    WHERE id=_room_id AND status='playing' AND current_question_index=_expected_index;
  END IF;

  GET DIAGNOSTICS _rows=ROW_COUNT;
  RETURN _rows>0;
END; $$;
REVOKE ALL ON FUNCTION public.host_set_next_question(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.host_set_next_question(uuid,integer,integer) TO authenticated,service_role;

DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='game_rooms_question_index_check') THEN
    ALTER TABLE public.game_rooms ADD CONSTRAINT game_rooms_question_index_check CHECK(current_question_index>=-1);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='game_rooms_phase_duration_check') THEN
    ALTER TABLE public.game_rooms ADD CONSTRAINT game_rooms_phase_duration_check CHECK(phase_duration_seconds>=0);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='questions_time_limit_check') THEN
    ALTER TABLE public.questions ADD CONSTRAINT questions_time_limit_check CHECK(time_limit>0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_room_phase(
  _room_id uuid,_expected_question_index integer,_expected_phase text,_next_phase text,
  _phase_duration_seconds integer,_next_question_index integer DEFAULT NULL,_next_status text DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _updated_rows integer:=0; _next_index integer; _allowed boolean:=false;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.game_rooms WHERE id=_room_id AND host_id=_uid)
    THEN RAISE EXCEPTION 'Only the host can change the game phase'; END IF;
  IF _expected_phase NOT IN('idle','reading','answering','result','survey-result','leaderboard','stats')
     OR _next_phase NOT IN('idle','reading','answering','result','survey-result','leaderboard','stats')
    THEN RAISE EXCEPTION 'Invalid phase'; END IF;
  IF _next_status IS NOT NULL AND _next_status NOT IN('waiting','playing','paused','finished')
    THEN RAISE EXCEPTION 'Invalid status'; END IF;

  _allowed :=
    (_expected_phase='idle' AND _next_phase='reading') OR
    (_expected_phase='reading' AND _next_phase='answering') OR
    (_expected_phase='answering' AND _next_phase IN('result','survey-result')) OR
    (_expected_phase IN('result','survey-result') AND _next_phase IN('reading','leaderboard','stats')) OR
    (_expected_phase='leaderboard' AND _next_phase IN('reading','stats')) OR
    (_expected_phase='stats' AND _next_phase='stats' AND _next_status='finished');

  IF NOT _allowed THEN RAISE EXCEPTION 'Illegal phase transition'; END IF;

  _next_index:=COALESCE(_next_question_index,_expected_question_index);
  IF _next_index<-1 OR _next_index>(
    SELECT COALESCE(MAX(sort_order),-1) FROM public.questions WHERE room_id=_room_id
  ) THEN RAISE EXCEPTION 'Question index out of range'; END IF;

  UPDATE public.game_rooms
  SET current_phase=_next_phase,phase_duration_seconds=GREATEST(_phase_duration_seconds,0),
      phase_started_at=now(),current_question_index=_next_index,
      status=COALESCE(_next_status,status),updated_at=now()
  WHERE id=_room_id AND current_question_index=_expected_question_index
    AND current_phase=_expected_phase AND status='playing';

  GET DIAGNOSTICS _updated_rows=ROW_COUNT;
  RETURN _updated_rows>0;
END; $$;
REVOKE ALL ON FUNCTION public.sync_room_phase(uuid,integer,text,text,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sync_room_phase(uuid,integer,text,text,integer,integer,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.advance_room_question(_room_id uuid,_from_index integer,_to_index integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _count integer; _rows integer:=0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.game_rooms WHERE id=_room_id AND host_id=_uid)
    THEN RAISE EXCEPTION 'Only the host can advance questions'; END IF;
  SELECT COUNT(*) INTO _count FROM public.questions WHERE room_id=_room_id;
  IF _to_index<0 OR _to_index>=_count THEN RAISE EXCEPTION 'Question index out of range'; END IF;
  UPDATE public.game_rooms SET current_question_index=_to_index,updated_at=now()
  WHERE id=_room_id AND status='playing' AND current_question_index=_from_index;
  GET DIAGNOSTICS _rows=ROW_COUNT;
  RETURN _rows>0;
END; $$;
REVOKE ALL ON FUNCTION public.advance_room_question(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.advance_room_question(uuid,integer,integer) TO authenticated,service_role;

CREATE TABLE IF NOT EXISTS public.question_folders(
  path text PRIMARY KEY,created_by uuid,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.question_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage question folders" ON public.question_folders;
CREATE POLICY "Admins can manage question folders"
ON public.question_folders FOR ALL TO authenticated
USING(public.has_role(auth.uid(),'admin'::public.app_role))
WITH CHECK(public.has_role(auth.uid(),'admin'::public.app_role));
REVOKE ALL ON public.question_folders FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.question_folders TO authenticated;
GRANT ALL ON public.question_folders TO service_role;
INSERT INTO public.question_folders(path,created_by)
SELECT DISTINCT q.folder,NULL FROM public.question_bank q
WHERE COALESCE(q.folder,'')<>'' ON CONFLICT(path) DO NOTHING;
