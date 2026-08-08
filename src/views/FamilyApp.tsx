import {
  AlertTriangle,
  BellRing,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  History,
  PhoneCall,
  RefreshCw,
  Settings,
  ShieldCheck,
  TestTube2,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { Modal } from '../components/Modal';
import { useStore } from '../store';
import type { CheckInState, DemoScenario } from '../types';

type FamilyAppProps = {
  notify: (message: string, tone?: 'success' | 'info') => void;
};

type FamilySection = 'receipt' | 'timeline' | 'settings';

const formatClock = (value: string | null) => value
  ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
  : '--:--';

const formatDayTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));

const stateMeta: Record<CheckInState, {
  label: string;
  headline: string;
  description: string;
  icon: typeof CheckCircle2;
}> = {
  pending: {
    label: '等待回应',
    headline: '今日问候已发出',
    description: '目前只知道问候已送达，尚未收到妈妈的回应。',
    icon: Clock3,
  },
  stable: {
    label: '今日安心',
    headline: '妈妈今天已回应',
    description: '原话中有明确的安心表达，没有触发需关注规则。',
    icon: CheckCircle2,
  },
  attention: {
    label: '需要关注',
    headline: '今天建议给妈妈打个电话',
    description: '回执中有需要人工确认的信息，请结合原话判断。',
    icon: AlertTriangle,
  },
  urgent: {
    label: '立即联系',
    headline: '请立即人工联系妈妈',
    description: '原话触发紧急规则。系统不诊断，也不会自动代拨。',
    icon: CircleAlert,
  },
  'no-response': {
    label: '尚未确认',
    headline: '两次问候仍未收到回应',
    description: '这不代表发生危险，建议先电话确认，再按家庭预案处理。',
    icon: BellRing,
  },
};

const medicationLabel = {
  taken: '原话提到已服药',
  missed: '原话提到尚未服药',
  question: '原话涉及调整用药',
  'not-mentioned': '未提及用药',
};

const actorLabel = {
  system: '系统',
  senior: '老人',
  family: '家属',
};

const demoScenarios: Array<{ id: DemoScenario; label: string; example: string }> = [
  { id: 'pending', label: '等待回应', example: '刚发出今日问候' },
  { id: 'stable', label: '今日安心', example: '挺好的，药吃过了' },
  { id: 'attention', label: '需要关注', example: '有点头晕，药还没吃' },
  { id: 'urgent', label: '立即联系', example: '我摔了，起不来了' },
  { id: 'no-response', label: '尚未确认', example: '两次问候没有回应' },
];

