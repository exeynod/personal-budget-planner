import { useEffect, useState } from 'react';
import { useUser } from './hooks/useUser';
import { OnboardingRequiredError } from './api/client';
import { useAiConversation } from './hooks/useAiConversation';
import { useCategories } from './hooks/useCategories';
import { useSettings } from './hooks/useSettings';
import { createActual } from './api/actual';
import type { CategoryKind } from './api/types';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { HomeScreen } from './screens/HomeScreen';
import { CategoriesScreen } from './screens/CategoriesScreen';
import { TemplateScreen } from './screens/TemplateScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SubscriptionsScreen } from './screens/SubscriptionsScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { ManagementScreen, type ManagementView } from './screens/ManagementScreen';
import { AccessScreen } from './screens/AccessScreen';
import { AnalyticsScreen } from './screens/AnalyticsScreen';
import { AiScreen } from './screens/AiScreen';
import { BottomNav, type BottomNavTint, type TabId } from './components/BottomNav';
import { BottomSheet } from './components/BottomSheet';
import { TransactionEditor } from './components/TransactionEditor';
import styles from './App.module.css';

/** Тон таб-бара под фон экрана. Aurora-экраны — light, Mesh/Sunset (AI) — dark.
 *  Analytics уехала в Management hub как sub-screen. */
const TAB_TINT: Record<TabId, BottomNavTint> = {
  home: 'light',
  transactions: 'light',
  ai: 'dark',
  management: 'light',
};

/** Тинт таб-бара для management sub-screens. Analytics — Mesh dark, остальные — Aurora light. */
const MGMT_TINT: Record<ManagementView, BottomNavTint> = {
  subscriptions: 'light',
  template: 'light',
  categories: 'light',
  settings: 'light',
  access: 'light',
  analytics: 'dark',
};

export default function App() {
  const { user, loading, error, refetch } = useUser();
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [managementView, setManagementView] = useState<ManagementView | null>(null);
  const [historyFilter, setHistoryFilter] = useState<number | null>(null);
  // Поднимаем состояние AI-чата на уровень App, чтобы оно переживало
  // переключение нижних табов (AiScreen unmount-ится при смене вкладки).
  const aiConversation = useAiConversation();
  const [pendingOnboarding, setPendingOnboarding] = useState<boolean>(false);

  // App-level Add-Transaction sheet — открывается через central FAB (BottomNav).
  // txMutationKey — bump-count, экраны (HomeScreen / TransactionsScreen / etc.)
  // подписываются на него через useEffect и рефетчат свои данные.
  const [addTxOpen, setAddTxOpen] = useState(false);
  const [txMutationKey, setTxMutationKey] = useState(0);
  const { categories } = useCategories(false);
  const { settings } = useSettings();

  useEffect(() => {
    function onUnhandled(ev: PromiseRejectionEvent) {
      // Phase 14 D-14-01: stale /me + 409 race → force OnboardingScreen.
      if (ev.reason instanceof OnboardingRequiredError) {
        ev.preventDefault();
        setPendingOnboarding(true);
      }
    }
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => window.removeEventListener('unhandledrejection', onUnhandled);
  }, []);

  if (loading && !user) {
    return (
      <div className={styles.appWrapper}>
        <div className={styles.loadingRoot}>Загрузка…</div>
      </div>
    );
  }
  if (error || !user) {
    return (
      <div className={styles.appWrapper}>
        <div className={styles.errorRoot}>
          Не удалось загрузить пользователя.
          <br />
          {error && <code>{error}</code>}
        </div>
      </div>
    );
  }

  const isOnboarded = user.onboarded_at !== null;

  if (!isOnboarded || pendingOnboarding) {
    return (
      <div className={styles.appWrapper}>
        <div className={styles.appRoot}>
          <OnboardingScreen
            user={user}
            onRefreshUser={refetch}
            onComplete={() => {
              setPendingOnboarding(false);
              setActiveTab('home');
              void refetch();
            }}
          />
        </div>
      </div>
    );
  }

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setManagementView(null);
    if (tab !== 'transactions') setHistoryFilter(null);
  };

  const handleAddTxSave = async (data: {
    kind?: CategoryKind;
    category_id: number;
    amount_cents: number;
    description: string | null;
    tx_date?: string;
  }) => {
    if (!data.kind || !data.tx_date) return;
    await createActual({
      kind: data.kind,
      category_id: data.category_id,
      amount_cents: data.amount_cents,
      description: data.description,
      tx_date: data.tx_date,
    });
    setTxMutationKey((k) => k + 1);
    setAddTxOpen(false);
  };

  const maxTxDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();

  const tabbarTint: BottomNavTint = managementView
    ? MGMT_TINT[managementView]
    : TAB_TINT[activeTab];

  // key для force-remount screenContainer ребёнка при смене экрана (триггерит screenFade)
  const screenKey = managementView ?? activeTab;

  return (
    <div className={styles.appWrapper}>
      <div className={styles.appRoot}>
        <div className={styles.screenContainer}>
          <div key={screenKey} className={styles.screenSlot}>
          {/* Management sub-screens (рендерятся поверх всего) */}
          {managementView === 'analytics' && (
            <AnalyticsScreen onBack={() => setManagementView(null)} />
          )}
          {managementView === 'subscriptions' && (
            <SubscriptionsScreen onBack={() => setManagementView(null)} />
          )}
          {managementView === 'template' && (
            <TemplateScreen onBack={() => setManagementView(null)} />
          )}
          {managementView === 'categories' && (
            <CategoriesScreen onBack={() => setManagementView(null)} />
          )}
          {managementView === 'settings' && (
            <SettingsScreen onBack={() => setManagementView(null)} />
          )}
          {managementView === 'access' && (
            <AccessScreen onBack={() => setManagementView(null)} />
          )}

          {/* Main tabs (скрыты когда показывается management sub-screen) */}
          {!managementView && activeTab === 'home' && (
            <HomeScreen
              txMutationKey={txMutationKey}
              onNavigateToSub={(s) => {
                if (s === 'planned') {
                  setActiveTab('transactions');
                } else {
                  setManagementView(s as ManagementView);
                }
              }}
              onNavigateToHistory={(categoryId) => {
                setHistoryFilter(categoryId ?? null);
                setActiveTab('transactions');
              }}
            />
          )}
          {!managementView && activeTab === 'transactions' && (
            <TransactionsScreen
              txMutationKey={txMutationKey}
              categoryFilter={historyFilter}
              onClearFilter={() => setHistoryFilter(null)}
            />
          )}
          {!managementView && activeTab === 'ai' && <AiScreen {...aiConversation} />}
          {!managementView && activeTab === 'management' && (
            <ManagementScreen onNavigate={(screen) => setManagementView(screen)} />
          )}
          </div>
        </div>

        <BottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onFabClick={() => setAddTxOpen(true)}
          tint={tabbarTint}
        />

        <BottomSheet
          open={addTxOpen}
          onClose={() => setAddTxOpen(false)}
          title="Новая транзакция"
        >
          <TransactionEditor
            entity="actual"
            key={addTxOpen ? `app-actual-${txMutationKey}` : 'closed'}
            categories={categories}
            onSave={handleAddTxSave}
            onCancel={() => setAddTxOpen(false)}
            maxTxDate={maxTxDate}
            aiEnabled={settings?.enable_ai_categorization ?? false}
          />
        </BottomSheet>
      </div>
    </div>
  );
}
