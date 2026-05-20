// Phase 27-03 (SAV-V10-03): NewGoalSheet — bottom-sheet form body for
// creating a Goal. Wrapped by SavingsMount inside <PosterSheet>; this
// component is router-agnostic and only manages local form state.
//
// Form:
//   - name (text, required, ≤ 80 chars per backend Field)
//   - target (digits-only rubles → cents on save, required > 0)
//   - due (HTML <input type="date">, optional; backend rejects past dates)
//
// СОХРАНИТЬ disabled until isValidGoalDraft passes.

import { useState } from 'react';
import { PosterButton } from '../../componentsV10';
import { isValidGoalDraft } from './computeSavings';
import { parseRublesToKopecksOr0, sanitizeMoneyInput } from '../../utils/parseMoney';
import styles from './SavingsSheets.module.css';

export interface NewGoalSheetProps {
  /** Save handler; payload uses cents (×100 conversion done inside). */
  onSave: (payload: {
    name: string;
    target_cents: number;
    due: string | null;
  }) => void;
  /** ОТМЕНА click. */
  onClose: () => void;
  /** True while POST /goals in flight. */
  submitting: boolean;
}

export function NewGoalSheet(props: NewGoalSheetProps) {
  const [name, setName] = useState('');
  const [targetRubles, setTargetRubles] = useState('');
  const [due, setDue] = useState('');

  // P2-10: single money parser — keeps kopecks.
  const targetCents = parseRublesToKopecksOr0(targetRubles);

  const draft = { name, target_cents: targetCents, due: due || null };
  const valid = isValidGoalDraft(draft);

  const handleSave = () => {
    if (!valid) return;
    props.onSave({
      name: name.trim(),
      target_cents: targetCents,
      due: due || null,
    });
  };

  return (
    <div className={styles.editorRoot}>
      <div className={styles.editorTitle}>НОВАЯ ЦЕЛЬ</div>

      <label className={styles.fieldLabel}>НАЗВАНИЕ</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 80))}
        className={styles.textInput}
        placeholder="напр. iPhone"
        data-testid="goal-name-input"
      />

      <label className={styles.fieldLabel}>СУММА (₽)</label>
      <input
        type="text"
        inputMode="decimal"
        value={targetRubles}
        onChange={(e) => setTargetRubles(sanitizeMoneyInput(e.target.value))}
        className={styles.textInput}
        placeholder="100000"
        data-testid="goal-target-input"
      />

      <label className={styles.fieldLabel}>СРОК (необязательно)</label>
      <input
        type="date"
        value={due}
        onChange={(e) => setDue(e.target.value)}
        className={styles.textInput}
        data-testid="goal-due-input"
      />

      <div className={styles.editorActions}>
        <PosterButton variant="ghost" onClick={props.onClose}>
          ОТМЕНА
        </PosterButton>
        <PosterButton
          variant="primary"
          onClick={handleSave}
          disabled={!valid || props.submitting}
        >
          {props.submitting ? 'СОХРАНЯЕМ…' : 'СОХРАНИТЬ'}
        </PosterButton>
      </div>
    </div>
  );
}
