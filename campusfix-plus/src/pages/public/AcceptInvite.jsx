/**
 * AcceptInvite — Public invitation onboarding page for newly provisioned staff and admins.
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import insforge from '../../lib/insforge';
import Button from '../../components/ui/Button';
import { acceptInvitation } from '../../services/userService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/useToast';

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const { toast } = useToast();

  const [invitation, setInvitation] = useState(null);
  const [checking, setChecking] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function verifyToken() {
      if (!token) {
        setErrorMsg('No invitation token provided.');
        setChecking(false);
        return;
      }

      try {
        setChecking(true);
        // Look up token in public.invitations (allowed by policy for status = 'PENDING')
        const { data, error } = await insforge.database
          .from('invitations')
          .select('*')
          .eq('token', token)
          .eq('status', 'PENDING')
          .limit(1);

        if (error || !data || data.length === 0) {
          setErrorMsg('This invitation token is invalid, has expired, or has already been used.');
          return;
        }

        const inv = data[0];
        if (new Date(inv.expires_at).getTime() < Date.now()) {
          setErrorMsg('This invitation has expired. Please request a new invitation from an administrator.');
          return;
        }

        setInvitation(inv);
      } catch (err) {
        setErrorMsg(err.message || 'Failed to verify invitation.');
      } finally {
        setChecking(false);
      }
    }

    verifyToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    try {
      setSubmitting(true);
      await acceptInvitation({ token, password });
      toast.success('Account activated successfully! Logging you in...');

      // Automatic sign in
      const loggedUser = await login({ email: invitation.email, password });

      // Navigate to destination dashboard
      if (loggedUser.role === 'ADMIN' || loggedUser.role === 'SUPER_ADMIN') {
        navigate('/admin/dashboard', { replace: true });
      } else if (
        loggedUser.role === 'STAFF' ||
        loggedUser.role === 'MAINTENANCE_STAFF' ||
        loggedUser.role === 'DEPARTMENT_STAFF'
      ) {
        navigate('/staff/dashboard', { replace: true });
      } else {
        navigate('/student/dashboard', { replace: true });
      }
    } catch (err) {
      toast.error(err.message || 'Activation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg mb-4">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">CampusFix+ Institutional Onboarding</h2>
        <p className="mt-1 text-xs text-slate-500">
          Activate your verified campus maintenance or administrative account
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-slate-200">
          {checking ? (
            <div className="text-center py-8 space-y-3">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
              <p className="text-xs text-slate-500">Validating institutional invitation token...</p>
            </div>
          ) : errorMsg ? (
            <div className="text-center py-6 space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Invitation Unavailable</h3>
                <p className="mt-1 text-xs text-slate-500">{errorMsg}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/login')}>
                Back to Sign In
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 space-y-1.5 text-xs">
                <div className="font-semibold text-slate-900 flex items-center justify-between">
                  <span>{invitation.name}</span>
                  <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                    {invitation.role}
                  </span>
                </div>
                <div className="text-slate-500">{invitation.email}</div>
                {invitation.department && (
                  <div className="text-[11px] text-slate-600 font-medium">
                    Department: {invitation.department}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Create Secure Password *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full text-xs pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm Password *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    className="w-full text-xs pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button variant="primary" type="submit" loading={submitting} className="w-full justify-center">
                  Activate Account & Sign In <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
