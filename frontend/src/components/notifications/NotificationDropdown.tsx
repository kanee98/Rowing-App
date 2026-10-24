import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { NotificationItem } from '../../types';
import { 
  Bell, CheckCircle2, AlertTriangle, Calendar, Dumbbell, 
  Megaphone, Check, Clock, X, ExternalLink, ShieldAlert
} from 'lucide-react';

interface NotificationDropdownProps {
  onNavigateAction?: (action?: string) => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ onNavigateAction }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await api.getNotifications();
      setNotifications(res.items);
      setUnreadCount(res.unread_count);
    } catch (e) {
      // Ignore if unauthenticated
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 20000); // Polling every 20s
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkRead = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    setLoading(true);
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'schedule_assigned':
        return <Calendar className="w-4 h-4 text-sky-400" />;
      case 'performance_logged':
        return <Dumbbell className="w-4 h-4 text-amber-400" />;
      case 'verification_completed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'weather_alert':
        return <ShieldAlert className="w-4 h-4 text-rose-400" />;
      default:
        return <Megaphone className="w-4 h-4 text-purple-400" />;
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const d = new Date(dateStr);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
        className="relative p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-extrabold text-white animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] bg-slate-900 border border-slate-800 rounded-3xl p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 px-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={loading}
                className="text-[11px] font-medium text-rowing-400 hover:text-rowing-300 transition-colors flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="py-1 max-h-[380px] overflow-y-auto space-y-1 divide-y divide-slate-800/40">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-slate-500 space-y-2">
                <Bell className="w-8 h-8 mx-auto opacity-40 text-slate-400" />
                <p className="text-xs">No notifications yet.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.currentTarget.click(); } }}
                  onClick={() => {
                    if (!n.is_read) handleMarkRead(n.id, { stopPropagation: () => {} } as any);
                    if (n.link_action && onNavigateAction) onNavigateAction(n.link_action);
                    setIsOpen(false);
                  }}
                  className={`p-2.5 rounded-2xl flex items-start gap-2.5 transition-colors cursor-pointer ${
                    n.is_read
                      ? 'hover:bg-slate-800/50 opacity-75'
                      : 'bg-slate-800/40 hover:bg-slate-800/80 border-l-2 border-rowing-400'
                  }`}
                >
                  <div className="mt-0.5 p-1.5 rounded-xl bg-slate-800 shrink-0 border border-slate-700/60">
                    {getItemIcon(n.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className={`text-xs font-bold truncate ${n.is_read ? 'text-slate-300' : 'text-white'}`}>
                        {n.title}
                      </h4>
                      <span className="text-[9px] text-slate-500 font-mono shrink-0">
                        {formatTimeAgo(n.created_at)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                      {n.message}
                    </p>
                  </div>

                  {!n.is_read && (
                    <button
                      onClick={(e) => handleMarkRead(n.id, e)}
                      title="Mark as read"
                      className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 shrink-0"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
