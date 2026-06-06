// Phase 27-06: Management barrel — Mounts + Views + types.
//
// Consumers (V10MainShell handleTab) import only `MgmtHubMount`. Internal
// hub navigation pushes `SettingsMount` / `AccessMount` directly.

export { MgmtHubMount } from './MgmtHubMount';
export {
  MgmtHubView,
  type MgmtHubViewProps,
  type MgmtRowId,
} from './MgmtHubView';

export { TemplateMount } from './TemplateMount';
export {
  NativeTemplateView,
  type NativeTemplateViewProps,
  type AddTemplateLineDraft,
} from './NativeTemplateView';

export { SettingsMount } from './SettingsMount';
export { SettingsView, type SettingsViewProps } from './SettingsView';

export { AccessMount } from './AccessMount';
export {
  AccessView,
  type AccessViewProps,
  type AccessUser,
  type AccessAiUsage,
  type AccessTab,
} from './AccessView';
