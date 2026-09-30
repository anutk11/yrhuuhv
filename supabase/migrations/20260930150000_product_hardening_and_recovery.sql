-- Product hardening batch: question versioning, drafts, favorites, duplicate detection,
-- pre-game validation, host recovery/heartbeat, user administration and personal stats.

ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS content_hash text;

UPDATE public.question_bank
SET status = COALESCE(status, 'published'),
    source_type = COALESCE(source_type, CASE WHEN source_question_id IS NOT NULL THEN 'copied' ELSE 'manual' END);

ALTER TABLE public.question_bank
  DROP CONSTRAINT IF EXISTS question_bank_status_check,
  DROP CONSTRAINT IF EXISTS question_bank_source_type_check;

ALTER TABLE public.question_bank
  ADD CONSTRAINT question_bank_status_check CHECK (status IN ('draft','published','archived')),
  ADD CONSTRAINT question_bank_source_type_check CHECK (source_type IN ('manual','ai','copied','saved_from_game','imported'));

CREATE INDEX IF NOT EXISTS idx_question_bank_owner_status
  ON public.question_bank(owner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_question_bank_content_hash
  ON public.question_bank(content_hash);

CREATE OR REPLACE FUNCTION public.question_bank_make_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.content_hash := md5(
    lower(regexp_replace(trim(COALESCE(NEW.question_text,'')), '\\s+', ' ', 'g'))
    || '|' ||
    lower(regexp_replace(COALESCE(NEW.options::text,'[]'), '\\s+', ' ', 'g'))
    || '|' || COALESCE(NEW.question_type,'')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_question_bank_make_hash ON public.question_bank;
CREATE TRIGGER trg_question_bank_make_hash
BEFORE INSERT OR UPDATE OF question_text, options, question_type
ON public.question_bank
FOR EACH ROW EXECUTE FUNCTION public.question_bank_make_hash();

UPDATE public.question_bank q
SET content_hash = md5(
  lower(regexp_replace(trim(COALESCE(q.question_text,'')), '\\s+', ' ', 'g'))
  || '|' || lower(regexp_replace(COALESCE(q.options::text,'[]'), '\\s+', ' ', 'g'))
  || '|' || COALESCE(q.question_type,'')
)
WHERE q.content_hash IS NULL;

CREATE TABLE IF NOT EXISTS public.question_bank_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  question_text text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_index integer NOT NULL DEFAULT 0,
  question_type text NOT NULL DEFAULT 'trivia',
  time_limit integer NOT NULL DEFAULT 15,
  category text NOT NULL DEFAULT 'כללי',
  folder text NOT NULL DEFAULT 'כללי',
  media_url text,
  media_type text,
  media_path text,
  image_view_time integer NOT NULL DEFAULT 5,
  keep_image boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'published',
  source_type text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(question_id, version_no)
);
ALTER TABLE public.question_bank_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own or central question versions" ON public.question_bank_versions;
CREATE POLICY "Users can view own or central question versions"
ON public.question_bank_versions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.question_bank q
    WHERE q.id = question_id
      AND (q.bank_scope='central' OR q.owner_id=auth.uid() OR public.has_role(auth.uid(),'admin'))
  )
);
REVOKE ALL ON public.question_bank_versions FROM PUBLIC, anon;
GRANT SELECT ON public.question_bank_versions TO authenticated;
GRANT ALL ON public.question_bank_versions TO service_role;

CREATE OR REPLACE FUNCTION public.snapshot_question_bank_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _next integer;
BEGIN
  SELECT COALESCE(MAX(version_no),0)+1 INTO _next
  FROM public.question_bank_versions
  WHERE question_id=NEW.id;

  INSERT INTO public.question_bank_versions(
    question_id,version_no,question_text,options,correct_index,question_type,time_limit,
    category,folder,media_url,media_type,media_path,image_view_time,keep_image,
    status,source_type,created_by
  )
  VALUES(
    NEW.id,_next,NEW.question_text,COALESCE(NEW.options,'[]'::jsonb),COALESCE(NEW.correct_index,0),
    COALESCE(NEW.question_type,'trivia'),COALESCE(NEW.time_limit,15),COALESCE(NEW.category,'כללי'),
    COALESCE(NEW.folder,'כללי'),NEW.media_url,NEW.media_type,NEW.media_path,
    COALESCE(NEW.image_view_time,5),COALESCE(NEW.keep_image,false),
    COALESCE(NEW.status,'published'),COALESCE(NEW.source_type,'manual'),NEW.created_by
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_question_bank_version ON public.question_bank;
CREATE TRIGGER trg_snapshot_question_bank_version
AFTER INSERT OR UPDATE ON public.question_bank
FOR EACH ROW EXECUTE FUNCTION public.snapshot_question_bank_version();

CREATE TABLE IF NOT EXISTS public.question_bank_favorites(
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,question_id)
);
ALTER TABLE public.question_bank_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own question favorites" ON public.question_bank_favorites;
CREATE POLICY "Users manage own question favorites"
ON public.question_bank_favorites FOR ALL TO authenticated
USING (user_id=auth.uid())
WITH CHECK (user_id=auth.uid());
REVOKE ALL ON public.question_bank_favorites FROM PUBLIC,anon;
GRANT SELECT,INSERT,DELETE ON public.question_bank_favorites TO authenticated;
GRANT ALL ON public.question_bank_favorites TO service_role;

