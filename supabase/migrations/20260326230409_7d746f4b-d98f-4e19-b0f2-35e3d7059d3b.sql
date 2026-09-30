
-- Add folder column to question_bank
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT 'כללי';

-- Create game_templates table
CREATE TABLE public.game_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  template_name text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{"correctness_weight": 60, "show_leaderboard_every": 2, "default_time_limit": 15}'::jsonb,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage templates" ON public.game_templates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Templates viewable by creator" ON public.game_templates
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());
