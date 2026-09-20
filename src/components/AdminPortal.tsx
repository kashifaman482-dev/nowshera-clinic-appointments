import React, { useState, useEffect } from 'react';
import {
  UserProfile,
  DoctorStat,
  AppointmentDetail,
  DoctorDirectoryEntry,
} from '../types';
import { clinicBackend } from '../services/clinicBackend';
import {
  formatKarachiDate,
  formatKarachiSlotRange,
  getKarachiDate,
  getTodayKarachiDate,
} from '../utils/karachiTime';
import {
  Shield,
  Stethoscope,
  Calendar as CalendarIcon,
  Search,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  Lock,
  BarChart3,
  Clock,
  Building2,
  Users,
} from 'lucide-react';

interface AdminPortalProps {
  currentUser: UserProfile;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'appointments' | 'doctors'>('dashboard');

  // Doctor Stats (from view: doctor_stats)
  const [doctorStats, setDoctorStats] = useState<DoctorStat[]>([]);
  const [loadingStats, setLoadingStats] = useState<boolean>(false);

  // Appointments (from view: appointment_details)
  const [appointments, setAppointments] = useState<AppointmentDetail[]>([]);
  const [loadingAppts, setLoadingAppts] = useState<boolean>(false);
  const [filterDoctorId, setFilterDoctorId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('');

  // Doctor Directory (from view: doctor_directory)
  const [doctorDirectory, setDoctorDirectory] = useState<DoctorDirectoryEntry[]>([]);
  const [loadingDocs, setLoadingDocs] = useState<boolean>(false);

  // Add Doctor Form (dispatches to n8n webhook)
  const [newDocName, setNewDocName] = useState<string>('');
  const [newDocSpecialty, setNewDocSpecialty] = useState<string>('');
  const [newDocEmail, setNewDocEmail] = useState<string>('');
  const [submittingDoc, setSubmittingDoc] = useState<boolean>(false);

  // Feedback
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadAllAdminData();
  }, [currentUser.id]);

  const loadAllAdminData = async () => {
    loadStats();
    loadAppointments();
    loadDoctors();
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const stats = await clinicBackend.getDoctorStats();
      setDoctorStats(stats);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error loading doctor statistics.');
    } finally {
      setLoadingStats(false);
    }
  };

  const loadAppointments = async () => {
    setLoadingAppts(true);
    try {
      const appts = await clinicBackend.getAppointments();
      setAppointments(appts);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error loading appointments from view appointment_details.');
    } finally {
      setLoadingAppts(false);
    }
  };

  const loadDoctors = async () => {
    setLoadingDocs(true);
    try {
      const docs = await clinicBackend.getDoctorDirectory();
      setDoctorDirectory(docs);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error loading doctor directory.');
    } finally {
      setLoadingDocs(false);
    }
  };

  // Cancel Appointment as Admin via RPC: cancel_appointment({ p_id: apptId })
  const handleAdminCancel = async (apptId: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const supabase = clinicBackend.getClient();
      const { data, error } = await supabase.rpc('cancel_appointment', {
        p_id: apptId,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setSuccessMsg('Appointment cancelled. Slot has been returned to the schedule.');
      await loadAppointments();
      await loadStats();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to cancel appointment.');
    }
  };

  // Add Doctor -> triggers n8n webhook
  const handleAddDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocName.trim() || !newDocSpecialty.trim() || !newDocEmail.trim()) {
      setErrorMsg('All fields (Name, Specialty, Email) are required.');
      return;
    }

    setSubmittingDoc(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await clinicBackend.adminAddDoctor(newDocName, newDocSpecialty, newDocEmail);
      setSuccessMsg(res.message);
      setNewDocName('');
      setNewDocSpecialty('');
      setNewDocEmail('');
      await loadDoctors();
      await loadStats();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to trigger doctor onboarding.');
    } finally {
      setSubmittingDoc(false);
    }
  };

  // Compute aggregate numbers from doctor_stats
  const totalPending = doctorStats.reduce((sum, d) => sum + d.pending, 0);
  const totalConfirmed = doctorStats.reduce((sum, d) => sum + d.confirmed, 0);
  const totalCompleted = doctorStats.reduce((sum, d) => sum + d.completed, 0);
  const totalCancelled = doctorStats.reduce((sum, d) => sum + d.cancelled, 0);
  const totalNoShow = doctorStats.reduce((sum, d) => sum + d.no_show, 0);

  // Filter appointments
  const filteredAppointments = appointments.filter((appt) => {
    if (filterDoctorId !== 'all' && appt.doctor_id !== filterDoctorId) return false;
    if (filterStatus !== 'all' && appt.status !== filterStatus) return false;
    if (filterDate && getKarachiDate(appt.slot_start) !== filterDate) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex flex-wrap border-b border-slate-200 bg-white px-4 sm:px-6 rounded-t-xl shadow-xs gap-1">
        <button
          id="admin-tab-dashboard"
          onClick={() => {
            setActiveTab('dashboard');
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`py-3.5 px-4 text-sm font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'dashboard'
              ? 'border-rose-700 text-rose-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-rose-600" />
          <span>Doctor Stats &amp; Counts</span>
        </button>

        <button
          id="admin-tab-appointments"
          onClick={() => {
            setActiveTab('appointments');
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`py-3.5 px-4 text-sm font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'appointments'
              ? 'border-rose-700 text-rose-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <CalendarIcon className="w-4 h-4 text-rose-600" />
          <span>Master Appointments</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
            {appointments.length}
          </span>
        </button>

        <button
          id="admin-tab-doctors"
          onClick={() => {
            setActiveTab('doctors');
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`py-3.5 px-4 text-sm font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'doctors'
              ? 'border-rose-700 text-rose-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Stethoscope className="w-4 h-4 text-rose-600" />
          <span>Doctor Directory &amp; Onboarding</span>
        </button>
      </div>

      {/* Feedback Alerts */}
      {errorMsg && (
        <div
          id="admin-error-banner"
          className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl flex items-start gap-3 shadow-xs"
        >
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-rose-900">Server Error Message</p>
            <p className="text-xs text-rose-800 mt-0.5">{errorMsg}</p>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-rose-500 hover:text-rose-700 text-xs font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {successMsg && (
        <div
          id="admin-success-banner"
          className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl flex items-start gap-3 shadow-xs"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-emerald-900">Action Confirmed</p>
            <p className="text-xs text-emerald-800 mt-0.5">{successMsg}</p>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-600 hover:text-emerald-800 text-xs font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* TAB 1: DOCTOR STATS DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Aggregate KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Pending
              </span>
              <div className="text-2xl font-bold text-amber-700 mt-1">{totalPending}</div>
              <span className="text-[11px] text-slate-400">Awaiting doctor review</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Confirmed
              </span>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{totalConfirmed}</div>
              <span className="text-[11px] text-slate-400">Scheduled slots</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Completed
              </span>
              <div className="text-2xl font-bold text-sky-700 mt-1">{totalCompleted}</div>
              <span className="text-[11px] text-slate-400">Concluded consultations</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                No-Show
              </span>
              <div className="text-2xl font-bold text-purple-700 mt-1">{totalNoShow}</div>
              <span className="text-[11px] text-slate-400">Patient absent</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Cancelled
              </span>
              <div className="text-2xl font-bold text-rose-700 mt-1">{totalCancelled}</div>
              <span className="text-[11px] text-slate-400">Released intervals</span>
            </div>
          </div>

          {/* Breakdown by Doctor (View: doctor_stats) */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">
                  Doctor Clinical Performance Breakdown
                </h3>
                <p className="text-xs text-slate-500">
                  Exact columns from PostgreSQL View: <code className="text-rose-800">doctor_stats</code>
                </p>
              </div>
              <span className="text-xs text-slate-400">Real-time database aggregation</span>
            </div>

            {loadingStats ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Querying view doctor_stats...
              </div>
            ) : doctorStats.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No doctors registered in stats view.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 uppercase font-semibold">
                      <th className="py-2.5 px-3">Doctor</th>
                      <th className="py-2.5 px-3">Specialty</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-center text-amber-700">Pending</th>
                      <th className="py-2.5 px-3 text-center text-emerald-700">Confirmed</th>
                      <th className="py-2.5 px-3 text-center text-sky-700">Completed</th>
                      <th className="py-2.5 px-3 text-center text-purple-700">No-Show</th>
                      <th className="py-2.5 px-3 text-center text-rose-700">Cancelled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {doctorStats.map((ds) => (
                      <tr key={ds.doctor_id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-3 font-semibold text-slate-900 whitespace-nowrap">
                          {ds.doctor_name}
                        </td>
                        <td className="py-3 px-3 text-slate-600 font-medium">
                          {ds.specialty}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              ds.active
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {ds.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-amber-700">
                          {ds.pending}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-emerald-700">
                          {ds.confirmed}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-sky-700">
                          {ds.completed}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-purple-700">
                          {ds.no_show}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-rose-700">
                          {ds.cancelled}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MASTER APPOINTMENTS */}
      {activeTab === 'appointments' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Master Appointment Ledger</h3>
              <p className="text-xs text-slate-500">
                View: <code className="text-rose-800">appointment_details</code> (Strictly no visit notes per RLS)
              </p>
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Doctor clinical notes are legally confidential</span>
            </div>
          </div>

          {/* Filters (Doctor, Status, Date) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Filter by Doctor:
              </label>
              <select
                id="filter-doctor-select"
                value={filterDoctorId}
                onChange={(e) => setFilterDoctorId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-medium"
              >
                <option value="all">All Doctors</option>
                {doctorDirectory.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name} ({doc.specialty})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Filter by Status:
              </label>
              <select
                id="filter-status-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-medium"
              >
                <option value="all">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Completed">Completed</option>
                <option value="No-show">No-show</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Filter by Date (Asia/Karachi):
              </label>
              <input
                id="filter-date-input"
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-medium"
              />
            </div>
          </div>

          {/* Table */}
          {loadingAppts ? (
            <div className="p-12 text-center text-xs text-slate-500">
              Querying view appointment_details...
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              No appointments matching selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 uppercase font-semibold">
                    <th className="py-2.5 px-3">Date &amp; Slot</th>
                    <th className="py-2.5 px-3">Patient</th>
                    <th className="py-2.5 px-3">Doctor</th>
                    <th className="py-2.5 px-3">Specialty</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Admin Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAppointments.map((appt) => {
                    const canCancel =
                      appt.status === 'Pending' || appt.status === 'Confirmed';

                    return (
                      <tr key={appt.id} id={`admin-appt-row-${appt.id}`} className="hover:bg-slate-50/60">
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-semibold text-slate-900">
                            {formatKarachiDate(appt.slot_start)}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 text-rose-600" />
                            <span>{formatKarachiSlotRange(appt.slot_start, appt.slot_end)}</span>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-900">
                            {appt.patient_name || 'Patient'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {appt.patient_phone || appt.patient_email || 'No contact'}
                          </div>
                        </td>

                        <td className="py-3 px-3 font-medium text-slate-900">
                          {appt.doctor_name}
                        </td>

                        <td className="py-3 px-3 text-slate-600">
                          {appt.specialty}
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              appt.status === 'Confirmed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : appt.status === 'Pending'
                                ? 'bg-amber-100 text-amber-800'
                                : appt.status === 'Completed'
                                ? 'bg-sky-100 text-sky-800'
                                : appt.status === 'No-show'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {appt.status}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {canCancel ? (
                            <button
                              id={`admin-cancel-btn-${appt.id}`}
                              onClick={() => handleAdminCancel(appt.id)}
                              className="px-2.5 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer"
                              title="RPC: cancel_appointment"
                            >
                              Cancel Appointment
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">Concluded</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DOCTOR DIRECTORY & ONBOARDING */}
      {activeTab === 'doctors' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Add Doctor Form */}
          <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-rose-700" />
                <h3 className="font-semibold text-slate-900 text-sm">Add Doctor</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Dispatches invite to automated n8n webhook workflow for password setup.
              </p>
            </div>

            <form onSubmit={handleAddDoctor} className="space-y-4">
              {errorMsg && (
                <div
                  id="admin-doctor-form-error"
                  role="alert"
                  className="p-3 bg-rose-50 border border-rose-300 text-rose-900 text-xs rounded-lg flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1 font-medium">{errorMsg}</div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Doctor Full Name:
                </label>
                <input
                  id="admin-new-doc-name"
                  type="text"
                  required
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  placeholder="e.g. Dr. Ayesha Malik"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Specialty:
                </label>
                <input
                  id="admin-new-doc-specialty"
                  type="text"
                  required
                  value={newDocSpecialty}
                  onChange={(e) => setNewDocSpecialty(e.target.value)}
                  placeholder="e.g. Pediatrics, Cardiology, Family Medicine"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address:
                </label>
                <input
                  id="admin-new-doc-email"
                  type="email"
                  required
                  value={newDocEmail}
                  onChange={(e) => setNewDocEmail(e.target.value)}
                  placeholder="doctor@nowsheraclinic.pk"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <button
                id="admin-submit-doctor-btn"
                type="submit"
                disabled={submittingDoc}
                className="w-full py-2.5 px-4 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                <span>{submittingDoc ? 'Dispatching to Webhook...' : 'Invite & Register Doctor'}</span>
              </button>
            </form>
          </div>

          {/* Directory List (View: doctor_directory: id, name, specialty) */}
          <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Active Doctor Directory</h3>
                <p className="text-xs text-slate-500">
                  Exact columns from PostgreSQL View: <code className="text-rose-800">doctor_directory</code> (id, name, specialty)
                </p>
              </div>
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full">
                {doctorDirectory.length} active
              </span>
            </div>

            {loadingDocs ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Loading doctor directory...
              </div>
            ) : doctorDirectory.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border">
                No active doctors listed in directory.
              </div>
            ) : (
              <div className="space-y-2">
                {doctorDirectory.map((doc) => (
                  <div
                    key={doc.id}
                    id={`directory-doc-${doc.id}`}
                    className="p-3.5 rounded-lg border border-slate-200 flex items-center justify-between bg-slate-50/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center shrink-0">
                        <Stethoscope className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900 text-xs">{doc.name}</h4>
                        <p className="text-[11px] text-rose-700 font-medium">{doc.specialty}</p>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Active
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
