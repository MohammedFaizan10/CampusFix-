/**
 * AdminDashboard — Command center for facilities administrators with Real-time Complaint Visibility.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, RefreshCw, Layers, Radio, Sparkles, BellRing } from 'lucide-react';
import Button from '../../components/ui/Button';
import PrototypeBanner from '../../components/ui/PrototypeBanner';
import AdminStatCards from './components/AdminStatCards';
import AdminCharts from './components/AdminCharts';
import AdminNeedsAction from './components/AdminNeedsAction';
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
    reportedByEmail: raw.reported_by_email,
    assignedTo: raw.assigned_to,
    assignedToName: raw.assigned_to_name,
    evidence: raw.evidence || [],
    aiAnalysis: raw.ai_analysis || null,
    createdAt: raw.created_at || new Date().toISOString(),
    updatedAt: raw.updated_at || new Date().toISOString(),
    isRealtimeNew: true,
  };
}

export default function AdminDashboard() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recentLiveAlert, setRecentLiveAlert] = useState(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getAllComplaintsRaw();
      setComplaints(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Set up Realtime subscriptions for new complaint and status updates
  useEffect(() => {
    if (!user) return;

    realtimeService.syncUser(user);

    // Listen for new complaints inserted across campus
    const unbindCreated = realtimeService.onComplaintCreated((rawComplaint) => {
      const formatted = formatRealtimeComplaint(rawComplaint);
      setComplaints((prev) => [formatted, ...prev.filter((c) => c.id !== formatted.id)]);

      // Display live notification badge & alert banner
      setRecentLiveAlert(formatted);

      toast.info(
        `🚨 New ${formatted.priority} Complaint: ${formatted.id} (${formatted.category}) at ${
          formatted.location?.building || 'Campus'
        }`
      );
    });

    // Listen for status or assignment updates
    const unbindUpdated = realtimeService.onComplaintUpdated((rawUpdate) => {
      setComplaints((prev) =>
        prev.map((item) =>
          item.id === rawUpdate.id
            ? {
                ...item,
                status: rawUpdate.status || item.status,
                priority: rawUpdate.priority || item.priority,
                department: rawUpdate.department || item.department,
                assignedTo: rawUpdate.assigned_to !== undefined ? rawUpdate.assigned_to : item.assignedTo,
                assignedToName:
                  rawUpdate.assigned_to_name !== undefined ? rawUpdate.assigned_to_name : item.assignedToName,
                updatedAt: rawUpdate.updated_at || new Date().toISOString(),
              }
            : item
        )
      );

      toast.info(`Complaint ${rawUpdate.id} updated: Status is now ${rawUpdate.status}`);
    });

    return () => {
      unbindCreated();
      unbindUpdated();
    };
  }, [user]);

  const handleStatCardFilter = (filterParams) => {
    const searchParams = new URLSearchParams(filterParams);
    navigate(`/admin/complaints?${searchParams.toString()}`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Operations Console</h1>
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">
              <ShieldCheck className="w-3.5 h-3.5" /> Facilities Admin
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 animate-pulse">
              <Radio className="w-3 h-3 text-emerald-600" /> Live Realtime Active
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time campus maintenance monitoring, automated SLA tracking, and staff dispatch.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" iconLeft={RefreshCw} loading={loading} onClick={loadData}>
            Sync Feed
          </Button>
          <Button variant="primary" size="sm" iconLeft={Layers} onClick={() => navigate('/admin/assignments')}>
            Dispatch Queue
          </Button>
        </div>
      </div>

      {/* Real-time Alert Banner for Newly Ingested Complaints */}
      {recentLiveAlert && (
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50 p-4 shadow-sm transition-all animate-fadeIn">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-600 text-white shadow-xs">
                <BellRing className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">Real-time Complaint Received:</span>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                    {recentLiveAlert.id}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                    {recentLiveAlert.priority}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  <strong>{recentLiveAlert.title}</strong> — {recentLiveAlert.category} ({recentLiveAlert.department}) in{' '}
                  {recentLiveAlert.location?.building || 'Campus'} {recentLiveAlert.location?.room || ''} (Submitted:{' '}
                  {new Date(recentLiveAlert.createdAt).toLocaleTimeString()})
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(`/admin/complaints?search=${recentLiveAlert.id}`)}
              >
                View Ticket
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setRecentLiveAlert(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      <PrototypeBanner />

      {/* 6 Key StatCards */}
      <AdminStatCards complaints={complaints} onSelectFilter={handleStatCardFilter} />

      {/* Urgent Action List */}
      <AdminNeedsAction complaints={complaints} />

      {/* Recharts Visual Breakdown */}
      <AdminCharts complaints={complaints} />
    </div>
  );
}
