/**
/**
 * notificationService.js — Real InsForge PostgreSQL Notification Service.
 * Manages user notifications, persistence, unread counters, and Realtime delivery.
 */
import insforge from '../lib/insforge';

function formatNotification(n, userRole) {
  const rolePrefix = userRole ? userRole.toLowerCase() : 'student';
  let link = `/${rolePrefix}/notifications`;
  if (n.complaint_id) {
    if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
      link = `/admin/complaints?search=${n.complaint_id}`;
    } else if (userRole === 'STAFF' || userRole === 'MAINTENANCE_STAFF' || userRole === 'DEPARTMENT_STAFF') {
      link = `/staff/tasks?search=${n.complaint_id}`;
    } else {
      link = `/student/complaints/${n.complaint_id}`;
    }
  }

  return {
    id: n.id,
    userId: n.recipient_id,
    complaintId: n.complaint_id,
    type: n.type,
    title: n.title,
    body: n.message,
    read: n.is_read,
    createdAt: n.created_at,
    link,
  };
}

/**
 * Fetch notifications for a user from InsForge PostgreSQL.
 * @param {string} userId
 * @param {{unreadOnly?: boolean, limit?: number, role?: string}} options
 * @returns {Promise<object[]>}
 */
export async function getNotifications(userId, options = {}) {
  if (!userId) return [];

  let query = insforge.database
    .from('notifications')
    .select('*')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false });

  if (options.unreadOnly) {
    query = query.eq('is_read', false);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Failed to load notifications from PostgreSQL:', error.message);
    return [];
  }

  return (data || []).map((n) => formatNotification(n, options.role));
}

/**
 * Mark a single notification as read.
 * @param {string} notifId
 * @returns {Promise<void>}
 */
export async function markRead(notifId) {
  if (!notifId) return;
  const { error } = await insforge.database
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notifId);

  if (error) {
    console.error('Failed to mark notification read:', error.message);
  }
}

/**
 * Mark all notifications for a user as read.
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function markAllRead(userId) {
  if (!userId) return;
  const { error } = await insforge.database
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', userId)
    .eq('is_read', false);

  if (error) {
    console.error('Failed to mark all notifications read:', error.message);
  }
}

/**
 * Get unread notification count for a user.
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function getUnreadCount(userId) {
  if (!userId) return 0;
  const { count, error } = await insforge.database
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('is_read', false);

  if (error) {
    console.error('Failed to get unread count:', error.message);
    return 0;
  }
  return count || 0;
}

/**
 * Subscribe to realtime notifications for a specific user.
 * @param {string} userId
 * @param {(notification: object) => void} onNotification
 * @returns {Promise<() => void>} Cleanup function
 */
export async function subscribeToUserNotifications(userId, onNotification) {
  if (!userId) return () => {};

  const channel = `notifications:user:${userId}`;

  try {
    if (!insforge.realtime.isConnected) {
      await insforge.realtime.connect();
    }

    const subRes = await insforge.realtime.subscribe(channel);
    if (!subRes.ok) {
      console.warn(`[Realtime] Failed to subscribe to ${channel}:`, subRes.error?.message);
    }

    const handler = (payload) => {
      if (onNotification && payload) {
        onNotification({
          id: payload.id,
          userId: payload.recipient_id,
          complaintId: payload.complaint_id,
          type: payload.type,
          title: payload.title,
          body: payload.message,
          read: payload.is_read || false,
          createdAt: payload.created_at || new Date().toISOString(),
          link: payload.complaint_id ? `/student/complaints/${payload.complaint_id}` : '/notifications',
        });
      }
    };

    insforge.realtime.on('new_notification', handler);

    return () => {
      insforge.realtime.off('new_notification', handler);
      insforge.realtime.unsubscribe(channel);
    };
  } catch (err) {
    console.error('[Realtime] Notification subscription error:', err);
    return () => {};
  }
}
