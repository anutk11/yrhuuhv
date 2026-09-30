-- User-owned question banks, central bank, durable folders, and per-user game-history snapshots.
-- This migration intentionally keeps live game questions separate from the bank:
-- a room always plays from public.questions, while bank edits affect only future games.

ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS bank_scope text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_question_id uuid REFERENCES public.question_bank(id) ON DELETE SET NULL;

-- Rows that existed before private banks were introduced are the shared central bank.
UPDATE public.question_bank
SET bank_scope = 'central', owner_id = NULL
WHERE owner_id IS NULL;

ALTER TABLE public.question_bank
  DROP CONSTRAINT IF EXISTS question_bank_scope_check,
  DROP CONSTRAINT IF EXISTS question_bank_owner_check,
  DROP CONSTRAINT IF EXISTS question_bank_private_creator_check;

ALTER TABLE public.question_bank
  ADD CONSTRAINT question_bank_scope_check
    CHECK (bank_scope IN ('private','central')),
  ADD CONSTRAINT question_bank_owner_check
    CHECK (
      (bank_scope = 'central' AND owner_id IS NULL)
      OR
      (bank_scope = 'private' AND owner_id IS NOT NULL)
    ),
  ADD CONSTRAINT question_bank_private_creator_check
    CHECK (
      bank_scope = 'central'
      OR created_by = owner_id
    );

CREATE INDEX IF NOT EXISTS idx_question_bank_private_owner
  ON public.question_bank(owner_id, created_at DESC)
  WHERE bank_scope = 'private';

CREATE INDEX IF NOT EXISTS idx_question_bank_central
  ON public.question_bank(created_at DESC)
  WHERE bank_scope = 'central';

CREATE INDEX IF NOT EXISTS idx_question_bank_source
  ON public.question_bank(source_question_id);

DROP POLICY IF EXISTS "Question bank viewable by authenticated" ON public.question_bank;
DROP POLICY IF EXISTS "Admins can view question bank" ON public.question_bank;
DROP POLICY IF EXISTS "Admins can manage question bank" ON public.question_bank;

