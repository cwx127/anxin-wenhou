import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createCheckInReceipt,
  createNoResponseReceipt,
  type CheckInInput,
  type CheckInReceipt,
  type QuickCheckInResponse,
} from './checkin';
import { createDemoData } from './data';
import { APP_STORAGE_KEY, readStorage, writeStorage } from './storage';
import type {
  AppData,
  CheckInSession,
  CheckInSettings,
  CheckInState,
  DemoScenario,
  FollowUpAnswer,
} from './types';

const STORAGE_VERSION = 3;

type AppStore = {
  data: AppData;
  beginCheckIn: () => void;
  submitVoiceCheckIn: (text: string) => CheckInReceipt;
  submitQuickCheckIn: (response: QuickCheckInResponse) => CheckInReceipt;
  answerFollowUp: (answer: FollowUpAnswer) => void;
  confirmReminder: () => void;
  markMessagePlayed: (messageId: string) => void;
  markFamilyContacted: () => void;
  closeCheckIn: () => void;
  updateSettings: (settings: Partial<CheckInSettings>) => void;
  loadDemoScenario: (scenario: DemoScenario) => void;
  resetDemo: () => void;
};

const StoreContext = createContext<AppStore | null>(null);

const uniqueId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const scheduledAtFor = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date.toISOString();
};

const stateForReceipt = (receipt: CheckInReceipt): CheckInState => {
  if (receipt.status === 'unanswered') return 'no-response';
  if (receipt.level === 'urgent') return 'urgent';
  if (receipt.level === 'attention') return 'attention';
  return 'stable';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const isString = (value: unknown): value is string => typeof value === 'string';

const isReceipt = (value: unknown): value is CheckInReceipt => {
  if (!isRecord(value)) return false;
  const validFollowUp = value.followUp === null
    || (isRecord(value.followUp) && isString(value.followUp.question) && isString(value.followUp.reason));
  const validMedication = ['taken', 'missed', 'question', 'not-mentioned'].includes(String(value.medicationMention));
  return (value.status === 'responded' || value.status === 'unanswered')
    && (value.level === 'normal' || value.level === 'attention' || value.level === 'urgent')
    && isString(value.headline)
    && isString(value.summary)
    && isString(value.suggestedAction)
    && validFollowUp
    && validMedication
    && (value.sourceText === null || isString(value.sourceText))
    && typeof value.isFallback === 'boolean'
    && Array.isArray(value.evidence)
    && value.evidence.every((item) =>
      isRecord(item)
      && (item.source === 'senior' || item.source === 'system')
      && isString(item.quote)
      && isString(item.meaning),
    );
};

const isCurrentData = (value: unknown): value is AppData => {
  if (!isRecord(value)) return false;
  const { senior, checkIn, reminder, messages, contacts, settings } = value;
  if (!isRecord(senior) || !isRecord(checkIn) || !isRecord(reminder) || !isRecord(settings)) return false;

  const validState = ['pending', 'stable', 'attention', 'urgent', 'no-response'].includes(String(checkIn.state));
  const validFamilyAction = ['none', 'pending', 'contacted', 'closed'].includes(String(checkIn.familyAction));
  const validTimeline = Array.isArray(checkIn.timeline) && checkIn.timeline.every((item) =>
    isRecord(item)
    && isString(item.id)
    && (item.actor === 'system' || item.actor === 'senior' || item.actor === 'family')
    && isString(item.title)
    && isString(item.detail)
    && isString(item.occurredAt),
  );
  const validReceipt = checkIn.receipt === null || isReceipt(checkIn.receipt);
  const validContacts = Array.isArray(contacts) && contacts.length > 0 && contacts.every((contact) =>
    isRecord(contact)
    && isString(contact.id)
    && isString(contact.name)
    && isString(contact.relation)
    && isString(contact.phone)
    && typeof contact.priority === 'number',
  );
  const validMessages = Array.isArray(messages) && messages.every((message) =>
    isRecord(message)
    && isString(message.id)
    && isString(message.author)
    && isString(message.text)
    && isString(message.sentAt)
    && typeof message.played === 'boolean',
  );

  return isString(senior.name)
    && isString(senior.preferredName)
    && isString(senior.city)
    && isString(senior.lastActiveAt)
    && validState
    && validFamilyAction
    && isString(checkIn.id)
    && isString(checkIn.scheduledAt)
    && (checkIn.respondedAt === null || isString(checkIn.respondedAt))
    && typeof checkIn.attempts === 'number'
    && validTimeline
    && validReceipt
    && isString(reminder.id)
    && isString(reminder.title)
    && isString(reminder.detail)
    && isString(reminder.dueTime)
    && (reminder.completedAt === null || isString(reminder.completedAt))
    && validContacts
    && validMessages
    && isString(settings.scheduleTime)
    && typeof settings.retryMinutes === 'number'
    && typeof settings.maxAttempts === 'number'
    && typeof settings.shareExactQuote === 'boolean'
    && settings.storeRawAudio === false;
};

const loadData = () => {
  try {
    const saved = readStorage(APP_STORAGE_KEY);
    if (!saved) return createDemoData();
    const parsed: unknown = JSON.parse(saved);
    if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION || !isCurrentData(parsed.data)) {
      return createDemoData();
    }
    return parsed.data;
  } catch {
    return createDemoData();
  }
};

