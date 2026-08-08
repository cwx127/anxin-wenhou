import type { AppData } from './types';

const todayAt = (hours: number, minutes: number) => {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};

export const createDemoData = (): AppData => {
  const scheduledAt = todayAt(8, 30);

  return {
    senior: {
      name: '王秀兰',
      preferredName: '王阿姨',
      city: '杭州',
      lastActiveAt: scheduledAt,
    },
    checkIn: {
      id: 'checkin-today-demo',
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
          id: 'timeline-scheduled',
          kind: 'scheduled',
          actor: 'system',
          title: '今日问候已排定',
          detail: '按家庭设置在 08:30 发起一次温和问候。',
          occurredAt: scheduledAt,
        },
        {
          id: 'timeline-prompt',
          kind: 'prompt',
          actor: 'system',
          title: '等待老人回应',
          detail: '可说一句话，也可使用“挺好的”“有点不舒服”“想找家人”回应。',
          occurredAt: scheduledAt,
        },
      ],
    },
    reminder: {
      id: 'reminder-morning-medication',
      title: '早上的药',
      detail: '按已有医嘱：1 片，早餐后',
      dueTime: '08:00',
      category: 'medication',
      completedAt: null,
    },
    messages: [
      {
        id: 'message-daughter',
        author: '女儿 王静',
        text: '妈妈，晚上我给您打电话。中午记得好好吃饭。',
        sentAt: todayAt(9, 10),
        played: false,
      },
    ],
    contacts: [
      { id: 'contact-daughter', name: '王静', relation: '女儿', phone: '演示号码', priority: 1 },
      { id: 'contact-son', name: '王明', relation: '儿子', phone: '演示号码', priority: 2 },
      { id: 'contact-community', name: '青禾社区值班室', relation: '社区', phone: '演示号码', priority: 3 },
    ],
    settings: {
      scheduleTime: '08:30',
      retryMinutes: 10,
      maxAttempts: 2,
      shareExactQuote: true,
      storeRawAudio: false,
    },
  };
};