CREATE OR REPLACE FUNCTION public.find_question_bank_duplicates(
  _question_id uuid,
  _limit integer DEFAULT 10
)
RETURNS TABLE(id uuid,question_text text,bank_scope text,owner_id uuid,status text,similarity_score real)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _hash text; _owner uuid; _scope text; _text text;
BEGIN
  SELECT q.content_hash,q.owner_id,q.bank_scope,q.question_text
  INTO _hash,_owner,_scope,_text
  FROM public.question_bank q
  WHERE q.id=_question_id;

  IF _text IS NULL THEN RAISE EXCEPTION 'Question not found'; END IF;

  RETURN QUERY
  SELECT q.id,q.question_text,q.bank_scope,q.owner_id,q.status,
         CASE WHEN q.content_hash=_hash THEN 1.0::real ELSE 0.0::real END
  FROM public.question_bank q
  WHERE q.id<>_question_id
    AND q.status<>'archived'
    AND (
      q.content_hash=_hash
      OR (
        q.bank_scope='central'
        OR q.owner_id=_owner
        OR public.has_role(auth.uid(),'admin')
      )
    )
    AND (
      q.bank_scope='central'
      OR q.owner_id=auth.uid()
      OR public.has_role(auth.uid(),'admin')
    )
  ORDER BY CASE WHEN q.content_hash=_hash THEN 0 ELSE 1 END, q.created_at DESC
  LIMIT GREATEST(1,LEAST(COALESCE(_limit,10),50));
