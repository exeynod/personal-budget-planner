// Phase 33 CMP-33-04: ПДн consent checkbox for onboarding step 1 +
// Settings → Privacy. Calls grantConsent() on tick. Idempotent on
// already-granted state.

import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { grantConsent } from '../api/me';
import styles from './PdnConsentCheckbox.module.css';

export interface PdnConsentCheckboxProps {
  /** Invoked after a successful grant. Parent should advance the UI. */
  onGranted?: (timestamp: string) => void;
  /** Initial state (e.g. user already consented). */
  initialChecked?: boolean;
  /** Disable interaction (read-only). */
  disabled?: boolean;
}

export function PdnConsentCheckbox({
  onGranted,
  initialChecked = false,
  disabled = false,
}: PdnConsentCheckboxProps) {
  const [checked, setChecked] = useState(initialChecked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked;
    setChecked(next);
    if (next && !disabled) {
      setBusy(true);
      setError(null);
      try {
        const resp = await grantConsent();
        if (resp.pdn_consent_at && onGranted) {
          onGranted(resp.pdn_consent_at);
        }
      } catch {
        setError('Не удалось сохранить согласие. Попробуйте ещё раз.');
        setChecked(false);
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <div className={styles.wrapper}>
      <label className={styles.label}>
        <input
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={busy || disabled}
          className={styles.checkbox}
        />
        <span className={styles.text}>
          Я согласен на обработку персональных данных в соответствии с
          {' '}
          <a
            href="/legal/privacy?lang=ru"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Политикой конфиденциальности
          </a>
          {' '}
          и
          {' '}
          <a
            href="/legal/terms?lang=ru"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Условиями использования
          </a>
          .
        </span>
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
