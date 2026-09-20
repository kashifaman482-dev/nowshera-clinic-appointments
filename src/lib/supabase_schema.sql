-- =========================================================================
-- NOWSHERA FAMILY CLINIC - EXACT SUPABASE POSTGRESQL SCHEMA, VIEWS & RPCs
-- =========================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE appointment_status AS ENUM ('Pending', 'Confirmed', 'Rejected', 'Cancelled', 'Completed', 'No-show');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. PROFILES TABLE
-- Exact columns: id, role, name, email, phone, created_at
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'patient',
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Trigger to auto-create profile on auth.users sign-up
-- "Sign-up must pass options.data = {name, phone}."
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, role, name, email, phone)
    VALUES (
        NEW.id,
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'patient'::user_role),
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.email,
        NEW.raw_user_meta_data->>'phone'
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 4. DOCTORS TABLE
-- Exact columns: id, profile_id, specialty, active, created_at
CREATE TABLE IF NOT EXISTS public.doctors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    specialty TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. DOCTOR AVAILABILITY TABLE
-- Exact columns: id, doctor_id, day_of_week, start_time, end_time, created_at
-- day_of_week: "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
-- start_time, end_time: "HH:MM:SS"
CREATE TABLE IF NOT EXISTS public.doctor_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    day_of_week TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT check_end_after_start CHECK (end_time > start_time)
);

-- Trigger: Validate no overlapping availability intervals for the same doctor on the same day
CREATE OR REPLACE FUNCTION check_doctor_availability_overlap()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.doctor_availability
        WHERE doctor_id = NEW.doctor_id
          AND day_of_week = NEW.day_of_week
          AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND (NEW.start_time < end_time AND NEW.end_time > start_time)
    ) THEN
        RAISE EXCEPTION 'Availability interval overlaps with existing active hours for this day.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_doctor_availability_overlap ON public.doctor_availability;
CREATE TRIGGER trg_doctor_availability_overlap
    BEFORE INSERT OR UPDATE ON public.doctor_availability
    FOR EACH ROW
    EXECUTE FUNCTION check_doctor_availability_overlap();

-- 6. DOCTOR LEAVE TABLE
-- Exact columns: id, doctor_id, leave_date, created_at
CREATE TABLE IF NOT EXISTS public.doctor_leave (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    leave_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_doctor_leave_date UNIQUE (doctor_id, leave_date)
);

-- 7. APPOINTMENTS TABLE
-- Exact columns: id, patient_id, doctor_id, slot_start, slot_end, status, note, created_at
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
    slot_start TIMESTAMPTZ NOT NULL,
    slot_end TIMESTAMPTZ NOT NULL,
    status appointment_status NOT NULL DEFAULT 'Pending',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT check_slot_order CHECK (slot_end > slot_start)
);

-- Trigger: When doctor registers leave, auto-cancel Pending/Confirmed appointments on that date in Asia/Karachi
CREATE OR REPLACE FUNCTION process_doctor_leave_cancellations()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.appointments
    SET status = 'Cancelled'
    WHERE doctor_id = NEW.doctor_id
      AND ((slot_start AT TIME ZONE 'Asia/Karachi')::date = NEW.leave_date)
      AND status IN ('Pending', 'Confirmed');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_doctor_leave_cancel ON public.doctor_leave;
CREATE TRIGGER trg_doctor_leave_cancel
    AFTER INSERT ON public.doctor_leave
    FOR EACH ROW
    EXECUTE FUNCTION process_doctor_leave_cancellations();

-- 8. VISIT NOTES TABLE (Patient and Doctor access)
-- Exact columns: id, appointment_id, doctor_id, patient_id, note, created_at
CREATE TABLE IF NOT EXISTS public.visit_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID UNIQUE NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.doctors(id),
    patient_id UUID NOT NULL REFERENCES public.profiles(id),
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =========================================================================
-- DATABASE VIEWS
-- =========================================================================

-- View 1: doctor_directory
-- Exact columns: id, name, specialty
CREATE OR REPLACE VIEW public.doctor_directory AS
SELECT
    d.id,
    p.name,
    d.specialty
FROM public.doctors d
JOIN public.profiles p ON p.id = d.profile_id
WHERE d.active = true;

-- View 2: appointment_details
-- Exact columns: id, patient_id, doctor_id, slot_start, slot_end, status, created_at,
-- patient_name, patient_phone, patient_email, doctor_name, specialty
CREATE OR REPLACE VIEW public.appointment_details AS
SELECT
    a.id,
    a.patient_id,
    a.doctor_id,
    a.slot_start,
    a.slot_end,
    a.status,
    a.created_at,
    p.name AS patient_name,
    p.phone AS patient_phone,
    p.email AS patient_email,
    dp.name AS doctor_name,
    d.specialty
