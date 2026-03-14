
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'nurse');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Patients table
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  id_number TEXT UNIQUE,
  ward TEXT,
  bed_number TEXT,
  admission_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  discharge_date TIMESTAMPTZ,
  assigned_nurse_id UUID REFERENCES auth.users(id),
  diagnosis TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view patients" ON public.patients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert patients" ON public.patients
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'nurse')
  );

CREATE POLICY "Admins can update patients" ON public.patients
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'nurse')
  );

-- Vitals table (real-time data from hardware)
CREATE TABLE public.vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  temperature NUMERIC(4,1),
  systolic_bp INTEGER,
  diastolic_bp INTEGER,
  heart_rate INTEGER,
  oxygen_saturation NUMERIC(4,1),
  blood_glucose NUMERIC(5,1),
  respiratory_rate INTEGER,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_critical BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE public.vitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view vitals" ON public.vitals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can insert vitals" ON public.vitals
  FOR INSERT WITH CHECK (true);

-- Treatments table
CREATE TABLE public.treatments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  treatment_name TEXT NOT NULL,
  description TEXT,
  prescribed_by UUID REFERENCES auth.users(id),
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view treatments" ON public.treatments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can insert treatments" ON public.treatments
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'nurse')
  );

CREATE POLICY "Staff can update treatments" ON public.treatments
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'nurse')
  );

-- Alert acknowledgments for non-repudiation
CREATE TABLE public.alert_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vital_id UUID REFERENCES public.vitals(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  acknowledged_by UUID REFERENCES auth.users(id) NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);
ALTER TABLE public.alert_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view acknowledgments" ON public.alert_acknowledgments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert acknowledgments" ON public.alert_acknowledgments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = acknowledged_by);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for vitals
ALTER PUBLICATION supabase_realtime ADD TABLE public.vitals;

-- Create index for fast vital lookups
CREATE INDEX idx_vitals_patient_recorded ON public.vitals (patient_id, recorded_at DESC);
CREATE INDEX idx_vitals_critical ON public.vitals (is_critical) WHERE is_critical = true;
