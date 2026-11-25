import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { Shield, ArrowRight, Eye, EyeOff, AlertTriangle, Building2 } from 'lucide-react';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Checkbox from '../../components/ui/Checkbox';
import Button from '../../components/ui/Button';
import FormField from '../../components/ui/FormField';
import PasswordStrengthMeter from '../../components/common/PasswordStrengthMeter';
import { ALL_DEPARTMENTS, DEPARTMENT_META } from '../../constants/departments';
import { ROLES } from '../../constants/roles';

const STAFF_ROLES = [
  { value: ROLES.STAFF, label: 'Field Staff' },
  { value: 'MAINTENANCE_STAFF', label: 'Maintenance Staff' },
  { value: 'DEPARTMENT_STAFF', label: 'Department Staff' },
  { value: ROLES.ADMIN, label: 'Administrator' },
];

const DESIGNATIONS = [
  'Maintenance Specialist',
  'Senior Technician',
  'Junior Technician',
  'Electrician',
  'Plumber',
  'Civil Engineer',
  'IT Support Engineer',
  'Security Officer',
  'Housekeeping Supervisor',
  'Department Head',
  'Campus Estate Manager',
  'Administrative Officer',
];

export default function StaffRegister() {
  const { staffRegister } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    employeeId: '',
    phone: '',
    department: ALL_DEPARTMENTS[0],
    designation: 'Maintenance Specialist',
    role: ROLES.STAFF,
    password: '',
    confirmPassword: '',
    adminCode: '',
    terms: false,
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const empIdRef = useRef(null);
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);
  const adminCodeRef = useRef(null);

  function validate() {
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = 'Full name is required.';
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email))
      newErrors.email = 'Valid institutional email is required.';
    if (!form.employeeId.trim()) newErrors.employeeId = 'Employee ID is required.';
    if (!form.phone.trim() || form.phone.trim().length < 10)
      newErrors.phone = 'Valid phone number is required.';
    if (!form.password || form.password.length < 6)
      newErrors.password = 'Password must be at least 6 characters.';
    if (form.password !== form.confirmPassword)
      newErrors.confirmPassword = 'Passwords do not match.';
    if (!form.adminCode.trim())
      newErrors.adminCode = 'Organization registration code is required.';
    if (!form.terms)
      newErrors.terms = 'You must accept the institutional policies.';
    return newErrors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const formErrors = validate();
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      const firstRef = formErrors.name
        ? nameRef
        : formErrors.email
        ? emailRef
        : formErrors.employeeId
        ? empIdRef
        : formErrors.phone
        ? phoneRef
        : formErrors.password
        ? passwordRef
        : formErrors.confirmPassword
        ? confirmRef
        : adminCodeRef;
      firstRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setErrors({});
    try {
      const user = await staffRegister(form);
      toast.success(`Account created! Welcome, ${user.name}.`);

      const role = user.role;
      if (role === ROLES.ADMIN || role === 'SUPER_ADMIN') {
        navigate('/admin/dashboard', { replace: true });
      } else {
        navigate('/staff/dashboard', { replace: true });
      }
    } catch (err) {
      setErrors({ form: err.message });
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const isAdminRole = form.role === ROLES.ADMIN;

  return (
    <div className="py-8 sm:py-12">
      <div className="mx-auto max-w-xl px-4 sm:px-6">
        {/* Info Banner */}
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 shadow-sm">
          <div className="flex items-start gap-2">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <div>
              <p className="font-bold">Staff & Admin Registration Portal</p>
              <p className="mt-1 text-slate-600">
                This registration form is for <strong>authorized campus staff</strong> and <strong>administrators</strong> only.
                An <strong>organization registration code</strong> issued by your Campus Estate Office is required to complete registration.
              </p>
            </div>
          </div>
        </div>

        <Card className="p-6 sm:p-8">
          <div className="flex items-center gap-2.5 text-amber-700">
            <Building2 className="h-6 w-6" aria-hidden="true" />
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Staff / Admin Registration
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Create your institutional account for campus maintenance operations.
          </p>

          {errors.form && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{errors.form}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            {/* Name */}
            <FormField label="Full Name" required error={errors.name}>
              <Input
                ref={nameRef}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Ramesh Chandra"
                error={Boolean(errors.name)}
              />
            </FormField>

            {/* Email + Employee ID */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Institutional Email" required error={errors.email}>
                <Input
                  ref={emailRef}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="ramesh.c@staff.campusfix.edu"
                  error={Boolean(errors.email)}
                />
              </FormField>

              <FormField label="Employee ID" required error={errors.employeeId}>
                <Input
                  ref={empIdRef}
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  placeholder="e.g. STF-104"
                  error={Boolean(errors.employeeId)}
                />
              </FormField>
            </div>

            {/* Phone */}
            <FormField label="Phone Number" required error={errors.phone}>
              <Input
                ref={phoneRef}
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91-98XXXXXXXX"
                error={Boolean(errors.phone)}
              />
            </FormField>

            {/* Role + Department */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Account Role" required>
                <Select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  options={STAFF_ROLES}
                />
              </FormField>

              <FormField label="Assigned Department" required>
                <Select
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  options={ALL_DEPARTMENTS.map((d) => ({
                    value: d,
                    label: DEPARTMENT_META[d]?.label || d,
                  }))}
                />
              </FormField>
            </div>

            {/* Designation */}
            <FormField label="Designation">
              <Select
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
                options={DESIGNATIONS.map((d) => ({ value: d, label: d }))}
              />
            </FormField>

            {/* Passwords */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Password" required error={errors.password}>
                <div className="relative">
                  <Input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Min 6 characters"
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

              <FormField label="Confirm Password" required error={errors.confirmPassword}>
                <Input
                  ref={confirmRef}
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  placeholder="Repeat password"
                  error={Boolean(errors.confirmPassword)}
                />
              </FormField>
            </div>

            <PasswordStrengthMeter password={form.password} />

            {/* Admin / Organization Code */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <FormField
                label={isAdminRole ? 'Admin Authorization Code' : 'Organization Registration Code'}
                required
                error={errors.adminCode}
                hint="Provided by the Campus Estate Office or IT Administration."
              >
                <Input
                  ref={adminCodeRef}
                  type="password"
                  value={form.adminCode}
                  onChange={(e) => setForm({ ...form, adminCode: e.target.value })}
                  placeholder={isAdminRole ? 'Enter admin authorization code' : 'Enter organization code'}
                  error={Boolean(errors.adminCode)}
                />
              </FormField>
              {isAdminRole && (
                <p className="mt-2 text-[10px] text-rose-600 font-semibold flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Administrator accounts require a separate authorization code from the IT Security Office.
                </p>
              )}
            </div>

            {/* Terms */}
            <div className="pt-2">
              <Checkbox
                checked={form.terms}
                onChange={(e) => setForm({ ...form, terms: e.target.checked })}
                label="I confirm that I am an authorized campus employee and agree to institutional IT policies."
              />
              {errors.terms && <p className="mt-1 text-xs text-rose-600">{errors.terms}</p>}
            </div>

            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              className="w-full justify-center mt-3"
              icon={<ArrowRight className="h-4 w-4" />}
            >
              Complete {isAdminRole ? 'Admin' : 'Staff'} Registration
            </Button>
          </form>

          <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
            <span>
              Already registered?{' '}
              <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-700">
                Log in
              </Link>
            </span>
            <span>
              Student?{' '}
              <Link to="/register" className="font-semibold text-primary-600 hover:text-primary-700">
                Student Registration
              </Link>
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
