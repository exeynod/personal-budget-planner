/**
 * Pulse-pill индикатор вызова AI tool (AI-04).
 *
 * Показывается между user message и AI response пока tool выполняется.
 * Исчезает при первом токене ответа.
 */
import styles from './ToolUseIndicator.module.css';

interface Props {
  toolName?: string | null;
}

/** Человекочитаемые названия tools. */
const TOOL_LABELS: Record<string, string> = {
  get_period_balance: 'Смотрю баланс...',
  get_category_summary: 'Анализирую категории...',
  query_transactions: 'Ищу транзакции...',
  get_forecast: 'Считаю прогноз...',
};

export function ToolUseIndicator({ toolName }: Props) {
  const label = toolName
    ? (TOOL_LABELS[toolName] ?? 'Смотрю данные...')
    : 'Смотрю данные...';

  return (
    <div className={styles.pill}>
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.label}>{label}</span>
    </div>
  );
}
