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
  size = 30,
}: {
  name: string;
  id?: number;
  size?: number;
}) {
  const v = visualForCategory(name, id);
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
