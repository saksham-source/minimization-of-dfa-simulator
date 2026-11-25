import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  computeDfaFingerprint,
  ENGINE_VERSION,
  minimize,
  validateDraft,
  type DetailLevel,
  type DFADraft,
  type Method,
  type MinimizationResult,
  type ValidationResult,
} from '../engine';
import { PRESET_FIXTURES } from '../fixtures/presets';
import { createInitialDraftState, draftReducer, type DraftAction, type DraftStoreState } from './draftReducer';

export const STORAGE_KEY = 'dfa-studio:v1';

export type PlaybackSpeed = 0.5 | 1 | 1.5 | 2;
export type ThemePreference = 'system' | 'light' | 'dark';
export type MotionPreference = 'system' | 'reduce' | 'no-preference';
export type SimulatorPhase = 'build' | 'simulate' | 'results';

export interface Preferences {
  theme: ThemePreference;
  speed: PlaybackSpeed;
  detailLevel: DetailLevel;
  motion: MotionPreference;
  pauseOnRoundSummaries: boolean;
  disable3D: boolean;
}

export interface PracticeStats {
  attempted: number;
  solvedIndependently: number;
  solvedWithHints: number;
  revealed: number;
  completedIds: string[];
  mistakes: { id: string; promptTitle: string; message: string; lessonId: number }[];
}

interface PersistedDataV1 {
  version: 1;
  engineVersion: number;
  savedAt: number;
  draft: DFADraft;
  method: Method;
  hasSolved: boolean;
  fingerprint: string | null;
  lastEventId: number | null;
  phase: SimulatorPhase;
  preferences: Preferences;
  practice: PracticeStats;
}

const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  speed: 1,
  detailLevel: 'concept',
  motion: 'system',
  pauseOnRoundSummaries: true,
  disable3D: false,
};

const DEFAULT_PRACTICE: PracticeStats = {
  attempted: 0,
  solvedIndependently: 0,
  solvedWithHints: 0,
  revealed: 0,
  completedIds: [],
  mistakes: [],
};

const DEFAULT_STARTER_DRAFT: DFADraft = PRESET_FIXTURES.find((p) => p.id === 'even-ones')!.draft;

function loadPersistedState(): {
  persisted: PersistedDataV1 | null;
  warning: string | null;
  hasSavedDraft: boolean;
} {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { persisted: null, warning: null, hasSavedDraft: false };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedDataV1>;
    if (!parsed || parsed.version !== 1 || !parsed.draft || typeof parsed.draft !== 'object') {
      return {
        persisted: null,
        warning: 'Saved local draft had an unrecognized format and was reset safely.',
        hasSavedDraft: false,
      };
    }
    return {
      persisted: parsed as PersistedDataV1,
      warning: null,
      hasSavedDraft: true,
    };
  } catch {
    return {
      persisted: null,
      warning: 'Browser local storage is unavailable or unreadable; work will stay in memory (use JSON export to save).',
      hasSavedDraft: false,
    };
  }
}

interface AppContextValue {
  draftState: DraftStoreState;
  dispatchDraft: React.Dispatch<DraftAction>;
  validation: ValidationResult;
  method: Method;
  setMethod: (m: Method) => void;
  phase: SimulatorPhase;
  setPhase: (p: SimulatorPhase) => void;
  result: MinimizationResult | null;
  cursor: number;
  setCursor: (idx: number) => void;
  visibleEventIndices: number[];
  preferences: Preferences;
  updatePreferences: (patch: Partial<Preferences>) => void;
  resolvedTheme: 'light' | 'dark';
  reducedMotionActive: boolean;
  practice: PracticeStats;
  recordPracticeAttempt: (outcome: {
    id: string;
    promptTitle: string;
    status: 'independent' | 'hinted' | 'revealed';
    mistakeMessage?: string;
    lessonId?: number;
  }) => void;
  resetPracticeStats: () => void;
  startSolving: (overrideDraft?: DFADraft, overrideMethod?: Method) => boolean;
  invalidateSolution: () => void;
  loadPreset: (draft: DFADraft, autoSolve?: boolean) => void;
  hasSavedDraft: boolean;
  lastSavedAt: number | null;
  storageWarning: string | null;
  versionNotice: string | null;
  dismissNotice: () => void;
  clearLocalData: () => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const initialLoad = useMemo(() => loadPersistedState(), []);
  const p = initialLoad.persisted;

  const [draftState, dispatchDraft] = useReducer(
    draftReducer,
    p?.draft ?? DEFAULT_STARTER_DRAFT,
    createInitialDraftState,
  );

