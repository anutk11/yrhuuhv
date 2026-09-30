
-- Question bank table
CREATE TABLE public.question_bank (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL DEFAULT 'כללי',
  question_text text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_index integer NOT NULL DEFAULT 0,
  question_type text NOT NULL DEFAULT 'trivia',
  time_limit integer NOT NULL DEFAULT 15,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "Question bank viewable by authenticated"
  ON public.question_bank FOR SELECT
  TO authenticated
  USING (true);

-- Admins can manage
CREATE POLICY "Admins can manage question bank"
  ON public.question_bank FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert some sample questions
INSERT INTO public.question_bank (category, question_text, options, correct_index, question_type, time_limit, created_by)
VALUES
  ('היסטוריה', 'באיזו שנה הוכרזה מדינת ישראל?', '["1948", "1947", "1950", "1945"]', 0, 'trivia', 15, '22475688-f03e-422c-ade2-107582f3ccbc'),
  ('היסטוריה', 'מי היה ראש הממשלה הראשון של ישראל?', '["דוד בן גוריון", "חיים וייצמן", "גולדה מאיר", "לוי אשכול"]', 0, 'trivia', 15, '22475688-f03e-422c-ade2-107582f3ccbc'),
  ('גאוגרפיה', 'מהו ההר הגבוה ביותר בישראל?', '["הר מירון", "הר החרמון", "הר תבור", "הר הצופים"]', 1, 'trivia', 15, '22475688-f03e-422c-ade2-107582f3ccbc'),
  ('גאוגרפיה', 'איזו עיר היא הגדולה ביותר בישראל?', '["ירושלים", "תל אביב", "חיפה", "באר שבע"]', 0, 'trivia', 15, '22475688-f03e-422c-ade2-107582f3ccbc'),
  ('מדע', 'מהו היסוד הכימי הנפוץ ביותר ביקום?', '["מימן", "חמצן", "פחמן", "הליום"]', 0, 'trivia', 15, '22475688-f03e-422c-ade2-107582f3ccbc'),
  ('מדע', 'כמה כוכבי לכת יש במערכת השמש?', '["8", "9", "7", "10"]', 0, 'trivia', 15, '22475688-f03e-422c-ade2-107582f3ccbc'),
  ('בידור', 'מי ניצח באירוויזיון 2018 עבור ישראל?', '["נטע ברזילי", "עדן גולן", "דנה אינטרנשיונל", "עופרה חזה"]', 0, 'trivia', 15, '22475688-f03e-422c-ade2-107582f3ccbc'),
  ('ספורט', 'באיזה ספורט ישראל זכתה במדליית זהב אולימפית ראשונה?', '["ג׳ודו", "שייט", "התעמלות", "שחייה"]', 0, 'trivia', 15, '22475688-f03e-422c-ade2-107582f3ccbc'),
  ('סקרים', 'מה האוכל האהוב עליכם?', '["פיצה", "סושי", "המבורגר", "פלאפל"]', 0, 'survey', 15, '22475688-f03e-422c-ade2-107582f3ccbc'),
  ('סקרים', 'לאן הייתם רוצים לטוס?', '["יפן", "איטליה", "ארה״ב", "תאילנד"]', 0, 'survey', 15, '22475688-f03e-422c-ade2-107582f3ccbc');
