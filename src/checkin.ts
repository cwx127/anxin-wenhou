export type CheckInLevel = 'normal' | 'attention' | 'urgent';

export type QuickCheckInResponse = 'well' | 'unwell' | 'contact-family';

export type CheckInInput =
  | { mode: 'voice'; text: string }
  | { mode: 'quick'; response: QuickCheckInResponse };

export type CheckInEvidenceCategory =
  | 'wellbeing'
  | 'symptom'
  | 'medication'
  | 'help-request'
  | 'statement'
  | 'system';

export type CheckInEvidence = {
  category: CheckInEvidenceCategory;
  source: 'senior' | 'system';
  quote: string;
  meaning: string;
};

export type MedicationMention = 'taken' | 'missed' | 'question' | 'not-mentioned';

export type CheckInFollowUp = {
  question: string;
  reason: string;
};

export type CheckInReceipt = {
  status: 'responded' | 'unanswered';
  level: CheckInLevel;
  headline: string;
  summary: string;
  evidence: CheckInEvidence[];
  suggestedAction: string;
  followUp: CheckInFollowUp | null;
  medicationMention: MedicationMention;
  sourceText: string | null;
  isFallback: boolean;
};

type TextRule = {
  pattern: RegExp;
  category: CheckInEvidenceCategory;
  meaning: string;
};

type MatchedRule = TextRule & { quote: string };

const QUICK_RESPONSE_TEXT: Record<QuickCheckInResponse, string> = {
  well: '我今天挺好的',
  unwell: '我今天有点不舒服',
  'contact-family': '我想联系家人',
};

const EMERGENCY_RULES: TextRule[] = [
  {
    pattern: /救命|快来人|帮帮我/,
    category: 'help-request',
    meaning: '老人发出了明确的紧急求助',
  },
  {
    pattern: /摔倒(?:了)?|跌倒(?:了)?|摔了/,
    category: 'symptom',
    meaning: '原话提到疑似跌倒',
  },
  {
    pattern: /起不来(?:了)?|站不起来(?:了)?|不能动(?:了)?/,
    category: 'symptom',
    meaning: '原话提到无法起身或移动',
  },
  {
    pattern: /胸口疼|胸口痛|胸痛/,
    category: 'symptom',
    meaning: '原话提到胸部疼痛',
  },
  {
    pattern: /呼吸困难|喘不上气|不能呼吸|透不过气/,
    category: 'symptom',
    meaning: '原话提到呼吸困难',
  },
  {
    pattern: /昏倒(?:了)?|晕倒(?:了)?|意识不清/,
    category: 'symptom',
    meaning: '原话提到失去意识或意识异常',
  },
];

const MEDICATION_QUESTION_RULES: TextRule[] = [
  {
    pattern: /多吃(?:一片|一点|点)?|少吃(?:一片|一点|点)?|加药|减药|停药|换药|调药|改药/,
    category: 'medication',
    meaning: '原话涉及自行调整用药',
  },
  {
    pattern: /(?:调整|改变|更改).{0,4}(?:剂量|药量)|(?:剂量|药量).{0,6}(?:怎么调|怎么改|能改吗|可以改吗)/,
    category: 'medication',
    meaning: '原话询问了药物剂量调整',
  },
];

const MEDICATION_MISSED_RULES: TextRule[] = [
  {
    pattern: /药(?:还|也|都)?没(?:有)?吃|还没(?:有)?吃药|没(?:有)?服药|忘(?:了)?吃药|漏(?:服|吃)(?:药)?/,
    category: 'medication',
    meaning: '老人表示用药尚未完成',
  },
];

const MEDICATION_TAKEN_RULES: TextRule[] = [
  {
    pattern: /药(?:已经|都|刚)?吃(?:过|了)|吃过药|已经?服药|已服药|服过药/,
    category: 'medication',
    meaning: '老人表示已经服药',
  },
];

const HEALTH_RULES: TextRule[] = [
  {
    pattern: /头晕|眩晕/,
    category: 'symptom',
    meaning: '原话提到头晕',
  },
  {
    pattern: /不舒服|难受|恶心|想吐|心慌|发烧|发热|乏力|没力气/,
    category: 'symptom',
    meaning: '原话提到身体不适',
  },
  {
    pattern: /疼|痛/,
    category: 'symptom',
    meaning: '原话提到疼痛',
  },
];

const CONTACT_FAMILY_RULES: TextRule[] = [
  {
    pattern: /联系(?:一下)?家人|找(?:一下)?家人|想找家人|想联系家人|叫我(?:女儿|儿子|家里人)|给(?:我)?(?:女儿|儿子|家里人)打电话/,
    category: 'help-request',
    meaning: '老人希望家人主动联系',
  },
];

