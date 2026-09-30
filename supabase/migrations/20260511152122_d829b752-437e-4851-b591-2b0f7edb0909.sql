
-- Restrict question-media bucket uploads/deletes to admins
DROP POLICY IF EXISTS "Authenticated users can upload question media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own question media" ON storage.objects;

CREATE POLICY "Admins can upload question media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'question-media' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete question media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'question-media' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Prevent client-side score cheating: clients must insert with score=0 and is_correct=false.
-- Authoritative scoring should be done server-side (edge function with service role).
DROP POLICY IF EXISTS "Players can insert own answers" ON public.game_answers;
CREATE POLICY "Players can insert own answers"
ON public.game_answers FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND score = 0
  AND is_correct = false
);
