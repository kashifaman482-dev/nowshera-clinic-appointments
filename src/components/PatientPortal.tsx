import React, { useState, useEffect } from 'react';
import { UserProfile, DoctorDirectoryEntry, AppointmentDetail, FreeSlot } from '../types';
import { clinicBackend } from '../services/clinicBackend';
import {
  formatKarachiDate,
  formatKarachiSlotRange,
  getKarachiDate,
  getTodayKarachiDate,
  isMoreThanTwoHoursAway,
} from '../utils/karachiTime';
import {
  Calendar as CalendarIcon,
  Clock,
  Stethoscope,
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileText,
  RotateCcw,
  CalendarCheck,
  ChevronRight,
  Info,
  CalendarX,
  User,
} from 'lucide-react';

interface PatientPortalProps {
  currentUser: UserProfile;
}

export const PatientPortal: React.FC<PatientPortalProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'book' | 'appointments'>('book');

  // Booking Flow State
  const [doctors, setDoctors] = useState<DoctorDirectoryEntry[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKarachiDate());
  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [submittingBooking, setSubmittingBooking] = useState<boolean>(false);

  // Appointments List State
  const [myAppointments, setMyAppointments] = useState<AppointmentDetail[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState<boolean>(false);

  // Reschedule Modal State
  const [rescheduleAppointmentItem, setRescheduleAppointmentItem] =
    useState<AppointmentDetail | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleSlots, setRescheduleSlots] = useState<FreeSlot[]>([]);
  const [selectedRescheduleSlotStart, setSelectedRescheduleSlotStart] = useState<string | null>(
    null
  );
  const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState<boolean>(false);
  const [submittingReschedule, setSubmittingReschedule] = useState<boolean>(false);
  const [rescheduleModalError, setRescheduleModalError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Visit Note Viewer Modal
  const [viewingNotesAppointment, setViewingNotesAppointment] =
    useState<AppointmentDetail | null>(null);

  // Feedback notifications
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadDoctors();
    loadAppointments();
  }, [currentUser.id]);

  const loadDoctors = async () => {
    try {
      const docs = await clinicBackend.getDoctorDirectory();
      setDoctors(docs);
      if (docs.length > 0 && !selectedDoctorId) {
        setSelectedDoctorId(docs[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error loading doctor directory.');
    }
  };

  const loadAppointments = async () => {
    setLoadingAppointments(true);
    try {
      const appts = await clinicBackend.getAppointments();
      setMyAppointments(appts);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error loading appointments.');
    } finally {
      setLoadingAppointments(false);
    }
  };

  // Fetch free slots when doctor or date changes
  useEffect(() => {
    if (selectedDoctorId && selectedDate) {
      fetchFreeSlots(selectedDoctorId, selectedDate);
    }
  }, [selectedDoctorId, selectedDate]);

  const fetchFreeSlots = async (doctorId: string, dateStr: string, keepError: boolean = false) => {
    setLoadingSlots(true);
    if (!keepError) {
      setErrorMsg(null);
    }
    setSelectedSlotStart(null);
    try {
      const freeSlots = await clinicBackend.getFreeSlots(doctorId, dateStr);
      setSlots(freeSlots);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error fetching available slots.');
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  // Book Appointment
  const handleBookAppointment = async () => {
    if (!selectedDoctorId || !selectedDate || !selectedSlotStart) {
      setErrorMsg('Please select a doctor, consultation date, and a free 30-minute slot.');
      return;
    }

    setSubmittingBooking(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await clinicBackend.bookAppointment(selectedDoctorId, selectedSlotStart);
      setSuccessMsg(
        `Appointment successfully requested! Status is Pending doctor confirmation.`
      );
      // Refresh slots and appointments
      await fetchFreeSlots(selectedDoctorId, selectedDate);
      await loadAppointments();
      setTimeout(() => {
        setActiveTab('appointments');
      }, 1200);
    } catch (err: any) {
      // Rule: "clear error if slot was just taken or patient already has an appointment at that time (any doctor)"
      setErrorMsg(err.message || 'Failed to book appointment.');
      // Refresh slots immediately to update taken state
      fetchFreeSlots(selectedDoctorId, selectedDate, true);
    } finally {
      setSubmittingBooking(false);
    }
  };

  // Cancel Appointment:
  // supabase.rpc('cancel_appointment', { p_id: appointment.id })
  const handleCancelAppointment = async (appt: AppointmentDetail) => {
    setCancellingId(appt.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const supabase = clinicBackend.getClient();
      const { data, error } = await supabase.rpc('cancel_appointment', {
        p_id: appt.id,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setSuccessMsg('Appointment cancelled successfully. The slot has been released.');

      // 1. Re-fetch appointment_details
      await loadAppointments();

      // 2. Refresh the slot list so the freed slot appears again
      const apptDoctorId = appt.doctor_id || selectedDoctorId;
      const apptSlotStart = appt.slot_start;
      const apptDate = apptSlotStart ? getKarachiDate(apptSlotStart) : selectedDate;

      if (apptDoctorId && apptDate) {
        setSelectedDoctorId(apptDoctorId);
        setSelectedDate(apptDate);
        await fetchFreeSlots(apptDoctorId, apptDate, true);
      } else if (selectedDoctorId && selectedDate) {
        await fetchFreeSlots(selectedDoctorId, selectedDate, true);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to cancel appointment.');
    } finally {
      setCancellingId(null);
    }
  };

  // Reschedule Flow
  const openRescheduleModal = async (appt: AppointmentDetail) => {
    setRescheduleAppointmentItem(appt);
    setRescheduleModalError(null);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const initialDate = getKarachiDate(tomorrow);
    setRescheduleDate(initialDate);
    setSelectedRescheduleSlotStart(null);
    await loadRescheduleSlots(appt.doctor_id, initialDate);
  };

  const loadRescheduleSlots = async (doctorId: string, dateStr: string) => {
    setLoadingRescheduleSlots(true);
    setRescheduleModalError(null);
    try {
      const freeSlots = await clinicBackend.getFreeSlots(doctorId, dateStr);
      setRescheduleSlots(freeSlots);
    } catch (err: any) {
      setRescheduleModalError(err.message || 'Error loading slots for rescheduling.');
      setErrorMsg(err.message || 'Error loading slots for rescheduling.');
      setRescheduleSlots([]);
    } finally {
      setLoadingRescheduleSlots(false);
    }
  };

  const handleRescheduleDateChange = (newDate: string) => {
    setRescheduleDate(newDate);
    setSelectedRescheduleSlotStart(null);
    setRescheduleModalError(null);
    if (rescheduleAppointmentItem) {
      loadRescheduleSlots(rescheduleAppointmentItem.doctor_id, newDate);
    }
  };

  // Reschedule:
  // supabase.rpc('reschedule_appointment', { p_id: appointment.id, p_new_start: <ISO timestamp of the chosen slot_start from get_free_slots> })
  const submitReschedule = async () => {
    if (!rescheduleAppointmentItem || !selectedRescheduleSlotStart) {
      setRescheduleModalError('Please select a new consultation slot.');
      setErrorMsg('Please select a new consultation slot.');
      return;
    }

    const appointment = rescheduleAppointmentItem;
    setSubmittingReschedule(true);
    setRescheduleModalError(null);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const supabase = clinicBackend.getClient();
      const { data, error } = await supabase.rpc('reschedule_appointment', {
        p_id: appointment.id,
        p_new_start: selectedRescheduleSlotStart,
      });

      if (error) {
        setRescheduleModalError(error.message);
        setErrorMsg(error.message);
        return;
      }

      const prevDoctorId = appointment.doctor_id;
      const targetDate = rescheduleDate || getKarachiDate(selectedRescheduleSlotStart);

      setSuccessMsg(
        'Appointment rescheduled successfully! Status has been updated to Pending for doctor confirmation.'
      );
      setRescheduleAppointmentItem(null);

      // 1. Re-fetch appointment_details
      await loadAppointments();

      // 2. Refresh the slot list so the freed slot appears again
      setSelectedDoctorId(prevDoctorId);
      setSelectedDate(targetDate);
      await fetchFreeSlots(prevDoctorId, targetDate, true);
    } catch (err: any) {
      setRescheduleModalError(err.message || 'Unable to reschedule appointment.');
      setErrorMsg(err.message || 'Unable to reschedule appointment.');
    } finally {
      setSubmittingReschedule(false);
    }
  };

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId);

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-4 sm:px-6 rounded-t-xl shadow-xs">
        <button
          id="patient-tab-book"
          onClick={() => {
            setActiveTab('book');
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`py-4 px-3 sm:px-6 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'book'
              ? 'border-teal-700 text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <CalendarCheck className="w-4 h-4 text-teal-600" />
          <span>Book Consultation</span>
        </button>

        <button
          id="patient-tab-appointments"
          onClick={() => {
            setActiveTab('appointments');
            setErrorMsg(null);
            setSuccessMsg(null);
            loadAppointments();
          }}
          className={`py-4 px-3 sm:px-6 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'appointments'
              ? 'border-teal-700 text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="w-4 h-4 text-teal-600" />
          <span>My Appointments</span>
          {myAppointments.length > 0 && (
            <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700 font-bold">
              {myAppointments.length}
            </span>
          )}
        </button>
      </div>

      {/* Feedback Alerts */}
      {errorMsg && (
        <div
          id="patient-error-banner"
          className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl flex items-start gap-3 shadow-xs"
        >
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-rose-900">Server Message</p>
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
          id="patient-success-banner"
          className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl flex items-start gap-3 shadow-xs"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-emerald-900">Operation Successful</p>
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

      {/* TAB 1: BOOK CONSULTATION */}
      {activeTab === 'book' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Step 1: Select Doctor */}
          <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <h3 className="font-semibold text-slate-900 text-sm">Select Consultant</h3>
              </div>
              <span className="text-xs text-slate-500">From doctor_directory</span>
            </div>

            {doctors.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No active doctors currently available in directory.
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {doctors.map((doc) => {
                  const isSelected = selectedDoctorId === doc.id;
                  return (
                    <div
                      key={doc.id}
                      id={`doctor-card-${doc.id}`}
                      onClick={() => setSelectedDoctorId(doc.id)}
                      className={`p-3.5 rounded-lg border text-left cursor-pointer transition-all ${
                        isSelected
                          ? 'border-teal-600 bg-teal-50/50 shadow-xs ring-1 ring-teal-600'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                              isSelected ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            <Stethoscope className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900 text-sm leading-tight">
                              {doc.name}
                            </h4>
                            <p className="text-xs text-teal-700 font-medium mt-0.5">
                              {doc.specialty}
                            </p>
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2: Date & Free Slots */}
          <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <h3 className="font-semibold text-slate-900 text-sm">Choose Consultation Slot</h3>
              </div>
              <span className="text-xs text-slate-500">RPC: get_free_slots</span>
            </div>

            {/* Date Picker (Filter in Asia/Karachi) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-slate-500" />
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Consultation Date:
                </label>
              </div>
              <input
                id="booking-date-input"
                type="date"
                min={getTodayKarachiDate()}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            {/* Free Slots Grid */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>
                  Available 30-Minute Slots for{' '}
                  <span className="font-semibold text-slate-900">
                    {formatKarachiDate(`${selectedDate}T00:00:00+05:00`)}
                  </span>
                </span>
                <span>{slots.length} slots open</span>
              </div>

              {loadingSlots ? (
                <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                  <span>Calculating free slots on server...</span>
                </div>
              ) : slots.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  <CalendarX className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">No open consultation slots on this date.</p>
                  <p className="mt-1">
                    The consultant may be off duty, on leave, or all intervals are already booked.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
                  {slots.map((slot, idx) => {
                    const isSelected = selectedSlotStart === slot.slot_start;
                    return (
                      <button
                        key={idx}
                        id={`slot-btn-${idx}`}
                        type="button"
                        onClick={() => setSelectedSlotStart(slot.slot_start)}
                        className={`py-2 px-2.5 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                            : 'bg-white text-slate-800 border-slate-300 hover:border-teal-500 hover:bg-teal-50/40'
                        }`}
                      >
                        {formatKarachiSlotRange(slot.slot_start, slot.slot_end)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected Summary & Book Submit */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-600">
                {selectedDoctor && selectedSlotStart ? (
                  <div>
                    Booking with <strong className="text-slate-900">{selectedDoctor.name}</strong> at{' '}
                    <strong className="text-teal-800">
                      {formatKarachiSlotRange(selectedSlotStart, '')}
                    </strong>
                  </div>
                ) : (
                  <span>Select doctor, date, and time slot to request appointment.</span>
                )}
              </div>

              <button
                id="patient-submit-booking-btn"
                onClick={handleBookAppointment}
                disabled={!selectedDoctorId || !selectedSlotStart || submittingBooking}
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {submittingBooking ? 'Submitting to RPC...' : 'Request Appointment'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MY APPOINTMENTS */}
      {activeTab === 'appointments' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Consultation History &amp; Status</h3>
              <p className="text-xs text-slate-500">
                From view appointment_details (filtered for current patient)
              </p>
            </div>
            <div className="text-xs text-slate-500">
              Reschedule/Cancellation permitted &gt;2 hours before start
            </div>
          </div>

          {loadingAppointments ? (
            <div className="p-12 text-center text-xs text-slate-500">
              Loading appointment details...
            </div>
          ) : myAppointments.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              <CalendarCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">No appointments scheduled.</p>
              <p className="mt-1">Switch to the "Book Consultation" tab to pick a slot.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 uppercase font-semibold">
                    <th className="py-2.5 px-3">Date &amp; Slot</th>
                    <th className="py-2.5 px-3">Doctor &amp; Specialty</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Clinical Notes</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {myAppointments.map((appt) => {
                    const isUpcoming =
                      appt.status === 'Pending' || appt.status === 'Confirmed';
                    const canModify = isUpcoming;

                    return (
                      <tr key={appt.id} id={`appt-row-${appt.id}`} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3 font-medium text-slate-900 whitespace-nowrap">
                          <div>{formatKarachiDate(appt.slot_start)}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 text-teal-600" />
                            <span>{formatKarachiSlotRange(appt.slot_start, appt.slot_end)}</span>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900">{appt.doctor_name}</div>
                          <div className="text-[11px] text-teal-700 font-medium">
                            {appt.specialty || 'Consultant'}
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
                            <button
                              id={`view-notes-btn-${appt.id}`}
                              onClick={() => setViewingNotesAppointment(appt)}
                              className="text-xs text-teal-700 hover:text-teal-900 font-medium flex items-center gap-1 cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>View Notes</span>
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">None recorded</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {canModify ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                id={`reschedule-btn-${appt.id}`}
                                onClick={() => openRescheduleModal(appt)}
                                className="px-2.5 py-1 rounded border border-slate-300 text-slate-700 hover:text-teal-700 hover:border-teal-400 text-xs font-medium cursor-pointer"
                                title="Reschedule appointment"
                              >
                                Reschedule
                              </button>
                              <button
                                id={`cancel-btn-${appt.id}`}
                                onClick={() => handleCancelAppointment(appt)}
                                disabled={cancellingId === appt.id}
                                className="px-2.5 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-medium cursor-pointer disabled:opacity-50"
                                title="Cancel appointment"
                              >
                                {cancellingId === appt.id ? 'Cancelling...' : 'Cancel'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">
                              {appt.status === 'Cancelled' ? 'Cancelled' : 'Concluded'}
                            </span>
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

      {/* RESCHEDULE MODAL */}
      {rescheduleAppointmentItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900 text-sm">Reschedule Consultation</h3>
              <button
                onClick={() => setRescheduleAppointmentItem(null)}
                className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Error Banner */}
            {rescheduleModalError && (
              <div
                id="reschedule-modal-error"
                role="alert"
                className="p-3 bg-rose-50 border-2 border-rose-300 text-rose-900 text-xs rounded-lg flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{rescheduleModalError}</div>
              </div>
            )}

            <div className="text-xs text-slate-600">
              Rescheduling appointment with{' '}
              <strong className="text-slate-900">
                {rescheduleAppointmentItem.doctor_name}
              </strong>
              . Status will return to <span className="font-semibold text-amber-700">Pending</span>.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                New Consultation Date:
              </label>
              <input
                type="date"
                min={getTodayKarachiDate()}
                value={rescheduleDate}
                onChange={(e) => handleRescheduleDateChange(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Available Slots:
              </label>
              {loadingRescheduleSlots ? (
                <div className="p-4 text-center text-xs text-slate-500">Checking open slots...</div>
              ) : rescheduleSlots.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border">
                  No slots open on this date.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {rescheduleSlots.map((slot, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedRescheduleSlotStart(slot.slot_start)}
                      className={`p-2 text-xs rounded border cursor-pointer ${
                        selectedRescheduleSlotStart === slot.slot_start
                          ? 'bg-teal-700 text-white border-teal-700 font-semibold'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-teal-50'
                      }`}
                    >
                      {formatKarachiSlotRange(slot.slot_start, slot.slot_end)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRescheduleAppointmentItem(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm-reschedule-btn"
                type="button"
                onClick={submitReschedule}
                disabled={!selectedRescheduleSlotStart || submittingReschedule}
                className="px-4 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
              >
                {submittingReschedule ? 'Rescheduling...' : 'Confirm Reschedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VISIT NOTES MODAL */}
      {viewingNotesAppointment && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-700" />
                <h3 className="font-semibold text-slate-900 text-sm">Clinical Visit Notes</h3>
              </div>
              <button
                onClick={() => setViewingNotesAppointment(null)}
                className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <strong>Doctor:</strong> {viewingNotesAppointment.doctor_name} (
                {viewingNotesAppointment.specialty})
              </div>
              <div>
                <strong>Date &amp; Time:</strong>{' '}
                {formatKarachiDate(viewingNotesAppointment.slot_start)} at{' '}
                {formatKarachiSlotRange(
                  viewingNotesAppointment.slot_start,
                  viewingNotesAppointment.slot_end
                )}
              </div>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 leading-relaxed min-h-[100px] whitespace-pre-wrap">
              {viewingNotesAppointment.visit_notes}
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setViewingNotesAppointment(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-medium hover:bg-slate-900 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
