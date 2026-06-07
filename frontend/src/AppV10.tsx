import './stylesV10/responsive.css';
import './stylesV10/native.css';
import './stylesV10/animations.css';
import styles from './AppV10.module.css';
import { NativeShell } from './screensV10/native/NativeShell';
import { AuthGate } from './screensV10/Auth/AuthGate';

export default function AppV10() {
  // Liquid Glass is the single shipping design — the app always boots the
  // native iOS shell (NativeShell). AuthGate + the data stack underneath stay
  // design-agnostic.
  return (
    <div className={styles.shellRoot} data-theme="v10" data-testid="v10-shell">
      <AuthGate>
        <NativeShell />
      </AuthGate>
    </div>
  );
}