END;
$$;
REVOKE ALL ON FUNCTION public.find_question_bank_duplicates(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.find_question_bank_duplicates(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_game_before_start(_room_id uuid)
RETURNS TABLE(ok boolean,error_count integer,warnings jsonb,errors jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _errors jsonb:='[]'::jsonb; _warnings jsonb:='[]'::jsonb; _count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.game_rooms WHERE id=_room_id AND host_id=auth.uid()
  ) THEN RAISE EXCEPTION 'Only the host can validate this game'; END IF;

  SELECT COUNT(*) INTO _count FROM public.questions WHERE room_id=_room_id;
  IF _count=0 THEN
    _errors:=_errors || jsonb_build_array('אין שאלות במשחק');
  END IF;

  IF EXISTS(SELECT 1 FROM public.questions WHERE room_id=_room_id
            AND (trim(COALESCE(question_text,''))='' OR jsonb_array_length(COALESCE(options,'[]'::jsonb))<2)) THEN
    _errors:=_errors || jsonb_build_array('קיימות שאלות ללא טקסט או עם פחות משתי תשובות');
  END IF;

  IF EXISTS(SELECT 1 FROM public.questions WHERE room_id=_room_id
            AND question_type='trivia' AND (correct_index IS NULL OR correct_index<0
              OR correct_index>=jsonb_array_length(COALESCE(options,'[]'::jsonb)))) THEN
    _errors:=_errors || jsonb_build_array('קיימות שאלות טריוויה ללא תשובה נכונה תקינה');
  END IF;

  IF EXISTS(SELECT 1 FROM public.questions WHERE room_id=_room_id AND COALESCE(time_limit,0)<=0) THEN
    _errors:=_errors || jsonb_build_array('קיימות שאלות ללא זמן מענה תקין');
  END IF;

  IF EXISTS(
    SELECT 1 FROM (
      SELECT md5(lower(regexp_replace(trim(question_text),'\\s+',' ','g'))) h,COUNT(*) c
      FROM public.questions WHERE room_id=_room_id
      GROUP BY 1 HAVING COUNT(*)>1
    ) d
  ) THEN
    _warnings:=_warnings || jsonb_build_array('יש שאלות כפולות או כמעט זהות במשחק');
  END IF;

  IF EXISTS(SELECT 1 FROM public.questions WHERE room_id=_room_id AND media_url IS NOT NULL AND trim(media_url)<>'') THEN
    _warnings:=_warnings || jsonb_build_array('יש שאלות עם מדיה; יש לוודא שהקבצים זמינים לפני תחילת המשחק');
  END IF;

  RETURN QUERY SELECT jsonb_array_length(_errors)=0, jsonb_array_length(_errors), _warnings, _errors;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_game_before_start(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.validate_game_before_start(uuid) TO authenticated,service_role;

ALTER TABLE public.game_rooms
  ADD COLUMN IF NOT EXISTS host_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS host_recovery_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.host_heartbeat(_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _rows integer;
BEGIN
  UPDATE public.game_rooms
  SET host_last_seen_at=now(),updated_at=now()
  WHERE id=_room_id AND host_id=auth.uid() AND status IN ('waiting','playing','paused');
  GET DIAGNOSTICS _rows=ROW_COUNT;
  RETURN _rows>0;
END;
$$;
REVOKE ALL ON FUNCTION public.host_heartbeat(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.host_heartbeat(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.recover_game_room(_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _rows integer;
BEGIN
  UPDATE public.game_rooms
  SET status='playing',
      host_last_seen_at=now(),
      host_recovery_count=COALESCE(host_recovery_count,0)+1,
      updated_at=now()
  WHERE id=_room_id
    AND host_id=auth.uid()
    AND status IN ('playing','paused')
    AND EXISTS(SELECT 1 FROM public.questions q WHERE q.room_id=_room_id);
  GET DIAGNOSTICS _rows=ROW_COUNT;
  RETURN _rows>0;
END;
$$;
REVOKE ALL ON FUNCTION public.recover_game_room(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recover_game_room(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _target_role public.app_role; _admin_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF _user_id IS NULL OR _user_id=auth.uid() THEN RAISE EXCEPTION 'Cannot delete yourself'; END IF;

  SELECT role INTO _target_role FROM public.user_roles WHERE user_id=_user_id LIMIT 1;
  IF _target_role='admin' THEN
    SELECT COUNT(*) INTO _admin_count FROM public.user_roles WHERE role='admin';
    IF _admin_count<=1 THEN RAISE EXCEPTION 'Cannot delete the last admin'; END IF;
  END IF;

  DELETE FROM auth.users WHERE id=_user_id;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_personal_game_stats(_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(games_played bigint,games_hosted bigint,total_score bigint,average_score numeric,
              total_correct bigint,total_answers bigint,best_score bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF auth.uid() IS NULL OR (_user_id<>auth.uid() AND NOT public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  RETURN QUERY
  WITH my_games AS (
    SELECT h.id,h.host_id,
      COALESCE((
        SELECT (r.value->>'score')::integer
        FROM jsonb_array_elements(COALESCE(h.rankings,'[]'::jsonb)) r(value)
        WHERE (r.value->>'user_id')::uuid=_user_id
        LIMIT 1
      ),0)::bigint AS score
    FROM public.game_history h
    WHERE public.can_view_game_history(h.id,_user_id)
  ),
  answer_stats AS (
    SELECT COUNT(*)::bigint AS total_answers,
           COUNT(*) FILTER (WHERE a.is_correct)::bigint AS total_correct
    FROM public.game_history_answers a
    JOIN my_games g ON g.id=a.history_id
    WHERE a.user_id=_user_id
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE host_id=_user_id)::bigint,
    COALESCE(SUM(score),0)::bigint,
    COALESCE(AVG(score),0)::numeric,
    (SELECT total_correct FROM answer_stats),
    (SELECT total_answers FROM answer_stats),
    COALESCE(MAX(score),0)::bigint
  FROM my_games;
END;
$$;
REVOKE ALL ON FUNCTION public.get_personal_game_stats(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_personal_game_stats(uuid) TO authenticated;

-- Backfill the first immutable version for every existing bank question.
INSERT INTO public.question_bank_versions(
  question_id,version_no,question_text,options,correct_index,question_type,time_limit,
  category,folder,media_url,media_type,media_path,image_view_time,keep_image,
  status,source_type,created_by
)
SELECT q.id,1,q.question_text,COALESCE(q.options,'[]'::jsonb),COALESCE(q.correct_index,0),
       COALESCE(q.question_type,'trivia'),COALESCE(q.time_limit,15),COALESCE(q.category,'כללי'),
       COALESCE(q.folder,'כללי'),q.media_url,q.media_type,q.media_path,
       COALESCE(q.image_view_time,5),COALESCE(q.keep_image,false),
       COALESCE(q.status,'published'),COALESCE(q.source_type,'manual'),q.created_by
FROM public.question_bank q
WHERE NOT EXISTS(
  SELECT 1 FROM public.question_bank_versions v WHERE v.question_id=q.id
);
