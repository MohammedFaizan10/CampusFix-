-- Fix RLS policy on account_audit_logs to allow edge functions (auth.uid() is null) and admins to insert
DROP POLICY IF EXISTS "admin_insert_audit_logs" ON public.account_audit_logs;

CREATE POLICY "admin_insert_audit_logs" ON public.account_audit_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (auth.uid() IS NULL OR public.is_admin());
