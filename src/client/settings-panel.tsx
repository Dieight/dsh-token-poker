/**
 * Browser settings panel: mounted into DSH's Settings as its own section
 * (`settings.section` slot). Reads/writes the `dsh-token-poker` namespace
 * through the client settings scope (`settingsScope.bind`), the same pattern
 * DSH's own settings rows use. The provider/model pickers are fed from DSH's
 * configurable-provider directory (`connection.api.llm.providers` + the
 * settings describe mirror), so the choices always match what DSH has
 * configured locally.
 */
import React, { useEffect, useState } from "react";
import type { PokerSettings, ProviderRow } from "../shared/settings";

/** Snapshot of the bound settings scope (from the client settings transport). */
export interface PokerSettingsSnapshot {
  status: "loading" | "ready" | "saving" | "unavailable" | "error";
  value?: unknown;
  writable?: boolean;
  error?: unknown;
}

export interface PokerSettingsPanelProps {
  /** Selector hook over the bound settings store (injected via hooks). */
  usePokerSettings: (
    selector: (snapshot: PokerSettingsSnapshot) => unknown,
  ) => unknown;
  /** Write one field into the namespace. */
  setField: (field: keyof PokerSettings, value: unknown) => void;
  /** Resolve DSH's configured provider directory (routes + display names). */
  loadProviders: () => Promise<ProviderRow[]>;
  /** Resolve the current model list for one provider (fresh describe). */
  loadProviderModels: (provider: string) => Promise<string[]>;
  /** Bound locale translator for the `settings.tokenPoker` namespace. */
  t: (key: string) => string;
}

export function PokerSettingsPanel(props: PokerSettingsPanelProps) {
  const {
    usePokerSettings,
    setField,
    loadProviders,
    loadProviderModels,
    t,
  } = props;
  const state = usePokerSettings((snapshot) => snapshot) as PokerSettingsSnapshot;
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [providersBusy, setProvidersBusy] = useState(false);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Refresh the provider's model list whenever the provider setting changes.
  useEffect(() => {
    let alive = true;
    const provider = (state.value as Partial<PokerSettings> | undefined)?.provider;
    if (!provider) {
      setModels([]);
      setModelsError(null);
      return;
    }
    setModelsError(null);
    loadProviderModels(provider)
      .then((list) => {
        if (!alive) return;
        setModels(list);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setModels([]);
        setModelsError(
          error instanceof Error ? error.message : String(error),
        );
      });
    return () => {
      alive = false;
    };
  }, [loadProviderModels, state.value]);

  useEffect(() => {
    let alive = true;
    setProvidersBusy(true);
    loadProviders()
      .then((rows) => {
        if (!alive) return;
        setProviders(rows);
        setProvidersBusy(false);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setProvidersError(error instanceof Error ? error.message : String(error));
        setProvidersBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [loadProviders]);

  if (state.status === "unavailable") return null;

  const v = (state.value ?? {}) as Partial<PokerSettings>;
  const busy =
    state.status === "loading" ||
    state.status === "saving" ||
    state.status === "error";
  const writable = !!state.writable && !busy;

  const providerKnown = providers.some((row) => row.provider === v.provider);

  return (
    <div className="tp-settings">
      <div className="tp-settings__desc">{t("description")}</div>

      <div className="tp-settings__row">
        <span className="tp-settings__field">{t("aiEnabled")}</span>
        <span className="tp-settings__control">
          <input
            type="checkbox"
            checked={!!v.aiEnabled}
            disabled={!writable}
            onChange={(e) => setField("aiEnabled", e.target.checked)}
          />
        </span>
      </div>

      <div className="tp-settings__row">
        <span className="tp-settings__field">{t("provider")}</span>
        <span className="tp-settings__control">
          <select
            className="tp-settings__select"
            value={v.provider ?? ""}
            disabled={!writable || providersBusy}
            onChange={(e) => {
              const next = e.target.value;
              // Switching provider invalidates the previous model choice:
              // clear it so the model picker shows the new provider's list
              // instead of pretending the old model is still valid.
              setField("provider", next);
              if (v.model) setField("model", "");
            }}
          >
            {providers.map((row) => (
              <option key={row.provider} value={row.provider}>
                {row.displayName}
              </option>
            ))}
            {v.provider && !providerKnown ? (
              <option value={v.provider}>{v.provider}</option>
            ) : null}
          </select>
        </span>
      </div>

      <div className="tp-settings__row">
        <span className="tp-settings__field">{t("model")}</span>
        <span className="tp-settings__control">
          <select
            className="tp-settings__select"
            value={v.model ?? ""}
            disabled={!writable}
            onChange={(e) => setField("model", e.target.value)}
          >
            {v.model ? null : (
              <option value="" disabled>
                {t("selectModel")}
              </option>
            )}
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
            {v.model && !models.includes(v.model) ? (
              <option value={v.model}>{v.model}</option>
            ) : null}
          </select>
          {modelsError ? (
            <span className="tp-settings__hint" title={modelsError}>
              {t("modelsError")}
            </span>
          ) : null}
        </span>
      </div>

      <div className="tp-settings__row">
        <span className="tp-settings__field">{t("maxTokens")}</span>
        <span className="tp-settings__control">
          <input
            type="number"
            className="tp-settings__number"
            min={16}
            max={4096}
            step={16}
            value={v.maxTokens ?? 256}
            disabled={!writable}
            onChange={(e) => setField("maxTokens", Number(e.target.value))}
          />
        </span>
      </div>

      <div className="tp-settings__row">
        <span className="tp-settings__field">{t("temperature")}</span>
        <span className="tp-settings__control tp-settings__slider">
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={v.temperature ?? 1}
            disabled={!writable}
            onChange={(e) => setField("temperature", Number(e.target.value))}
          />
          <span className="tp-settings__value">
            {(v.temperature ?? 1).toFixed(1)}
          </span>
        </span>
      </div>

      <div className="tp-settings__row">
        <span className="tp-settings__field">{t("isolateScope")}</span>
        <span className="tp-settings__control">
          <input
            type="checkbox"
            checked={!!v.isolateScope}
            disabled={!writable}
            onChange={(e) => setField("isolateScope", e.target.checked)}
          />
        </span>
      </div>

      <div className="tp-settings__row">
        <span className="tp-settings__field">{t("thinkTimeoutMs")}</span>
        <span className="tp-settings__control">
          <input
            type="number"
            className="tp-settings__number"
            min={1000}
            max={120000}
            step={1000}
            value={v.thinkTimeoutMs ?? 30000}
            disabled={!writable}
            onChange={(e) => setField("thinkTimeoutMs", Number(e.target.value))}
          />
        </span>
      </div>

      {providersError !== null ? (
        <div className="tp-settings__error" role="alert">
          {t("providersError")}: {providersError}
        </div>
      ) : null}
    </div>
  );
}
