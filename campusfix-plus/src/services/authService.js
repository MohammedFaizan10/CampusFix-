/**
 * authService.js — Real InsForge Authentication Service.
 *
 * Interacts with InsForge Backend (PostgreSQL + auth.users + public.user_profiles).
 */
import insforge from '../lib/insforge';
import { ROLES } from '../constants/roles';

function formatUserFromProfile(authUser, profile) {
  const name = profile?.name || authUser?.name || authUser?.email?.split('@')[0] || 'User';
  const initials = profile?.avatar_initials || name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'CF';

  return {
    id: authUser.id,
    name: name,
    email: authUser.email,
    role: profile?.role || ROLES.STUDENT,
    department: profile?.department || null,
    rollNumber: profile?.roll_number || null,
    employeeId: profile?.employee_id || null,
    designation: profile?.designation || null,
    program: profile?.program || null,
    academicYear: profile?.academic_year || null,
    section: profile?.section || null,
    semester: profile?.semester || null,
    phone: profile?.phone || null,
    avatarInitials: initials,
    avatarColor: profile?.avatar_color || 'bg-indigo-600',
    isActive: profile?.is_active ?? true,
    joinedAt: profile?.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
  };
}

/**
 * Initiate Google OAuth using InsForge Auth PKCE flow.
 */
export async function signInWithGoogle() {
  const { data, error } = await insforge.auth.signInWithOAuth('google', {
    redirectTo: `${window.location.origin}/auth/callback`,
    additionalParams: { prompt: 'select_account' }
  });
  if (error) {
    throw new Error(error.message || 'Failed to start Google sign in.');
  }
  return data;
}

/**
 * Completes a student profile for a newly authenticated Google user.
 * Strictly assigns the STUDENT role (never ADMIN or STAFF).
 */
