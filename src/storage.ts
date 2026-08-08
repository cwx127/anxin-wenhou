export const APP_STORAGE_KEY = 'anxin-checkin-mvp-v3';
export const ROLE_STORAGE_KEY = 'anxin-checkin-active-role';

export const readStorage = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const writeStorage = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const clearDemoStorage = () => {
  try {
    window.localStorage.removeItem(APP_STORAGE_KEY);
    window.localStorage.removeItem(ROLE_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private or embedded browsing contexts.
  }
};
