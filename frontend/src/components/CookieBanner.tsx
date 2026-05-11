// Phase 33 CMP-33-05: minimal cookie banner (info-only).
//
// Renders при первом visit (no `cookie_consent_v1` in localStorage).
// Dismissed via «Понятно» button → sets localStorage flag.
// Full opt-in analytics flow deferred to Phase 38 (PostHog/Plausible).
//
// 152-ФЗ note: this banner covers only ОБЯЗАТЕЛЬНЫЕ (technical) cookies
// — session/auth/CSRF. Per ст. 9 cookie-law об обязательных cookies
// достаточно info-уведомления; opt-in нужен только для analytics/marketing
// (когда они появятся, расширим до полноценного opt-in flow).

import { useEffect, useState } from 'react';
import styles from './CookieBanner.module.css';

const STORAGE_KEY = 'cookie_consent_v1';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const acknowledged = window.localStorage.getItem(STORAGE_KEY);
      if (!acknowledged) {
        setVisible(true);
      }
    } catch {
      // localStorage unavailable (private mode, iframe sandbox) — degrade silently.
    }
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'acknowledged');
    } catch {
      /* noop */
    }
    setVisible(false);
  };

  if (!visible) {
    return null;
  }

  return (
    <div className={styles.banner} role="region" aria-label="Cookie notice">
      <p className={styles.text}>
        Мы используем только обязательные cookies для работы приложения.
        {' '}
        <a
          href="/legal/privacy?lang=ru"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          Подробнее
        </a>
      </p>
      <button type="button" onClick={dismiss} className={styles.button}>
        Понятно
      </button>
    </div>
  );
}
