/**
 * Login — Authenticates users into their respective role portals.
 */
import { useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogIn, ArrowRight, ShieldAlert, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import Card from '../../components/ui/Card';
import FormField from '../../components/ui/FormField';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import DemoAccountsPanel from './components/DemoAccountsPanel';
import { useAuth } from '../../context/AuthContext';
import * as authService from '../../services/authService';
import { useToast } from '../../hooks/useToast';
import { ROLES } from '../../constants/roles';

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [rateLimitMessage, setRateLimitMessage] = useState('');

  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);

  const from = location.state?.from?.pathname;

  function validate() {
    const errs = {};
    if (!email.trim()) errs.email = 'Institutional email is required.';
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = 'Enter a valid email address.';
    if (!password) errs.password = 'Password is required.';
    return errs;
  }

  function fillDemo(acc) {
    setEmail(acc.email);
    setPassword(acc.password);
    setErrors({});
    setRateLimitMessage('');
  }

  async function handleGoogleLogin() {
    try {
      setGoogleLoading(true);
      await authService.signInWithGoogle();
    } catch (err) {
      toast.error(err.message || 'Failed to initiate Google login.');
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setRateLimitMessage('');
    const formErrors = validate();
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      if (formErrors.email) emailInputRef.current?.focus();
      else if (formErrors.password) passwordInputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setErrors({});
    try {
      const user = await login({ email: email.trim(), password });
      toast.success(`Welcome back, ${user.name}!`);

      if (from) {
        navigate(from, { replace: true });
        return;
      }

      const role = user.role;
      if (role === ROLES.ADMIN || role === 'SUPER_ADMIN') {
        navigate('/admin/dashboard', { replace: true });
      } else if (
        role === ROLES.STAFF ||
        role === 'MAINTENANCE_STAFF' ||
        role === 'DEPARTMENT_STAFF'
      ) {
        navigate('/staff/dashboard', { replace: true });
      } else {
        navigate('/student/dashboard', { replace: true });
      }
    } catch (err) {
      const msg = err.message || 'Authentication failed.';
      setErrors({ form: msg });
      toast.error(msg);
      passwordInputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="py-8 sm:py-14">
      <div className="mx-auto max-w-xl px-4 sm:px-6">
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-900 shadow-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <div>
            <strong>InsForge Backend Active:</strong> Real authentication, PostgreSQL persistence, and Realtime are live on project <code>CampusFix+</code>. Use your registered credentials, Google account, or select a pre-provisioned account below.
          </div>
        </div>

        <Card className="p-6 sm:p-8">
          <div className="flex items-center gap-2.5 text-primary-700">
            <LogIn className="h-6 w-6" aria-hidden="true" />
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Portal Login</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">Sign in to access your designated campus portal.</p>

          {rateLimitMessage && (
            <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{rateLimitMessage}</span>
            </div>
          )}
          {errors.form && !rateLimitMessage && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{errors.form}</div>
          )}

          <div className="mt-6"><DemoAccountsPanel onFillDemo={fillDemo} /></div>

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <FormField label="Institutional Email" required error={errors.email} hint="e.g. arjun.mehta@student.campusfix.edu">
              <Input
                ref={emailInputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@campusfix.edu"
                error={Boolean(errors.email)}
              />
            </FormField>

            <FormField label="Password" required error={errors.password}>
              <div className="relative">
                <Input
                  ref={passwordInputRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  error={Boolean(errors.password)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </FormField>

            <div className="flex items-center justify-between text-xs pt-1">
              <Link to="/forgot-password" className="font-medium text-primary-600 hover:text-primary-700">Forgot password?</Link>
              <div className="flex items-center gap-2">
                <Link to="/register" className="font-medium text-slate-600 hover:text-slate-900">
                  Student <span className="text-primary-600 underline">Register</span>
                </Link>
                <span className="text-slate-300">|</span>
                <Link to="/register/staff" className="font-medium text-amber-600 hover:text-amber-700 underline">
                  Staff / Admin
                </Link>
              </div>
            </div>

            <Button type="submit" variant="primary" loading={submitting} className="w-full justify-center mt-2" icon={<ArrowRight className="h-4 w-4" />}>
              Sign In to Portal
            </Button>
          </form>

          {/* Social OAuth Divider & Google Button */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400 font-semibold">Or continue with</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-slate-300 rounded-xl bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs disabled:opacity-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            {googleLoading ? 'Connecting to Google...' : 'Continue with Google'}
          </button>
        </Card>
      </div>
    </div>
  );
}