  const [method, setMethodState] = useState<Method>(p?.method ?? 'partition');
  const [preferences, setPreferences] = useState<Preferences>({
    ...DEFAULT_PREFERENCES,
    ...(p?.preferences ?? {}),
  });
  const [practice, setPractice] = useState<PracticeStats>({
    ...DEFAULT_PRACTICE,
    ...(p?.practice ?? {}),
  });

  // Restore solved trace deterministically if persisted
  const initialSession = useMemo(() => {
    if (!p?.hasSolved) {
      return { result: null, cursor: 0, phase: 'build' as SimulatorPhase, notice: null as string | null };
    }
    const val = validateDraft(p.draft);
    if (!val.ok) {
      return {
        result: null,
        cursor: 0,
        phase: 'build' as SimulatorPhase,
        notice: 'Restored incomplete draft in builder mode.',
      };
    }
    try {
      const res = minimize(val.dfa, p.method);
      const fp = computeDfaFingerprint(val.dfa);
      if (p.engineVersion !== ENGINE_VERSION || p.fingerprint !== fp) {
        return {
          result: res,
          cursor: 0,
          phase: p.phase === 'build' ? 'build' : ('simulate' as SimulatorPhase),
          notice: 'Engine version or DFA changed since last save; trace restarted from step 1.',
        };
      }
      let idx = 0;
      if (typeof p.lastEventId === 'number') {
        const found = res.trace.events.findIndex((e) => e.id === p.lastEventId);
        if (found >= 0) idx = found;
      }
      return {
        result: res,
        cursor: idx,
        phase: p.phase,
        notice: null,
      };
    } catch {
      return {
        result: null,
        cursor: 0,
        phase: 'build' as SimulatorPhase,
        notice: 'Could not recompute saved trace; restored draft in builder.',
      };
    }
  }, [p]);

  const [resultState, setResultState] = useState<{
    result: MinimizationResult;
    semanticRevision: number;
  } | null>(() =>
    initialSession.result
      ? { result: initialSession.result, semanticRevision: draftState.semanticRevision }
      : null,
  );
  const result =
    resultState && resultState.semanticRevision === draftState.semanticRevision
      ? resultState.result
      : null;