const WELLBEING_RULES: TextRule[] = [
  {
    pattern: /挺好的|挺好|很好|还好|没事|平安|不错|精神(?:挺)?好|一切正常/,
    category: 'wellbeing',
    meaning: '老人主动表达状态良好',
  },
];

const NEGATION_BEFORE_MATCH =
  /(?:没有|没|未|不是|并非|不曾|无需|不用)[^，。！？；,.!?;]{0,6}$/;

const findNonNegatedMatch = (text: string, pattern: RegExp) => {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matches = text.matchAll(new RegExp(pattern.source, flags));

  for (const match of matches) {
    const index = match.index ?? 0;
    const prefix = text.slice(Math.max(0, index - 6), index);
    if (!NEGATION_BEFORE_MATCH.test(prefix)) return match[0];
  }

  return null;
};

const matchRule = (text: string, rule: TextRule, respectNegation = false): MatchedRule | null => {
  const quote = respectNegation
    ? findNonNegatedMatch(text, rule.pattern)
    : text.match(rule.pattern)?.[0] ?? null;
  return quote ? { ...rule, quote } : null;
};

const matchRules = (text: string, rules: TextRule[], respectNegation = false) =>
  rules
    .map((rule) => matchRule(text, rule, respectNegation))
    .filter((match): match is MatchedRule => match !== null);

