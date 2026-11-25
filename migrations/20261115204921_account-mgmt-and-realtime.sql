-- Migration: 20261115204921_account-mgmt-and-realtime.sql
-- Description: Account management (invitations, audit logs), notifications, and realtime infrastructure.

-- 1. SUPER_ADMIN HELPER FUNCTION
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

-- 2. INVITATIONS TABLE
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('STAFF', 'MAINTENANCE_STAFF', 'DEPARTMENT_STAFF', 'ADMIN', 'SUPER_ADMIN')),
  department TEXT,
  designation TEXT,
  employee_id TEXT,
  phone TEXT,
  token TEXT UNIQUE NOT NULL,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by_name TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON public.invitations(status);

-- 3. ACCOUNT AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.account_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  target_user_id UUID,
  target_email TEXT NOT NULL,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_name TEXT,
  performed_by_role TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_audit_logs_created_at ON public.account_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_audit_logs_target_email ON public.account_audit_logs(target_email);
CREATE INDEX IF NOT EXISTS idx_account_audit_logs_performed_by ON public.account_audit_logs(performed_by);

-- 4. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  complaint_id TEXT REFERENCES public.complaints(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'COMPLAINT_UPDATE' CHECK (type IN ('NEW_COMPLAINT', 'STATUS_CHANGE', 'ASSIGNMENT', 'PRIORITY_CHANGE', 'COMMENT', 'SYSTEM')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_complaint ON public.notifications(complaint_id);

-- 5. REALTIME CHANNELS CONFIGURATION
INSERT INTO realtime.channels (pattern, description, enabled)
VALUES 
  ('complaints:all', 'Global complaint events for administrators', true),
  ('complaints:dept:%', 'Department-specific complaint events for staff', true),
  ('complaints:user:%', 'Student/reporter specific complaint events', true),
  ('complaints:ticket:%', 'Specific ticket lifecycle updates', true),
  ('notifications:user:%', 'Direct user notifications', true)
ON CONFLICT (pattern) DO UPDATE
SET description = EXCLUDED.description,
    enabled = EXCLUDED.enabled;

-- 6. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 7. RLS POLICIES: INVITATIONS
CREATE POLICY "admin_read_invitations" ON public.invitations
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "admin_manage_invitations" ON public.invitations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Allow looking up pending invitation by token for accepting
CREATE POLICY "anyone_read_invitation_by_token" ON public.invitations
  FOR SELECT TO anon, authenticated
  USING (status = 'PENDING');

-- 8. RLS POLICIES: ACCOUNT AUDIT LOGS
CREATE POLICY "admin_read_audit_logs" ON public.account_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "admin_insert_audit_logs" ON public.account_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- 9. RLS POLICIES: NOTIFICATIONS
CREATE POLICY "users_read_own_notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_id = (SELECT auth.uid()) OR public.is_admin());

CREATE POLICY "users_update_own_notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = (SELECT auth.uid()))
  WITH CHECK (recipient_id = (SELECT auth.uid()));

CREATE POLICY "users_delete_own_notifications" ON public.notifications
  FOR DELETE TO authenticated
  USING (recipient_id = (SELECT auth.uid()) OR public.is_admin());

CREATE POLICY "authenticated_insert_notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_staff() OR recipient_id = (SELECT auth.uid()));

-- 10. REALTIME CHANNELS RLS
ALTER TABLE realtime.channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campusfix_channels_access" ON realtime.channels;
CREATE POLICY "campusfix_channels_access"
ON realtime.channels FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR
  (
    pattern LIKE 'complaints:dept:%'
    AND split_part(realtime.channel_name(), ':', 3) = (
      SELECT department FROM public.user_profiles WHERE id = (SELECT auth.uid()) LIMIT 1
    )
  )
  OR
  (
    (pattern = 'complaints:user:%' OR pattern = 'notifications:user:%')
    AND split_part(realtime.channel_name(), ':', 3) = (SELECT auth.uid())::text
  )
  OR
  (
    pattern = 'complaints:ticket:%'
  )
);

-- 11. AUDIT TRIGGER FOR USER PROFILES
CREATE OR REPLACE FUNCTION public.audit_user_profile_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_caller_name TEXT;
BEGIN
  -- Security check: only SUPER_ADMIN can assign ADMIN or SUPER_ADMIN
  IF NEW.role IN ('ADMIN', 'SUPER_ADMIN') AND (OLD.role IS NULL OR OLD.role NOT IN ('ADMIN', 'SUPER_ADMIN')) THEN
    IF v_caller_id IS NOT NULL AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Only SUPER_ADMIN can assign administrative roles';
    END IF;
  END IF;

  SELECT role, name INTO v_caller_role, v_caller_name
  FROM public.user_profiles
  WHERE id = v_caller_id;

  -- Log role change
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO public.account_audit_logs (
      action, target_user_id, target_email, performed_by, performed_by_name, performed_by_role, details
    ) VALUES (
      'ROLE_CHANGE',
      NEW.id,
      NEW.email,
      v_caller_id,
      COALESCE(v_caller_name, 'System'),
      COALESCE(v_caller_role, 'SYSTEM'),
      jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role)
    );
  END IF;

  -- Log status change
  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    INSERT INTO public.account_audit_logs (
      action, target_user_id, target_email, performed_by, performed_by_name, performed_by_role, details
    ) VALUES (
      CASE WHEN NEW.is_active THEN 'ACCOUNT_ACTIVATED' ELSE 'ACCOUNT_DEACTIVATED' END,
      NEW.id,
      NEW.email,
      v_caller_id,
      COALESCE(v_caller_name, 'System'),
      COALESCE(v_caller_role, 'SYSTEM'),
      jsonb_build_object('old_status', OLD.is_active, 'new_status', NEW.is_active)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

DROP TRIGGER IF EXISTS trg_user_profile_audit ON public.user_profiles;
CREATE TRIGGER trg_user_profile_audit
AFTER UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.audit_user_profile_changes();

-- 12. NOTIFICATION REALTIME PUBLISH TRIGGER
CREATE OR REPLACE FUNCTION public.notify_on_new_notification()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM realtime.publish(
    'notifications:user:' || NEW.recipient_id::text,
    'new_notification',
    jsonb_build_object(
      'id', NEW.id,
      'recipient_id', NEW.recipient_id,
      'complaint_id', NEW.complaint_id,
      'title', NEW.title,
      'message', NEW.message,
      'type', NEW.type,
      'is_read', NEW.is_read,
      'created_at', NEW.created_at
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

DROP TRIGGER IF EXISTS trg_notification_realtime ON public.notifications;
CREATE TRIGGER trg_notification_realtime
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_new_notification();

-- 13. COMPLAINTS REALTIME AND NOTIFICATION TRIGGER
CREATE OR REPLACE FUNCTION public.notify_complaint_events()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
  v_admin_record RECORD;
  v_staff_record RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_payload := jsonb_build_object(
      'event', 'COMPLAINT_CREATED',
      'id', NEW.id,
      'title', NEW.title,
      'category', NEW.category,
      'priority', NEW.priority,
      'status', NEW.status,
      'department', NEW.department,
      'location', NEW.location,
      'reported_by', NEW.reported_by,
      'reported_by_name', NEW.reported_by_name,
      'reported_by_email', NEW.reported_by_email,
      'created_at', NEW.created_at
    );

    -- 1. Broadcast to global admin channel
    PERFORM realtime.publish('complaints:all', 'complaint_created', v_payload);

    -- 2. Broadcast to department channel
    IF NEW.department IS NOT NULL THEN
      PERFORM realtime.publish('complaints:dept:' || NEW.department, 'complaint_created', v_payload);
    END IF;

    -- 3. Broadcast to student channel
    IF NEW.reported_by IS NOT NULL THEN
      PERFORM realtime.publish('complaints:user:' || NEW.reported_by::text, 'complaint_created', v_payload);
    END IF;

    -- 4. Create notifications for active Administrators
    FOR v_admin_record IN
      SELECT id FROM public.user_profiles
      WHERE role IN ('ADMIN', 'SUPER_ADMIN') AND is_active = TRUE AND (NEW.reported_by IS NULL OR id != NEW.reported_by)
    LOOP
      INSERT INTO public.notifications (
        recipient_id, complaint_id, title, message, type
      ) VALUES (
        v_admin_record.id,
        NEW.id,
        'New Complaint: ' || NEW.id,
        NEW.title || ' (' || NEW.category || ' - ' || NEW.priority || ') in ' || COALESCE(NEW.location->>'building', 'Campus'),
        'NEW_COMPLAINT'
      );
    END LOOP;

    -- 5. Create notifications for relevant active Department Staff
    IF NEW.department IS NOT NULL THEN
      FOR v_staff_record IN
        SELECT id FROM public.user_profiles
        WHERE department = NEW.department AND role IN ('STAFF', 'MAINTENANCE_STAFF', 'DEPARTMENT_STAFF') AND is_active = TRUE
      LOOP
        INSERT INTO public.notifications (
          recipient_id, complaint_id, title, message, type
        ) VALUES (
          v_staff_record.id,
          NEW.id,
          'New ' || NEW.department || ' Complaint: ' || NEW.id,
          NEW.title || ' in ' || COALESCE(NEW.location->>'building', 'Campus'),
          'NEW_COMPLAINT'
        );
      END LOOP;
    END IF;

    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_payload := jsonb_build_object(
      'event', 'COMPLAINT_UPDATED',
      'id', NEW.id,
      'title', NEW.title,
      'category', NEW.category,
      'priority', NEW.priority,
      'status', NEW.status,
      'department', NEW.department,
      'assigned_to', NEW.assigned_to,
      'assigned_to_name', NEW.assigned_to_name,
      'location', NEW.location,
      'reported_by', NEW.reported_by,
      'updated_at', NEW.updated_at
    );

    -- Broadcast updates
    PERFORM realtime.publish('complaints:all', 'complaint_updated', v_payload);

    IF NEW.department IS NOT NULL THEN
      PERFORM realtime.publish('complaints:dept:' || NEW.department, 'complaint_updated', v_payload);
    END IF;

    IF OLD.department IS DISTINCT FROM NEW.department AND OLD.department IS NOT NULL THEN
      PERFORM realtime.publish('complaints:dept:' || OLD.department, 'complaint_updated', v_payload);
    END IF;

    IF NEW.reported_by IS NOT NULL THEN
      PERFORM realtime.publish('complaints:user:' || NEW.reported_by::text, 'complaint_updated', v_payload);
    END IF;

    PERFORM realtime.publish('complaints:ticket:' || NEW.id, 'complaint_updated', v_payload);

    -- Status change notification
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      -- Notify Student
      IF NEW.reported_by IS NOT NULL THEN
        INSERT INTO public.notifications (
          recipient_id, complaint_id, title, message, type
        ) VALUES (
          NEW.reported_by,
          NEW.id,
          'Status Updated: ' || NEW.id,
          'Your complaint "' || NEW.title || '" status changed to ' || NEW.status,
          'STATUS_CHANGE'
        );
      END IF;

      -- Notify Admins
      FOR v_admin_record IN
        SELECT id FROM public.user_profiles
        WHERE role IN ('ADMIN', 'SUPER_ADMIN') AND is_active = TRUE AND (NEW.reported_by IS NULL OR id != NEW.reported_by)
      LOOP
        INSERT INTO public.notifications (
          recipient_id, complaint_id, title, message, type
        ) VALUES (
          v_admin_record.id,
          NEW.id,
          'Status Updated: ' || NEW.id,
          'Complaint ' || NEW.id || ' status changed to ' || NEW.status,
          'STATUS_CHANGE'
        );
      END LOOP;
    END IF;

    -- Assignment change notification
    IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
      INSERT INTO public.notifications (
        recipient_id, complaint_id, title, message, type
      ) VALUES (
        NEW.assigned_to,
        NEW.id,
        'Task Assigned: ' || NEW.id,
        'You have been assigned to: ' || NEW.title,
        'ASSIGNMENT'
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

DROP TRIGGER IF EXISTS trg_complaints_realtime_and_notifications ON public.complaints;
CREATE TRIGGER trg_complaints_realtime_and_notifications
AFTER INSERT OR UPDATE ON public.complaints
FOR EACH ROW
EXECUTE FUNCTION public.notify_complaint_events();

-- 14. GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT SELECT ON public.invitations TO anon;
GRANT SELECT, INSERT ON public.account_audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
