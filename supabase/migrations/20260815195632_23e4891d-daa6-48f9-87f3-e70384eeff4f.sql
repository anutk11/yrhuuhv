-- 1. Helper to avoid recursive RLS on room_players
CREATE OR REPLACE FUNCTION public.is_room_member(_room_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_players rp
    WHERE rp.room_id = _room_id AND rp.user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.game_rooms gr
    WHERE gr.id = _room_id AND gr.host_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_room_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_room_member(uuid, uuid) TO authenticated, service_role;

-- 2. Lock down SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.snapshot_game_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.advance_room_question(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rewind_question(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_room_phase(uuid, integer, text, text, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advance_room_question(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rewind_question(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_room_phase(uuid, integer, text, text, integer, integer, text) TO authenticated, service_role;

-- 3. player_roster: admins only can read
DROP POLICY IF EXISTS "Authenticated can view roster" ON public.player_roster;
CREATE POLICY "Admins can view roster"
ON public.player_roster FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. question_bank: admins only can read
DROP POLICY IF EXISTS "Question bank viewable by authenticated" ON public.question_bank;
CREATE POLICY "Admins can view question bank"
ON public.question_bank FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 5. room_players: scope to own room
DROP POLICY IF EXISTS "Room players viewable by authenticated" ON public.room_players;
CREATE POLICY "Room players viewable by room members"
ON public.room_players FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_room_member(room_id, auth.uid()));

-- 6. game_answers: scope to own room
DROP POLICY IF EXISTS "Answers viewable by room participants" ON public.game_answers;
CREATE POLICY "Answers viewable by room members"
ON public.game_answers FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_room_member(room_id, auth.uid()));

-- 7. questions: allow room members to read, so public_questions can be SECURITY INVOKER
CREATE POLICY "Room members can view questions"
ON public.questions FOR SELECT TO authenticated
USING (public.is_room_member(room_id, auth.uid()));

DROP VIEW IF EXISTS public.public_questions;
CREATE VIEW public.public_questions
WITH (security_invoker = on) AS
SELECT
  q.id,
  q.room_id,
  q.question_text,
  q.options,
  q.question_type,
  q.time_limit,
  q.sort_order,
  q.media_url,
  q.media_type,
  q.image_view_time,
  q.keep_image,
  q.created_at,
  CASE
    WHEN gr.host_id = auth.uid() THEN q.correct_index
    WHEN gr.status = 'finished' THEN q.correct_index
    WHEN gr.current_question_index > q.sort_order THEN q.correct_index
    WHEN gr.current_question_index = q.sort_order
      AND gr.current_phase = ANY (ARRAY['result','leaderboard','stats']) THEN q.correct_index
    ELSE NULL::integer
  END AS correct_index
FROM public.questions q
JOIN public.game_rooms gr ON gr.id = q.room_id;

GRANT SELECT ON public.public_questions TO authenticated;
GRANT ALL ON public.public_questions TO service_role;