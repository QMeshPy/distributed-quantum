import type { Session } from "better-auth";

export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  organization?: string | null;
  designation?: string | null;
  trialEndsAt?: string | null;
  hasSubscription?: boolean;
}

export interface SettingsSession extends Session {
  user: UserProfile;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface NotificationPreferences {
  jobCompleted: boolean;
  jobFailed: boolean;
  systemAlerts: boolean;
  weeklyDigest: boolean;
}
