import { create } from 'zustand';
import { User, onAuthStateChanged, Unsubscribe } from 'firebase/auth';
import { auth } from '@/firebase/config';

interface AuthState {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  initializeAuth: () => void;
}

// Track the unsubscribe function to prevent duplicate listeners
let _authUnsubscribe: Unsubscribe | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  isAdmin: false,

  initializeAuth: () => {
    // Guard: if already listening, don't attach another listener
    if (_authUnsubscribe) return;

    _authUnsubscribe = onAuthStateChanged(auth, (user) => {
      set({ 
        user, 
        loading: false,
        isAdmin: !!user // Any authenticated user is treated as admin/manager
      });
    });
  },
}));
