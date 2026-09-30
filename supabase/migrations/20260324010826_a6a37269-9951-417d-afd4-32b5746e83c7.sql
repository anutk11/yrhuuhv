
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS image_view_time integer NOT NULL DEFAULT 5;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS keep_image boolean NOT NULL DEFAULT false;
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS image_view_time integer NOT NULL DEFAULT 5;
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS keep_image boolean NOT NULL DEFAULT false;
