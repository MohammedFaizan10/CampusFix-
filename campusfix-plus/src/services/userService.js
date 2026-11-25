/**
 * userService.js — Real InsForge PostgreSQL User Service.
 * Manages user accounts, staff queries, invitations, and administrative provisioning.
 */
import insforge from '../lib/insforge';
import { ROLES } from '../constants/roles';

function formatProfile(p) {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role,
    department: p.department,
    assignedDepartment: p.department,
    rollNumber: p.roll_number,
    employeeId: p.employee_id,
    designation: p.designation,
    program: p.program,
    academicYear: p.academic_year,
    section: p.section,
    semester: p.semester,
    phone: p.phone,
    avatarInitials: p.avatar_initials || 'CF',
    avatarColor: p.avatar_color || 'bg-indigo-600',
    isActive: p.is_active ?? true,
    joinedAt: p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
  };
}

/**
 * Fetch all users with optional filtering from PostgreSQL.
 */
export async function getUsers(filters = {}) {
  let query = insforge.database.from('user_profiles').select('*').order('created_at', { ascending: false });

  if (filters.role && filters.role !== 'ALL') {
    query = query.eq('role', filters.role);
  }
  if (filters.status && filters.status !== 'ALL') {
    const isAct = filters.status === 'ACTIVE';
    query = query.eq('is_active', isAct);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load users: ${error.message}`);
  }

  let result = (data || []).map(formatProfile);

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (u) =>
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.employeeId && u.employeeId.toLowerCase().includes(q)) ||
        (u.rollNumber && u.rollNumber.toLowerCase().includes(q)) ||
        (u.department && u.department.toLowerCase().includes(q))
    );
  }

  return result;
}

/**
 * Fetch a single user by ID.
 */
export async function getUserByIdService(id) {
  const { data, error } = await insforge.database
    .from('user_profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    throw new Error(`User ${id} not found.`);
  }

  return formatProfile(data);
}

/**
 * Fetch all active staff members.
 */
export async function getStaffList() {
  const { data, error } = await insforge.database
    .from('user_profiles')
    .select('*')
    .in('role', [ROLES.STAFF, 'MAINTENANCE_STAFF', 'DEPARTMENT_STAFF'])
    .eq('is_active', true);

  if (error) throw new Error(error.message);
  return (data || []).map(formatProfile);
}

/**
 * Fetch staff members by assigned department.
 */
export async function getStaffByDepartment(department) {
  if (!department) return [];
  const { data, error } = await insforge.database
    .from('user_profiles')
    .select('*')
    .in('role', [ROLES.STAFF, 'MAINTENANCE_STAFF', 'DEPARTMENT_STAFF'])
    .eq('department', department)
    .eq('is_active', true);

  if (error) throw new Error(error.message);
  return (data || []).map(formatProfile);
}

/**
 * Create a new staff or admin account via secure server-side Edge Function.
 */
export async function createStaffUser(payload) {
  const empId = payload.employeeId || `STF-${Math.floor(100 + Math.random() * 900)}`;
  const password = payload.password || 'Staff@12345';
  const role = payload.role || ROLES.STAFF;
  const dept = payload.assignedDepartment || payload.department || null;

  // Invoke secure Edge Function with server-side authorization checks
  const { data, error } = await insforge.functions.invoke('provision-user', {
    body: {
      action: 'provision',
      email: payload.email.trim().toLowerCase(),
      password,
      name: payload.name.trim(),
      role,
      department: dept,
      designation: payload.designation || 'Maintenance Specialist',
      employee_id: empId,
      phone: payload.phone || null,
    },
  });

  if (error || data?.error) {
    const msg = data?.error || error?.message || 'Provisioning failed';
    throw new Error(msg);
  }

  return data.user;
}

/**
 * Create a secure invitation for staff or admin onboarding.
 */
export async function createInvitation(payload) {
  const empId = payload.employeeId || `STF-${Math.floor(100 + Math.random() * 900)}`;
  const role = payload.role || ROLES.STAFF;
  const dept = payload.assignedDepartment || payload.department || null;

  const { data, error } = await insforge.functions.invoke('provision-user', {
    body: {
      action: 'invite',
      email: payload.email.trim().toLowerCase(),
      name: payload.name.trim(),
      role,
      department: dept,
      designation: payload.designation || 'Maintenance Specialist',
      employee_id: empId,
      phone: payload.phone || null,
    },
  });

  if (error || data?.error) {
    const msg = data?.error || error?.message || 'Failed to create invitation';
    throw new Error(msg);
  }

  return data.invitation;
}

/**
 * Accept an invitation using the unique token and set user password.
 */
export async function acceptInvitation({ token, password }) {
  const { data, error } = await insforge.functions.invoke('provision-user', {
    body: {
      action: 'accept_invitation',
      token,
      password,
    },
  });

  if (error || data?.error) {
    const msg = data?.error || error?.message || 'Failed to accept invitation';
    throw new Error(msg);
  }

  return data;
}

/**
 * Decline / Reject an invitation.
 */
export async function rejectInvitation({ token, reason }) {
  const { data, error } = await insforge.functions.invoke('provision-user', {
    body: {
      action: 'reject_invitation',
      token,
      reason,
    },
  });

  if (error || data?.error) {
    const msg = data?.error || error?.message || 'Failed to decline invitation';
    throw new Error(msg);
  }

  return data;
}

/**
 * Fetch pending and past invitations for the Admin Console.
 */
export async function getInvitations() {
  const { data, error } = await insforge.database
    .from('invitations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Failed to load invitations:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Revoke a pending invitation.
 */
export async function revokeInvitation(invitationId) {
  const { error } = await insforge.database
    .from('invitations')
    .update({ status: 'REVOKED' })
    .eq('id', invitationId);

  if (error) throw new Error(error.message);
  return true;
}

/**
 * Fetch account audit logs.
 */
export async function getAuditLogs(limit = 50) {
  const { data, error } = await insforge.database
    .from('account_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('Failed to load audit logs:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Request an administrative password reset email for any user.
 */
export async function initiatePasswordReset(email) {
  const { data, error } = await insforge.functions.invoke('provision-user', {
    body: {
      action: 'reset_password_request',
      email,
    },
  });

  if (error || data?.error) {
    throw new Error(data?.error || error?.message || 'Password reset request failed');
  }

  return data;
}

/**
 * Toggle active status of a user (Admin action with safety checks).
 */
export async function toggleUserStatus(id, currentAdminId) {
  if (id === currentAdminId) {
    throw new Error('Action blocked: You cannot deactivate your own account.');
  }

  const { data: user, error: fetchErr } = await insforge.database
    .from('user_profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !user) throw new Error(`User ${id} not found.`);

  const newStatus = !user.is_active;

  const { data, error } = await insforge.functions.invoke('provision-user', {
    body: {
      action: 'toggle_status',
      userId: id,
      is_active: newStatus,
    },
  });

  if (error || data?.error) {
    throw new Error(data?.error || error?.message || 'Failed to update account status');
  }

  return { ...user, is_active: newStatus };
}

/**
 * Change role of a user with database audit.
 */
export async function changeUserRole(id, newRole, currentAdminId) {
  if (id === currentAdminId && newRole !== ROLES.ADMIN && newRole !== 'SUPER_ADMIN') {
    throw new Error('Action blocked: You cannot demote your own Administrator account.');
  }

  const { data, error } = await insforge.functions.invoke('provision-user', {
    body: {
      action: 'change_role',
      userId: id,
      newRole,
    },
  });

  if (error || data?.error) {
    throw new Error(data?.error || error?.message || 'Failed to change role');
  }

  return data;
}

/**
 * Update general user fields.
 */
export async function updateUser(id, patch) {
  const dbPatch = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.department !== undefined) dbPatch.department = patch.department;
  if (patch.assignedDepartment !== undefined) dbPatch.department = patch.assignedDepartment;
  if (patch.designation !== undefined) dbPatch.designation = patch.designation;
  if (patch.phone !== undefined) dbPatch.phone = patch.phone;
  if (patch.employeeId !== undefined) dbPatch.employee_id = patch.employeeId;
  if (patch.program !== undefined) dbPatch.program = patch.program;
  if (patch.academicYear !== undefined) dbPatch.academic_year = patch.academicYear;
  if (patch.section !== undefined) dbPatch.section = patch.section;

  const { data, error } = await insforge.database
    .from('user_profiles')
    .update(dbPatch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return formatProfile(data);
}
