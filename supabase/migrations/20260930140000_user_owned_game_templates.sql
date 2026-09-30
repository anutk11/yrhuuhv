-- Templates are personal user assets; admins may still manage them.
DROP POLICY IF EXISTS "Admins can manage templates" ON public.game_templates;
DROP POLICY IF EXISTS "Templates viewable by creator" ON public.game_templates;

CREATE POLICY "Users can view own templates"
ON public.game_templates FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can create own templates"
ON public.game_templates FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own templates"
ON public.game_templates FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can delete own templates"
ON public.game_templates FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);
