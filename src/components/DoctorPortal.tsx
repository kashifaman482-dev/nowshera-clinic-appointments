import React, { useState, useEffect } from 'react';
import { UserProfile, AppointmentDetail, DoctorAvailability, DoctorLeave } from '../types';
import { clinicBackend } from '../services/clinicBackend';
import {
  formatKarachiDate,
  formatKarachiSlotRange,
  getKarachiDate,
  getTodayKarachiDate,
} from '../utils/karachiTime';
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Stethoscope,
  UserCheck,
  UserX,
  FileEdit,
  Plus,
  Trash2,
  CalendarPlus,
  History,
  CalendarDays,
  User,
} from 'lucide-react';

interface DoctorPortalProps {
  currentUser: UserProfile;
}

const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const TIME_OPTIONS_24H = [
  '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30',
  '22:00', '22:30', '23:00'
];

/** Parses and returns strict 24-hour HH:MM:SS format, e.g. 11:00 -> 11:00:00 */
const parseTo24HHMMSS = (val: string): string | null => {
  if (!val) return null;
  const trimmed = val.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = match[3] ? parseInt(match[3], 10) : 0;
  if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/** Returns total minutes from midnight for 24-hour comparison */
const get24Minutes = (val: string): number => {
  const parsed = parseTo24HHMMSS(val);
  if (!parsed) return -1;
  const parts = parsed.split(':').map(Number);
  return parts[0] * 60 + parts[1];
};

export const DoctorPortal: React.FC<DoctorPortalProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<
    'schedule' | 'pending' | 'availability' | 'leaves' | 'patients'
  >('schedule');

  // Resolved doctor ID (checks doctors table or uses currentUser.id)
  const [doctorId, setDoctorId] = useState<string>(currentUser.id);

  // Appointments
  const [appointments, setAppointments] = useState<AppointmentDetail[]>([]);
  const [loadingAppts, setLoadingAppts] = useState<boolean>(false);

  // Availability
  const [availabilities, setAvailabilities] = useState<DoctorAvailability[]>([]);
  const [loadingAvail, setLoadingAvail] = useState<boolean>(false);
  const [newAvailDay, setNewAvailDay] = useState<string>('Monday');
  const [newAvailStart, setNewAvailStart] = useState<string>('09:00');
  const [newAvailEnd, setNewAvailEnd] = useState<string>('13:00');

  // Leaves (table: id, doctor_id, leave_date, created_at)
  const [leaves, setLeaves] = useState<DoctorLeave[]>([]);
  const [newLeaveDate, setNewLeaveDate] = useState<string>('');
  const [submittingLeave, setSubmittingLeave] = useState<boolean>(false);

  // Complete / No-Show Modal
  const [completionModalItem, setCompletionModalItem] = useState<{
    appointment: AppointmentDetail;
    type: 'Completed' | 'No-show';
  } | null>(null);
  const [visitNotesText, setVisitNotesText] = useState<string>('');
  const [submittingCompletion, setSubmittingCompletion] = useState<boolean>(false);

  // Feedback
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const todayStr = getTodayKarachiDate();

  useEffect(() => {
    initDoctor();
  }, [currentUser.id]);

  const initDoctor = async () => {
    try {
      const resolvedId = await clinicBackend.getSignedInDoctorId(currentUser.id);
      setDoctorId(resolvedId);
      loadAllDoctorData(resolvedId);
    } catch {
      loadAllDoctorData(currentUser.id);
    }
  };

  const loadAllDoctorData = async (docId: string) => {
    loadAppointments();
    loadAvailabilities(docId);
    loadLeaves(docId);
  };

  const loadAppointments = async () => {
    setLoadingAppts(true);
    try {
      const data = await clinicBackend.getAppointments();
      setAppointments(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error loading appointments.');
    } finally {
      setLoadingAppts(false);
    }
  };

  const loadAvailabilities = async (docId: string) => {
    setLoadingAvail(true);
    try {
      const data = await clinicBackend.getDoctorAvailability(docId);
      setAvailabilities(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error loading weekly availability.');
    } finally {
      setLoadingAvail(false);
    }
  };

  const loadLeaves = async (docId: string) => {
    try {
      const data = await clinicBackend.getDoctorLeaves(docId);
      setLeaves(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error loading leaves.');
    }
  };

  // Respond: Confirm or Reject
  const handleRespond = async (appointmentId: string, action: 'confirm' | 'reject') => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await clinicBackend.respondAppointment(appointmentId, action);
      setSuccessMsg(`Appointment has been ${action}ed.`);
      await loadAppointments();
    } catch (err: any) {
      setErrorMsg(err.message || `Failed to ${action} appointment.`);
    }
  };

  // Cancel appointment via RPC: cancel_appointment({ p_id: appointmentId })
  const handleDoctorCancel = async (appointmentId: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const supabase = clinicBackend.getClient();
      const { data, error } = await supabase.rpc('cancel_appointment', {
        p_id: appointmentId,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setSuccessMsg('Appointment cancelled. Slot has been freed.');
      await loadAppointments();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to cancel appointment.');
    }
  };

  // Open Complete / No-show Modal
  const openCompletionModal = (appt: AppointmentDetail, type: 'Completed' | 'No-show') => {
    setCompletionModalItem({ appointment: appt, type });
    setVisitNotesText(appt.visit_notes || '');
  };

  // Submit Complete or No-Show
  const submitCompletion = async () => {
    if (!completionModalItem) return;
    setSubmittingCompletion(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await clinicBackend.completeAppointment(
        completionModalItem.appointment.id,
        completionModalItem.type,
        visitNotesText
      );
      setSuccessMsg(
        `Consultation marked as ${completionModalItem.type}.${
          visitNotesText.trim() ? ' Clinical visit notes saved securely.' : ''
        }`
      );
      setCompletionModalItem(null);
      await loadAppointments();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating appointment status.');
    } finally {
      setSubmittingCompletion(false);
    }
  };

  // Add Availability
  const handleAddAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const startHHMMSS = parseTo24HHMMSS(newAvailStart);
    const endHHMMSS = parseTo24HHMMSS(newAvailEnd);

    if (!startHHMMSS) {
      setErrorMsg('Please enter a valid 24-hour start time (e.g. 11:00, 00:00 to 23:59).');
      return;
    }
    if (!endHHMMSS) {
      setErrorMsg('Please enter a valid 24-hour end time (e.g. 14:00, 00:00 to 23:59).');
      return;
    }

    const startMins = get24Minutes(newAvailStart);
    const endMins = get24Minutes(newAvailEnd);

    if (endMins <= startMins) {
      setErrorMsg(`End time (${endHHMMSS}) must be after start time (${startHHMMSS}) in 24-hour comparison.`);
      return;
    }

    try {
      await clinicBackend.addDoctorAvailability(
        doctorId,
        newAvailDay,
        startHHMMSS,
        endHHMMSS
      );
      setSuccessMsg(
        `Availability saved for ${newAvailDay}: ${startHHMMSS} to ${endHHMMSS} (stored in 24-hour format).`
      );
      await loadAvailabilities(doctorId);
    } catch (err: any) {
      // Server error message displayed in UI
      setErrorMsg(err.message || 'Failed to add availability hours.');
    }
  };

  // Delete Availability
  const handleDeleteAvailability = async (id: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await clinicBackend.deleteDoctorAvailability(id);
      setSuccessMsg('Availability interval deleted.');
      await loadAvailabilities(doctorId);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to remove availability.');
    }
  };

  // Add Leave
  const handleAddLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeaveDate) {
      setErrorMsg('Leave date is required.');
      return;
    }

    setSubmittingLeave(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await clinicBackend.addDoctorLeave(doctorId, newLeaveDate);
      setSuccessMsg(
        `Leave registered for ${newLeaveDate}. Any pending/confirmed appointments on this date were automatically cancelled.`
      );
      setNewLeaveDate('');
      await loadLeaves(doctorId);
      await loadAppointments();
    } catch (err: any) {
      // Show server error in UI
      setErrorMsg(err.message || 'Failed to register leave date.');
    } finally {
      setSubmittingLeave(false);
    }
  };

  // Delete Leave
  const handleDeleteLeave = async (id: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await clinicBackend.deleteDoctorLeave(id);
      setSuccessMsg('Leave entry removed.');
      await loadLeaves(doctorId);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to remove leave date.');
    }
  };

  // Filter appointments for today
  const todayAppointments = appointments.filter(
    (a) => getKarachiDate(a.slot_start) === todayStr
  );
  // Filter pending
  const pendingAppointments = appointments.filter((a) => a.status === 'Pending');

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex flex-wrap border-b border-slate-200 bg-white px-4 sm:px-6 rounded-t-xl shadow-xs gap-1">
        <button
          id="doctor-tab-schedule"
          onClick={() => {
            setActiveTab('schedule');
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'schedule'
              ? 'border-indigo-700 text-indigo-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <CalendarIcon className="w-4 h-4 text-indigo-600" />
          <span>Consultation Schedule</span>
          {todayAppointments.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold">
              {todayAppointments.length} today
            </span>
          )}
        </button>

        <button
          id="doctor-tab-pending"
          onClick={() => {
            setActiveTab('pending');
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'pending'
              ? 'border-indigo-700 text-indigo-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="w-4 h-4 text-amber-600" />
          <span>Pending Requests</span>
          {pendingAppointments.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs font-bold">
              {pendingAppointments.length}
            </span>
          )}
        </button>

        <button
          id="doctor-tab-availability"
          onClick={() => {
            setActiveTab('availability');
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'availability'
              ? 'border-indigo-700 text-indigo-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <CalendarDays className="w-4 h-4 text-slate-600" />
          <span>Weekly Availability</span>
        </button>

        <button
          id="doctor-tab-leaves"
          onClick={() => {
            setActiveTab('leaves');
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'leaves'
              ? 'border-indigo-700 text-indigo-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <CalendarPlus className="w-4 h-4 text-slate-600" />
          <span>Leave Dates</span>
        </button>
      </div>

      {/* Feedback Alerts */}
      {errorMsg && (
        <div
          id="doctor-error-banner"
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
          id="doctor-success-banner"
          className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl flex items-start gap-3 shadow-xs"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-emerald-900">Action Completed</p>
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

      {/* TAB 1: SCHEDULE */}
      {activeTab === 'schedule' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Consultation Roster</h3>
              <p className="text-xs text-slate-500">
                From view appointment_details (filtered by slot_start in Asia/Karachi)
              </p>
            </div>
            <div className="text-xs text-slate-600 font-medium">
              Today: {formatKarachiDate(`${todayStr}T00:00:00+05:00`)}
            </div>
          </div>

          {loadingAppts ? (
            <div className="p-12 text-center text-xs text-slate-500">
              Loading schedule from appointment_details...
            </div>
          ) : appointments.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              No appointments on record.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 uppercase font-semibold">
                    <th className="py-2.5 px-3">Date &amp; Slot</th>
                    <th className="py-2.5 px-3">Patient Details</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Visit Notes</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {appointments.map((appt) => {
                    const isToday = getKarachiDate(appt.slot_start) === todayStr;
                    return (
                      <tr
                        key={appt.id}
                        id={`doctor-appt-row-${appt.id}`}
                        className={`hover:bg-slate-50/60 ${isToday ? 'bg-indigo-50/20' : ''}`}
                      >
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            {formatKarachiDate(appt.slot_start)}
                            {isToday && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-100 text-indigo-800 font-bold">
                                Today
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 text-indigo-600" />
                            <span>{formatKarachiSlotRange(appt.slot_start, appt.slot_end)}</span>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-900">
                            {appt.patient_name || 'Patient'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {appt.patient_phone || appt.patient_email || 'No contact provided'}
                          </div>
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

                        <td className="py-3 px-3">
                          {appt.visit_notes ? (
                            <div className="text-[11px] text-slate-700 line-clamp-2 max-w-xs">
                              {appt.visit_notes}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">None</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {appt.status === 'Pending' && (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                id={`doctor-confirm-btn-${appt.id}`}
                                onClick={() => handleRespond(appt.id, 'confirm')}
                                className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
                                title="RPC: respond_appointment (confirm)"
                              >
                                Confirm
                              </button>
                              <button
                                id={`doctor-reject-btn-${appt.id}`}
                                onClick={() => handleRespond(appt.id, 'reject')}
                                className="px-2.5 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer"
                                title="RPC: respond_appointment (reject)"
                              >
                                Reject
                              </button>
                            </div>
                          )}

                          {appt.status === 'Confirmed' && (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                id={`doctor-complete-btn-${appt.id}`}
                                onClick={() => openCompletionModal(appt, 'Completed')}
                                className="px-2.5 py-1 rounded bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer"
                                title="RPC: complete_appointment"
                              >
                                Complete
                              </button>
                              <button
                                id={`doctor-noshow-btn-${appt.id}`}
                                onClick={() => openCompletionModal(appt, 'No-show')}
                                className="px-2.5 py-1 rounded border border-purple-300 text-purple-700 hover:bg-purple-50 text-xs font-semibold cursor-pointer"
                                title="RPC: complete_appointment (No-show)"
                              >
                                No-show
                              </button>
                              <button
                                id={`doctor-cancel-btn-${appt.id}`}
                                onClick={() => handleDoctorCancel(appt.id)}
                                className="px-2.5 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer"
                                title="RPC: cancel_appointment"
                              >
                                Cancel
                              </button>
                            </div>
                          )}

                          {(appt.status === 'Completed' || appt.status === 'No-show') && (
                            <button
                              id={`doctor-edit-notes-btn-${appt.id}`}
                              onClick={() => openCompletionModal(appt, appt.status as any)}
                              className="text-xs text-indigo-700 hover:text-indigo-900 font-medium inline-flex items-center gap-1 cursor-pointer"
                            >
                              <FileEdit className="w-3.5 h-3.5" />
                              <span>Update Note</span>
                            </button>
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

      {/* TAB 2: PENDING REQUESTS */}
      {activeTab === 'pending' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Pending Patient Requests</h3>
              <p className="text-xs text-slate-500">
                Appointments awaiting your confirmation. Slots are held immediately.
              </p>
            </div>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-md border border-amber-200">
              {pendingAppointments.length} pending
            </span>
          </div>

          {pendingAppointments.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">No pending requests!</p>
              <p className="mt-1">All consultation slots have been addressed.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingAppointments.map((appt) => (
                <div
                  key={appt.id}
                  id={`pending-card-${appt.id}`}
                  className="p-4 rounded-xl border border-amber-200 bg-amber-50/30 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-amber-800">
                        Pending Request
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm mt-0.5">
                        {appt.patient_name || 'Patient'}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {appt.patient_phone || appt.patient_email}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-semibold text-slate-900">
                        {formatKarachiDate(appt.slot_start)}
                      </div>
                      <div className="text-teal-800 font-medium">
                        {formatKarachiSlotRange(appt.slot_start, appt.slot_end)}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-amber-200/60 flex items-center justify-end gap-2">
                    <button
                      id={`pending-reject-btn-${appt.id}`}
                      onClick={() => handleRespond(appt.id, 'reject')}
                      className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 bg-white hover:bg-rose-50 text-xs font-semibold cursor-pointer"
                    >
                      Reject Request
                    </button>
                    <button
                      id={`pending-confirm-btn-${appt.id}`}
                      onClick={() => handleRespond(appt.id, 'confirm')}
                      className="px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
                    >
                      Confirm Slot
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: WEEKLY AVAILABILITY */}
      {activeTab === 'availability' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Add Availability Form */}
          <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 text-sm">Add Working Hours</h3>
                <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  24-Hour Clock
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Enter hours strictly in 24h format (e.g. 11:00 saves as 11:00:00, never converted to 23:00).
              </p>
            </div>

            <form onSubmit={handleAddAvailability} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Day of the Week:
                </label>
                <select
                  id="avail-day-select"
                  value={newAvailDay}
                  onChange={(e) => setNewAvailDay(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                >
                  {DAYS_OF_WEEK.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>

              {/* Datalist for 24-Hour Autocomplete / Suggestions */}
              <datalist id="time-24h-options">
                {TIME_OPTIONS_24H.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>

              <div className="grid grid-cols-2 gap-3">
                {/* 24-Hour Start Time */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Start Time (24h):
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">HH:MM</span>
                  </div>
                  <div className="space-y-1.5">
                    <input
                      id="avail-start-input"
                      type="text"
                      required
                      list="time-24h-options"
                      value={newAvailStart}
                      onChange={(e) => setNewAvailStart(e.target.value)}
                      placeholder="11:00"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-medium focus:ring-2 focus:ring-indigo-500"
                    />
                    <select
                      value={TIME_OPTIONS_24H.includes(newAvailStart) ? newAvailStart : ''}
                      onChange={(e) => {
                        if (e.target.value) setNewAvailStart(e.target.value);
                      }}
                      className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] font-mono text-slate-600 bg-slate-50"
                    >
                      <option value="">Quick pick start (24h)...</option>
                      {TIME_OPTIONS_24H.map((t) => (
                        <option key={`start-${t}`} value={t}>
                          {t} (24h)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-1">
                    {parseTo24HHMMSS(newAvailStart) ? (
                      <span className="text-[10px] text-teal-700 font-mono flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                        Saves as: <strong>{parseTo24HHMMSS(newAvailStart)}</strong>
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-600 font-mono">
                        Format: HH:MM (00:00 - 23:59)
                      </span>
                    )}
                  </div>
                </div>

                {/* 24-Hour End Time */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      End Time (24h):
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">HH:MM</span>
                  </div>
                  <div className="space-y-1.5">
                    <input
                      id="avail-end-input"
                      type="text"
                      required
                      list="time-24h-options"
                      value={newAvailEnd}
                      onChange={(e) => setNewAvailEnd(e.target.value)}
                      placeholder="14:00"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-medium focus:ring-2 focus:ring-indigo-500"
                    />
                    <select
                      value={TIME_OPTIONS_24H.includes(newAvailEnd) ? newAvailEnd : ''}
                      onChange={(e) => {
                        if (e.target.value) setNewAvailEnd(e.target.value);
                      }}
                      className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] font-mono text-slate-600 bg-slate-50"
                    >
                      <option value="">Quick pick end (24h)...</option>
                      {TIME_OPTIONS_24H.map((t) => (
                        <option key={`end-${t}`} value={t}>
                          {t} (24h)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-1">
                    {parseTo24HHMMSS(newAvailEnd) ? (
                      <span className="text-[10px] text-teal-700 font-mono flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                        Saves as: <strong>{parseTo24HHMMSS(newAvailEnd)}</strong>
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-600 font-mono">
                        Format: HH:MM (00:00 - 23:59)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Shift Presets */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-[10px] font-semibold text-slate-500 block mb-1.5">
                  Common 24h Clinical Shifts:
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'Morning: 09:00 - 13:00', start: '09:00', end: '13:00' },
                    { label: 'Mid-Day: 11:00 - 15:00', start: '11:00', end: '15:00' },
                    { label: 'Afternoon: 14:00 - 18:00', start: '14:00', end: '18:00' },
                    { label: 'Evening: 18:00 - 22:00', start: '18:00', end: '22:00' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setNewAvailStart(preset.start);
                        setNewAvailEnd(preset.end);
                      }}
                      className="px-2 py-1 text-[11px] font-mono text-slate-600 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 rounded border border-slate-200 transition-colors text-left"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                id="avail-submit-btn"
                type="submit"
                className="w-full py-2.5 px-4 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Save Working Hours (24h)</span>
              </button>
            </form>
          </div>

          {/* Current Active Hours */}
          <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Active Schedule Matrix</h3>
                <p className="text-[11px] text-slate-500">
                  Showing saved hours in 24-hour format and exact database records.
                </p>
              </div>
              <span className="text-xs text-slate-500 font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                table: doctor_availability
              </span>
            </div>

            {loadingAvail ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading hours...</div>
            ) : availabilities.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-lg border">
                No weekly hours configured. Patients will see zero available slots.
              </div>
            ) : (
              <div className="space-y-2.5">
                {availabilities.map((av) => {
                  const rawStart = av.start_time;
                  const rawEnd = av.end_time;
                  const display24Start = rawStart.slice(0, 5);
                  const display24End = rawEnd.slice(0, 5);
                  const storedStart = rawStart.length === 5 ? `${rawStart}:00` : rawStart;
                  const storedEnd = rawEnd.length === 5 ? `${rawEnd}:00` : rawEnd;

                  return (
                    <div
                      key={av.id}
                      id={`avail-item-${av.id}`}
                      className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between bg-slate-50/50 hover:bg-slate-50 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="font-semibold text-slate-900 text-xs sm:text-sm">
                            {av.day_of_week}
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-950 font-mono text-xs font-bold">
                            <Clock className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{display24Start} – {display24End}</span>
                            <span className="text-[10px] text-indigo-700 bg-indigo-100/70 px-1 py-0.2 rounded font-sans uppercase font-bold">
                              24h
                            </span>
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-400">Stored in DB:</span>
                          <span className="font-semibold text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            {storedStart}
                          </span>
                          <span className="text-slate-400">to</span>
                          <span className="font-semibold text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            {storedEnd}
                          </span>
                          <span className="text-[10px] text-slate-400 font-sans">
                            (24-Hour HH:MM:SS)
                          </span>
                        </div>
                      </div>

                      <button
                        id={`delete-avail-btn-${av.id}`}
                        onClick={() => handleDeleteAvailability(av.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete availability rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: LEAVES */}
      {activeTab === 'leaves' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Add Leave Form */}
          <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="pb-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900 text-sm">Register Clinic Leave</h3>
              <p className="text-xs text-slate-500">
                Rule: Auto-cancels Pending &amp; Confirmed appointments on this date.
              </p>
            </div>

            <form onSubmit={handleAddLeave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Leave Date:
                </label>
                <input
                  id="leave-date-input"
                  type="date"
                  min={todayStr}
                  required
                  value={newLeaveDate}
                  onChange={(e) => setNewLeaveDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <button
                id="leave-submit-btn"
                type="submit"
                disabled={submittingLeave}
                className="w-full py-2.5 px-4 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <CalendarPlus className="w-4 h-4" />
                <span>{submittingLeave ? 'Registering...' : 'Register Leave & Auto-Cancel'}</span>
              </button>
            </form>
          </div>

          {/* Current Leaves List */}
          <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900 text-sm">Scheduled Leaves</h3>
              <span className="text-xs text-slate-500">Table: doctor_leave</span>
            </div>

            {leaves.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-lg border">
                No leave dates registered.
              </div>
            ) : (
              <div className="space-y-2">
                {leaves.map((lv) => (
                  <div
                    key={lv.id}
                    id={`leave-item-${lv.id}`}
                    className="p-3 rounded-lg border border-slate-200 flex items-center justify-between bg-slate-50/50"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 text-xs">{lv.leave_date}</div>
                    </div>

                    <button
                      id={`delete-leave-btn-${lv.id}`}
                      onClick={() => handleDeleteLeave(lv.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                      title="Remove leave date"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* COMPLETE / NO-SHOW MODAL */}
      {completionModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900 text-sm">
                Mark Consultation: {completionModalItem.type}
              </h3>
              <button
                onClick={() => setCompletionModalItem(null)}
                className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border">
              <div>
                <strong>Patient:</strong> {completionModalItem.appointment.patient_name}
              </div>
              <div>
                <strong>Slot:</strong>{' '}
                {formatKarachiDate(completionModalItem.appointment.slot_start)} at{' '}
                {formatKarachiSlotRange(
                  completionModalItem.appointment.slot_start,
                  completionModalItem.appointment.slot_end
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Clinical Visit Notes (Confidential; stored in visit_notes table):
              </label>
              <textarea
                id="modal-visit-notes-input"
                rows={4}
                value={visitNotesText}
                onChange={(e) => setVisitNotesText(e.target.value)}
                placeholder="Enter diagnosis, treatment prescribed, clinical observations, or follow-up instructions..."
                className="w-full p-2.5 border border-slate-300 rounded-lg text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Restricted to patient and doctor only via Row-Level Security.
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCompletionModalItem(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitCompletion}
                disabled={submittingCompletion}
                className="px-4 py-1.5 rounded-lg bg-indigo-700 text-white text-xs font-semibold hover:bg-indigo-800 disabled:opacity-50 cursor-pointer"
              >
                {submittingCompletion ? 'Saving...' : `Confirm ${completionModalItem.type}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
