export type UserRole = 'patient' | 'doctor' | 'admin';

export type AppointmentStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Rejected'
  | 'Cancelled'
  | 'Completed'
  | 'No-show';

/**
 * profiles table exact columns:
 * id, role, name, email, phone, created_at
 */
export interface UserProfile {
  id: string;
  role: UserRole;
  name: string;
  email: string;
  phone?: string | null;
  created_at?: string;
}

/**
 * doctors table exact columns:
 * id, profile_id, specialty, active, created_at
 */
export interface DoctorRecord {
  id: string;
  profile_id: string;
  specialty: string;
  active: boolean;
  created_at?: string;
}

/**
 * View doctor_directory exact columns:
 * id, name, specialty
 */
export interface DoctorDirectoryEntry {
  id: string;
  name: string;
  specialty: string;
}

/**
 * appointments table exact columns:
 * id, patient_id, doctor_id, slot_start, slot_end, status, note, created_at
 */
export interface AppointmentRecord {
  id: string;
  patient_id: string;
  doctor_id: string;
  slot_start: string;
  slot_end: string;
  status: AppointmentStatus;
  note?: string | null;
  created_at: string;
}

/**
 * View appointment_details exact columns:
 * id, patient_id, doctor_id, slot_start, slot_end, status, created_at,
 * patient_name, patient_phone, patient_email, doctor_name, specialty
 */
export interface AppointmentDetail {
  id: string;
  patient_id: string;
  doctor_id: string;
  slot_start: string;
  slot_end: string;
  status: AppointmentStatus;
  created_at: string;
  patient_name: string | null;
  patient_phone: string | null;
  patient_email: string | null;
  doctor_name: string | null;
  specialty: string | null;
  visit_notes?: string | null; // Joined from visit_notes table for patient & doctor
}

/**
 * View doctor_stats exact columns:
 * doctor_id, doctor_name, specialty, active, pending, confirmed, completed, no_show, cancelled
 */
export interface DoctorStat {
  doctor_id: string;
  doctor_name: string;
  specialty: string;
  active: boolean;
  pending: number;
  confirmed: number;
  completed: number;
  no_show: number;
  cancelled: number;
}

/**
 * rpc get_free_slots(p_doctor_id, p_date) returns rows with:
 * slot_start, slot_end
 */
export interface FreeSlot {
  slot_start: string;
  slot_end: string;
}

/**
 * doctor_availability table exact columns:
 * id, doctor_id, day_of_week, start_time, end_time, created_at
 * (day_of_week: "Monday", "Tuesday", etc.; start_time/end_time: "HH:MM:SS")
 */
export interface DoctorAvailability {
  id: string;
  doctor_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  created_at?: string;
}

/**
 * doctor_leave table exact columns:
 * id, doctor_id, leave_date, created_at
 */
export interface DoctorLeave {
  id: string;
  doctor_id: string;
  leave_date: string;
  created_at?: string;
}

/**
 * visit_notes table exact columns:
 * id, appointment_id, doctor_id, patient_id, note, created_at
 */
export interface VisitNote {
  id?: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  note: string;
  created_at?: string;
}