export function FamilyApp({ notify }: FamilyAppProps) {
  const {
    data,
    markFamilyContacted,
    closeCheckIn,
    updateSettings,
    loadDemoScenario,
    resetDemo,
  } = useStore();
  const [section, setSection] = useState<FamilySection>('receipt');
  const [demoOpen, setDemoOpen] = useState(false);
  const { checkIn, settings } = data;
  const receipt = checkIn.receipt;
  const meta = stateMeta[checkIn.state];
  const StateIcon = meta.icon;
  const primaryContact = data.contacts[0];
  const needsAction = checkIn.state === 'attention' || checkIn.state === 'urgent' || checkIn.state === 'no-response';

  const navItems = [
    { id: 'receipt' as const, label: '今日回执', icon: FileText },
    { id: 'timeline' as const, label: '过程记录', icon: History },
    { id: 'settings' as const, label: '问候设置', icon: Settings },
  ];

  const chooseScenario = (scenario: DemoScenario) => {
    loadDemoScenario(scenario);
    setDemoOpen(false);
    setSection('receipt');
    notify(`已切换到“${demoScenarios.find((item) => item.id === scenario)?.label}”场景`, 'info');
  };

  return (
    <div className="family-shell">
      <aside className="family-sidebar">
        <div className="family-person">
          <span className="avatar avatar-large">王</span>
          <div><strong>{data.senior.name}</strong><small>妈妈 · {data.senior.city}</small></div>
        </div>

        <nav aria-label="家属端主导航">
          {navItems.map((item) => (
            <button key={item.id} className={section === item.id ? 'active' : ''} aria-current={section === item.id ? 'page' : undefined} onClick={() => setSection(item.id)}>
              <item.icon aria-hidden="true" />
              <span>{item.label}</span>
              {item.id === 'receipt' && needsAction && checkIn.familyAction === 'pending' && <small className="nav-dot" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-privacy">
          <ShieldCheck aria-hidden="true" />
          <div><strong>最少必要分享</strong><small>原始音频不长期保存</small></div>
        </div>
      </aside>

      <main className="family-main">
        <header className="family-page-header">
          <div>
            <span className="section-kicker">{data.senior.name} · 今日问安</span>
            <h1>{navItems.find((item) => item.id === section)?.label}</h1>
            <p>最近活动 {formatClock(data.senior.lastActiveAt)} · 回执只依据今日回应和系统事件</p>
          </div>
          <div className="family-header-actions">
            <button className="icon-button icon-button-soft" onClick={() => setDemoOpen(true)} aria-label="切换演示场景" title="切换演示场景">
              <TestTube2 aria-hidden="true" />
            </button>
            <a className={`button ${checkIn.state === 'urgent' ? 'button-danger' : 'button-primary'}`} href={`tel:${primaryContact.phone.replace(/\s/g, '')}`}>
              <PhoneCall aria-hidden="true" />给妈妈打电话
            </a>
          </div>
        </header>

        {section === 'receipt' && (
          <>
            <section className={`status-band status-band-${checkIn.state}`} aria-labelledby="receipt-status-title">
              <span className="status-band-icon"><StateIcon aria-hidden="true" /></span>
              <div>
                <span className="status-band-label">{meta.label}</span>
                <h2 id="receipt-status-title">{meta.headline}</h2>
                <p>{meta.description}</p>
              </div>
              <div className="status-band-time">
                <span>{receipt?.status === 'unanswered' ? '尝试次数' : '回应时间'}</span>
                <strong>{receipt?.status === 'unanswered' ? `${checkIn.attempts} 次` : formatClock(checkIn.respondedAt)}</strong>
              </div>
            </section>

            <div className="receipt-layout">
              <section className="receipt-document" aria-labelledby="receipt-document-title">
                <header className="receipt-document-header">
                  <div><span className="section-kicker">安心回执</span><h2 id="receipt-document-title">今天发生了什么</h2></div>
                  <span className={`status-label status-${receipt?.level ?? 'pending'}`}>{meta.label}</span>
                </header>

                {receipt ? (
                  <>
                    <dl className="receipt-facts">
                      <div><dt>回应方式</dt><dd>{checkIn.inputMode === 'voice' ? '一句话' : checkIn.inputMode === 'quick' ? '快捷按钮' : '未回应'}</dd></div>
                      <div><dt>问候次数</dt><dd>{checkIn.attempts} 次</dd></div>
                      <div><dt>事项线索</dt><dd>{medicationLabel[receipt.medicationMention]}</dd></div>
                    </dl>

                    {settings.shareExactQuote && receipt.sourceText ? (
                      <blockquote className="evidence-quote">
                        <span><UserRound aria-hidden="true" />妈妈的原话</span>
                        “{receipt.sourceText}”
                      </blockquote>
                    ) : (
                      <div className="quote-hidden"><EyeOff aria-hidden="true" />{receipt.sourceText ? '原话分享已关闭，只显示结构化摘要' : '本次没有可用的回应原话'}</div>
                    )}

                    <div className="receipt-summary">
                      <h3>回执摘要</h3>
                      <p>{receipt.summary}</p>
                    </div>

                    <div className="evidence-section">
                      <div className="subsection-heading">
                        <div><span className="section-kicker">可追溯依据</span><h3>为什么是这个结果</h3></div>
                        <span>{receipt.evidence.length} 条证据</span>
                      </div>
                      <div className="evidence-list">
                        {receipt.evidence.map((item, index) => (
                          <article key={`${item.quote}-${index}`}>
                            <span className="evidence-index">{index + 1}</span>
                            <div><strong>“{item.quote}”</strong><p>{item.meaning}</p></div>
                            <span className="source-tag">{item.source === 'senior' ? '老人原话' : '系统事实'}</span>
                          </article>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="waiting-receipt">
                    <Clock3 aria-hidden="true" />
                    <h3>等待今天的第一条回应</h3>
                    <p>收到回应后，这里会显示原话、事实依据、关注级别和建议动作。</p>
                  </div>
                )}
              </section>

              <aside className="family-action-panel">
                <div className="action-panel-heading">
                  <span className={`action-icon action-icon-${checkIn.state}`}><StateIcon aria-hidden="true" /></span>
                  <div><span>建议动作</span><h2>{needsAction ? '先人工确认' : '今天无需立即操作'}</h2></div>
                </div>
                <p>{receipt?.suggestedAction ?? '等待老人完成今日回应；不要把“等待中”理解为异常。'}</p>

                {checkIn.followUpAnswer === 'request-callback' && (
                  <div className="callback-request"><PhoneCall aria-hidden="true" /><span><strong>妈妈希望收到回电</strong><small>这是老人主动确认的联系意愿</small></span></div>
                )}

                {needsAction && checkIn.familyAction === 'pending' && (
                  <>
                    <a className={`button button-full ${checkIn.state === 'urgent' ? 'button-danger' : 'button-primary'}`} href={`tel:${primaryContact.phone.replace(/\s/g, '')}`}>
                      <PhoneCall aria-hidden="true" />拨打 {primaryContact.name}
                    </a>
                    <button className="button button-outline button-full" onClick={() => {
                      markFamilyContacted();
                      notify('已记录为家属人工联系');
                    }}><Check aria-hidden="true" />我已经联系过</button>
                  </>
                )}

                {checkIn.familyAction === 'contacted' && (
                  <>
                    <div className="action-complete"><CheckCircle2 aria-hidden="true" /><span><strong>已记录人工联系</strong><small>系统没有自动代拨</small></span></div>
                    <button className="button button-primary button-full" onClick={() => {
                      closeCheckIn();
                      notify('本次关注已完成');
                    }}><Check aria-hidden="true" />完成本次关注</button>
                  </>
                )}

                {checkIn.familyAction === 'closed' && (
                  <div className="action-complete"><CheckCircle2 aria-hidden="true" /><span><strong>本次关注已完成</strong><small>处置过程已写入记录</small></span></div>
                )}

                <button className="timeline-link" onClick={() => setSection('timeline')}>
                  查看完整过程记录 <ChevronRight aria-hidden="true" />
                </button>

                <div className="receipt-boundary">
                  <ShieldCheck aria-hidden="true" />
                  <span>回执不是健康诊断；需关注级别只用于安排人工确认。</span>
                </div>
              </aside>
            </div>
          </>
        )}

        {section === 'timeline' && (
          <section className="timeline-page" aria-labelledby="timeline-title">
            <header className="content-heading">
              <div><span className="section-kicker">可解释过程</span><h2 id="timeline-title">从问候到回执</h2><p>每一步都标明由谁完成，自动动作与人工动作不会混写。</p></div>
              <span className={`status-label status-${receipt?.level ?? 'pending'}`}>{meta.label}</span>
            </header>

            <div className="process-timeline">
              {checkIn.timeline.map((item, index) => (
                <article key={item.id}>
                  <div className="timeline-rail">
                    <span>{index + 1}</span>
                    {index < checkIn.timeline.length - 1 && <i />}
                  </div>
                  <div className="timeline-content">
                    <div className="timeline-meta"><span className={`actor-tag actor-${item.actor}`}>{actorLabel[item.actor]}</span><time>{formatDayTime(item.occurredAt)}</time></div>
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="implementation-boundary">
              <CircleAlert aria-hidden="true" />
              <div><strong>MVP 实现边界</strong><p>本版本在同一浏览器内模拟双端同步；真实短信、Push、跨设备账号和自动调度尚未接入。</p></div>
            </div>
          </section>
        )}

        {section === 'settings' && (
          <section className="settings-page" aria-labelledby="settings-title">
            <header className="content-heading">
              <div><span className="section-kicker">家庭规则</span><h2 id="settings-title">问候与分享设置</h2><p>正常日低打扰，未回应或需关注时再由家人确认。</p></div>
            </header>

            <div className="settings-layout">
              <section className="settings-group">
                <div className="settings-group-heading"><Clock3 aria-hidden="true" /><div><h3>每日问候</h3><p>设置首次问候和一次温和重试。</p></div></div>
                <label className="setting-row">
                  <span><strong>首次问候时间</strong><small>老人可在之后任何时间补答</small></span>
                  <input type="time" value={settings.scheduleTime} onChange={(event) => updateSettings({ scheduleTime: event.target.value })} />
                </label>
                <label className="setting-row">
                  <span><strong>未回应后重试</strong><small>不连续打扰</small></span>
                  <select value={settings.retryMinutes} onChange={(event) => updateSettings({ retryMinutes: Number(event.target.value) })}>
                    <option value={10}>10 分钟后</option>
                    <option value={20}>20 分钟后</option>
                    <option value={30}>30 分钟后</option>
                  </select>
                </label>
                <label className="setting-row">
                  <span><strong>最多问候次数</strong><small>达到次数后只记为“尚未确认”</small></span>
                  <select value={settings.maxAttempts} onChange={(event) => updateSettings({ maxAttempts: Number(event.target.value) })}>
                    <option value={1}>1 次</option>
                    <option value={2}>2 次</option>
                    <option value={3}>3 次</option>
                  </select>
                </label>
              </section>

              <section className="settings-group">
                <div className="settings-group-heading"><ShieldCheck aria-hidden="true" /><div><h3>分享范围</h3><p>家属只看到生成回执所需的信息。</p></div></div>
                <div className="setting-row">
                  <span><strong>分享回应原话</strong><small>帮助家属核对摘要依据</small></span>
                  <button className={`switch-control ${settings.shareExactQuote ? 'on' : ''}`} aria-label="分享回应原话" aria-pressed={settings.shareExactQuote} onClick={() => updateSettings({ shareExactQuote: !settings.shareExactQuote })}>
                    <span />{settings.shareExactQuote ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                  </button>
                </div>
                <div className="setting-row">
                  <span><strong>长期保存原始音频</strong><small>本 MVP 固定关闭</small></span>
                  <button className="switch-control" disabled aria-label="原始音频长期保存已关闭"><span /><EyeOff aria-hidden="true" /></button>
                </div>
              </section>

              <section className="settings-group settings-contacts">
                <div className="settings-group-heading"><PhoneCall aria-hidden="true" /><div><h3>人工联系顺序</h3><p>系统只展示联系方式，不会自动代拨。</p></div></div>
                {data.contacts.map((contact) => (
                  <article key={contact.id}>
                    <span className="contact-order">{contact.priority}</span>
                    <span className="avatar avatar-neutral">{contact.name.slice(0, 1)}</span>
                    <div><strong>{contact.name}</strong><small>{contact.relation} · {contact.phone}</small></div>
                    <a className="icon-button" href={`tel:${contact.phone.replace(/\s/g, '')}`} aria-label={`联系${contact.name}`} title="打电话"><PhoneCall aria-hidden="true" /></a>
                  </article>
                ))}
              </section>
            </div>

            <div className="settings-footer-actions">
              <button className="button button-outline" onClick={() => setDemoOpen(true)}><TestTube2 aria-hidden="true" />切换演示场景</button>
              <button className="text-action" onClick={() => {
                resetDemo();
                notify('已恢复初始演示数据');
              }}><RefreshCw aria-hidden="true" />恢复初始数据</button>
            </div>
          </section>
        )}
      </main>

      <nav className="family-mobile-nav" aria-label="家属端移动导航">
        {navItems.map((item) => (
          <button key={item.id} className={section === item.id ? 'active' : ''} aria-current={section === item.id ? 'page' : undefined} onClick={() => setSection(item.id)}>
            <item.icon aria-hidden="true" /><span>{item.label}</span>
          </button>
        ))}
      </nav>

      <Modal open={demoOpen} title="场景验证" description="切换后可立即检查回执、证据、建议动作和过程记录。" onClose={() => setDemoOpen(false)}>
        <div className="scenario-list">
          {demoScenarios.map((scenario) => (
            <button key={scenario.id} className={checkIn.state === scenario.id ? 'active' : ''} onClick={() => chooseScenario(scenario.id)}>
              <span className={`scenario-dot scenario-dot-${scenario.id}`} />
              <span><strong>{scenario.label}</strong><small>{scenario.example}</small></span>
              {checkIn.state === scenario.id ? <Check aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
