-- Allow authenticated users to store media for their own private question bank.
-- Personal uploads use the first path segment as the authenticated user id.
DROP POLICY IF EXISTS "Users can upload personal question media" ON storage.objects;
CREATE POLICY "Users can upload personal question media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'question-media'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

DROP POLICY IF EXISTS "Users can update personal question media" ON storage.objects;
CREATE POLICY "Users can update personal question media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'question-media'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
)
WITH CHECK (
  bucket_id = 'question-media'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

DROP POLICY IF EXISTS "Users can delete personal question media" ON storage.objects;
CREATE POLICY "Users can delete personal question media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'question-media'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
