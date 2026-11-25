/**
 * AdminUsers — User account administration with role controls, profile editing, audit logs, and security boundaries.
 */
import { useState, useEffect } from 'react';
import {
  UserPlus,
  Search,
  Shield,
  RefreshCw,
  Power,
  KeyRound,
  Edit,
  Mail,
  Clock,
  History,
  Copy,
  Check,
  Trash2,
  CheckCircle2,
  XCircle,
  Eye,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import PrototypeBanner from '../../components/ui/PrototypeBanner';
import CreateStaffModal from './components/CreateStaffModal';
import {
  getUsers,
  toggleUserStatus,
  changeUserRole,
  updateUser,
  getInvitations,
  revokeInvitation,
  getAuditLogs,
  initiatePasswordReset,
} from '../../services/userService';
import { ALL_DEPARTMENTS, DEPARTMENT_META } from '../../constants/departments';
import { ROLES } from '../../constants/roles';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/useToast';

export default function AdminUsers() {
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'invitations' | 'audit'
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters for users
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // Modals & Action Targets
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // User object being edited
  const [confirmTarget, setConfirmTarget] = useState(null); // { user, action: 'toggle' | 'role', newRole }
  const [submitting, setSubmitting] = useState(false);
  const [copiedToken, setCopiedToken] = useState(null);

  const { user: currentAdmin } = useAuth();
  const isSuperAdmin = currentAdmin?.role === 'SUPER_ADMIN';
  const { toast } = useToast();

  const loadData = async () => {
    try {
      setLoading(true);
      if (activeTab === 'users') {
        const data = await getUsers({ role: roleFilter, status: statusFilter, search });
        setUsers(data);
      } else if (activeTab === 'invitations') {
        const invs = await getInvitations();
        setInvitations(invs);
      } else if (activeTab === 'audit') {
        const logs = await getAuditLogs(100);
        setAuditLogs(logs);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, roleFilter, statusFilter, search]);

  const handleConfirmAction = async () => {
    if (!confirmTarget) return;
    try {
      setSubmitting(true);
      if (confirmTarget.action === 'toggle') {
        await toggleUserStatus(confirmTarget.user.id, currentAdmin?.id);
        toast.success(`User ${confirmTarget.user.name} status updated.`);
      } else if (confirmTarget.action === 'role') {
        await changeUserRole(confirmTarget.user.id, confirmTarget.newRole, currentAdmin?.id);
        toast.success(`User ${confirmTarget.user.name} role changed to ${confirmTarget.newRole}.`);
      }
      setConfirmTarget(null);
      loadData();
    } catch (err) {
      toast.error(err.message || 'Operation blocked.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async (email, name) => {
    try {
      setSubmitting(true);
      await initiatePasswordReset(email);
      toast.success(`Password reset link dispatched for ${name} (${email}).`);
    } catch (err) {
      toast.error(err.message || 'Failed to initiate password reset.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      setSubmitting(true);
      await updateUser(editingUser.id, {
        name: editingUser.name,
        department: editingUser.department,
        designation: editingUser.designation,
        employeeId: editingUser.employeeId,
        phone: editingUser.phone,
      });
      toast.success(`Profile updated for ${editingUser.name}.`);
      setEditingUser(null);
      loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to save profile changes.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeInvite = async (invId) => {
    try {
      await revokeInvitation(invId);
      toast.success('Invitation revoked.');
      loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to revoke invitation.');
    }
  };

  const handleCopyInviteLink = (token) => {
    const inviteUrl = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedToken(token);
    toast.success('Invitation link copied!');
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const getRoleBadgeVariant = (role) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'danger';
      case 'ADMIN':
        return 'warning';
      case 'STAFF':
      case 'MAINTENANCE_STAFF':
      case 'DEPARTMENT_STAFF':
        return 'info';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">User Account Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage student directories, administrative privileges, staff assignments, and audit trails.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" iconLeft={RefreshCw} loading={loading} onClick={loadData}>
            Refresh
          </Button>
          <Button variant="primary" size="sm" iconLeft={UserPlus} onClick={() => setIsCreateModalOpen(true)}>
            Provision Account
          </Button>
        </div>
      </div>

      <PrototypeBanner />

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Active Directory ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('invitations')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'invitations'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Pending Invitations ({invitations.filter((i) => i.status === 'PENDING').length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Security Audit Logs
        </button>
      </div>

      {/* TAB 1: ACCOUNTS DIRECTORY */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name, email, roll, or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {['ALL', ROLES.STUDENT, ROLES.STAFF, 'MAINTENANCE_STAFF', 'DEPARTMENT_STAFF', ROLES.ADMIN, 'SUPER_ADMIN'].map(
                (r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoleFilter(r)}
                    className={`text-[11px] px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                      roleFilter === r
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {r.replace('_', ' ')}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Affiliation / Dept</th>
                    <th className="py-3 px-4">Employee/Roll ID</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center py-8 text-slate-400">
                        No user accounts match current criteria.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const isSelf = u.id === currentAdmin?.id;
                      const canModifyRole = isSuperAdmin || (u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN');

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900 flex items-center gap-2">
                              {u.name}{' '}
                              {isSelf && (
                                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">{u.email}</div>
                          </td>
                          <td className="py-3 px-4">
                            {canModifyRole && !isSelf ? (
                              <select
                                value={u.role}
                                onChange={(e) =>
                                  setConfirmTarget({ user: u, action: 'role', newRole: e.target.value })
                                }
                                className="text-xs rounded border border-slate-200 px-2 py-1 bg-white font-medium text-slate-700 focus:ring-1 focus:ring-indigo-500"
                              >
                                <option value={ROLES.STUDENT}>STUDENT</option>
                                <option value={ROLES.STAFF}>STAFF</option>
                                <option value="MAINTENANCE_STAFF">MAINTENANCE_STAFF</option>
                                <option value="DEPARTMENT_STAFF">DEPARTMENT_STAFF</option>
                                {isSuperAdmin && <option value={ROLES.ADMIN}>ADMIN</option>}
                                {isSuperAdmin && <option value="SUPER_ADMIN">SUPER_ADMIN</option>}
                              </select>
                            ) : (
                              <Badge variant={getRoleBadgeVariant(u.role)}>{u.role}</Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {u.department || u.assignedDepartment || (u.role === 'STUDENT' ? 'Student Body' : 'General')}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                            {u.employeeId || u.rollNumber || '—'}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                u.isActive
                                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                  : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                              />
                              {u.isActive ? 'Active' : 'Suspended'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                title="Edit Profile Details"
                                onClick={() => setEditingUser({ ...u })}
                                className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                title="Send Password Reset Email"
                                onClick={() => handlePasswordReset(u.email, u.name)}
                                className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>
                              {!isSelf && (
                                <button
                                  type="button"
                                  title={u.isActive ? 'Deactivate Account' : 'Reactivate Account'}
                                  onClick={() => setConfirmTarget({ user: u, action: 'toggle' })}
                                  className={`p-1 rounded transition-colors ${
                                    u.isActive
                                      ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                      : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                                  }`}
                                >
                                  <Power className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PENDING INVITATIONS */}
      {activeTab === 'invitations' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Invitee</th>
                  <th className="py-3 px-4">Assigned Role</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Expires</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invitations.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-8 text-slate-400">
                      No invitations issued yet. Use "Provision Account" to generate invitation links.
                    </td>
                  </tr>
                ) : (
                  invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{inv.name}</div>
                        <div className="text-[11px] text-slate-500">{inv.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="info">{inv.role}</Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{inv.department || '—'}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            inv.status === 'ACCEPTED'
                              ? 'bg-emerald-50 text-emerald-700'
                              : inv.status === 'PENDING'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {inv.status === 'PENDING' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                iconLeft={copiedToken === inv.token ? Check : Copy}
                                onClick={() => handleCopyInviteLink(inv.token)}
                              >
                                {copiedToken === inv.token ? 'Copied' : 'Copy Link'}
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                iconLeft={Trash2}
                                onClick={() => handleRevokeInvite(inv.id)}
                              >
                                Revoke
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target User / Email</th>
                  <th className="py-3 px-4">Executed By</th>
                  <th className="py-3 px-4">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-8 text-slate-400">
                      No security audit records recorded yet.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded font-mono text-[10px]">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{log.target_email}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {log.performed_by_name || 'System'}{' '}
                        <span className="text-[10px] text-slate-400">({log.performed_by_role || 'SYSTEM'})</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[10px] text-slate-500 max-w-xs truncate">
                        {JSON.stringify(log.details)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: PROVISION NEW ACCOUNT */}
      <CreateStaffModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={loadData}
      />

      {/* MODAL: EDIT USER PROFILE */}
      {editingUser && (
        <Modal
          isOpen={!!editingUser}
          onClose={() => setEditingUser(null)}
          title={`Edit Account Details — ${editingUser.name}`}
          description={`Update institutional profile records for ${editingUser.email}.`}
        >
          <form onSubmit={handleSaveProfile} className="space-y-3 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Employee / Roll ID</label>
                <input
                  type="text"
                  value={editingUser.employeeId || editingUser.rollNumber || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, employeeId: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Department</label>
                <select
                  value={editingUser.department || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, department: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">None / Campus Wide</option>
                  {ALL_DEPARTMENTS.map((deptKey) => (
                    <option key={deptKey} value={deptKey}>
                      {DEPARTMENT_META[deptKey]?.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Designation</label>
                <input
                  type="text"
                  value={editingUser.designation || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, designation: e.target.value })}
                  placeholder="e.g. Lead Engineer"
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                type="text"
                value={editingUser.phone || ''}
                onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                placeholder="+91-98XXXXXXXX"
                className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <Button variant="secondary" type="button" onClick={() => setEditingUser(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={submitting}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmTarget && (
        <Modal
          isOpen={!!confirmTarget}
          onClose={() => setConfirmTarget(null)}
          title="Confirm Administrative Security Action"
          description="This action modifies access privileges and will be logged in the database security audit log."
        >
          <div className="space-y-4 pt-2">
            <p className="text-xs text-slate-600">
              {confirmTarget.action === 'toggle' ? (
                <>
                  Are you sure you want to {confirmTarget.user.isActive ? 'deactivate' : 'reactivate'} account{' '}
                  <strong>{confirmTarget.user.name}</strong> ({confirmTarget.user.email})?
                </>
              ) : (
                <>
                  Are you sure you want to promote/change <strong>{confirmTarget.user.name}</strong> from{' '}
                  <span className="font-semibold">{confirmTarget.user.role}</span> to{' '}
                  <span className="font-semibold text-indigo-600">{confirmTarget.newRole}</span>?
                </>
              )}
            </p>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <Button variant="secondary" onClick={() => setConfirmTarget(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant={confirmTarget.action === 'toggle' && confirmTarget.user.isActive ? 'danger' : 'primary'}
                loading={submitting}
                onClick={handleConfirmAction}
              >
                Confirm Action
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
