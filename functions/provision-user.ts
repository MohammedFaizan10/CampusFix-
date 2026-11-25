import { createClient, createAdminClient } from 'npm:@insforge/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL') || '';
  const apiKey = Deno.env.get('API_KEY') || '';

  if (!baseUrl || !apiKey) {
    return new Response(JSON.stringify({ error: 'Server configuration missing' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const adminClient = createAdminClient({ baseUrl, apiKey });

  try {
    const body = await req.json();
    const { action } = body;

    // Handle Public / Anonymous action: Staff/Admin Self-Registration with Org Code
    if (action === 'validate_staff_registration') {
      const {
        email,
        password,
        name,
        role = 'STAFF',
        department,
        designation,
        employee_id,
        phone,
        admin_code
      } = body;

      if (!email || !password || !name || !admin_code) {
        return new Response(JSON.stringify({ error: 'Name, email, password, and organization code are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Validate organization registration codes
      // STAFF_CODE: For staff roles (STAFF, MAINTENANCE_STAFF, DEPARTMENT_STAFF)
      // ADMIN_CODE: For admin roles (ADMIN) — separate, more restricted code
      const STAFF_REGISTRATION_CODE = Deno.env.get('STAFF_REGISTRATION_CODE') || 'CAMPUSFIX-STAFF-2026';
      const ADMIN_REGISTRATION_CODE = Deno.env.get('ADMIN_REGISTRATION_CODE') || 'CAMPUSFIX-ADMIN-2026';

      const isAdminRole = role === 'ADMIN' || role === 'SUPER_ADMIN';

      // SUPER_ADMIN can never self-register
      if (role === 'SUPER_ADMIN') {
        return new Response(JSON.stringify({ error: 'SUPER_ADMIN accounts cannot be self-registered. Contact IT Security.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const expectedCode = isAdminRole ? ADMIN_REGISTRATION_CODE : STAFF_REGISTRATION_CODE;
      if (admin_code.trim() !== expectedCode) {
        return new Response(JSON.stringify({ error: isAdminRole
          ? 'Invalid admin authorization code. Contact the IT Security Office.'
          : 'Invalid organization registration code. Contact the Campus Estate Office.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check if email already exists
      const { data: existingProfiles } = await adminClient.database
        .from('user_profiles')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .limit(1);

      if (existingProfiles && existingProfiles.length > 0) {
        return new Response(JSON.stringify({ error: `An account with email ${email} already exists.` }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check if employee_id already exists
      if (employee_id) {
        const { data: existingEmp } = await adminClient.database
          .from('user_profiles')
          .select('id')
          .eq('employee_id', employee_id.trim().toUpperCase())
          .limit(1);

        if (existingEmp && existingEmp.length > 0) {
          return new Response(JSON.stringify({ error: `Employee ID '${employee_id}' is already registered.` }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Create the auth user
      const { data: authData, error: authErr } = await adminClient.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        name: name.trim()
      });

      if (authErr) {
        return new Response(JSON.stringify({ error: authErr.message || 'Registration failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const newUserId = authData?.user?.id;
      if (!newUserId) {
        return new Response(JSON.stringify({ error: 'Auth user creation returned no ID' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Insert user profile
      const initials = name.trim().split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
      const avatarColor = isAdminRole ? 'bg-teal-600' : 'bg-amber-600';

      const { error: profileErr } = await adminClient.database
        .from('user_profiles')
        .upsert([{
          id: newUserId,
          email: email.trim().toLowerCase(),
          name: name.trim(),
          role: isAdminRole ? 'ADMIN' : role,
          department: department || null,
          designation: designation || null,
          employee_id: employee_id || null,
          phone: phone || null,
          avatar_initials: initials,
          avatar_color: avatarColor,
          is_active: true
        }]);

      if (profileErr) {
        return new Response(JSON.stringify({ error: profileErr.message || 'Failed to create profile' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Audit log (non-blocking)
      await adminClient.database
        .from('account_audit_logs')
        .insert([{
          action: 'STAFF_SELF_REGISTERED',
          target_user_id: newUserId,
          target_email: email.trim().toLowerCase(),
          performed_by: newUserId,
          performed_by_name: name.trim(),
          performed_by_role: isAdminRole ? 'ADMIN' : role,
          details: { role: isAdminRole ? 'ADMIN' : role, department, designation, employee_id, method: 'org_code' }
        }]).then(() => {}).catch((e: any) => console.error('Audit log error:', e));

      return new Response(JSON.stringify({
        success: true,
        user: {
          id: newUserId,
          email: email.trim().toLowerCase(),
          name: name.trim(),
          role: isAdminRole ? 'ADMIN' : role,
          department
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Handle Public / Anonymous action: accept_invitation
    if (action === 'accept_invitation') {
      const { token, password } = body;
      if (!token || !password) {
        return new Response(JSON.stringify({ error: 'Invitation token and password are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Fetch pending invitation
      const { data: invList, error: invErr } = await adminClient.database
        .from('invitations')
        .select('*')
        .eq('token', token)
        .eq('status', 'PENDING')
        .limit(1);

      if (invErr || !invList || invList.length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid or expired invitation token' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const inv = invList[0];
      if (new Date(inv.expires_at).getTime() < Date.now()) {
        await adminClient.database
          .from('invitations')
          .update({ status: 'EXPIRED' })
          .eq('id', inv.id);

        return new Response(JSON.stringify({ error: 'This invitation has expired. Please contact an administrator.' }), {
          status: 410,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Create user in Auth
      const { data: authData, error: authErr } = await adminClient.auth.signUp({
        email: inv.email,
        password: password,
        name: inv.name
      });

      if (authErr) {
        return new Response(JSON.stringify({ error: authErr.message || 'Failed to create auth user' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const newUserId = authData?.user?.id;
      if (!newUserId) {
        return new Response(JSON.stringify({ error: 'Auth user ID missing after creation' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Create User Profile
      const { error: profileErr } = await adminClient.database
        .from('user_profiles')
        .upsert([{
          id: newUserId,
          email: inv.email,
          name: inv.name,
          role: inv.role,
          department: inv.department || null,
          designation: inv.designation || null,
          employee_id: inv.employee_id || null,
          phone: inv.phone || null,
          avatar_initials: inv.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase(),
          is_active: true
        }]);

      if (profileErr) {
        return new Response(JSON.stringify({ error: profileErr.message || 'Failed to create user profile' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Mark invitation accepted
      await adminClient.database
        .from('invitations')
        .update({ status: 'ACCEPTED', accepted_at: new Date().toISOString() })
        .eq('id', inv.id);

      // Log in audit table
      await adminClient.database
        .from('account_audit_logs')
        .insert([{
          action: 'INVITATION_ACCEPTED',
          target_user_id: newUserId,
          target_email: inv.email,
          performed_by: newUserId,
          performed_by_name: inv.name,
          performed_by_role: inv.role,
          details: { role: inv.role, department: inv.department }
        }]);

      return new Response(JSON.stringify({ success: true, email: inv.email, role: inv.role }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Handle Public / Anonymous action: reject_invitation
    if (action === 'reject_invitation') {
      const { token, reason } = body;
      if (!token) {
        return new Response(JSON.stringify({ error: 'Invitation token is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Fetch pending invitation
      const { data: invList, error: invErr } = await adminClient.database
        .from('invitations')
        .select('*')
        .eq('token', token)
        .eq('status', 'PENDING')
        .limit(1);

      if (invErr || !invList || invList.length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid or expired invitation token' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const inv = invList[0];

      // Mark invitation as REJECTED
      const { error: updateErr } = await adminClient.database
        .from('invitations')
        .update({
          status: 'REJECTED',
          updated_at: new Date().toISOString()
        })
        .eq('id', inv.id);

      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message || 'Failed to reject invitation' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Log rejection in account_audit_logs
      await adminClient.database
        .from('account_audit_logs')
        .insert([{
          action: 'INVITATION_REJECTED',
          target_email: inv.email,
          performed_by_name: inv.name,
          performed_by_role: inv.role,
          details: { role: inv.role, department: inv.department, reason: reason || 'Declined by recipient' }
        }]).then(() => {}).catch((e: any) => console.error('Audit log insert error:', e));

      return new Response(JSON.stringify({ success: true, message: 'Invitation declined successfully' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // All subsequent actions require Authenticated Admin or Super Admin
    const authHeader = req.headers.get('Authorization');
    const token = authHeader ? authHeader.replace('Bearer ', '').trim() : null;

    if (!token) {
      return new Response(JSON.stringify({ error: 'Authorization header missing' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const callerClient = createClient({ baseUrl, accessToken: token });
    const { data: callerAuth, error: callerAuthErr } = await callerClient.auth.getCurrentUser();

    if (callerAuthErr || !callerAuth?.user?.id) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const callerId = callerAuth.user.id;

    // Fetch caller's profile to inspect role
    const { data: callerProfiles, error: callerProfErr } = await adminClient.database
      .from('user_profiles')
      .select('id, name, email, role, is_active')
      .eq('id', callerId)
      .limit(1);

    if (callerProfErr || !callerProfiles || callerProfiles.length === 0) {
      return new Response(JSON.stringify({ error: 'Caller profile not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const callerProfile = callerProfiles[0];
    const isCallerAdmin = callerProfile.role === 'ADMIN' || callerProfile.role === 'SUPER_ADMIN';
    const isCallerSuperAdmin = callerProfile.role === 'SUPER_ADMIN';

    if (!isCallerAdmin || !callerProfile.is_active) {
      return new Response(JSON.stringify({ error: 'Forbidden: administrative privileges required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Action 1: Provision Account Directly
    if (action === 'provision') {
      const {
        email,
        password,
        name,
        role = 'STAFF',
        department,
        designation,
        employee_id,
        phone
      } = body;

      if (!email || !password || !name) {
        return new Response(JSON.stringify({ error: 'Name, email and password are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check role assignment permission
      if ((role === 'ADMIN' || role === 'SUPER_ADMIN') && !isCallerSuperAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden: Only SUPER_ADMIN can provision ADMIN or SUPER_ADMIN accounts' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check if user already exists
      const { data: existingProfiles } = await adminClient.database
        .from('user_profiles')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .limit(1);

      if (existingProfiles && existingProfiles.length > 0) {
        return new Response(JSON.stringify({ error: `An account with email ${email} already exists` }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Create Auth user
      const { data: authData, error: authErr } = await adminClient.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        name: name.trim()
      });

      if (authErr) {
        return new Response(JSON.stringify({ error: authErr.message || 'Failed to create auth user' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const newUserId = authData?.user?.id;
      if (!newUserId) {
        return new Response(JSON.stringify({ error: 'Auth user creation returned no ID' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Insert User Profile
      const { error: profileErr } = await adminClient.database
        .from('user_profiles')
        .upsert([{
          id: newUserId,
          email: email.trim().toLowerCase(),
          name: name.trim(),
          role,
          department: department || null,
          designation: designation || null,
          employee_id: employee_id || null,
          phone: phone || null,
          avatar_initials: name.trim().split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase(),
          is_active: true
        }]);

      if (profileErr) {
        return new Response(JSON.stringify({ error: profileErr.message || 'Failed to create profile' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Record Audit Log
      const { error: auditErr } = await adminClient.database
        .from('account_audit_logs')
        .insert([{
          action: 'ACCOUNT_PROVISIONED',
          target_user_id: newUserId,
          target_email: email.trim().toLowerCase(),
          performed_by: callerId,
          performed_by_name: callerProfile.name,
          performed_by_role: callerProfile.role,
          details: { role, department, designation, employee_id }
        }]);

      if (auditErr) {
        console.error('Audit log insert error:', auditErr);
      }

      return new Response(JSON.stringify({
        success: true,
        user: { id: newUserId, email: email.trim().toLowerCase(), name, role, department },
        auditError: auditErr?.message || null
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Action 2: Create Invitation
    if (action === 'invite') {
      const {
        email,
        name,
        role = 'STAFF',
        department,
        designation,
        employee_id,
        phone
      } = body;

      if (!email || !name) {
        return new Response(JSON.stringify({ error: 'Name and email are required for invitation' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if ((role === 'ADMIN' || role === 'SUPER_ADMIN') && !isCallerSuperAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden: Only SUPER_ADMIN can invite administrative users' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: invData, error: invErr } = await adminClient.database
        .from('invitations')
        .insert([{
          email: email.trim().toLowerCase(),
          name: name.trim(),
          role,
          department: department || null,
          designation: designation || null,
          employee_id: employee_id || null,
          phone: phone || null,
          token,
          invited_by: callerId,
          invited_by_name: callerProfile.name,
          status: 'PENDING',
          expires_at: expiresAt
        }])
        .select();

      if (invErr) {
        return new Response(JSON.stringify({ error: invErr.message || 'Failed to create invitation' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      await adminClient.database
        .from('account_audit_logs')
        .insert([{
          action: 'INVITATION_SENT',
          target_email: email.trim().toLowerCase(),
          performed_by: callerId,
          performed_by_name: callerProfile.name,
          performed_by_role: callerProfile.role,
          details: { role, department, designation, employee_id, token }
        }]);

      return new Response(JSON.stringify({
        success: true,
        invitation: {
          token,
          email: email.trim().toLowerCase(),
          name,
          role,
          department,
          expires_at: expiresAt
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Action 3: Toggle User Active Status
    if (action === 'toggle_status') {
      const { userId, is_active } = body;
      if (!userId || typeof is_active !== 'boolean') {
        return new Response(JSON.stringify({ error: 'userId and is_active boolean required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check target role
      const { data: targetProfiles } = await adminClient.database
        .from('user_profiles')
        .select('role, email')
        .eq('id', userId)
        .limit(1);

      if (targetProfiles && targetProfiles.length > 0) {
        const target = targetProfiles[0];
        if ((target.role === 'ADMIN' || target.role === 'SUPER_ADMIN') && !isCallerSuperAdmin) {
          return new Response(JSON.stringify({ error: 'Only SUPER_ADMIN can modify administrator accounts' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      const { error: updateErr } = await adminClient.database
        .from('user_profiles')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true, is_active }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Action 4: Change Role
    if (action === 'change_role') {
      const { userId, newRole } = body;
      if (!userId || !newRole) {
        return new Response(JSON.stringify({ error: 'userId and newRole are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if ((newRole === 'ADMIN' || newRole === 'SUPER_ADMIN') && !isCallerSuperAdmin) {
        return new Response(JSON.stringify({ error: 'Only SUPER_ADMIN can grant administrator roles' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error: updateErr } = await adminClient.database
        .from('user_profiles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true, role: newRole }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Action 5: Admin Password Reset Request
    if (action === 'reset_password_request') {
      const { email } = body;
      if (!email) {
        return new Response(JSON.stringify({ error: 'Email is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error: resetErr } = await adminClient.auth.sendResetPasswordEmail({
        email: email.trim().toLowerCase()
      });

      if (resetErr) {
        return new Response(JSON.stringify({ error: resetErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      await adminClient.database
        .from('account_audit_logs')
        .insert([{
          action: 'PASSWORD_RESET_INITIATED',
          target_email: email.trim().toLowerCase(),
          performed_by: callerId,
          performed_by_name: callerProfile.name,
          performed_by_role: callerProfile.role,
          details: { initiated_by: callerProfile.email }
        }]);

      return new Response(JSON.stringify({ success: true, message: `Password reset email dispatched to ${email}` }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