export async function completeGoogleStudentProfile(payload) {
  const { data: authData, error: authError } = await insforge.auth.getCurrentUser();
  if (authError || !authData?.user) {
    throw new Error('No authenticated Google session found. Please sign in again.');
  }

  const user = authData.user;
  const rollNumber = (payload.rollNumber || '').trim().toUpperCase();
  if (!rollNumber) {
    throw new Error('Student ID / Roll number is mandatory.');
  }

  // Ensure roll number is unique
  const { data: existingRoll } = await insforge.database
    .from('user_profiles')
    .select('id')
    .eq('roll_number', rollNumber)
    .maybeSingle();

  if (existingRoll && existingRoll.id !== user.id) {
    throw new Error(`Student ID '${rollNumber}' is already registered to another account.`);
  }

  // Check if profile exists to prevent duplicate insertion
  const { data: existingProfile } = await insforge.database
    .from('user_profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  const name = (payload.name || user.name || user.email.split('@')[0]).trim();
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'ST';

  const profileData = {
    id: user.id,
    email: user.email,
    name: name,
    role: ROLES.STUDENT, // Strictly enforced: NEVER ADMIN, SUPER_ADMIN, or STAFF
    roll_number: rollNumber,
    department: payload.department || 'Computer Science Engineering',
    program: payload.program || 'Bachelor of Technology',
    academic_year: payload.academicYear || '2025-2026',
    section: payload.section || 'A',
    phone: payload.phone || null,
    avatar_initials: initials,
    avatar_color: 'bg-indigo-600',
    is_active: true,
  };

  if (existingProfile) {
    const { error: updateErr } = await insforge.database
      .from('user_profiles')
      .update(profileData)
      .eq('id', user.id);
    if (updateErr) throw new Error(updateErr.message);
  } else {
    const { error: insertErr } = await insforge.database
      .from('user_profiles')
      .insert([profileData]);
    if (insertErr) throw new Error(insertErr.message);
  }

  return formatUserFromProfile(user, profileData);
}

/**
 * Authenticate with email and password via InsForge.
 */
export async function login({ email, password }) {
  if (!email || !password) {
    throw new Error('Please enter both your institutional email and password.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await insforge.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    throw new Error(error.message || 'Invalid credentials.');
  }

  const authUser = data.user;
  const { data: profile } = await insforge.database
    .from('user_profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  return formatUserFromProfile(authUser, profile);
}

/**
 * Staff / Admin self-registration with organization code verification.
 * The code is validated server-side by the Edge Function.
 */
export async function staffRegister(payload) {
  const {
    name,
    email,
    employeeId,
    phone,
    department,
    designation,
    role,
    password,
    adminCode,
  } = payload;

  if (!name || !email || !password || !employeeId || !adminCode) {
    throw new Error('All required fields must be completed.');
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
    throw new Error('Please enter a valid institutional email address.');
  }

  // Check if employee ID is unique
  const { data: existingEmp } = await insforge.database
    .from('user_profiles')
    .select('id')
    .eq('employee_id', employeeId.trim().toUpperCase())
    .maybeSingle();

  if (existingEmp) {
    throw new Error(`Employee ID '${employeeId.trim().toUpperCase()}' is already registered.`);
  }

  // Validate the organization/admin code via Edge Function
  const { data: codeResult, error: codeError } = await insforge.functions.invoke('provision-user', {
    body: {
      action: 'validate_staff_registration',
      email: normalizedEmail,
      password,
      name: name.trim(),
      role: role || ROLES.STAFF,
      department: department || null,
      designation: designation || 'Maintenance Specialist',
      employee_id: employeeId.trim().toUpperCase(),
      phone: phone || null,
      admin_code: adminCode.trim(),
    },
  });

  if (codeError || codeResult?.error) {
    const msg = codeResult?.error || codeError?.message || 'Registration failed.';
    throw new Error(msg);
  }

  // If the edge function created the user, sign them in
  const { data: signInData, error: signInError } = await insforge.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (signInError) {
    throw new Error(signInError.message || 'Account created but auto-login failed. Please log in manually.');
  }

  const authUser = signInData.user;
  const { data: profile } = await insforge.database
    .from('user_profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  return formatUserFromProfile(authUser, profile);
}

/**
 * Self-registration for students only.
 */
export async function register(payload) {
  const { name, email, rollNumber, department, password } = payload;

  if (!name || !email || !rollNumber || !department || !password) {
    throw new Error('All registration fields are mandatory.');
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Validate format
  if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
    throw new Error('Please enter a valid institutional email address.');
  }

  // Check unique student ID / roll number
  const { data: existingRoll } = await insforge.database
    .from('user_profiles')
    .select('id')
    .eq('roll_number', rollNumber.trim().toUpperCase())
    .maybeSingle();

  if (existingRoll) {
    throw new Error(`Student ID '${rollNumber.trim().toUpperCase()}' is already registered.`);
  }

  // Sign up via InsForge Auth
  const { data: signUpData, error: signUpError } = await insforge.auth.signUp({
    email: normalizedEmail,
    password,
    name: name.trim(),
  });

  if (signUpError) {
    throw new Error(signUpError.message || 'Registration failed.');
  }

  const authUser = signUpData.user;
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'ST';

  const newProfile = {
    id: authUser.id,
    email: normalizedEmail,
    name: name.trim(),
    role: ROLES.STUDENT,
    roll_number: rollNumber.trim().toUpperCase(),
    department: department,
    program: payload.program || 'Bachelor of Technology',
    academic_year: payload.academicYear || '2025-2026',
    section: payload.section || 'A',
    phone: payload.phone || null,
    avatar_initials: initials,
    avatar_color: 'bg-indigo-600',
    is_active: true,
  };

  const { error: profileError } = await insforge.database
    .from('user_profiles')
    .insert([newProfile]);

  if (profileError) {
    console.error('Failed to create profile record:', profileError);
  }

  return formatUserFromProfile(authUser, newProfile);
}

/**
 * Terminate active session via InsForge.
 */
export async function logout() {
  await insforge.auth.signOut();
}

/**
 * Bootstrap session from InsForge currentUser.
 */
export async function getMe() {
  try {
    const { data, error } = await insforge.auth.getCurrentUser();
    if (error || !data?.user) {
      return null;
    }

    const authUser = data.user;
    const { data: profile } = await insforge.database
      .from('user_profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    return formatUserFromProfile(authUser, profile);
  } catch (err) {
    console.warn('InsForge getMe session verification error:', err);
    return null;
  }
}

/**
 * Password reset request.
 */
export async function requestPasswordReset(email) {
  if (!email) {
    throw new Error('Please enter your institutional email address.');
  }

  const { error } = await insforge.auth.sendResetPasswordEmail({
    email: email.trim().toLowerCase(),
    redirectTo: `${window.location.origin}/reset-password`,
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    message: `Password reset instructions dispatched to ${email}.`,
  };
}

/**
 * Reset password completion.
 */
export async function resetPassword(token, newPassword) {
  if (!token || !newPassword) {
    throw new Error('Invalid token or missing new password.');
  }
  if (newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  const { error } = await insforge.auth.resetPassword({
    newPassword,
    otp: token,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}
