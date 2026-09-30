-- Add media columns to questions table
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS media_type text DEFAULT 'none';

-- Add media columns to question_bank table
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS media_type text DEFAULT 'none';

-- Create storage bucket for question media
INSERT INTO storage.buckets (id, name, public) VALUES ('question-media', 'question-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to question-media bucket
CREATE POLICY "Authenticated users can upload question media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'question-media');

-- Allow public read access
CREATE POLICY "Public read access for question media"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'question-media');

-- Allow owners to delete their uploads
CREATE POLICY "Users can delete own question media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'question-media');