FROM public.appointments a
JOIN public.profiles p ON p.id = a.patient_id
JOIN public.doctors d ON d.id = a.doctor_id
JOIN public.profiles dp ON dp.id = d.profile_id;

-- View 3: doctor_stats
-- Exact columns: doctor_id, doctor_name, specialty, active, pending, confirmed, completed, no_show, cancelled
CREATE OR REPLACE VIEW public.doctor_stats AS
SELECT
    d.id AS doctor_id,
    p.name AS doctor_name,
    d.specialty,
    d.active,
    COUNT(a.id) FILTER (WHERE a.status = 'Pending')::INT AS pending,
    COUNT(a.id) FILTER (WHERE a.status = 'Confirmed')::INT AS confirmed,
    COUNT(a.id) FILTER (WHERE a.status = 'Completed')::INT AS completed,
    COUNT(a.id) FILTER (WHERE a.status = 'No-show')::INT AS no_show,
    COUNT(a.id) FILTER (WHERE a.status = 'Cancelled')::INT AS cancelled
FROM public.doctors d
JOIN public.profiles p ON p.id = d.profile_id
LEFT JOIN public.appointments a ON a.doctor_id = d.id
GROUP BY d.id, p.name, d.specialty, d.active;

-- =========================================================================
-- STORED FUNCTIONS & RPCs
-- =========================================================================

-- RPC 1: get_free_slots(p_doctor_id, p_date)
-- Returns rows with: slot_start, slot_end
CREATE OR REPLACE FUNCTION public.get_free_slots(
    p_doctor_id UUID,
    p_date DATE
)
RETURNS TABLE (
    slot_start TIMESTAMPTZ,
    slot_end TIMESTAMPTZ
) AS $$
DECLARE
    v_day_name TEXT;
    v_is_active BOOLEAN;
    v_on_leave BOOLEAN;
    v_avail RECORD;
    v_cur_time TIME;
    v_next_time TIME;
    v_cur_ts TIMESTAMPTZ;
    v_next_ts TIMESTAMPTZ;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    -- 1. Check doctor active
    SELECT active INTO v_is_active FROM public.doctors WHERE id = p_doctor_id;
    IF v_is_active IS NOT TRUE THEN
        RETURN;
    END IF;

    -- 2. Check if date is in past (in Asia/Karachi)
    IF p_date < (v_now AT TIME ZONE 'Asia/Karachi')::date THEN
        RETURN;
    END IF;

    -- 3. Check if doctor on leave
    SELECT EXISTS(SELECT 1 FROM public.doctor_leave WHERE doctor_id = p_doctor_id AND leave_date = p_date)
    INTO v_on_leave;
    IF v_on_leave THEN
        RETURN;
    END IF;

    -- 4. Get English day of week name (e.g. 'Monday', 'Tuesday', ...)
    v_day_name := trim(to_char(p_date, 'Day'));

    -- 5. Iterate through doctor_availability for this day
    FOR v_avail IN (
        SELECT da.start_time, da.end_time
        FROM public.doctor_availability da
        WHERE da.doctor_id = p_doctor_id
          AND da.day_of_week = v_day_name
        ORDER BY da.start_time
    ) LOOP
        v_cur_time := v_avail.start_time;
        WHILE v_cur_time + INTERVAL '30 minutes' <= v_avail.end_time LOOP
            v_next_time := (v_cur_time + INTERVAL '30 minutes')::TIME;
            
            -- Slot timestamps anchored in Asia/Karachi
            v_cur_ts := (p_date || ' ' || v_cur_time)::timestamp AT TIME ZONE 'Asia/Karachi';
            v_next_ts := (p_date || ' ' || v_next_time)::timestamp AT TIME ZONE 'Asia/Karachi';

            -- If in past, skip
            IF v_cur_ts <= v_now THEN
                v_cur_time := v_next_time;
                CONTINUE;
            END IF;

            -- Check if slot is taken (Pending or Confirmed hold slot)
            IF EXISTS (
                SELECT 1 FROM public.appointments a
                WHERE a.doctor_id = p_doctor_id
                  AND a.slot_start = v_cur_ts
                  AND a.status IN ('Pending', 'Confirmed')
            ) THEN
                v_cur_time := v_next_time;
                CONTINUE;
            END IF;

            -- Yield available free slot
            slot_start := v_cur_ts;
            slot_end := v_next_ts;
            RETURN NEXT;

            v_cur_time := v_next_time;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- RPC 2: book_appointment(p_doctor_id, p_slot_start)
