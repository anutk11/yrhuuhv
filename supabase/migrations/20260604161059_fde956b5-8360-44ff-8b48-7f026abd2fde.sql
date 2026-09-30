
-- 1. Tighten questions SELECT: only host. Players use the safe view.
DROP POLICY IF EXISTS "Questions viewable by authenticated" ON public.questions;

-- Safe view that exposes correct_index only to the host or after the answer phase
CREATE OR REPLACE VIEW public.public_questions
WITH (security_invoker = off) AS
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
      AND gr.current_phase IN ('result','leaderboard','stats') THEN q.correct_index
    ELSE NULL
  END AS correct_index
FROM public.questions q
JOIN public.game_rooms gr ON gr.id = q.room_id;

GRANT SELECT ON public.public_questions TO authenticated, anon;

-- 2. Remove permissive anon policies (yemot-webhook uses service_role and bypasses RLS)
DROP POLICY IF EXISTS "yemot_phone_insert_answers" ON public.game_answers;
DROP POLICY IF EXISTS "yemot_phone_insert_players" ON public.room_players;
DROP POLICY IF EXISTS "yemot_phone_update_players" ON public.room_players;
DROP POLICY IF EXISTS "yemot_phone_read_players" ON public.room_players;
DROP POLICY IF EXISTS "yemot_phone_read_rooms" ON public.game_rooms;

-- 3. Storage: admins-only UPDATE on question-media
DROP POLICY IF EXISTS "Admins can update question media" ON storage.objects;
CREATE POLICY "Admins can update question media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'question-media' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'question-media' AND public.has_role(auth.uid(), 'admin'));

-- 4. user_roles: explicit WITH CHECK so only admins can insert/update
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
