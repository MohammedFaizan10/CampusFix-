/**
 * complaintService.js — Real InsForge PostgreSQL Complaint Service.
 * Persists complaints, status updates, visual evidence, and triage history.
 */
import insforge from '../lib/insforge';
import { STATUSES } from '../constants/statuses';
import { PRIORITIES } from '../constants/priorities';
import { isTransitionAllowed } from '../constants/transitions';

function formatComplaint(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority || PRIORITIES.MEDIUM,
    status: row.status || STATUSES.SUBMITTED,
    location: row.location || {},
    reportedBy: row.reported_by,
    reportedByName: row.reported_by_name,
    reportedByEmail: row.reported_by_email,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to_name,
    department: row.department,
    evidence: row.evidence || [],
    aiAnalysis: row.ai_analysis || null,
    timeline: row.timeline || [],
    comments: row.comments || [],
    internalNotes: row.internal_notes || [],
    rejectionReason: row.rejection_reason || null,
    resolvedAt: row.resolved_at || null,
    verifiedAt: row.verified_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fetch all complaints raw for client-side aggregations.
 */
export async function getAllComplaintsRaw() {
  const { data, error } = await insforge.database
    .from('complaints')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Error fetching all complaints:', error.message);
    return [];
  }
  return (data || []).map(formatComplaint);
}

/**
 * Paginated and filtered complaint query matching Spring Data page structure.
 */
export async function getComplaints(filters = {}) {
  const {
    status, priority, category, department, building,
    reportedBy, assignedTo, search,
    page = 0, size = 10, sort = 'created_at', order = 'desc',
  } = filters;

  let query = insforge.database
    .from('complaints')
    .select('*');

  if (status && status !== 'ALL') query = query.eq('status', status);
  if (priority && priority !== 'ALL') query = query.eq('priority', priority);
  if (category && category !== 'ALL') query = query.eq('category', category);
  if (department && department !== 'ALL') query = query.eq('department', department);
  if (reportedBy) query = query.eq('reported_by', reportedBy);
  if (assignedTo && assignedTo !== 'ALL') {
    if (assignedTo === 'UNASSIGNED') {
      query = query.is('assigned_to', null);
    } else {
      query = query.eq('assigned_to', assignedTo);
    }
  }

  const dbSort = sort === 'createdAt' ? 'created_at' : sort === 'updatedAt' ? 'updated_at' : sort;
  query = query.order(dbSort, { ascending: order === 'asc' });

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch complaints: ${error.message}`);
  }

  let list = (data || []).map(formatComplaint);

  // Client-side filtering for JSON properties (building) and fuzzy search
  if (building && building !== 'ALL') {
    list = list.filter((c) => c.location?.building === building || c.location?.buildingId === building);
  }

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(
      (c) =>
        (c.title && c.title.toLowerCase().includes(q)) ||
        (c.description && c.description.toLowerCase().includes(q)) ||
        (c.id && c.id.toLowerCase().includes(q)) ||
        (c.category && c.category.toLowerCase().includes(q))
    );
  }

  const totalElements = list.length;
  const paginated = list.slice(page * size, page * size + size);

  return {
    content: paginated,
    totalElements,
    totalPages: Math.ceil(totalElements / size) || 1,
    page,
    size,
  };
}

/**
 * Fetch a single complaint by ticket ID.
 */
export async function getComplaintById(id) {
  const { data, error } = await insforge.database
    .from('complaints')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    throw new Error(`Complaint ${id} not found.`);
  }

  return formatComplaint(data);
}

/**
 * Upload an image evidence file to InsForge Storage bucket 'complaint-evidence'.
 * Returns permanent storage URL, key, and metadata.
 */
export async function uploadEvidenceFile(file) {
  if (!file) return null;
  try {
    const filename = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
    const { data, error } = await insforge.storage
      .from('complaint-evidence')
      .upload(filename, file);

    if (error) {
      console.warn('Storage upload error:', error.message);
      return null;
    }

    // Retrieve verified permanent URL from InsForge Storage
    const { data: urlData } = insforge.storage
      .from('complaint-evidence')
      .getPublicUrl(data.key || filename);

    return {
      name: file.name,
      url: urlData?.publicUrl || data.url,
      key: data.key || filename,
      size: file.size,
      type: file.type,
    };
  } catch (err) {
    console.warn('Upload evidence exception:', err);
    return null;
  }
}

/**
 * Create a new complaint record in PostgreSQL.
 */
export async function createComplaint(payload) {
  const now = new Date().toISOString();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const complaintId = `CF-2026-${randomSuffix}`;

  const row = {
    id: complaintId,
    title: payload.title,
    description: payload.description,
    category: payload.category,
    priority: payload.priority || PRIORITIES.MEDIUM,
    status: STATUSES.SUBMITTED,
    location: payload.location || {},
    reported_by: payload.reportedBy || null,
    reported_by_name: payload.reportedByName || null,
    reported_by_email: payload.reportedByEmail || null,
    assigned_to: null,
    assigned_to_name: null,
    department: payload.department || null,
    evidence: payload.evidence || [],
    ai_analysis: payload.aiAnalysis || null,
    timeline: [
      {
        status: STATUSES.SUBMITTED,
        at: now,
        by: payload.reportedBy,
        note: 'Issue reported by student resident.',
      },
    ],
    comments: [],
    internal_notes: [],
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await insforge.database
    .from('complaints')
    .insert([row])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to submit complaint: ${error.message}`);
  }

  return formatComplaint(data);
}

