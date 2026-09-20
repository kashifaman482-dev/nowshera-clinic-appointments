import { useState, useEffect } from 'react';
import { UserProfile } from './types';
import { clinicBackend } from './services/clinicBackend';
import { getSupabaseClient } from './lib/supabaseClient';
import { Header } from './components/Header';
import { AuthScreen } from './components/AuthScreen';
import { PatientPortal } from './components/PatientPortal';
import { DoctorPortal } from './components/DoctorPortal';
import { AdminPortal } from './components/AdminPortal';
import { Building2 } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize session and listen to Supabase auth state changes
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        const profile = await clinicBackend.getCurrentProfile();
        if (isMounted) {
          setCurrentUser(profile);
        }
      } catch (err) {
        console.error('Session initialization error:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    const supabase = getSupabaseClient();
    let authListener: { subscription: { unsubscribe: () => void } } | null = null;

    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          if (session?.user) {
            try {
              const profile = await clinicBackend.getCurrentProfile();
              if (isMounted) {
                setCurrentUser(profile);
              }
            } catch (e) {
              console.error('Error fetching profile on auth change:', e);
            }
          }
        } else if (event === 'SIGNED_OUT') {
          if (isMounted) {
            setCurrentUser(null);
          }
        }
      });
      authListener = data;
    }

    return () => {
      isMounted = false;
      if (authListener) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await clinicBackend.signOut();
    } catch (e) {
      console.error('Sign out error:', e);
    } finally {
      setCurrentUser(null);
    }
  };

  const handleAuthSuccess = (profile: UserProfile) => {
    setCurrentUser(profile);
  };

  // Loading initial authentication state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-14 h-14 rounded-2xl bg-teal-700 text-white flex items-center justify-center shadow-lg shadow-teal-900/10 mb-4 animate-pulse">
          <Building2 className="w-7 h-7" />
        </div>
        <p className="text-slate-700 font-semibold text-sm">Nowshera Family Clinic</p>
        <p className="text-slate-500 text-xs mt-1">Connecting to clinical security database...</p>
      </div>
    );
  }

  // If not signed in, show Real Supabase Auth Screen (Sign In & Sign Up)
  if (!currentUser) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  // Once signed in, render the user's specific role portal:
  // "after login read the user's role from the profiles table (id = auth user id) and show only that role's pages. Sign-out button. No role switching."
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <Header currentUser={currentUser} onSignOut={handleSignOut} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentUser.role === 'patient' && (
          <PatientPortal key={`patient-${currentUser.id}`} currentUser={currentUser} />
        )}

        {currentUser.role === 'doctor' && (
          <DoctorPortal key={`doctor-${currentUser.id}`} currentUser={currentUser} />
        )}

        {currentUser.role === 'admin' && (
          <AdminPortal key={`admin-${currentUser.id}`} currentUser={currentUser} />
        )}
      </main>
    </div>
  );
}
