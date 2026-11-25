import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Check, Clock, ExternalLink, Wrench, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import * as notificationService from '../../services/notificationService';

export default function NotificationDropdown() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);

  const loadNotifications = async () => {
    if (!user?.id) return;
    try {
      const [notifs, unread] = await Promise.all([
        notificationService.getNotifications(user.id, { limit: 10, role }),
        notificationService.getUnreadCount(user.id),
      ]);
      setNotifications(notifs);
      setUnreadCount(unread);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  };

  useEffect(() => {
    loadNotifications();

    if (!user?.id) return;

    // Realtime subscription to live notifications for this user
    let cleanupFn = () => {};
    notificationService
      .subscribeToUserNotifications(user.id, (newNotif) => {
        setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)].slice(0, 10));
        setUnreadCount((c) => c + 1);
      })
      .then((cleanup) => {
        cleanupFn = cleanup;
      });

    return () => {
      cleanupFn();
    };
  }, [user?.id, role]);

  // Click outside and Esc key listener
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  async function handleMarkAll() {
    if (!user?.id) return;
    await notificationService.markAllRead(user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  async function handleNotificationClick(n) {
    if (!n.read) {
      await notificationService.markRead(n.id);
      setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) {
      navigate(n.link);
    }
  }

  const rolePrefix = role ? role.toLowerCase() : 'student';

  const getTypeIcon = (type) => {
    switch (type) {
      case 'NEW_COMPLAINT':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />;
      case 'ASSIGNMENT':
        return <Wrench className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />;
      case 'STATUS_CHANGE':
        return <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />;
      default:
        return <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 transition-colors"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-xs animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-800">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-400">No recent notifications</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-3.5 text-xs transition-colors cursor-pointer hover:bg-slate-50 flex gap-2.5 ${
                    n.read ? 'bg-white opacity-80' : 'bg-indigo-50/40 font-medium'
                  }`}
                >
                  {getTypeIcon(n.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="font-semibold text-slate-900 truncate">{n.title}</p>
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-600 line-clamp-2">{n.body}</p>
                    <p className="mt-1 text-[10px] text-slate-400 font-mono">
                      {n.createdAt ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-100 bg-slate-50/50 p-2 text-center">
            <Link
              to={`/${rolePrefix}/dashboard`}
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Open Dashboard Feed →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
