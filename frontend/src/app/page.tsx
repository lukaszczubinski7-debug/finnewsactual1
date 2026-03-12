"use client";

import { useEffect, useMemo, useState } from "react";

import AnalysisPanel from "../components/AnalysisPanel";
import AuthProfilePanel from "../components/AuthProfilePanel";
import BriefResult from "../components/BriefResult";
import type { ContinentKey } from "../components/ContinentMap";
import FooterActions from "../components/FooterActions";
import HeaderBar from "../components/HeaderBar";
import VersionSelector from "../components/VersionSelector";
import styles from "../components/HudBriefForm.module.css";
import { deleteMe, getMe, getPreferences, login, patchPreferences, postBrief, register } from "../lib/api";
import { HARD_LIST_LIMIT, createInitialFormState, ensureContinents } from "../lib/briefDefaults";
import type { APIError, AuthUser, BriefRequest, BriefResponse, ContinentCode, UserPreference } from "../lib/types";

const REGION_OPTIONS: Array<{ key: ContinentKey; label: string }> = [
  { key: "AMERYKA_PN", label: "Ameryka Polnocna" },
  { key: "AMERYKA_PD", label: "Ameryka Poludniowa" },
  { key: "EUROPA", label: "Europa" },
  { key: "AFRYKA", label: "Afryka" },
  { key: "BLISKI_WSCHOD", label: "Bliski Wschod" },
  { key: "AZJA", label: "Azja" },
  { key: "AUSTRALIA", label: "Australia" },
];
const DEFAULT_SELECTED_REGIONS: ContinentKey[] = REGION_OPTIONS.map((option) => option.key);

const REGION_TO_CONTINENTS: Record<ContinentKey, ContinentCode[]> = {
  AMERYKA_PN: ["NA"],
  AMERYKA_PD: ["SA"],
  EUROPA: ["EU"],
  AFRYKA: ["AF"],
  BLISKI_WSCHOD: ["ME"],
  AZJA: ["AS"],
  AUSTRALIA: ["OC"],
};

const initialFormState: BriefRequest = createInitialFormState();
const AUTH_TOKEN_KEY = "finnews_access_token";
type AuthMode = "closed" | "login" | "register" | "profile";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY_INPUT_VALIDATION_MESSAGE = "Wpisz pytanie, wybierz region lub uzupelnij profil uzytkownika.";

function mapRegionsToContinents(regions: ContinentKey[]): ContinentCode[] {
  const mapped = regions.flatMap((region) => REGION_TO_CONTINENTS[region] || []);
  return ensureContinents(mapped);
}

function hasUsefulProfile(preference: UserPreference | null): boolean {
  if (!preference) {
    return false;
  }
  return Boolean(
    preference.search_profile_text?.trim() ||
      preference.response_style?.trim() ||
      preference.notes?.trim() ||
      preference.interested_assets.length ||
      preference.interested_regions.length ||
      preference.interested_topics.length,
  );
}

