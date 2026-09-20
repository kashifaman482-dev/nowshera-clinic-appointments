import React from 'react';
import { UserProfile } from '../types';
import { Building2, LogOut, User } from 'lucide-react';

interface HeaderProps {
  currentUser: UserProfile | null;
  onSignOut: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentUser, onSignOut }) => {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
      {/* Top Clinical Strip */}
      <div className="bg-slate-900 text-slate-300 text-xs px-4 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
          <span className="font-medium text-slate-200">Nowshera Family Clinic</span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="hidden sm:inline text-slate-400">Grand Trunk Road, Nowshera Cantt • (0923) 610123</span>
        </div>
        <div className="text-[11px] text-slate-400">
          Clinic Timezone: <span className="font-semibold text-slate-300">Asia/Karachi (PKT, UTC+5)</span>
        </div>
      </div>

      {/* Main navigation header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
        {/* Clinic Identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center shadow-xs">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight font-serif">
              Nowshera Family Clinic
            </h1>
            <p className="text-xs text-slate-500">
              Clinical Appointment &amp; Consultation System
            </p>
          </div>
        </div>

        {/* User profile & Sign Out */}
        {currentUser && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-900 flex items-center justify-end gap-1.5">
                <span>{currentUser.name}</span>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                    currentUser.role === 'patient'
                      ? 'bg-teal-100 text-teal-800'
                      : currentUser.role === 'doctor'
                      ? 'bg-indigo-100 text-indigo-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {currentUser.role}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                {currentUser.email}
              </div>
            </div>

            <button
              id="header-signout-btn"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-300 text-xs font-medium transition-colors cursor-pointer"
              title="Sign out of your account"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
