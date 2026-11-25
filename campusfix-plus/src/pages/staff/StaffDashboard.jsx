/**
 * StaffDashboard — Mobile-first workspace for field technicians and maintenance staff with Real-time Updates.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, RefreshCw, ListFilter, Radio, BellRing } from 'lucide-react';
import Button from '../../components/ui/Button';
import PrototypeBanner from '../../components/ui/PrototypeBanner';
import StaffStatCards from './components/StaffStatCards';
import StaffPriorityTasks from './components/StaffPriorityTasks';
import StaffWorkloadChart from './components/StaffWorkloadChart';
import { getAllComplaintsRaw } from '../../services/complaintService';
import realtimeService from '../../services/realtimeService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/useToast';

function formatRealtimeComplaint(raw) {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description || '',
    category: raw.category,
    priority: raw.priority,
    status: raw.status,
    department: raw.department,
    location: raw.location || {},
    reportedBy: raw.reported_by,
    reportedByName: raw.reported_by_name || 'Student',
    assignedTo: raw.assigned_to,
    assignedToName: raw.assigned_to_name,
    evidence: raw.evidence || [],
    aiAnalysis: raw.ai_analysis || null,
    createdAt: raw.created_at || new Date().toISOString(),
    updatedAt: raw.updated_at || new Date().toISOString(),
  };
}

export default function StaffDashboard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recentTaskAlert, setRecentTaskAlert] = useState(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const loadTasks = async () => {
    try {
      setLoading(true);
      const all = await getAllComplaintsRaw();
      // Filter strictly to complaints relevant to this staff member:
      // Either directly assigned OR belonging to their department
      const userDept = user?.department || user?.assignedDepartment;
      const myTasks = all.filter(
        (c) =>
          c.assignedTo === user?.id ||
          c.assignedTo === user?.name ||
          (userDept && c.department === userDept)
      );
      setTasks(myTasks);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [user]);

  // Real-time subscriptions for staff department & assignments
  useEffect(() => {
    if (!user) return;

    realtimeService.syncUser(user);

    const userDept = user.department || user.assignedDepartment;

    const unbindCreated = realtimeService.onComplaintCreated((rawComplaint) => {
      const isRelevant =
        rawComplaint.assigned_to === user.id ||
        (userDept && rawComplaint.department === userDept);

      if (isRelevant) {
        const formatted = formatRealtimeComplaint(rawComplaint);
        setTasks((prev) => [formatted, ...prev.filter((t) => t.id !== formatted.id)]);
        setRecentTaskAlert(formatted);
        toast.info(
          `🔔 New Department Work Order: ${formatted.id} (${formatted.category}) in ${
            formatted.location?.building || 'Campus'
          }`
        );
      }
    });

    const unbindUpdated = realtimeService.onComplaintUpdated((rawUpdate) => {
      const isRelevant =
        rawUpdate.assigned_to === user.id ||
        (userDept && rawUpdate.department === userDept);

      if (isRelevant) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === rawUpdate.id
              ? {
                  ...t,
                  status: rawUpdate.status || t.status,
                  priority: rawUpdate.priority || t.priority,
                  assignedTo: rawUpdate.assigned_to !== undefined ? rawUpdate.assigned_to : t.assignedTo,
                  assignedToName: rawUpdate.assigned_to_name !== undefined ? rawUpdate.assigned_to_name : t.assignedToName,
                  updatedAt: rawUpdate.updated_at || new Date().toISOString(),
                }
              : t
          )
        );

        toast.info(`Work Order ${rawUpdate.id} updated: Status is now ${rawUpdate.status}`);
      }
    });

    return () => {
      unbindCreated();
      unbindUpdated();
    };
  }, [user]);

  const handleStatCardFilter = (filterParams) => {
    const params = new URLSearchParams(filterParams);
    navigate(`/staff/tasks?${params.toString()}`);
  };

  return (
    <div className="space-y-5">
      {/* Technician Greeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Technician Workspace
            </h1>
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">
              <Wrench className="w-3.5 h-3.5" /> {user?.name || 'Staff'}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 animate-pulse">
              <Radio className="w-3 h-3 text-emerald-600" /> Live Feed Active
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Department:{' '}
            <strong className="text-slate-700">{user?.department || 'Facilities Maintenance'}</strong>. Real-time
            mobile dispatch log. Track open repairs, document parts used, and upload completion proof.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            iconLeft={RefreshCw}
            loading={loading}
            onClick={loadTasks}
            className="min-h-[44px] sm:min-h-0"
          >
            Sync Tasks
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={ListFilter}
            onClick={() => navigate('/staff/tasks')}
            className="min-h-[44px] sm:min-h-0"
          >
            All Tasks
          </Button>
        </div>
      </div>

      {/* Real-time Task Alert Banner */}
      {recentTaskAlert && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm animate-fadeIn">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-600 text-white shadow-xs">
                <BellRing className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">New Realtime Work Order:</span>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                    {recentTaskAlert.id}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                    {recentTaskAlert.priority}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  <strong>{recentTaskAlert.title}</strong> — {recentTaskAlert.location?.building || 'Campus'}{' '}
                  {recentTaskAlert.location?.room || ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => navigate(`/staff/tasks/${recentTaskAlert.id}`)}>
                Open Work Order
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setRecentTaskAlert(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      <PrototypeBanner />

      {/* 5 Field StatCards */}
      <StaffStatCards tasks={tasks} onSelectFilter={handleStatCardFilter} />

      {/* Today's Priority Work */}
      <StaffPriorityTasks tasks={tasks} />

      {/* Visual Workload Breakdown */}
      <StaffWorkloadChart tasks={tasks} />
    </div>
  );
}
