import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MessageCircle,
  Mic,
  PhoneCall,
  Pill,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
  Volume2,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import type { CheckInLevel, QuickCheckInResponse } from '../checkin';
import { useStore } from '../store';

type SeniorAppProps = {
  notify: (message: string, tone?: 'success' | 'info') => void;
};

type SpeechRecognitionResultLike = {
  results: { [index: number]: { [index: number]: { transcript: string } } };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const formatClock = (value: string | Date) =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(value);

const levelLabel: Record<CheckInLevel, string> = {
  normal: '今日安心',
  attention: '需要关注',
  urgent: '立即联系',
};

const quickActions: Array<{
  response: QuickCheckInResponse;
  label: string;
  detail: string;
  icon: typeof CheckCircle2;
  tone: string;
}> = [
  { response: 'well', label: '挺好的', detail: '今天一切还好', icon: CheckCircle2, tone: 'well' },
  { response: 'unwell', label: '有点不舒服', detail: '想让家人知道', icon: AlertTriangle, tone: 'unwell' },
  { response: 'contact-family', label: '想找家人', detail: '希望家人回电话', icon: PhoneCall, tone: 'family' },
];

export function SeniorApp({ notify }: SeniorAppProps) {
  const {
    data,
    beginCheckIn,
    submitVoiceCheckIn,
    submitQuickCheckIn,
    answerFollowUp,
    confirmReminder,
    markMessagePlayed,
  } = useStore();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const now = new Date();
  const { checkIn, reminder } = data;
  const receipt = checkIn.receipt;
  const primaryContact = data.contacts[0];
  const latestMessage = data.messages[0];
  const needsAnswer = checkIn.state === 'pending' || checkIn.state === 'no-response';

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const speakMessage = () => {
    if (!latestMessage) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(latestMessage.text);
      utterance.lang = 'zh-CN';
      utterance.rate = 0.86;
      window.speechSynthesis.speak(utterance);
    }
    markMessagePlayed(latestMessage.id);
    notify('正在朗读家人留言', 'info');
  };

  const startListening = () => {
    const speechWindow = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      notify('当前浏览器未提供语音识别，可直接输入后提交', 'info');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      setTranscript(event.results[0]?.[0]?.transcript ?? '');
    };
    recognition.onerror = () => {
      setListening(false);
      notify('这次没有听清，可以再说一次或直接输入', 'info');
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const submitVoice = (event: FormEvent) => {
    event.preventDefault();
    const value = transcript.trim();
    if (!value) {
      notify('请先说一句或输入今天的情况', 'info');
      return;
    }
    const nextReceipt = submitVoiceCheckIn(value);
    setVoiceOpen(false);
    setTranscript('');
    notify(nextReceipt.level === 'normal' ? '今日问候已完成' : '已把需要关注的内容整理给家人');
  };

  const submitQuick = (response: QuickCheckInResponse) => {
    const nextReceipt = submitQuickCheckIn(response);
    notify(nextReceipt.level === 'normal' ? '今日问候已完成' : '已记录并整理给家人');
  };

  const reopenCheckIn = () => {
    beginCheckIn();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="senior-main">
      <header className="senior-welcome">
        <div>
          <p className="senior-date">{formatDate(now)} · {formatClock(now)}</p>
          <h1>{now.getHours() < 12 ? '早上好' : now.getHours() < 18 ? '下午好' : '晚上好'}，{data.senior.preferredName}</h1>
          <p>今天只做一件事：让家人知道您是否需要一个电话。</p>
        </div>
        <div className="connection-state">
          <ShieldCheck aria-hidden="true" />
          <span><strong>家庭已连接</strong><small>只分享今天的必要信息</small></span>
        </div>
      </header>

      <div className="senior-layout">
        <section className={`checkin-stage checkin-stage-${checkIn.state}`} aria-labelledby="daily-checkin-title">
          {needsAnswer ? (
            <>
              {checkIn.state === 'no-response' && (
                <div className="senior-notice">
                  <Clock3 aria-hidden="true" />
                  <span>刚才没有收到回应，现在回答也来得及。</span>
                </div>
              )}
              <div className="checkin-prompt-copy">
                <span className="section-kicker">今日问安</span>
                <h2 id="daily-checkin-title">您今天感觉怎么样？</h2>
                <p>说一句就好，也可以直接点下面的按钮。</p>
              </div>

              <button className="voice-primary" onClick={() => setVoiceOpen(true)}>
                <span className="voice-primary-icon"><Mic aria-hidden="true" /></span>
                <span><strong>按一下，说句话</strong><small>例如：“挺好的，药吃过了”</small></span>
              </button>

              <div className="quick-answer-grid" aria-label="快速回答">
                {quickActions.map((item) => (
                  <button
                    className={`quick-answer quick-answer-${item.tone}`}
                    key={item.response}
                    onClick={() => submitQuick(item.response)}
                  >
                    <item.icon aria-hidden="true" />
                    <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                    <ChevronRight aria-hidden="true" />
                  </button>
                ))}
              </div>
            </>
          ) : receipt ? (
            <>
              <div className="receipt-done-heading">
                <span className={`receipt-state-icon receipt-state-${receipt.level}`}>
                  {receipt.level === 'normal' ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
                </span>
                <div>
                  <span className={`status-label status-${receipt.level}`}>{levelLabel[receipt.level]}</span>
                  <h2 id="daily-checkin-title">{receipt.headline}</h2>
                  <p>{receipt.summary}</p>
                </div>
              </div>

              {receipt.sourceText && (
                <blockquote className="senior-quote">
                  <span>您刚才说</span>
                  “{receipt.sourceText}”
                </blockquote>
              )}

              {receipt.followUp && !checkIn.followUpAnswer && (
                <div className="senior-follow-up">
                  <span className="follow-up-avatar"><MessageCircle aria-hidden="true" /></span>
                  <div>
                    <strong>{receipt.followUp.question}</strong>
                    <p>{receipt.followUp.reason}</p>
                    <div className="follow-up-actions">
                      <button className="button button-primary" onClick={() => {
                        answerFollowUp('request-callback');
                        notify('已告诉家人，请尽快给您回电话');
                      }}><PhoneCall aria-hidden="true" />请家人给我打电话</button>
                      <button className="button button-outline" onClick={() => answerFollowUp('no-callback')}>现在不用</button>
                    </div>
                  </div>
                </div>
              )}

              {checkIn.followUpAnswer && (
                <div className="follow-up-confirmed">
                  <Check aria-hidden="true" />
                  {checkIn.followUpAnswer === 'request-callback' ? '已把“希望回拨”显示给家人' : '已记录，家人仍可看到今天的原话'}
                </div>
              )}

              {receipt.level === 'urgent' && (
                <div className="urgent-contact-row">
                  <div><strong>请先保持在安全位置</strong><span>系统不会自动代拨，请直接联系家人或当地急救。</span></div>
                  <a className="button button-danger button-large" href={`tel:${primaryContact.phone.replace(/\s/g, '')}`}>
                    <PhoneCall aria-hidden="true" />联系{primaryContact.name}
                  </a>
                </div>
              )}

              <button className="text-action" onClick={reopenCheckIn}>
                <RefreshCw aria-hidden="true" />重新回答今天的问候
              </button>
            </>
          ) : null}
        </section>

        <aside className="senior-side">
          <section className="today-reminder" aria-labelledby="today-reminder-title">
            <div className="side-section-heading">
              <span className="side-icon side-icon-medicine"><Pill aria-hidden="true" /></span>
              <div><span>今日事项</span><h2 id="today-reminder-title">{reminder.title}</h2></div>
              <time>{reminder.dueTime}</time>
            </div>
            <p>{reminder.detail}</p>
            {reminder.completedAt ? (
              <div className="completed-line"><CheckCircle2 aria-hidden="true" />{formatClock(reminder.completedAt)} 已完成</div>
            ) : (
              <button className="button button-success button-full" onClick={() => {
                confirmReminder();
                notify('已记录完成，不会改变原有用药方案');
              }}><Check aria-hidden="true" />我已完成</button>
            )}
          </section>

          {latestMessage && (
            <section className="family-note" aria-labelledby="family-note-title">
              <div className="side-section-heading">
                <span className="avatar">静</span>
                <div><span>家人留言</span><h2 id="family-note-title">{latestMessage.author}</h2></div>
                {!latestMessage.played && <span className="new-indicator">新</span>}
              </div>
              <blockquote>“{latestMessage.text}”</blockquote>
              <button className="button button-soft button-full" onClick={speakMessage}>
                {latestMessage.played ? <Volume2 aria-hidden="true" /> : <Play aria-hidden="true" />}
                {latestMessage.played ? '再听一遍' : '听留言'}
              </button>
            </section>
          )}

          <section className="contact-family-line">
            <div>
              <span className="avatar avatar-neutral">{primaryContact.name.slice(0, 1)}</span>
              <span><strong>{primaryContact.name}</strong><small>{primaryContact.relation} · 第一联系人</small></span>
            </div>
            <a className="icon-button icon-button-phone" href={`tel:${primaryContact.phone.replace(/\s/g, '')}`} aria-label={`联系${primaryContact.name}`} title="打电话">
              <PhoneCall aria-hidden="true" />
            </a>
          </section>
        </aside>
      </div>

      <footer className="senior-boundary">
        <ShieldCheck aria-hidden="true" />
        <span>这里只帮助传话和提醒，不做诊断，也不会自动呼叫急救。</span>
      </footer>

      <Modal
        open={voiceOpen}
        title="说一句今天的情况"
        description="只保留转成文字后的必要信息，原始音频不长期保存。"
        onClose={() => {
          stopListening();
          setVoiceOpen(false);
        }}
      >
        <form className="voice-form" onSubmit={submitVoice}>
          <button
            className={`voice-record-button ${listening ? 'listening' : ''}`}
            type="button"
            onClick={listening ? stopListening : startListening}
          >
            {listening ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
            <span>{listening ? '正在听，点一下停止' : '点一下开始说话'}</span>
          </button>
          <label className="field-label">
            <span>识别到的话</span>
            <textarea
              rows={4}
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder="例如：挺好的，早上的药吃过了。"
              maxLength={120}
            />
          </label>
          <div className="modal-actions-row">
            <button className="button button-outline" type="button" onClick={() => setVoiceOpen(false)}>取消</button>
            <button className="button button-primary" type="submit"><Check aria-hidden="true" />生成今日回执</button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
