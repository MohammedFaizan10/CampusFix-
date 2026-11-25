/**
 * CreateStaffModal — Dialog for onboarded technicians, supervisors, and administrators.
 * Supports both Direct Account Provisioning and Secure Invitation Link Generation.
 */
import { useState } from 'react';
import { Copy, Check, Send, UserCheck, ShieldAlert } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { ALL_DEPARTMENTS, DEPARTMENT_META } from '../../../constants/departments';
import { createStaffUser, createInvitation } from '../../../services/userService';
import { ROLES } from '../../../constants/roles';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../hooks/useToast';

export default function CreateStaffModal({ isOpen, onClose, onSuccess }) {
  const { user: currentAdmin } = useAuth();
  const isSuperAdmin = currentAdmin?.role === 'SUPER_ADMIN';

  const [mode, setMode] = useState('direct'); // 'direct' | 'invite'
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: ROLES.STAFF,
    employeeId: '',
    designation: 'Maintenance Specialist',
    assignedDepartment: ALL_DEPARTMENTS[0],
    phone: '',
    password: '',
  });

  const [generatedInvite, setGeneratedInvite] = useState(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleCopyLink = () => {
    if (!generatedInvite?.token) return;
    const inviteUrl = `${window.location.origin}/invite/${generatedInvite.token}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success('Invitation link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      toast.error('Please complete name and email.');
      return;
    }

    try {
      setSubmitting(true);

      if (mode === 'direct') {
        const finalPassword = formData.password || 'Staff@12345';
        await createStaffUser({
          ...formData,
          password: finalPassword,
        });
        toast.success(`Account provisioned successfully for ${formData.name}!`);
        onSuccess?.();
        handleClose();
      } else {
        // Invite mode
        const inv = await createInvitation(formData);
        setGeneratedInvite(inv);
        toast.success(`Invitation created for ${formData.name}!`);
        onSuccess?.();
      }
    } catch (err) {
      toast.error(err.message || 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setGeneratedInvite(null);
    setCopied(false);
    setFormData({
      name: '',
      email: '',
      role: ROLES.STAFF,
      employeeId: '',
      designation: 'Maintenance Specialist',
      assignedDepartment: ALL_DEPARTMENTS[0],
      phone: '',
      password: '',
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Provision Staff & Admin Account"
      description="Create accounts or issue secure onboarding invitations with role-based access control."
    >
      {generatedInvite ? (
        <div className="space-y-4 pt-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <div className="flex items-center gap-2 font-semibold">
              <UserCheck className="h-5 w-5 text-emerald-600" />
              Invitation Successfully Created!
            </div>
            <p className="mt-1 text-xs text-emerald-700">
              Share the secure link below with <strong>{generatedInvite.name}</strong> ({generatedInvite.email}). They can use this link to set their password and activate their account.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Invitation URL</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/invite/${generatedInvite.token}`}
                className="w-full text-xs font-mono bg-slate-50 rounded-lg border border-slate-200 p-2.5 text-slate-700 select-all"
              />
              <Button variant="outline" size="sm" iconLeft={copied ? Check : Copy} onClick={handleCopyLink}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">This token expires in 7 days and can only be used once.</p>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-100">
            <Button variant="primary" onClick={handleClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Workflow Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode('direct')}
              className={`py-1.5 rounded-md transition-all ${
                mode === 'direct' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Direct Provisioning
            </button>
            <button
              type="button"
              onClick={() => setMode('invite')}
              className={`py-1.5 rounded-md transition-all ${
                mode === 'invite' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Secure Invitation Link
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Ramesh Chandra"
                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Institutional Email *</label>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                placeholder="e.g. ramesh.c@staff.campusfix.edu"
                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Account Role *</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-indigo-500"
              >
                <option value={ROLES.STAFF}>Field Staff (STAFF)</option>
                <option value="MAINTENANCE_STAFF">Maintenance Staff</option>
                <option value="DEPARTMENT_STAFF">Department Staff</option>
                {isSuperAdmin && <option value={ROLES.ADMIN}>Administrator (ADMIN)</option>}
              </select>
              {!isSuperAdmin && (
                <p className="mt-1 text-[10px] text-slate-400">Only Super Admins can provision Administrator roles.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Department *</label>
              <select
                name="assignedDepartment"
                value={formData.assignedDepartment}
                onChange={handleChange}
                className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-indigo-500"
              >
                {ALL_DEPARTMENTS.map((deptKey) => (
                  <option key={deptKey} value={deptKey}>
                    {DEPARTMENT_META[deptKey]?.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Employee ID</label>
              <input
                type="text"
                name="employeeId"
                value={formData.employeeId}
                onChange={handleChange}
                placeholder="e.g. STF-104"
                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Designation</label>
              <input
                type="text"
                name="designation"
                value={formData.designation}
                onChange={handleChange}
                placeholder="e.g. Senior Electrician"
                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+91-98XXXXXXXX"
                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {mode === 'direct' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Password <span className="text-slate-400 font-normal">(Default: Staff@12345)</span>
                </label>
                <input
                  type="text"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Staff@12345"
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button variant="secondary" type="button" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={submitting}>
              {mode === 'direct' ? 'Provision Account' : 'Generate Invitation'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
