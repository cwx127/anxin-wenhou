import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createCheckInReceipt,
  createNoResponseReceipt,
  type CheckInInput,
  type CheckInReceipt,
  type QuickCheckInResponse,
} from './checkin';
import { createDemoData } from './data';
import type {
  AppData,
  CheckInSession,
  CheckInSettings,
  CheckInState,
  DemoScenario,
  FollowUpAnswer,
} from './types';

const STORAGE_KEY = 'anxin-checkin-mvp-v2';

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

const isCurrentData = (value: unknown): value is AppData => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppData>;
  return Boolean(candidate.checkIn?.timeline && candidate.settings?.scheduleTime && candidate.reminder);
};

const loadData = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return createDemoData();
    const parsed: unknown = JSON.parse(saved);
    return isCurrentData(parsed) ? parsed : createDemoData();
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
