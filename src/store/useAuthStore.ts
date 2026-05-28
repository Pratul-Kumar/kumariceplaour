import { create } from 'zustand';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebase/config';

interface AuthState {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  initializeAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  isAdmin: false,

  initializeAuth: () => {
    onAuthStateChanged(auth, (user) => {
      // In a real app, you might check a custom claim or a user document in Firestore to set isAdmin
      // For this PWA, if a user is logged in, we treat them as authenticated.
      set({ 
        user, 
        loading: false,
        isAdmin: !!user // Simplified: any authenticated user is admin/manager
      });
    });
  },
}));
