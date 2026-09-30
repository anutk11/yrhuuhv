-- Central-bank publishing audit and administrator user management.
CREATE TABLE IF NOT EXISTS public.question_bank_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  bank_scope text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  old_data jsonb,
  new_data jsonb
);

ALTER TABLE public.question_bank_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view question bank audit log" ON public.question_bank_audit_log;
CREATE POLICY "Admins can view question bank audit log"
ON public.question_bank_audit_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.question_bank_audit_log FROM anon;
GRANT SELECT ON public.question_bank_audit_log TO authenticated, service_role;
GRANT ALL ON public.question_bank_audit_log TO service_role;

CREATE INDEX IF NOT EXISTS idx_question_bank_audit_created
  ON public.question_bank_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_bank_audit_question
  ON public.question_bank_audit_log(question_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.audit_question_bank_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.question_bank_audit_log(
    question_id, action, bank_scope, actor_id, old_data, new_data
  )
  VALUES(
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    COALESCE(NEW.bank_scope, OLD.bank_scope),
    auth.uid(),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_question_bank_changes ON public.question_bank;
CREATE TRIGGER trg_audit_question_bank_changes
AFTER INSERT OR UPDATE OR DELETE ON public.question_bank
FOR EACH ROW EXECUTE FUNCTION public.audit_question_bank_changes();

REVOKE ALL ON FUNCTION public.audit_question_bank_changes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_question_bank_changes() TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS uq_question_bank_central_source
ON public.question_bank(source_question_id)
WHERE bank_scope = 'central' AND source_question_id IS NOT NULL;

-- Admin-only user management backed by auth.users.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
  user_id uuid,
  email text,
  display_name text,
  nickname text,
  role public.app_role,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    COALESCE(p.display_name, COALESCE(u.raw_user_meta_data->>'display_name',''))::text,
    COALESCE(p.nickname, COALESCE(u.raw_user_meta_data->>'nickname',''))::text,
    COALESCE(ur.role, 'user'::public.app_role),
    u.created_at,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  LEFT JOIN LATERAL (
    SELECT role FROM public.user_roles
    WHERE user_id = u.id
    ORDER BY CASE WHEN role='admin'::public.app_role THEN 0 ELSE 1 END
    LIMIT 1
  ) ur ON true
  ORDER BY u.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  _user_id uuid,
  _role public.app_role
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _actor uuid := auth.uid();
BEGIN
  IF _actor IS NULL OR NOT public.has_role(_actor, 'admin') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  IF _user_id = _actor AND _role <> 'admin'::public.app_role THEN
    RAISE EXCEPTION 'Cannot remove your own administrator role';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles(user_id, role) VALUES(_user_id, _role)
  ON CONFLICT(user_id, role) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, public.app_role) TO authenticated, service_role;