/**
 * Update complaint status and append timeline event.
 */
export async function updateStatus(id, payload) {
  const cur = await getComplaintById(id);
  const { status, note, by, role, assignedTo, assignedToName, department, priority, ...extra } = payload;

  if (role && status && status !== cur.status && !isTransitionAllowed(role, cur.status, status)) {
    throw new Error(`Illegal status transition from ${cur.status} to ${status} for role ${role}.`);
  }

  const now = new Date().toISOString();
  const nextStatus = status || cur.status;

  const newTimeline = [
    ...(cur.timeline || []),
    { status: nextStatus, at: now, by, note: note ?? '' },
  ];

  const patch = {
    status: nextStatus,
    updated_at: now,
    timeline: newTimeline,
    ...(assignedTo !== undefined && { assigned_to: assignedTo }),
    ...(assignedToName !== undefined && { assigned_to_name: assignedToName }),
    ...(department !== undefined && { department }),
    ...(priority !== undefined && { priority }),
    ...(nextStatus === STATUSES.RESOLVED && { resolved_at: now }),
    ...(nextStatus === STATUSES.VERIFIED && { verified_at: now }),
  };

  const { data, error } = await insforge.database
    .from('complaints')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update complaint: ${error.message}`);
  }

  return formatComplaint(data);
}

/**
 * Assign complaint to maintenance staff.
 */
export async function assignComplaint(id, { department, assignedTo, assignedToName, note, by, role }) {
  return updateStatus(id, {
    status: STATUSES.ASSIGNED,
    department,
    assignedTo,
    assignedToName,
    note: note || `Assigned to ${department}`,
    by,
    role,
  });
}

/**
 * Set SLA priority level.
 */
export async function setPriority(id, { priority, note, by }) {
  const cur = await getComplaintById(id);
  const now = new Date().toISOString();

  const newTimeline = [
    ...(cur.timeline || []),
    { status: cur.status, at: now, by, note: note || `Priority adjusted to ${priority}` },
  ];

  const { data, error } = await insforge.database
    .from('complaints')
    .update({
      priority,
      updated_at: now,
      timeline: newTimeline,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return formatComplaint(data);
}

/**
 * Bulk assign complaints.
 */
export async function bulkAssign(ids, { department, assignedTo, by, role }) {
  let count = 0;
  for (const id of ids) {
    try {
      await assignComplaint(id, { department, assignedTo, by, role });
      count++;
    } catch (err) {
      console.warn(`Failed to bulk assign ${id}:`, err);
    }
  }
  return { success: true, count };
}

/**
 * Add communication comment.
 */
export async function addComment(id, payload) {
  const cur = await getComplaintById(id);
  const comment = {
    id: `c-${id}-${Date.now().toString(36)}`,
    by: payload.by,
    role: payload.role || 'USER',
    at: new Date().toISOString(),
    text: payload.text,
  };

  const newComments = [...(cur.comments || []), comment];

  const { error } = await insforge.database
    .from('complaints')
    .update({ comments: newComments })
    .eq('id', id);

  if (error) throw new Error(error.message);
  return comment;
}

/**
 * Add private administrator/staff internal note.
 */
export async function addInternalNote(id, payload) {
  const cur = await getComplaintById(id);
  const note = {
    id: `in-${id}-${Date.now().toString(36)}`,
    by: payload.by,
    at: new Date().toISOString(),
    text: payload.text,
  };

  const newNotes = [...(cur.internalNotes || []), note];

  const { error } = await insforge.database
    .from('complaints')
    .update({ internal_notes: newNotes })
    .eq('id', id);

  if (error) throw new Error(error.message);
  return note;
}
