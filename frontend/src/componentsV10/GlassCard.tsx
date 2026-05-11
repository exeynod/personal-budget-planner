import { type CSSProperties, type ReactNode, forwardRef } from 'react';
import styles from './GlassCard.module.css';

export interface GlassCardProps {
  children: ReactNode;
  /** Material thickness — controls backdrop-filter blur radius. */
  material?: 'ultra-thin' | 'thin' | 'regular' | 'thick';
  /** Show inner top-edge highlight (subtle border light). Default true. */
  innerBorder?: boolean;
  /** Elevation shadow level. */
  elevation?: 'flat' | 'elevated' | 'floating' | 'floating-strong';
  /** Override border radius. Default — LG card radius 14pt. */
  radius?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  testId?: string;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(props, ref) {
  const {
    children,
    material = 'regular',
    innerBorder = true,
    elevation = 'elevated',
    radius,
    className,
    style,
    onClick,
    testId = 'glass-card',
  } = props;

  const composedClassName = [
    styles.root,
    styles[`material-${material}`],
    styles[`elevation-${elevation}`],
    innerBorder ? styles.withBorder : null,
    onClick ? styles.interactive : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const composedStyle: CSSProperties = {
    ...style,
    ...(radius !== undefined ? { borderRadius: `${radius}px` } : {}),
  };

  return (
    <div
      ref={ref}
      className={composedClassName}
      style={composedStyle}
      data-testid={testId}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
});
