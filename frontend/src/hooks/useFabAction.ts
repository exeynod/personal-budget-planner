import { createContext, useContext, useEffect } from 'react';

export interface FabActionApi {
  /**
   * Зарегистрировать context-aware действие для центрального FAB.
   * Передаём `null` (или просто не вызываем при нерелевантном активном
   * под-табе), чтобы FAB вернулся к дефолту — открытию sheet'а
   * «Новая транзакция».
   */
  setAction: (action: { run: () => void; label: string } | null) => void;
}

export const FabActionContext = createContext<FabActionApi>({ setAction: () => {} });

/**
 * Hook для экранов: регистрирует FAB-действие на время mount'а под условием
 * (`when`). Когда условие false или компонент анмаунтится — действие
 * сбрасывается, и центральный + снова открывает Add-Transaction sheet.
 *
 * Пример:
 *   useFabAction(activeSubTab === 'plan',
 *     () => plannedRef.current?.openCreateSheet(),
 *     'Добавить строку плана');
 */
export function useFabAction(when: boolean, run: () => void, label: string) {
  const { setAction } = useContext(FabActionContext);
  useEffect(() => {
    if (!when) return;
    setAction({ run, label });
    return () => setAction(null);
    // run/label intentionally not in deps — экран обновляется при смене subtab
    // через `when`-флаг; включение run в deps вызовет лишние ре-регистрации
    // при каждом рендере родителя.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [when, setAction]);
}