const toEvidence = (matches: MatchedRule[]): CheckInEvidence[] => {
  const seen = new Set<string>();
  return matches.flatMap((match) => {
    const key = `${match.category}:${match.quote}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      category: match.category,
      source: 'senior' as const,
      quote: match.quote,
      meaning: match.meaning,
    }];
  });
};

const resolveSourceText = (input: CheckInInput) =>
  input.mode === 'voice' ? input.text.trim() : QUICK_RESPONSE_TEXT[input.response];

const resolveMedicationMention = (
  questionMatches: MatchedRule[],
  missedMatches: MatchedRule[],
  takenMatches: MatchedRule[],
): MedicationMention => {
  if (questionMatches.length > 0) return 'question';
  if (missedMatches.length > 0) return 'missed';
  if (takenMatches.length > 0) return 'taken';
  return 'not-mentioned';
};

const createEmptyTranscriptReceipt = (): CheckInReceipt => ({
  status: 'responded',
  level: 'attention',
  headline: '需要再次确认',
  summary: '收到了一次问候操作，但没有可用的语音文字，暂时无法确认老人状态。',
  evidence: [{
    category: 'system',
    source: 'system',
    quote: '本次语音未识别出文字',
    meaning: '这是识别失败，不代表老人没有回应或发生危险',
  }],
  suggestedAction: '请让老人改用三个大按钮，或只再进行一次简短追问。',
  followUp: {
    question: '我没有听清，您现在是“挺好的”“有点不舒服”，还是“想找家人”？',
    reason: '用一个封闭式问题完成状态确认',
  },
  medicationMention: 'not-mentioned',
  sourceText: null,
  isFallback: true,
});

export const createCheckInReceipt = (input: CheckInInput): CheckInReceipt => {
  const sourceText = resolveSourceText(input);
  if (!sourceText) return createEmptyTranscriptReceipt();

  const emergencyMatches = matchRules(sourceText, EMERGENCY_RULES, true);
  const medicationQuestionMatches = matchRules(sourceText, MEDICATION_QUESTION_RULES);
  const medicationMissedMatches = matchRules(sourceText, MEDICATION_MISSED_RULES);
  const medicationTakenMatches = matchRules(sourceText, MEDICATION_TAKEN_RULES);
  const healthMatches = matchRules(sourceText, HEALTH_RULES, true);
  const contactMatches = matchRules(sourceText, CONTACT_FAMILY_RULES);
  const wellbeingMatches = matchRules(sourceText, WELLBEING_RULES);
  const medicationMention = resolveMedicationMention(
    medicationQuestionMatches,
    medicationMissedMatches,
    medicationTakenMatches,
  );

  if (emergencyMatches.length > 0) {
    return {
      status: 'responded',
      level: 'urgent',
      headline: '需要立即联系',
      summary: '老人原话触发了紧急规则，需要家属立即人工确认；系统不据此作医疗诊断。',
      evidence: toEvidence([
        ...emergencyMatches,
        ...medicationQuestionMatches,
        ...medicationMissedMatches,
      ]),
      suggestedAction: '请立即电话联系老人；若确认存在危险或始终无法联系，请按当地急救流程求助。',
      followUp: null,
      medicationMention,
      sourceText,
      isFallback: false,
    };
  }

  const needsAttention =
    medicationQuestionMatches.length > 0 ||
    medicationMissedMatches.length > 0 ||
    healthMatches.length > 0 ||
    contactMatches.length > 0;

  if (needsAttention) {
    const statements: string[] = [];
    if (healthMatches.length > 0) statements.push('提到身体不适');
    if (medicationMissedMatches.length > 0) statements.push('表示用药尚未完成');
    if (medicationQuestionMatches.length > 0) statements.push('询问了用药调整');
    if (contactMatches.length > 0) statements.push('希望家人主动联系');

    let followUp: CheckInFollowUp;
    let suggestedAction: string;
    if (medicationQuestionMatches.length > 0) {
      followUp = {
        question: '我不能帮您调整药量，需要我提醒家人联系医生或药师吗？',
        reason: '拒绝提供调药建议，并转交可信任的人处理',
      };
      suggestedAction = '不要自行加减、停换药；请家属协助联系医生或药师核对。';
    } else if (healthMatches.length > 0) {
      followUp = {
        question: '您现在坐稳了吗，需要我提醒家人给您打电话吗？',
        reason: '只确认当前安全与联系意愿，不作诊断',
      };
      suggestedAction = '建议家属尽快电话确认；若症状持续、加重或出现紧急表现，请寻求专业帮助。';
    } else if (contactMatches.length > 0) {
      followUp = {
        question: '好的，需要我现在提醒家人给您打电话吗？',
        reason: '确认联系意愿',
      };
      suggestedAction = '请首位联系人尽快回拨，并在回执中记录已经联系。';
    } else {
      followUp = {
        question: '需要我提醒家人和您确认今天的用药吗？',
        reason: '确认是否需要家属协助，不提供服药决策',
      };
      suggestedAction = '请家属温和确认未服原因，并以既有医嘱为准。';
    }

    return {
      status: 'responded',
      level: 'attention',
      headline: contactMatches.length > 0 ? '希望家人联系' : '今天需要关注',
      summary: `老人${statements.join('，并')}。`,
      evidence: toEvidence([
        ...healthMatches,
        ...medicationMissedMatches,
        ...medicationQuestionMatches,
        ...contactMatches,
      ]),
      suggestedAction,
      followUp,
      medicationMention,
      sourceText,
      isFallback: false,
    };
  }

  const normalEvidence = toEvidence([...wellbeingMatches, ...medicationTakenMatches]);
  const isFallback = normalEvidence.length === 0;

  if (isFallback) {
    normalEvidence.push({
      category: 'statement',
      source: 'senior',
      quote: sourceText,
      meaning: '保留老人今日原话，不从未识别内容推断健康结论',
    });
  }

  const summary = wellbeingMatches.length > 0 && medicationTakenMatches.length > 0
    ? '老人表示状态良好，并提到已经服药。'
    : wellbeingMatches.length > 0
      ? '老人表示今天状态良好。'
      : medicationTakenMatches.length > 0
        ? '老人已完成今日回应，并提到已经服药。'
        : '已收到今日回应，原话未提及明确不适、求助或用药问题。';

  return {
    status: 'responded',
    level: 'normal',
    headline: wellbeingMatches.length > 0 ? '今日已报平安' : '今日已回应',
    summary,
    evidence: normalEvidence,
    suggestedAction: '无需立即操作，家属可在今日回执中查看老人原话。',
    followUp: null,
    medicationMention,
    sourceText,
    isFallback,
  };
};

export const createNoResponseReceipt = (attempts = 2): CheckInReceipt => {
  const safeAttempts = Number.isFinite(attempts) ? Math.max(1, Math.floor(attempts)) : 2;
  return {
    status: 'unanswered',
    level: 'attention',
    headline: '今日尚未确认',
    summary: `已进行 ${safeAttempts} 次温和问候，仍未收到回应；这只表示“尚未确认”，不能据此判断老人遇险。`,
    evidence: [{
      category: 'system',
      source: 'system',
      quote: `${safeAttempts} 次问候均未收到回应`,
      meaning: '系统只记录无回应事实，不推断老人发生危险',
    }],
    suggestedAction: '请家属先电话联系老人确认；若联系不上，再按家庭预案联系邻居或社区。',
    followUp: null,
    medicationMention: 'not-mentioned',
    sourceText: null,
    isFallback: false,
  };
};
