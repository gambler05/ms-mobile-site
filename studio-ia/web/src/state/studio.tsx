import { CircleCheck, Info, TriangleExclamationPoint, X } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, type Capability, type EngineInfo, errorText, type StatusResponse } from "../lib/api";
import { loadPrefs, type Prefs, savePrefs } from "../lib/util";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  hint?: string;
}

interface StudioState {
  status: StatusResponse | null;
  statusError: string | null;
  loadingStatus: boolean;
  refreshStatus: (force?: boolean) => Promise<void>;
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  /** Moteurs compatibles avec le mode choisi (Auto / API / Local) et la capacité demandée. */
  enginesFor: (cap: Capability) => EngineInfo[];
  /** Moteur à utiliser par défaut : le préféré s'il est disponible, sinon le premier disponible. */
  defaultEngine: (cap: Capability, preferred?: string) => EngineInfo | null;
  toast: (kind: ToastKind, message: string, hint?: string) => void;
  toastError: (err: unknown) => void;
}

const Ctx = createContext<StudioState | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loadingStatus, setLoading] = useState(false);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const refreshStatus = useCallback(async (force = false) => {
    setLoading(true);
    try {
      setStatus(await api.status(force));
      setStatusError(null);
    } catch (err) {
      setStatusError(errorText(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const t = setInterval(() => void refreshStatus(), 60_000);
    return () => clearInterval(t);
  }, [refreshStatus]);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const toast = useCallback((kind: ToastKind, message: string, hint?: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, message, hint }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 9000 : 3500);
  }, []);

  const toastError = useCallback(
    (err: unknown) => {
      const { message, hint } = errorText(err);
      toast("error", message, hint);
    },
    [toast],
  );

  const enginesFor = useCallback(
    (cap: Capability) =>
      (status?.engines ?? []).filter((e) => e.capabilities.includes(cap) && (prefs.mode === "auto" || e.kind === prefs.mode)),
    [status, prefs.mode],
  );

  const defaultEngine = useCallback(
    (cap: Capability, preferred?: string) => {
      const list = enginesFor(cap).filter((e) => e.available);
      return list.find((e) => e.id === preferred) ?? list[0] ?? null;
    },
    [enginesFor],
  );

  const value = useMemo(
    () => ({ status, statusError, loadingStatus, refreshStatus, prefs, setPrefs, enginesFor, defaultEngine, toast, toastError }),
    [status, statusError, loadingStatus, refreshStatus, prefs, setPrefs, enginesFor, defaultEngine, toast, toastError],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} data-testid={`toast-${t.kind}`}>
            {t.kind === "success" ? <CircleCheck size={18} /> : t.kind === "error" ? <TriangleExclamationPoint size={18} /> : <Info size={18} />}
            <div className="grow">
              <div>{t.message}</div>
              {t.hint && <div className="hint">{t.hint}</div>}
            </div>
            <button className="btn btn-ghost btn-sm btn-icon" aria-label="Fermer" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useStudio(): StudioState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStudio doit être utilisé dans <StudioProvider>");
  return ctx;
}
