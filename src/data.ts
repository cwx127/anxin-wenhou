import { createCheckInReceipt } from './checkin';
import type { AppData } from './types';

const todayAt = (hours: number, minutes: number) => {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};

export const createDemoData = (): AppData => {
  const scheduledAt = todayAt(8, 30);
  const respondedAt = todayAt(8, 31);
  const receipt = createCheckInReceipt({
    mode: 'voice',
    text: '挺好的，早上的药吃过了。',
  });

  return {
    senior: {
      name: '王秀兰',
      preferredName: '王阿姨',
      city: '杭州',
      lastActiveAt: respondedAt,
    },
    checkIn: {
      id: 'checkin-today-demo',
      state: 'stable',
      scheduledAt,
      respondedAt,
      attempts: 1,
      inputMode: 'voice',
      quickResponse: null,
      receipt,
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
          title: '问候已送达',
          detail: '老人可说一句话，也可使用三个大按钮回应。',
          occurredAt: scheduledAt,
        },
        {
          id: 'timeline-response',
          kind: 'response',
          actor: 'senior',
          title: '收到老人原话',
          detail: '“挺好的，早上的药吃过了。”',
          occurredAt: respondedAt,
        },
        {
          id: 'timeline-analysis',
          kind: 'analysis',
          actor: 'system',
          title: '生成可解释回执',
          detail: '识别到“状态良好”和“已经服药”，未触发需关注规则。',
          occurredAt: respondedAt,
        },
        {
          id: 'timeline-delivery',
          kind: 'delivery',
          actor: 'system',
          title: '家属端已可查看',
          detail: '同步结构化摘要、原话证据和建议动作；不上传原始音频。',
          occurredAt: respondedAt,
        },
      ],
    },
    reminder: {
      id: 'reminder-morning-medication',
      title: '早上的药',
      detail: '按已有医嘱：1 片，早餐后',
      dueTime: '08:00',
      category: 'medication',
      completedAt: respondedAt,
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
      { id: 'contact-daughter', name: '王静', relation: '女儿', phone: '138 0013 7286', priority: 1 },
      { id: 'contact-son', name: '王明', relation: '儿子', phone: '139 2158 4602', priority: 2 },
      { id: 'contact-community', name: '青禾社区值班室', relation: '社区', phone: '0571 8820 1190', priority: 3 },
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