const createPendingSession = (scheduleTime: string): CheckInSession => {
  const scheduledAt = scheduledAtFor(scheduleTime);
  return {
    id: uniqueId('checkin'),
    state: 'pending',
    scheduledAt,
    respondedAt: null,
    attempts: 1,
    inputMode: null,
    quickResponse: null,
    receipt: null,
    followUpAnswer: null,
    familyAction: 'none',
    timeline: [
      {
        id: uniqueId('timeline'),
        kind: 'scheduled',
        actor: 'system',
        title: '今日问候已排定',
        detail: `按家庭设置在 ${scheduleTime} 发起一次温和问候。`,
        occurredAt: scheduledAt,
      },
      {
        id: uniqueId('timeline'),
        kind: 'prompt',
        actor: 'system',
        title: '等待老人回应',
        detail: '可说一句话，也可使用“挺好的”“有点不舒服”“想找家人”回应。',
        occurredAt: new Date().toISOString(),
      },
    ],
  };
};

const createReceiptSession = (
  receipt: CheckInReceipt,
  scheduleTime: string,
  inputMode: 'voice' | 'quick' | null,
  quickResponse: QuickCheckInResponse | null,
  attempts = 1,
): CheckInSession => {
  const scheduledAt = scheduledAtFor(scheduleTime);
  const occurredAt = new Date().toISOString();
  const evidenceDetail = receipt.evidence
    .map((item) => `“${item.quote}”：${item.meaning}`)
    .join('；');

  const timeline: CheckInSession['timeline'] = [
    {
      id: uniqueId('timeline'),
      kind: 'scheduled',
      actor: 'system',
      title: '今日问候已排定',
      detail: `按家庭设置在 ${scheduleTime} 发起问候。`,
      occurredAt: scheduledAt,
    },
  ];

  if (receipt.status === 'unanswered') {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      timeline.push({
        id: uniqueId('timeline'),
        kind: 'prompt',
        actor: 'system',
        title: attempt === 1 ? '首次问候未收到回应' : `第 ${attempt} 次问候未收到回应`,
        detail: attempt === attempts ? '达到家庭设置的尝试次数，状态记为“尚未确认”。' : '稍后按设置再温和问候一次。',
        occurredAt,
      });
    }
  } else {
    timeline.push(
      {
        id: uniqueId('timeline'),
        kind: 'prompt',
        actor: 'system',
        title: '问候已送达',
        detail: '老人可说一句话，也可使用三个大按钮回应。',
        occurredAt: scheduledAt,
      },
      {
        id: uniqueId('timeline'),
        kind: 'response',
        actor: 'senior',
        title: '收到老人回应',
        detail: receipt.sourceText ? `“${receipt.sourceText}”` : '老人完成了今日回应。',
        occurredAt,
      },
      {
        id: uniqueId('timeline'),
        kind: 'analysis',
        actor: 'system',
        title: '生成可解释回执',
        detail: evidenceDetail || '未发现可提取的风险事实，仅保留原话。',
        occurredAt,
      },
    );
  }

  timeline.push({
    id: uniqueId('timeline'),
    kind: 'delivery',
    actor: 'system',
    title: receipt.level === 'normal' ? '家属端已可查看' : '已在家属端标记待处理',
    detail: receipt.status === 'unanswered'
      ? '只同步“尚未确认”事实，不推断老人遇险。'
      : '同步结构化摘要、证据原话和建议动作；不保存原始音频。',
    occurredAt,
  });

  return {
    id: uniqueId('checkin'),
    state: stateForReceipt(receipt),
    scheduledAt,
    respondedAt: receipt.status === 'responded' ? occurredAt : null,
    attempts,
    inputMode,
    quickResponse,
    receipt,
    followUpAnswer: null,
    familyAction: receipt.level === 'normal' ? 'none' : 'pending',
    timeline,
  };
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData);

  useEffect(() => {
    writeStorage(APP_STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, data }));
  }, [data]);

  const submitInput = (input: CheckInInput) => {
    const receipt = createCheckInReceipt(input);
    setData((current) => ({
      ...current,
      senior: { ...current.senior, lastActiveAt: new Date().toISOString() },
      checkIn: createReceiptSession(
        receipt,
        current.settings.scheduleTime,
        input.mode,
        input.mode === 'quick' ? input.response : null,
      ),
      reminder: receipt.medicationMention === 'taken'
        ? { ...current.reminder, completedAt: new Date().toISOString() }
        : current.reminder,
    }));
    return receipt;
  };

  const value = useMemo<AppStore>(() => ({
    data,
    beginCheckIn: () => {
      setData((current) => ({
        ...current,
        checkIn: createPendingSession(current.settings.scheduleTime),
      }));
    },
    submitVoiceCheckIn: (text) => submitInput({ mode: 'voice', text }),
    submitQuickCheckIn: (response) => submitInput({ mode: 'quick', response }),
    answerFollowUp: (answer) => {
      setData((current) => ({
        ...current,
        checkIn: {
          ...current.checkIn,
          followUpAnswer: answer,
          familyAction: answer === 'request-callback' ? 'pending' : current.checkIn.familyAction,
          timeline: [
            ...current.checkIn.timeline,
            {
              id: uniqueId('timeline'),
              kind: 'follow-up',
              actor: 'senior',
              title: answer === 'request-callback' ? '老人希望家人回拨' : '老人暂不需要回拨',
              detail: answer === 'request-callback'
                ? '该选择已作为明确意愿显示在家属端。'
                : '仍保留本次关注回执，供家属查看原话后判断。',
              occurredAt: new Date().toISOString(),
            },
          ],
        },
      }));
    },
    confirmReminder: () => {
      setData((current) => ({
        ...current,
        senior: { ...current.senior, lastActiveAt: new Date().toISOString() },
        reminder: { ...current.reminder, completedAt: new Date().toISOString() },
      }));
    },
    markMessagePlayed: (messageId) => {
      setData((current) => ({
        ...current,
        messages: current.messages.map((message) =>
          message.id === messageId ? { ...message, played: true } : message,
        ),
      }));
    },
    markFamilyContacted: () => {
      setData((current) => ({
        ...current,
        checkIn: {
          ...current.checkIn,
          familyAction: 'contacted',
          timeline: [
            ...current.checkIn.timeline,
            {
              id: uniqueId('timeline'),
              kind: 'family-action',
              actor: 'family',
              title: '家属已记录联系',
              detail: '王静手动确认已通过电话联系老人；系统未自动代拨。',
              occurredAt: new Date().toISOString(),
            },
          ],
        },
      }));
    },
    closeCheckIn: () => {
      setData((current) => ({
        ...current,
        checkIn: {
          ...current.checkIn,
          familyAction: 'closed',
          timeline: [
            ...current.checkIn.timeline,
            {
              id: uniqueId('timeline'),
              kind: 'family-action',
              actor: 'family',
              title: '本次关注已完成',
              detail: '家属完成线下确认后手动关闭本次事项。',
              occurredAt: new Date().toISOString(),
            },
          ],
        },
      }));
    },
    updateSettings: (settings) => {
      setData((current) => ({
        ...current,
        settings: { ...current.settings, ...settings, storeRawAudio: false },
      }));
    },
    loadDemoScenario: (scenario) => {
      setData((current) => {
        if (scenario === 'pending') {
          return { ...current, checkIn: createPendingSession(current.settings.scheduleTime) };
        }

        const inputByScenario: Partial<Record<DemoScenario, CheckInInput>> = {
          stable: { mode: 'voice', text: '挺好的，早上的药吃过了。' },
          attention: { mode: 'voice', text: '有点头晕，药还没吃。' },
          urgent: { mode: 'voice', text: '我摔了，起不来了。' },
        };
        const input = inputByScenario[scenario];
        const attempts = current.settings.maxAttempts;
        const receipt = scenario === 'no-response'
          ? createNoResponseReceipt(attempts)
          : createCheckInReceipt(input!);

        return {
          ...current,
          senior: { ...current.senior, lastActiveAt: new Date().toISOString() },
          checkIn: createReceiptSession(
            receipt,
            current.settings.scheduleTime,
            input?.mode ?? null,
            input?.mode === 'quick' ? input.response : null,
            scenario === 'no-response' ? attempts : 1,
          ),
          reminder: {
            ...current.reminder,
            completedAt: scenario === 'stable' ? new Date().toISOString() : null,
          },
        };
      });
    },
    resetDemo: () => setData(createDemoData()),
  // submitInput deliberately reads only the latest state through setData.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used inside StoreProvider');
  return context;
};
