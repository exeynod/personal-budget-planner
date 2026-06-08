// Liquid Glass v2 — category icon tile (native iOS look).
//
// Reuses the existing `visualForCategory` mapping (utils/categoryVisuals.ts —
// phosphor icon + colour, already a project dependency, symmetric with the iOS
// SF-Symbol mapping in Design/Tokens.swift). Renders a filled white glyph on a
// rounded coloured square, like an iOS settings-row icon.

import { visualForCategory } from '../../utils/categoryVisuals';

export function CategoryIcon({
  name,
  id,
  icon,
  color,
  size = 30,
}: {
  name: string;
  id?: number;
  /** 0034: explicit icon key; preferred over name-based mapping when set. */
  icon?: string | null;
  /**
   * 0035: explicit colour key; preferred over the name/hash colour when set.
   * Optional — existing call sites that omit it keep their previous look.
   */
  color?: string | null;
  size?: number;
}) {
  const v = visualForCategory(name, id, icon, color);
  const Icon = v.Icon;
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 'var(--lgn-r-tile)',
        background: v.color,
        flex: '0 0 auto',
      }}
    >
      <Icon size={Math.round(size * 0.58)} weight="fill" color="#fff" />
    </span>
  );
}
