import type { CheckInReceipt, QuickCheckInResponse } from './checkin';

export type AppRole = 'senior' | 'family';

export type CheckInState = 'pending' | 'stable' | 'attention' | 'urgent' | 'no-response';

export type CheckInTimelineKind =
  | 'scheduled'
  | 'prompt'
  | 'response'
  | 'analysis'
  | 'delivery'
  | 'follow-up'
  | 'family-action';

export type CheckInTimelineItem = {
  id: string;
  kind: CheckInTimelineKind;
  actor: 'system' | 'senior' | 'family';
  title: string;
  detail: string;
  occurredAt: string;
};

export type FollowUpAnswer = 'request-callback' | 'no-callback';

export type FamilyActionState = 'none' | 'pending' | 'contacted' | 'closed';

export type CheckInSession = {
  id: string;
  state: CheckInState;
  scheduledAt: string;
  respondedAt: string | null;
  attempts: number;
  inputMode: 'voice' | 'quick' | null;
  quickResponse: QuickCheckInResponse | null;
  receipt: CheckInReceipt | null;
  followUpAnswer: FollowUpAnswer | null;
  familyAction: FamilyActionState;
  timeline: CheckInTimelineItem[];
};

export type DailyReminder = {
  id: string;
  title: string;
  detail: string;
  dueTime: string;
  category: 'medication' | 'meal' | 'activity';
  completedAt: string | null;
};

export type FamilyMessage = {
  id: string;
  author: string;
  text: string;
  sentAt: string;
  played: boolean;
};

export type EmergencyContact = {
  id: string;
  name: string;
  relation: string;
  phone: string;
  priority: number;
};

export type SeniorProfile = {
  name: string;
  preferredName: string;
  city: string;
  lastActiveAt: string;
};

export type CheckInSettings = {
  scheduleTime: string;
  retryMinutes: number;
  maxAttempts: number;
  shareExactQuote: boolean;
  storeRawAudio: false;
};

export type DemoScenario = 'pending' | 'stable' | 'attention' | 'urgent' | 'no-response';

export type AppData = {
  senior: SeniorProfile;
  checkIn: CheckInSession;
  reminder: DailyReminder;
  messages: FamilyMessage[];
  contacts: EmergencyContact[];
  settings: CheckInSettings;
};
