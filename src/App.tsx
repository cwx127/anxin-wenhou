import { MonitorSmartphone, ShieldCheck, UserRound, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Toast } from './components/Toast';
import { readStorage, ROLE_STORAGE_KEY, writeStorage } from './storage';
import type { AppRole } from './types';
import { FamilyApp } from './views/FamilyApp';
import { SeniorApp } from './views/SeniorApp';

export default function App() {
  const [role, setRole] = useState<AppRole>(() =>
    readStorage(ROLE_STORAGE_KEY) === 'family' ? 'family' : 'senior',
  );
  const [toast, setToast] = useState<{ id: number; message: string; tone: 'success' | 'info' } | null>(null);

  useEffect(() => {
    writeStorage(ROLE_STORAGE_KEY, role);
  }, [role]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = (message: string, tone: 'success' | 'info' = 'success') => {
    setToast({ id: Date.now(), message, tone });
  };

  return (
    <div className="app-root" data-role={role}>
      <header className="product-bar">
        <a className="product-brand" href="#top" aria-label="安心问候首页">
          <span className="brand-mark"><ShieldCheck aria-hidden="true" /></span>
          <span>
            <strong>安心问候</strong>
            <small>60 秒安心回执</small>
          </span>
        </a>

        <div className="product-promise" aria-label="产品边界">
          <span>不监控</span>
          <span>不诊断</span>
          <span>只同步必要信息</span>
        </div>

        <div className="role-switch" aria-label="切换演示视角">
          <button className={role === 'senior' ? 'active' : ''} aria-pressed={role === 'senior'} onClick={() => setRole('senior')}>
            <UserRound aria-hidden="true" /><span>老人端</span>
          </button>
          <button className={role === 'family' ? 'active' : ''} aria-pressed={role === 'family'} onClick={() => setRole('family')}>
            <Users aria-hidden="true" /><span>家属端</span>
          </button>
        </div>
      </header>

      <div className="demo-banner" role="status">
        <MonitorSmartphone aria-hidden="true" />
        <span><strong>公开交互演示</strong> 数据仅在当前浏览器同步，不会发送通知或拨打真实电话。</span>
      </div>

      <div id="top">
        {role === 'senior' ? <SeniorApp notify={notify} /> : <FamilyApp notify={notify} />}
      </div>

      {toast && <Toast key={toast.id} message={toast.message} tone={toast.tone} />}
    </div>
  );
}
