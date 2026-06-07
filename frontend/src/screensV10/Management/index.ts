// Phase 27-06: Management barrel — Mounts + Views + types.
//
// Consumers (V10MainShell handleTab) import only `MgmtHubMount`. Internal
// hub navigation pushes `SettingsMount` / `AccessMount` directly.

export { MgmtHubMount } from './MgmtHubMount';
export {
  NativeMgmtHubView,
  type MgmtHubViewProps,
  type MgmtRowId,
} from './NativeMgmtHubView';

export { TemplateMount } from './TemplateMount';
export {
  NativeTemplateView,
  type NativeTemplateViewProps,
  type AddTemplateLineDraft,
} from './NativeTemplateView';

export { SettingsMount } from './SettingsMount';
export {
  NativeSettingsView,
  type SettingsViewProps,
} from './NativeSettingsView';

export { AccessMount } from './AccessMount';
export {
  NativeAccessView,
  type AccessUser,
  type AccessAiUsage,
  type AccessTab,
} from './NativeAccessView';
