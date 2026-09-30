-- Truly private media for personal question banks.
ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS media_path text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('question-private-media', 'question-private-media', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users can upload personal question media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update personal question media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete personal question media" ON storage.objects;

CREATE POLICY "Users can upload private bank media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'question-private-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read private bank media"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'question-private-media'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Users can update private bank media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'question-private-media'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  )
)
WITH CHECK (
  bucket_id = 'question-private-media'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Users can delete private bank media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'question-private-media'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  )
);

-- Public game media may be uploaded by the host only into a room-scoped path.
DROP POLICY IF EXISTS "Admins can upload question media" ON storage.objects;
CREATE POLICY "Admins can upload question media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'question-media'
  AND public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Users can upload room media" ON storage.objects;
CREATE POLICY "Users can upload room media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'question-media'
  AND (storage.foldername(name))[1] = 'rooms'
  AND EXISTS (
    SELECT 1
    FROM public.game_rooms gr
    WHERE gr.id::text = (storage.foldername(name))[2]
      AND gr.host_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can delete question media" ON storage.objects;
CREATE POLICY "Admins can delete question media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'question-media'
  AND public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Users can delete room media" ON storage.objects;
CREATE POLICY "Users can delete room media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'question-media'
  AND (storage.foldername(name))[1] = 'rooms'
  AND EXISTS (
    SELECT 1
    FROM public.game_rooms gr
    WHERE gr.id::text = (storage.foldername(name))[2]
      AND gr.host_id = auth.uid()
  )
);
