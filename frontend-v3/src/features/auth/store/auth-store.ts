/**
 * Authentication Store
 *
 * Client-side authentication state management using Zustand.
 * Per ARCHITECTURE.md lines 228-236:
 * - Manages user session state
 * - Handles login/logout operations
 * - Persists user preferences to localStorage (NOT tokens)
 * - Verifies session validity
 *
 * @see {@link https://github.com/pmndrs/zustand}
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { LoginResponse } from '@/types/api';
import type { ClientUser } from '@/types/user';

/**
 * Authentication store state and actions
 */
interface AuthStore {
  /** Current authenticated user (null if not logged in) */
  user: ClientUser | null;

  /** Whether user is authenticated (derived from user state) */
  isAuthenticated: boolean;

  /** Whether a session check is in progress */
  isCheckingSession: boolean;

  /**
   * Login with email and password
   * Calls POST /api/auth/login
   * Updates user state from response
   *
   * @param email - User email
   * @param password - User password
   * @throws {Error} When login fails (invalid credentials, network error, etc.)
   */
  login: (email: string, password: string) => Promise<void>;

  /**
   * Logout current user
   * Calls POST /api/auth/logout
   * Clears user state
   *
   * @throws {Error} When logout API call fails
   */
  logout: () => Promise<void>;

  /**
   * Verify current session validity
   * Calls GET /api/auth/session
   * Updates user state if session is valid
   * Clears user state if session is invalid
   *
   * Use this on app initialization to restore session
   */
  checkSession: () => Promise<void>;

  /**
   * Update user preferences in state
   * Note: This only updates local state
   * Call API separately to persist preferences to backend
   *
   * @param preferences - Partial preferences to update
   */
  updateUserPreferences: (
    preferences: Partial<ClientUser['preferences']>,
  ) => void;

  /**
   * Internal: Set user state
   * Used by login/checkSession to update user
   *
   * @internal
   */
  _setUser: (user: ClientUser | null) => void;
}

/**
 * Authentication store
 *
 * Persists only user preferences to localStorage (NOT the entire user object)
 * Tokens are stored in HttpOnly cookies by the backend
 */
export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isCheckingSession: false,

      login: async (email: string, password: string) => {
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
            credentials: 'include', // Include cookies
          });

          if (!response.ok) {
            const errorData = (await response.json()) as {
              error?: { message?: string };
            };
            const errorMessage = errorData.error?.message;
            throw new Error(
              typeof errorMessage === 'string' && errorMessage.length > 0
                ? errorMessage
                : `Login failed: ${response.status} ${response.statusText}`,
            );
          }

          const data = (await response.json()) as LoginResponse;

          // Convert API response to ClientUser format
          const user: ClientUser = {
            _id: data.user._id,
            email: data.user.email,
            name: data.user.name,
            organisation: data.user.organisation ?? '',
            roleInOrg: data.user.roleInOrg ?? '',
            city: data.user.city ?? '',
            otpExpiry: data.user.otpExpiry
              ? new Date(data.user.otpExpiry)
              : null,
            otpVerified: data.user.otpVerified ?? false,
            tier: data.user.tier as 'free' | 'pro' | 'enterprise',
            freeTrialExpiresAt: new Date(
              data.user.freeTrialExpiresAt ??
                (data.user.tier === 'free'
                  ? Date.now() + 14 * 24 * 60 * 60 * 1000
                  : 0),
            ),
            createdAt: new Date(data.user.createdAt ?? Date.now()),
            preferences: {
              theme: data.user.preferences?.theme ?? 'light',
              defaultClusterId: data.user.preferences?.defaultClusterId,
            },
          };

          set({
            user,
            isAuthenticated: true,
          });
        } catch (error) {
          // Clear any stale user state on login failure
          set({
            user: null,
            isAuthenticated: false,
          });
          throw error;
        }
      },

      logout: async () => {
        try {
          const response = await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include', // Include cookies
          });

          if (!response.ok) {
            console.warn('Logout API call failed, clearing local state anyway');
          }
        } finally {
          // Always clear local state, even if API call fails
          set({
            user: null,
            isAuthenticated: false,
          });
        }
      },

      checkSession: async () => {
        set({ isCheckingSession: true });

        try {
          const response = await fetch('/api/auth/session', {
            method: 'GET',
            credentials: 'include', // Include cookies
          });

          if (!response.ok) {
            // Session invalid or expired
            set({
              user: null,
              isAuthenticated: false,
              isCheckingSession: false,
            });
            return;
          }

          const data = (await response.json()) as {
            user: {
              _id: string;
              email: string;
              name: string;
              organisation?: string;
              roleInOrg?: string;
              city?: string;
              otpExpiry?: string;
              otpVerified?: boolean;
              tier: string;
              freeTrialExpiresAt: string;
              createdAt: string;
              preferences?: {
                theme: 'light' | 'dark';
                defaultClusterId?: string;
              };
            } | null;
          };

          if (!data.user) {
            set({
              user: null,
              isAuthenticated: false,
              isCheckingSession: false,
            });
            return;
          }

          // Convert API response to ClientUser format
          const user: ClientUser = {
            _id: data.user._id,
            email: data.user.email,
            name: data.user.name,
            organisation: data.user.organisation ?? '',
            roleInOrg: data.user.roleInOrg ?? '',
            city: data.user.city ?? '',
            otpExpiry: data.user.otpExpiry
              ? new Date(data.user.otpExpiry)
              : null,
            otpVerified: data.user.otpVerified ?? false,
            tier: data.user.tier as 'free' | 'pro' | 'enterprise',
            freeTrialExpiresAt: new Date(data.user.freeTrialExpiresAt),
            createdAt: new Date(data.user.createdAt),
            preferences: {
              theme: data.user.preferences?.theme ?? 'light',
              defaultClusterId: data.user.preferences?.defaultClusterId,
            },
          };

          set({
            user,
            isAuthenticated: true,
            isCheckingSession: false,
          });
        } catch (error) {
          // Network error or parse error - clear state
          console.error('Session check failed:', error);
          set({
            user: null,
            isAuthenticated: false,
            isCheckingSession: false,
          });
        }
      },

      updateUserPreferences: (preferences) => {
        const currentUser = get().user;
        if (currentUser === null) {
          console.warn('Cannot update preferences: no user logged in');
          return;
        }

        set({
          user: {
            ...currentUser,
            preferences: {
              ...currentUser.preferences,
              ...preferences,
            },
          },
        });
      },

      _setUser: (user) => {
        set({
          user,
          isAuthenticated: user !== null,
        });
      },
    }),
    {
      name: 'auth-storage',

      // Only persist user preferences, NOT the entire user object
      // Tokens are in HttpOnly cookies, no need to persist user data
      partialize: (state) => ({
        // Only persist preferences if user exists
        preferences: state.user?.preferences,
      }),

      // Restore preferences on mount
      onRehydrateStorage: () => (state) => {
        if (state !== undefined) {
          // Trigger session check to restore full user state
          void state.checkSession();
        }
      },
    },
  ),
);
