import { getSupabaseClient } from '../lib/supabaseClient';
import {
  UserProfile,
  DoctorDirectoryEntry,
  AppointmentDetail,
  DoctorStat,
  FreeSlot,
  DoctorAvailability,
  DoctorLeave,
  UserRole,
} from '../types';

class ClinicBackendService {
  public getClient() {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error(
        'Supabase client is not initialized. Please verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
      );
    }
    return client;
  }

  // =========================================================================
  // AUTHENTICATION & PROFILE
  // Exact columns for profiles: id, role, name, email, phone, created_at
  // =========================================================================

  /**
   * Fetches the profile of the currently logged-in user from the profiles table.
   * "after login read the user's role from the profiles table (id = auth user id)"
   * Exact columns: id, role, name, email, phone, created_at
   */
  public async getCurrentProfile(): Promise<UserProfile | null> {
    const supabase = this.getClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return null;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, role, name, email, phone, created_at')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user profile:', error.message);
      throw new Error(error.message);
    }

    if (!profile) {
      // If profile trigger is slightly delayed or not yet created, return a fallback with session metadata
      const userMeta = session.user.user_metadata || {};
      return {
        id: session.user.id,
        role: (userMeta.role as UserRole) || 'patient',
        name: userMeta.name || session.user.email?.split('@')[0] || 'User',
        email: session.user.email || '',
        phone: userMeta.phone || null,
        created_at: session.user.created_at,
      };
    }

    return profile as UserProfile;
  }

  /**
   * Patient / User Sign-up:
   * "Sign-up must pass options.data = {name, phone}."
   */
  public async signUp(
    name: string,
    phone: string,
    email: string,
    password: string
  ): Promise<{ user: UserProfile | null; needsEmailConfirmation: boolean }> {
    const supabase = this.getClient();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanPhone = phone.trim();

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          name: cleanName,
          phone: cleanPhone,
        },
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user) {
      throw new Error('Sign-up failed: No user returned by authentication provider.');
    }

    // Check if session was returned immediately (email confirmation disabled) or pending confirmation
    const needsEmailConfirmation = !data.session;

    let profile: UserProfile | null = null;
    if (data.session) {
      profile = await this.getCurrentProfile();
    }

    return { user: profile, needsEmailConfirmation };
  }

  /**
   * Sign-in with email & password
   */
  public async signIn(email: string, password: string): Promise<UserProfile> {
    const supabase = this.getClient();
    const cleanEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user) {
      throw new Error('Sign-in failed. Please check your credentials.');
    }

    const profile = await this.getCurrentProfile();
    if (!profile) {
      throw new Error('Unable to find clinical profile for this authenticated account.');
    }

    return profile;
  }

  /**
   * Sign out
   */
  public async signOut(): Promise<void> {
    const supabase = this.getClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
  }

  // =========================================================================
  // DOCTOR DIRECTORY (View: doctor_directory: id, name, specialty)
  // =========================================================================

  public async getDoctorDirectory(): Promise<DoctorDirectoryEntry[]> {
    const supabase = this.getClient();
    const { data, error } = await supabase
      .from('doctor_directory')
      .select('id, name, specialty')
      .order('name');

    if (error) {
      throw new Error(error.message);
    }

    return (data || []) as DoctorDirectoryEntry[];
  }

  // =========================================================================
  // FREE SLOTS (RPC: get_free_slots(p_doctor_id, p_date))
  // Returns rows with: slot_start, slot_end
  // =========================================================================

  public async getFreeSlots(doctorId: string, dateStr: string): Promise<FreeSlot[]> {
    const supabase = this.getClient();
    const { data, error } = await supabase.rpc('get_free_slots', {
      p_doctor_id: doctorId,
      p_date: dateStr,
    });

    if (error) {
      throw new Error(error.message);
    }

    return (data || []) as FreeSlot[];
  }

  // =========================================================================
  // APPOINTMENTS (RPCs for mutation, View: appointment_details for reading)
  // View columns: id, patient_id, doctor_id, slot_start, slot_end, status,
  // created_at, patient_name, patient_phone, patient_email, doctor_name, specialty
  // Table appointments: id, patient_id, doctor_id, slot_start, slot_end, status, note, created_at
  // Table visit_notes: id, appointment_id, doctor_id, patient_id, note, created_at
  // =========================================================================

  public async getAppointments(): Promise<AppointmentDetail[]> {
    const supabase = this.getClient();
    // 1. Fetch appointments from view appointment_details
    const { data: appts, error: apptError } = await supabase
      .from('appointment_details')
      .select(
        'id, patient_id, doctor_id, slot_start, slot_end, status, created_at, patient_name, patient_phone, patient_email, doctor_name, specialty'
      )
      .order('slot_start', { ascending: false });

    if (apptError) {
      throw new Error(apptError.message);
    }

    if (!appts || appts.length === 0) {
      return [];
    }

    // 2. Fetch visit notes for patient or doctor (visit_notes: id, appointment_id, doctor_id, patient_id, note, created_at)
    try {
      const apptIds = appts.map((a: any) => a.id);
      const { data: notes } = await supabase
        .from('visit_notes')
        .select('appointment_id, note')
        .in('appointment_id', apptIds);

      const noteMap = new Map<string, string>();
      if (notes) {
        notes.forEach((n: any) => {
          noteMap.set(n.appointment_id, n.note);
        });
      }

      return appts.map((a: any) => ({
        ...a,
        visit_notes: noteMap.get(a.id) || null,
      })) as AppointmentDetail[];
    } catch {
      // If visit_notes query fails (e.g. for admin where RLS restricts access), return without notes
      return appts as AppointmentDetail[];
    }
  }

  /**
   * Book appointment:
   * "Book: rpc('book_appointment', {p_doctor_id, p_slot_start})."
   */
  public async bookAppointment(doctorId: string, slotStartIso: string): Promise<any> {
    const supabase = this.getClient();
    const { data, error } = await supabase.rpc('book_appointment', {
      p_doctor_id: doctorId,
      p_slot_start: slotStartIso,
    });

    if (error) {
      throw new Error(error.message);
    }
    return data;
  }

  /**
   * Reschedule appointment:
   * supabase.rpc('reschedule_appointment', { p_id: appointment.id, p_new_start: <ISO timestamp of the chosen slot_start from get_free_slots> })
   */
  public async rescheduleAppointment(
    appointmentId: string,
    newStartIso: string
  ): Promise<{ data: any; error: any }> {
    const supabase = this.getClient();
    const { data, error } = await supabase.rpc('reschedule_appointment', {
      p_id: appointmentId,
      p_new_start: newStartIso,
    });

    return { data, error };
  }

  /**
   * Cancel appointment:
   * supabase.rpc('cancel_appointment', { p_id: appointment.id })
   */
  public async cancelAppointment(
    appointmentId: string
  ): Promise<{ data: any; error: any }> {
    const supabase = this.getClient();
    const { data, error } = await supabase.rpc('cancel_appointment', {
      p_id: appointmentId,
    });

    return { data, error };
  }

  /**
   * Doctor respond:
   * "Doctor confirm/reject: rpc('respond_appointment', {p_id, p_action: 'confirm'|'reject'})."
   */
  public async respondAppointment(
    appointmentId: string,
    action: 'confirm' | 'reject'
  ): Promise<any> {
    const supabase = this.getClient();
    const { data, error } = await supabase.rpc('respond_appointment', {
      p_id: appointmentId,
      p_action: action,
    });

    if (error) {
      throw new Error(error.message);
    }
    return data;
  }

  /**
   * Doctor complete/no-show:
   * "Doctor complete/no-show: rpc('complete_appointment', {p_id, p_status: 'Completed'|'No-show', p_note})."
   */
  public async completeAppointment(
    appointmentId: string,
    status: 'Completed' | 'No-show',
    note?: string
  ): Promise<any> {
    const supabase = this.getClient();
    const { data, error } = await supabase.rpc('complete_appointment', {
      p_id: appointmentId,
      p_status: status,
      p_note: note || '',
    });

    if (error) {
      throw new Error(error.message);
    }
    return data;
  }

  // =========================================================================
  // DOCTOR STATS (View: doctor_stats: doctor_id, doctor_name, specialty, active,
  // pending, confirmed, completed, no_show, cancelled)
  // =========================================================================

  public async getDoctorStats(): Promise<DoctorStat[]> {
    const supabase = this.getClient();
    const { data, error } = await supabase
      .from('doctor_stats')
      .select(
        'doctor_id, doctor_name, specialty, active, pending, confirmed, completed, no_show, cancelled'
      )
      .order('doctor_name');

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).map((row: any) => ({
      doctor_id: row.doctor_id,
      doctor_name: row.doctor_name,
      specialty: row.specialty,
      active: row.active ?? true,
      pending: Number(row.pending || 0),
      confirmed: Number(row.confirmed || 0),
      completed: Number(row.completed || 0),
      no_show: Number(row.no_show || 0),
      cancelled: Number(row.cancelled || 0),
    })) as DoctorStat[];
  }

  // =========================================================================
  // DOCTOR AVAILABILITY & LEAVE
  // doctors: id, profile_id, specialty, active, created_at
  // doctor_availability: id, doctor_id, day_of_week, start_time, end_time, created_at
  // doctor_leave: id, doctor_id, leave_date, created_at
  // =========================================================================

  /**
   * Helper to resolve the doctor_id for the signed-in doctor:
   * Checks `doctors` table for `profile_id = userId` or `id = userId`, falls back to `userId`.
   * Exact columns of doctors: id, profile_id, specialty, active, created_at
   */
  public async getSignedInDoctorId(userId: string): Promise<string> {
    const supabase = this.getClient();
    try {
      const { data: doc } = await supabase
        .from('doctors')
        .select('id, profile_id')
        .or(`profile_id.eq.${userId},id.eq.${userId}`)
        .maybeSingle();

      if (doc?.id) return doc.id;
    } catch {
      // Fallback to userId
    }
    return userId;
  }

  /**
   * Fetch doctor availability
   * Columns: id, doctor_id, day_of_week, start_time, end_time, created_at
   */
  public async getDoctorAvailability(doctorId: string): Promise<DoctorAvailability[]> {
    const supabase = this.getClient();
    const { data, error } = await supabase
      .from('doctor_availability')
      .select('id, doctor_id, day_of_week, start_time, end_time, created_at')
      .eq('doctor_id', doctorId)
      .order('day_of_week')
      .order('start_time');

    if (error) {
      throw new Error(error.message);
    }
    return (data || []) as DoctorAvailability[];
  }

  /**
   * Add doctor availability
   * "For doctor_availability.day_of_week always save full English day names ("Monday", "Tuesday", ...),
   * and save start_time/end_time as "HH:MM:SS"."
   */
  public async addDoctorAvailability(
    doctorId: string,
    dayOfWeek: string,
    startTime: string,
    endTime: string
  ): Promise<void> {
    const supabase = this.getClient();

    // Ensure start_time and end_time are saved strictly in 24-hour "HH:MM:SS" (e.g. 11:00 -> 11:00:00, never 23:00:00)
    const formatToHHMMSS = (timeStr: string) => {
      const trimmed = timeStr.trim();
      const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (match) {
        const hh = parseInt(match[1], 10);
        const mm = parseInt(match[2], 10);
        const ss = match[3] ? parseInt(match[3], 10) : 0;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      }
      return trimmed;
    };

    const formattedStart = formatToHHMMSS(startTime);
    const formattedEnd = formatToHHMMSS(endTime);

    const { error } = await supabase.from('doctor_availability').insert({
      doctor_id: doctorId,
      day_of_week: dayOfWeek,
      start_time: formattedStart,
      end_time: formattedEnd,
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  public async deleteDoctorAvailability(id: string): Promise<void> {
    const supabase = this.getClient();
    const { error } = await supabase.from('doctor_availability').delete().eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetch doctor leaves
   * Exact columns: id, doctor_id, leave_date, created_at (NO reason column)
   */
  public async getDoctorLeaves(doctorId: string): Promise<DoctorLeave[]> {
    const supabase = this.getClient();
    const { data, error } = await supabase
      .from('doctor_leave')
      .select('id, doctor_id, leave_date, created_at')
      .eq('doctor_id', doctorId)
      .order('leave_date', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }
    return (data || []) as DoctorLeave[];
  }

  /**
   * Add doctor leave
   * Exact columns: id, doctor_id, leave_date, created_at (NO reason column)
   */
  public async addDoctorLeave(
    doctorId: string,
    leaveDate: string
  ): Promise<void> {
    const supabase = this.getClient();
    const { error } = await supabase.from('doctor_leave').insert({
      doctor_id: doctorId,
      leave_date: leaveDate,
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  public async deleteDoctorLeave(id: string): Promise<void> {
    const supabase = this.getClient();
    const { error } = await supabase.from('doctor_leave').delete().eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  }

  // =========================================================================
  // ADMIN DOCTOR ONBOARDING (Webhook)
  // =========================================================================

  public async adminAddDoctor(
    name: string,
    specialty: string,
    email: string
  ): Promise<{ message: string }> {
    const cleanName = name.trim();
    const cleanSpecialty = specialty.trim();
    const cleanEmail = email.trim().toLowerCase();

    const supabase = this.getClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Trigger n8n automated webhook for doctor creation/invitation
    const n8nUrl = import.meta.env.VITE_N8N_ADD_DOCTOR_URL;
    if (n8nUrl && typeof fetch !== 'undefined') {
      const response = await fetch(n8nUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          specialty: cleanSpecialty,
          role: 'doctor',
        }),
      });

      if (response.status === 403) {
        throw new Error('Only admins can add doctors.');
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
          errorText || `Failed to trigger doctor onboarding (HTTP ${response.status}).`
        );
      }
    }

    return {
      message: `Doctor ${cleanName} registration dispatched to automated onboarding webhook.`,
    };
  }
}

export const clinicBackend = new ClinicBackendService();