CREATE POLICY "Users can view central or own question bank"
ON public.question_bank FOR SELECT TO authenticated
USING (
  bank_scope = 'central'
  OR owner_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can create private bank questions"
ON public.question_bank FOR INSERT TO authenticated
WITH CHECK (
  (bank_scope = 'private' AND owner_id = auth.uid() AND created_by = auth.uid())
  OR
  (bank_scope = 'central' AND public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Users can edit own bank questions"
ON public.question_bank FOR UPDATE TO authenticated
USING (
  owner_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  (
    bank_scope = 'private'
    AND owner_id = auth.uid()
    AND created_by = auth.uid()
  )
  OR
  (
    bank_scope = 'central'
    AND public.has_role(auth.uid(), 'admin')
    AND owner_id IS NULL
  )
);

CREATE POLICY "Users can delete own bank questions"
ON public.question_bank FOR DELETE TO authenticated
USING (
  owner_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);

-- Folder ownership: same folder path can exist independently for different users.
ALTER TABLE public.question_folders
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.question_folders
SET scope = 'central', owner_id = NULL
WHERE owner_id IS NULL;

ALTER TABLE public.question_folders
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE public.question_folders
  DROP CONSTRAINT IF EXISTS question_folders_pkey,
  DROP CONSTRAINT IF EXISTS question_folders_scope_check,
  DROP CONSTRAINT IF EXISTS question_folders_owner_check;

ALTER TABLE public.question_folders
  ADD CONSTRAINT question_folders_pkey PRIMARY KEY (id),
  ADD CONSTRAINT question_folders_scope_check CHECK (scope IN ('private','central')),
  ADD CONSTRAINT question_folders_owner_check CHECK (
    (scope = 'central' AND owner_id IS NULL)
    OR
    (scope = 'private' AND owner_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_question_folders_private
  ON public.question_folders(owner_id, path)
  WHERE scope = 'private';

CREATE UNIQUE INDEX IF NOT EXISTS uq_question_folders_central
  ON public.question_folders(path)
  WHERE scope = 'central';

DROP POLICY IF EXISTS "Admins can manage question folders" ON public.question_folders;
DROP POLICY IF EXISTS "Admins can view question folders" ON public.question_folders;

CREATE POLICY "Users can view own or central folders"
ON public.question_folders FOR SELECT TO authenticated
USING (
  scope = 'central'
  OR owner_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can create private folders"
ON public.question_folders FOR INSERT TO authenticated
WITH CHECK (
  (scope = 'private' AND owner_id = auth.uid())
  OR
  (scope = 'central' AND public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Users can edit own folders"
ON public.question_folders FOR UPDATE TO authenticated
USING (
  owner_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  (scope = 'private' AND owner_id = auth.uid())
  OR
  (scope = 'central' AND public.has_role(auth.uid(), 'admin') AND owner_id IS NULL)
);

CREATE POLICY "Users can delete own folders"
ON public.question_folders FOR DELETE TO authenticated
USING (
  owner_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);

-- Every authenticated user can host a game. Admin-only management remains enforced at the
-- question-bank level rather than blocking ordinary users from creating rooms.
DROP POLICY IF EXISTS "Admins can create rooms" ON public.game_rooms;
CREATE POLICY "Authenticated users can create rooms"
ON public.game_rooms FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = host_id
  AND status = 'waiting'
);

-- Durable game history:
-- 1) game_history is the game-level summary.
-- 2) game_history_players snapshots the participants' names/scores.
-- 3) game_history_questions snapshots the exact question text/options/media.
-- 4) game_history_answers snapshots each player's answers at game time.
CREATE TABLE IF NOT EXISTS public.game_history_players (
  history_id uuid NOT NULL REFERENCES public.game_history(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  display_name text NOT NULL DEFAULT '',
  nickname text NOT NULL DEFAULT '',
  score integer NOT NULL DEFAULT 0,
  joined_at timestamptz,
  is_phone boolean NOT NULL DEFAULT false,
  PRIMARY KEY (history_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.game_history_questions (
  history_id uuid NOT NULL REFERENCES public.game_history(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  sort_order integer NOT NULL,
  question_text text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_index integer,
  question_type text NOT NULL,
  time_limit integer NOT NULL DEFAULT 15,
  media_url text,
  media_type text,
  image_view_time integer NOT NULL DEFAULT 5,
  keep_image boolean NOT NULL DEFAULT false,
  PRIMARY KEY (history_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.game_history_answers (
  history_id uuid NOT NULL REFERENCES public.game_history(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  user_id uuid NOT NULL,
  selected_index integer NOT NULL,
  answer_time_ms integer NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0,
  is_correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (history_id, question_id, user_id)
);

ALTER TABLE public.game_history_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_history_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_history_answers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_game_history(_history_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.game_history h
    WHERE h.id = _history_id
      AND (
        h.host_id = _user_id
        OR public.has_role(_user_id, 'admin')
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.game_history_players hp
    WHERE hp.history_id = _history_id
      AND hp.user_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_game_history(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_game_history(uuid,uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Hosts can view their own history" ON public.game_history;
CREATE POLICY "Users can view participated game history"
ON public.game_history FOR SELECT TO authenticated
USING (public.can_view_game_history(id, auth.uid()));

DROP POLICY IF EXISTS "Hosts can delete their own history" ON public.game_history;
CREATE POLICY "Hosts can delete their own history"
ON public.game_history FOR DELETE TO authenticated
USING (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Participants can view history players"
ON public.game_history_players FOR SELECT TO authenticated
USING (public.can_view_game_history(history_id, auth.uid()));

CREATE POLICY "Participants can view history questions"
ON public.game_history_questions FOR SELECT TO authenticated
USING (public.can_view_game_history(history_id, auth.uid()));

CREATE POLICY "Users can view own history answers"
ON public.game_history_answers FOR SELECT TO authenticated
USING (
  (
    user_id = auth.uid()
    AND public.can_view_game_history(history_id, auth.uid())
  )
  OR
  EXISTS (
    SELECT 1 FROM public.game_history h
    WHERE h.id = history_id
      AND (h.host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

REVOKE ALL ON public.game_history_players, public.game_history_questions, public.game_history_answers FROM anon;
GRANT SELECT ON public.game_history_players, public.game_history_questions, public.game_history_answers TO authenticated;
GRANT ALL ON public.game_history_players, public.game_history_questions, public.game_history_answers TO service_role;

CREATE INDEX IF NOT EXISTS idx_game_history_players_user
  ON public.game_history_players(user_id);

CREATE INDEX IF NOT EXISTS idx_game_history_questions_history_order
  ON public.game_history_questions(history_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_game_history_answers_user
  ON public.game_history_answers(history_id, user_id);

-- Replace the old history trigger with an idempotent snapshot trigger and fix its
-- room_name column reference.
CREATE OR REPLACE FUNCTION public.snapshot_game_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _history_id uuid;
  _rankings jsonb;
  _qcount integer;
  _pcount integer;
BEGIN
  IF NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished' THEN
    SELECT id INTO _history_id
    FROM public.game_history
    WHERE room_id = NEW.id
    ORDER BY finished_at DESC
    LIMIT 1;

    IF _history_id IS NULL THEN
      SELECT COUNT(*) INTO _qcount
      FROM public.questions
      WHERE room_id = NEW.id;

      SELECT COUNT(*) INTO _pcount
      FROM public.room_players
      WHERE room_id = NEW.id;

      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'user_id', rp.user_id,
            'score', rp.score,
            'display_name', COALESCE(p.display_name, ''),
            'nickname', COALESCE(p.nickname, '')
          )
          ORDER BY rp.score DESC, rp.joined_at ASC
        ),
        '[]'::jsonb
      )
      INTO _rankings
      FROM public.room_players rp
      LEFT JOIN public.profiles p ON p.user_id = rp.user_id
      WHERE rp.room_id = NEW.id;

      INSERT INTO public.game_history
        (room_id, room_name, room_code, host_id, questions_count, players_count, rankings, finished_at)
      VALUES
        (NEW.id, NEW.room_name, NEW.room_code, NEW.host_id, COALESCE(_qcount,0), COALESCE(_pcount,0), COALESCE(_rankings,'[]'::jsonb), now())
      RETURNING id INTO _history_id;

      INSERT INTO public.game_history_players
        (history_id, user_id, display_name, nickname, score, joined_at, is_phone)
      SELECT
        _history_id,
        rp.user_id,
        COALESCE(p.display_name, ''),
        COALESCE(p.nickname, ''),
        rp.score,
        rp.joined_at,
        p.user_id IS NULL
      FROM public.room_players rp
      LEFT JOIN public.profiles p ON p.user_id = rp.user_id
      WHERE rp.room_id = NEW.id
      ON CONFLICT DO NOTHING;

      INSERT INTO public.game_history_questions
        (history_id, question_id, sort_order, question_text, options, correct_index, question_type,
         time_limit, media_url, media_type, image_view_time, keep_image)
      SELECT
        _history_id, q.id, q.sort_order, q.question_text, q.options, q.correct_index, q.question_type,
        q.time_limit, q.media_url, q.media_type, q.image_view_time, q.keep_image
      FROM public.questions q
      WHERE q.room_id = NEW.id
      ON CONFLICT DO NOTHING;

      INSERT INTO public.game_history_answers
        (history_id, question_id, user_id, selected_index, answer_time_ms, score, is_correct, created_at)
      SELECT
        _history_id, ga.question_id, ga.user_id, ga.selected_index, ga.answer_time_ms,
        ga.score, ga.is_correct, ga.created_at
      FROM public.game_answers ga
      WHERE ga.room_id = NEW.id
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_game_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_game_history() TO service_role;