export default function Page() {
  const [selectedRegions, setSelectedRegions] = useState<ContinentKey[]>([]);
  const [mainQuestion, setMainQuestion] = useState("");
  const [briefMode, setBriefMode] = useState<BriefRequest["style"]>("krotko");
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [preferenceLoading, setPreferenceLoading] = useState(false);
  const [error, setError] = useState<APIError | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [result, setResult] = useState<BriefResponse | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("closed");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [preferences, setPreferences] = useState<UserPreference | null>(null);
  const [inputValidationMessage, setInputValidationMessage] = useState<string | null>(null);

  const hasQuestion = useMemo(() => mainQuestion.trim().length > 0, [mainQuestion]);
  const hasRegions = useMemo(() => selectedRegions.length > 0, [selectedRegions]);
  const hasProfile = useMemo(() => hasUsefulProfile(preferences), [preferences]);
  const canGenerate = hasQuestion || hasProfile || hasRegions;

  useEffect(() => {
    if (canGenerate) {
      setInputValidationMessage(null);
    }
  }, [canGenerate]);

  const toggleRegion = (region: ContinentKey) => {
    setInputValidationMessage(null);
    setSelectedRegions((current) =>
      current.includes(region) ? current.filter((item) => item !== region) : [...current, region],
    );
  };

  useEffect(() => {
    const savedToken = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (!savedToken) {
      return;
    }

    setToken(savedToken);
    setAuthLoading(true);
    void getMe(savedToken)
      .then((sessionUser) => {
        setUser(sessionUser);
      })
      .catch(() => {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const loadPreferences = async (activeToken: string) => {
    setPreferenceLoading(true);
    try {
      const pref = await getPreferences(activeToken);
      setPreferences(pref);
    } catch (prefError) {
      const apiError = prefError as APIError;
      setAuthError(apiError.message || "Nie udalo sie pobrac preferencji.");
    } finally {
      setPreferenceLoading(false);
    }
  };

  const handleLogin = async (email: string, password: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await login({ email, password });
      setToken(response.access_token);
      setUser(response.user);
      window.localStorage.setItem(AUTH_TOKEN_KEY, response.access_token);
      setAuthMode("closed");
    } catch (loginError) {
      const apiError = loginError as APIError;
      setAuthError(apiError.message || "Logowanie nie powiodlo sie.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (email: string, password: string) => {
    if (!EMAIL_REGEX.test(email.trim())) {
      setAuthError("Podaj poprawny adres email");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      await register({ email, password });
      await handleLogin(email, password);
    } catch (registerError) {
      const apiError = registerError as APIError;
      if (apiError.status === 422) {
        setAuthError("Podaj poprawny adres email");
      } else {
        setAuthError(apiError.message || "Rejestracja nie powiodla sie.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    setToken(null);
    setUser(null);
    setPreferences(null);
    setAuthMode("closed");
  };

  const handleDeleteAccount = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (token) {
        await deleteMe(token);
      }
    } catch {
      // Intentional no-op, local logout still proceeds.
    } finally {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      setToken(null);
      setUser(null);
      setPreferences(null);
      setAuthMode("closed");
      setAuthLoading(false);
    }
  };

  const handleSavePreferences = async (payload: UserPreference) => {
    if (!token) {
      setAuthError("Brak sesji uzytkownika.");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const saved = await patchPreferences(token, payload);
      setPreferences(saved);
      setAuthMode("closed");
    } catch (saveError) {
      const apiError = saveError as APIError;
      setAuthError(apiError.message || "Nie udalo sie zapisac preferencji.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedRegions([]);
    setMainQuestion("");
    setBriefMode("krotko");
    setError(null);
    setResult(null);
    setInputValidationMessage(null);
  };

  const handleSubmit = async () => {
    if (!canGenerate) {
      setInputValidationMessage(EMPTY_INPUT_VALIDATION_MESSAGE);
      return;
    }

    setInputValidationMessage(null);
    setLoading(true);
    setError(null);
    setResult(null);

    const payload: BriefRequest = {
      ...initialFormState,
      style: briefMode,
      list_limit: HARD_LIST_LIMIT,
      continents: mapRegionsToContinents(selectedRegions),
      geo_focus: "",
      query: mainQuestion.trim(),
    };

    try {
      const response = await postBrief(payload, token || undefined);
      setResult(response);
    } catch (submitError) {
      const apiError = submitError as APIError;
      setError({
        message: apiError.message || "Nie udalo sie wygenerowac podsumowania.",
        status: typeof apiError.status === "number" ? apiError.status : 0,
        debug: apiError.debug,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "26px 18px 64px",
        background:
          "radial-gradient(circle at top right, rgba(72, 93, 123, 0.2) 0%, transparent 35%), radial-gradient(circle at bottom left, rgba(72, 97, 131, 0.12) 0%, transparent 30%), linear-gradient(180deg, #0a0f16 0%, #05090f 100%)",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 22 }}>
        <section className={styles.panel}>
          <HeaderBar />
          <AuthProfilePanel
            user={user}
            authMode={authMode}
            loading={authLoading}
            error={authError}
            preference={preferences}
            preferenceLoading={preferenceLoading}
            onOpenLogin={() => {
              setAuthError(null);
              setAuthMode("login");
            }}
            onOpenRegister={() => {
              setAuthError(null);
              setAuthMode("register");
            }}
            onOpenProfile={() => {
              if (!token) {
                setAuthError("Brak sesji uzytkownika.");
                return;
              }
              setAuthError(null);
              setAuthMode("profile");
              void loadPreferences(token);
            }}
            onClose={() => setAuthMode("closed")}
            onLogin={handleLogin}
            onRegister={handleRegister}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
            onSavePreferences={handleSavePreferences}
          />
          <VersionSelector mode={briefMode} onChange={setBriefMode} disabled={loading || authLoading} />
          <AnalysisPanel
            regionOptions={REGION_OPTIONS}
            selectedRegions={selectedRegions}
            mainQuestion={mainQuestion}
            disabled={loading}
            validationMessage={inputValidationMessage}
            onToggleRegion={toggleRegion}
            onSelectAll={() => setSelectedRegions(DEFAULT_SELECTED_REGIONS)}
            onClearAll={() => setSelectedRegions([])}
            onMainQuestionChange={(value) => {
              setInputValidationMessage(null);
              setMainQuestion(value);
            }}
          />
          <FooterActions canGenerate={canGenerate} loading={loading} onGenerate={handleSubmit} onCancel={handleCancel} />
        </section>

        {error ? (
          <section
            role="alert"
            className={styles.panel}
            style={{
              borderColor: "rgba(217, 86, 86, 0.58)",
              boxShadow:
                "inset 0 0 0 1px rgba(217, 86, 86, 0.24), inset 0 0 24px rgba(217, 86, 86, 0.12), 0 12px 30px rgba(6, 8, 12, 0.45)",
              padding: "14px 16px",
              color: "#ffd7d7",
            }}
          >
            <strong style={{ display: "block", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Blad backendu{error.status ? ` (${error.status})` : ""}
            </strong>
            <span>{error.message}</span>
          </section>
        ) : null}

        {loading ? (
          <section className={styles.panel} style={{ padding: "14px 16px", color: "#c6d8f4" }}>
            Trwa generowanie briefu...
          </section>
        ) : null}

        {authLoading && !loading ? (
          <section className={styles.panel} style={{ padding: "14px 16px", color: "#c6d8f4" }}>
            Trwa synchronizacja sesji...
          </section>
        ) : null}

        {result ? <BriefResult result={result} /> : null}
      </div>
    </main>
  );
}
