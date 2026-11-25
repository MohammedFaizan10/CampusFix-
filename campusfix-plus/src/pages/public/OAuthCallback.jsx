/**
 * OAuthCallback.jsx — PKCE OAuth Callback Handler for Google Authentication.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import insforge from '../../lib/insforge';
import { ROLES } from '../../constants/roles';
import { useToast } from '../../hooks/useToast';

export default function OAuthCallback() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    async function handleAuth() {
      try {
        // Wait a brief moment for the InsForge SDK to finish PKCE token exchange
        await new Promise((r) => setTimeout(r, 600));

        const { data: authData, error: authErr } = await insforge.auth.getCurrentUser();

        if (authErr || !authData?.user) {
          throw new Error(authErr?.message || 'OAuth authentication failed. No valid session established.');
        }

        const user = authData.user;
        const userId = user.id;

        // Check if user_profile exists in PostgreSQL
        const { data: profileList, error: profErr } = await insforge.database
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .limit(1);

        if (profErr) {
          console.error('Error fetching user profile:', profErr);
        }

        let profile = profileList && profileList.length > 0 ? profileList[0] : null;

        // If no profile exists for this Google user, auto-create a strictly STUDENT profile
        if (!profile) {
          const rawName = user.profile?.name || user.email?.split('@')[0] || 'Campus Student';
          const initials = rawName
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0].toUpperCase())
            .join('') || 'CS';

          const newStudentProfile = {
            id: userId,
            email: user.email.toLowerCase(),
            name: rawName,
            role: ROLES.STUDENT, // Strictly enforce STUDENT role
            department: 'Civil Engineering',
            avatar_initials: initials,
            avatar_color: 'bg-indigo-600',
            is_active: true,
          };

          const { data: inserted, error: insertErr } = await insforge.database
            .from('user_profiles')
            .upsert([newStudentProfile])
            .select()
            .single();

          if (insertErr) {
            console.error('Error inserting initial Google student profile:', insertErr);
          } else {
            profile = inserted;
          }
        }

        if (isCancelled) return;

        // Check if suspended
        if (profile && profile.is_active === false) {
          toast.error('This account has been deactivated. Please contact an administrator.');
          navigate('/login', { replace: true });
          return;
        }

        const userRole = profile?.role || ROLES.STUDENT;
        toast.success(`Welcome back, ${profile?.name || user.email}!`);

        if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
          navigate('/admin/dashboard', { replace: true });
        } else if (
          userRole === 'STAFF' ||
          userRole === 'MAINTENANCE_STAFF' ||
          userRole === 'DEPARTMENT_STAFF'
        ) {
          navigate('/staff/dashboard', { replace: true });
        } else {
          navigate('/student/dashboard', { replace: true });
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('OAuth callback error:', err);
          setErrorMsg(err.message || 'Authentication failed');
          toast.error(err.message || 'OAuth authentication failed.');
          setTimeout(() => navigate('/login', { replace: true }), 2500);
        }
      }
    }

    handleAuth();

    return () => {
      isCancelled = true;
    };
  }, [navigate, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full text-center space-y-4">
        {errorMsg ? (
          <div className="space-y-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              ⚠️
            </div>
            <h3 className="text-sm font-bold text-slate-900">Authentication Failed</h3>
            <p className="text-xs text-slate-500">{errorMsg}</p>
            <p className="text-[11px] text-slate-400">Redirecting to login...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            <h3 className="text-sm font-bold text-slate-900">Verifying Google Credentials</h3>
            <p className="text-xs text-slate-500">
              Securing session and loading your campus role...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
