/**
 * realtimeService.js — InsForge Realtime Subscription & Event Routing.
 * Manages WebSocket pub/sub connections and broadcasts database events to dashboards.
 */
import insforge from '../lib/insforge';

class RealtimeManager {
  constructor() {
    this.currentUser = null;
    this.activeChannels = new Set();
    this.listeners = {
      complaint_created: new Set(),
      complaint_updated: new Set(),
    };
    this.isInitialized = false;
  }

  /**
   * Synchronize subscriptions with the authenticated user profile.
   * @param {object|null} user
   */
  async syncUser(user) {
    if (!user) {
      await this.cleanup();
      return;
    }

    if (this.currentUser?.id === user.id && this.currentUser?.role === user.role && this.isInitialized) {
      return;
    }

    this.currentUser = user;
    await this.setupChannels();
  }

  async setupChannels() {
    try {
      if (!insforge.realtime.isConnected) {
        await insforge.realtime.connect();
      }

      // 1. Determine channels to join based on user role and permissions
      const targetChannels = [];
      const role = this.currentUser?.role;
      const dept = this.currentUser?.department || this.currentUser?.assignedDepartment;

      if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
        targetChannels.push('complaints:all');
      } else if (role === 'STAFF' || role === 'MAINTENANCE_STAFF' || role === 'DEPARTMENT_STAFF') {
        if (dept) {
          targetChannels.push(`complaints:dept:${dept}`);
        }
      } else if (role === 'STUDENT' && this.currentUser?.id) {
        targetChannels.push(`complaints:user:${this.currentUser.id}`);
      }

      // Always subscribe to personal notifications channel
      if (this.currentUser?.id) {
        targetChannels.push(`notifications:user:${this.currentUser.id}`);
      }

      // Subscribe to target channels
      for (const ch of targetChannels) {
        if (!this.activeChannels.has(ch)) {
          const res = await insforge.realtime.subscribe(ch);
          if (res.ok) {
            this.activeChannels.add(ch);
          } else {
            console.warn(`[Realtime] Failed to subscribe to channel ${ch}:`, res.error?.message);
          }
        }
      }

      // Bind global event handlers if not already bound
      if (!this.isInitialized) {
        insforge.realtime.on('complaint_created', (payload) => {
          this.listeners.complaint_created.forEach((cb) => cb(payload));
        });

        insforge.realtime.on('complaint_updated', (payload) => {
          this.listeners.complaint_updated.forEach((cb) => cb(payload));
        });

        this.isInitialized = true;
      }
    } catch (err) {
      console.error('[Realtime] Failed to initialize channels:', err);
    }
  }

  /**
   * Register a callback for when a complaint is created.
   * @param {(complaint: object) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onComplaintCreated(callback) {
    this.listeners.complaint_created.add(callback);
    return () => {
      this.listeners.complaint_created.delete(callback);
    };
  }

  /**
   * Register a callback for when a complaint is updated (status, assignment, priority).
   * @param {(complaint: object) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onComplaintUpdated(callback) {
    this.listeners.complaint_updated.add(callback);
    return () => {
      this.listeners.complaint_updated.delete(callback);
    };
  }

  /**
   * Clean up all channels and listeners.
   */
  async cleanup() {
    for (const ch of this.activeChannels) {
      try {
        insforge.realtime.unsubscribe(ch);
      } catch (e) {
        // ignore
      }
    }
    this.activeChannels.clear();
    this.listeners.complaint_created.clear();
    this.listeners.complaint_updated.clear();
    this.isInitialized = false;
    this.currentUser = null;
  }
}

export const realtimeService = new RealtimeManager();
export default realtimeService;