CREATE OR REPLACE FUNCTION public.book_appointment(
    p_doctor_id UUID,
    p_slot_start TIMESTAMPTZ
)
RETURNS UUID AS $$
DECLARE
    v_patient_id UUID := auth.uid();
    v_slot_end TIMESTAMPTZ := p_slot_start + INTERVAL '30 minutes';
    v_appt_id UUID;
    v_conflict BOOLEAN;
BEGIN
    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'You must be authenticated to book an appointment.';
    END IF;

    -- Slot conflicts
    SELECT EXISTS (
        SELECT 1 FROM public.appointments
        WHERE doctor_id = p_doctor_id
          AND slot_start = p_slot_start
          AND status IN ('Pending', 'Confirmed')
    ) INTO v_conflict;

    IF v_conflict THEN
        RAISE EXCEPTION 'This slot has already been booked or requested.';
    END IF;

    INSERT INTO public.appointments (patient_id, doctor_id, slot_start, slot_end, status)
    VALUES (v_patient_id, p_doctor_id, p_slot_start, v_slot_end, 'Pending')
    RETURNING id INTO v_appt_id;

    RETURN v_appt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 3: reschedule_appointment(p_id, p_new_start)
CREATE OR REPLACE FUNCTION public.reschedule_appointment(
    p_id UUID,
    p_new_start TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_appt RECORD;
    v_conflict BOOLEAN;
    v_new_end TIMESTAMPTZ := p_new_start + INTERVAL '30 minutes';
BEGIN
    SELECT * INTO v_appt FROM public.appointments WHERE id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment not found.';
    END IF;

    -- Rule: Must be >= 2 hours before slot_start
    IF v_appt.slot_start - clock_timestamp() < INTERVAL '2 hours' THEN
        RAISE EXCEPTION 'Rescheduling is prohibited within 2 hours of scheduled slot.';
    END IF;

    -- Conflict check
    SELECT EXISTS (
        SELECT 1 FROM public.appointments
        WHERE doctor_id = v_appt.doctor_id
          AND slot_start = p_new_start
          AND id <> p_id
          AND status IN ('Pending', 'Confirmed')
    ) INTO v_conflict;

    IF v_conflict THEN
        RAISE EXCEPTION 'The chosen new slot is already occupied.';
    END IF;

    UPDATE public.appointments
    SET slot_start = p_new_start,
        slot_end = v_new_end,
        status = 'Pending'
    WHERE id = p_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 4: cancel_appointment(p_id)
CREATE OR REPLACE FUNCTION public.cancel_appointment(
    p_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role user_role;
    v_appt RECORD;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    SELECT * INTO v_appt FROM public.appointments WHERE id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment not found.';
    END IF;

    -- Patient 2-hour restriction
    IF v_role = 'patient' THEN
        IF v_appt.slot_start - clock_timestamp() < INTERVAL '2 hours' THEN
            RAISE EXCEPTION 'Patients cannot cancel appointments within 2 hours of slot time.';
        END IF;
    END IF;

    UPDATE public.appointments
    SET status = 'Cancelled'
    WHERE id = p_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 5: respond_appointment(p_id, p_action)
CREATE OR REPLACE FUNCTION public.respond_appointment(
    p_id UUID,
    p_action TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_action = 'confirm' THEN
        UPDATE public.appointments SET status = 'Confirmed' WHERE id = p_id;
    ELSIF p_action = 'reject' THEN
        UPDATE public.appointments SET status = 'Rejected' WHERE id = p_id;
    ELSE
        RAISE EXCEPTION 'Invalid action. Must be confirm or reject.';
    END IF;
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 6: complete_appointment(p_id, p_status, p_note)
CREATE OR REPLACE FUNCTION public.complete_appointment(
    p_id UUID,
    p_status TEXT,
    p_note TEXT DEFAULT ''
)
RETURNS BOOLEAN AS $$
DECLARE
    v_appt RECORD;
BEGIN
    SELECT * INTO v_appt FROM public.appointments WHERE id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment not found.';
    END IF;

    IF p_status NOT IN ('Completed', 'No-show') THEN
        RAISE EXCEPTION 'Status must be Completed or No-show.';
    END IF;

    UPDATE public.appointments
    SET status = p_status::appointment_status
    WHERE id = p_id;

    IF p_note IS NOT NULL AND length(trim(p_note)) > 0 THEN
        INSERT INTO public.visit_notes (appointment_id, doctor_id, patient_id, note)
        VALUES (p_id, v_appt.doctor_id, v_appt.patient_id, trim(p_note))
        ON CONFLICT (appointment_id) DO UPDATE SET
            note = EXCLUDED.note;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