  const [cursor, setCursor] = useState<number>(initialSession.cursor);
  const [phase, setPhase] = useState<SimulatorPhase>(initialSession.phase);
  const [versionNotice, setVersionNotice] = useState<string | null>(initialSession.notice);
  const [storageWarning, setStorageWarning] = useState<string | null>(initialLoad.warning);
  const [hasSavedDraft, setHasSavedDraft] = useState<boolean>(initialLoad.hasSavedDraft);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(p?.savedAt ?? null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );
  const [systemReducedMotion, setSystemReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
    const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onDark = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    const onMotion = (e: MediaQueryListEvent) => setSystemReducedMotion(e.matches);
    mqDark.addEventListener('change', onDark);
    mqMotion.addEventListener('change', onMotion);
    return () => {
      mqDark.removeEventListener('change', onDark);
      mqMotion.removeEventListener('change', onMotion);
    };
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    preferences.theme === 'system' ? (systemDark ? 'dark' : 'light') : preferences.theme;

  const reducedMotionActive: boolean =
    preferences.motion === 'system'
      ? systemReducedMotion
      : preferences.motion === 'reduce';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (preferences.motion === 'system') {
      document.documentElement.removeAttribute('data-reduced-motion');
    } else {
      document.documentElement.setAttribute(
        'data-reduced-motion',
        preferences.motion === 'reduce' ? 'true' : 'false',
      );
    }
  }, [preferences.motion]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  }, []);

  const validation = useMemo(() => validateDraft(draftState.draft), [draftState.draft]);

  const visibleEventIndices = useMemo(() => {
    if (!result) return [];
    if (preferences.detailLevel === 'operation') {
      return result.trace.events.map((_, i) => i);
    }
    return result.trace.events
      .map((ev, i) => (ev.detailLevel === 'concept' ? i : -1))
      .filter((i) => i >= 0);
  }, [result, preferences.detailLevel]);

  const updatePreferences = useCallback((patch: Partial<Preferences>) => {
    setPreferences((prev) => ({ ...prev, ...patch }));
  }, []);

  const startSolving = useCallback(
    (overrideDraft?: DFADraft, overrideMethod?: Method): boolean => {
      const targetDraft = overrideDraft ?? draftState.draft;
      const val = validateDraft(targetDraft);
      if (!val.ok) return false;
      const targetMethod = overrideMethod ?? method;
      const res = minimize(val.dfa, targetMethod);
      setResultState({ result: res, semanticRevision: draftState.semanticRevision });
      setCursor(0);
      setPhase('simulate');
      return true;
    },
    [draftState.draft, draftState.semanticRevision, method],
  );

  const setMethod = useCallback(
    (nextMethod: Method) => {
      if (nextMethod === method) return;
      setMethodState(nextMethod);
      if (result && validation.ok) {
        const res = minimize(validation.dfa, nextMethod);
        setResultState({ result: res, semanticRevision: draftState.semanticRevision });
        setCursor(0);
        setPhase('simulate');
      }
    },
    [draftState.semanticRevision, method, result, validation],
  );

  const invalidateSolution = useCallback(() => {
    setResultState(null);
    setCursor(0);
    setPhase('build');
  }, []);

  const loadPreset = useCallback(
    (draft: DFADraft, autoSolve = false) => {
      dispatchDraft({ type: 'replaceDraft', draft, label: `Load ${draft.name}`, resetHistory: true });
      if (autoSolve) {
        const val = validateDraft(draft);
        if (val.ok) {
          const res = minimize(val.dfa, method);
          // resetHistory resets semanticRevision to 1 in createInitialDraftState
          setResultState({ result: res, semanticRevision: 1 });
          setCursor(0);
          setPhase('simulate');
          return;
        }
      }
      setResultState(null);
      setCursor(0);
      setPhase('build');
    },
    [method],
  );

  const recordPracticeAttempt = useCallback(
    (outcome: {
      id: string;
      promptTitle: string;
      status: 'independent' | 'hinted' | 'revealed';
      mistakeMessage?: string;
      lessonId?: number;
    }) => {
      setPractice((prev) => {
        const alreadyCompleted = prev.completedIds.includes(outcome.id);
        const completedIds = alreadyCompleted
          ? prev.completedIds
          : [...prev.completedIds, outcome.id];
        const mistakes = outcome.mistakeMessage
          ? [
              ...prev.mistakes.filter((m) => m.id !== outcome.id),
              {
                id: outcome.id,
                promptTitle: outcome.promptTitle,
                message: outcome.mistakeMessage,
                lessonId: outcome.lessonId ?? 5,
              },
            ]
          : prev.mistakes;
        return {
          attempted: prev.attempted + 1,
          solvedIndependently:
            prev.solvedIndependently + (!alreadyCompleted && outcome.status === 'independent' ? 1 : 0),
          solvedWithHints:
            prev.solvedWithHints + (!alreadyCompleted && outcome.status === 'hinted' ? 1 : 0),
          revealed: prev.revealed + (!alreadyCompleted && outcome.status === 'revealed' ? 1 : 0),
          completedIds,
          mistakes,
        };
      });
    },
    [],
  );

  const resetPracticeStats = useCallback(() => {
    setPractice(DEFAULT_PRACTICE);
  }, []);

  // Debounced persistence
  const persistNow = useCallback(() => {
    try {
      const now = Date.now();
      const activeEventId = result?.trace.events[cursor]?.id ?? null;
      const payload: PersistedDataV1 = {
        version: 1,
        engineVersion: ENGINE_VERSION,
        savedAt: now,
        draft: draftState.draft,
        method,
        hasSolved: Boolean(result),
        fingerprint: result?.fingerprint ?? null,
        lastEventId: activeEventId,
        phase,
        preferences,
        practice,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setLastSavedAt(now);
      setHasSavedDraft(true);
      setStorageWarning(null);
    } catch {
      setStorageWarning(
        'Could not save to browser local storage (storage blocked or quota exceeded). Use JSON export to back up your DFA.',
      );
    }
  }, [cursor, draftState.draft, method, phase, practice, preferences, result]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      persistNow();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [persistNow]);

  useEffect(() => {
    const onBeforeUnload = () => persistNow();
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') persistNow();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [persistNow]);

  const clearLocalData = useCallback(() => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('dfa-studio:')) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        window.localStorage.removeItem(k);
      }
    } catch {
      // Ignore storage errors on clear
    }
    setHasSavedDraft(false);
    setLastSavedAt(null);
    setPractice(DEFAULT_PRACTICE);
    setPreferences(DEFAULT_PREFERENCES);
    dispatchDraft({ type: 'replaceDraft', draft: DEFAULT_STARTER_DRAFT, resetHistory: true });
    setResultState(null);
    setCursor(0);
    setPhase('build');
    showToast('Local DFA Studio data cleared');
  }, [showToast]);

  const value: AppContextValue = {
    draftState,
    dispatchDraft,
    validation,
    method,
    setMethod,
    phase,
    setPhase,
    result,
    cursor,
    setCursor,
    visibleEventIndices,
    preferences,
    updatePreferences,
    resolvedTheme,
    reducedMotionActive,
    practice,
    recordPracticeAttempt,
    resetPracticeStats,
    startSolving,
    invalidateSolution,
    loadPreset,
    hasSavedDraft,
    lastSavedAt,
    storageWarning,
    versionNotice,
    dismissNotice: () => setVersionNotice(null),
    clearLocalData,
    toastMessage,
    showToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
