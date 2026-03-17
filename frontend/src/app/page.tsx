"use client";

import { useEffect, useMemo, useState } from "react";

import AnalysisPanel from "../components/AnalysisPanel";
import AuthProfilePanel from "../components/AuthProfilePanel";
import BriefResult from "../components/BriefResult";
import Charts from "../components/Charts";
import Dashboard from "../components/Dashboard";
import FooterActions from "../components/FooterActions";
import HeaderBar from "../components/HeaderBar";
import ThreadDetail from "../components/ThreadDetail";
import ThreadsPanel from "../components/ThreadsPanel";
import ThreadSuggestionBanner from "../components/ThreadSuggestion";
import styles from "../components/HudBriefForm.module.css";
import {
  createThread, deleteMe, deleteThread, getMe, getPreferences, getThreads,
  login, patchPreferences, postBrief, refreshAllThreads, refreshThread,
  register, suggestThread,
} from "../lib/api";
import { HARD_LIST_LIMIT, createInitialFormState } from "../lib/briefDefaults";
import type {
  APIError, AuthUser, BriefRequest, BriefResponse, Thread,
  ThreadCreateRequest, ThreadSuggestion, UserPreference,
} from "../lib/types";

const ALL_CONTINENTS = ["NA", "EU", "AS", "ME", "SA", "AF", "OC"] as const;

const initialFormState: BriefRequest = createInitialFormState();
const AUTH_TOKEN_KEY = "finnews_access_token";
type AuthMode = "closed" | "login" | "register" | "profile";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY_INPUT_VALIDATION_MESSAGE = "Wpisz pytanie lub uzupelnij profil uzytkownika.";

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
  const [mainQuestion, setMainQuestion] = useState("");
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

  // Thread Memory state
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [threadSuggestion, setThreadSuggestion] = useState<ThreadSuggestion | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadCreating, setThreadCreating] = useState(false);
  const [threadRefreshingId, setThreadRefreshingId] = useState<number | null>(null);
  const [threadRefreshingAll, setThreadRefreshingAll] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"brief" | "dashboard" | "charts">("brief");

  const hasQuestion = useMemo(() => mainQuestion.trim().length > 0, [mainQuestion]);
  const hasProfile = useMemo(() => hasUsefulProfile(preferences), [preferences]);
  const canGenerate = hasQuestion || hasProfile;

  useEffect(() => {
    if (canGenerate) {
      setInputValidationMessage(null);
    }
  }, [canGenerate]);

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

  // Load threads when user logs in
  useEffect(() => {
    if (!token || !user) {
      setThreads([]);
      setSelectedThread(null);
      return;
    }
    setThreadLoading(true);
    void getThreads(token)
      .then((data) => setThreads(data))
      .catch(() => setThreadError("Nie udalo sie pobrac watkow."))
      .finally(() => setThreadLoading(false));
  }, [token, user]);

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
      if (apiError.status === 401) {
        setAuthError("Nieprawidlowy email lub haslo.");
      } else if (apiError.status === 0 || apiError.status === 500) {
        setAuthError("Serwer niedostepny. Sprawdz czy backend jest uruchomiony.");
      } else {
        setAuthError(apiError.message || "Logowanie nie powiodlo sie.");
      }
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
        setAuthError("Podaj poprawny adres email.");
      } else if (apiError.status === 409) {
        setAuthError("Konto z tym emailem juz istnieje.");
      } else if (apiError.status === 0 || apiError.status === 500) {
        setAuthError("Serwer niedostepny. Sprawdz czy backend jest uruchomiony.");
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
    setMainQuestion("");
    setError(null);
    setResult(null);
    setInputValidationMessage(null);
    setThreadSuggestion(null);
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
    setThreadSuggestion(null);

    const payload: BriefRequest = {
      ...initialFormState,
      style: "normalnie",
      list_limit: HARD_LIST_LIMIT,
      continents: [...ALL_CONTINENTS],
      geo_focus: "",
      query: mainQuestion.trim(),
    };

    try {
      const response = await postBrief(payload, token || undefined);
      setResult(response);
      // After brief — ask AI if it suggests a thread (only if logged in)
      if (token) {
        void suggestThread(token, response).then((suggestion) => {
          if (suggestion?.suggest) {
            setThreadSuggestion(suggestion);
          }
        }).catch(() => {
          // suggestion is optional, ignore errors
        });
      }
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

  // Thread handlers
  const handleCreateThread = async (req: ThreadCreateRequest) => {
    if (!token) return;
    setThreadCreating(true);
    setThreadError(null);
    setThreadSuggestion(null);
    try {
      const newThread = await createThread(token, req);
      setThreads((prev) => [newThread, ...prev]);
      setSelectedThread(newThread);
    } catch (err) {
      const apiError = err as APIError;
      setThreadError(apiError.message || "Nie udalo sie utworzyc watku.");
    } finally {
      setThreadCreating(false);
    }
  };

  const handleRefreshThread = async (threadId: number) => {
    if (!token) return;
    setThreadRefreshingId(threadId);
    setThreadError(null);
    try {
      const updated = await refreshThread(token, threadId);
      setThreads((prev) => prev.map((t) => (t.id === threadId ? updated : t)));
      if (selectedThread?.id === threadId) {
        setSelectedThread(updated);
      }
    } catch (err) {
      const apiError = err as APIError;
      setThreadError(apiError.message || "Nie udalo sie odswiezych watku.");
    } finally {
      setThreadRefreshingId(null);
    }
  };

  const handleRefreshAll = async () => {
    if (!token) return;
    setThreadRefreshingAll(true);
    setThreadError(null);
    try {
      await refreshAllThreads(token);
      // Reload threads list after refresh-all
      const updated = await getThreads(token);
      setThreads(updated);
      if (selectedThread) {
        const updatedSelected = updated.find((t) => t.id === selectedThread.id);
        if (updatedSelected) setSelectedThread(updatedSelected);
      }
    } catch (err) {
      const apiError = err as APIError;
      setThreadError(apiError.message || "Nie udalo sie odswiezych watkow.");
    } finally {
      setThreadRefreshingAll(false);
    }
  };

  const handleDeleteThread = async (threadId: number) => {
    if (!token) return;
    setThreadError(null);
    try {
      await deleteThread(token, threadId);
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (selectedThread?.id === threadId) {
        setSelectedThread(null);
      }
    } catch (err) {
      const apiError = err as APIError;
      setThreadError(apiError.message || "Nie udalo sie usunac watku.");
    }
  };

  const leftColumn = (
    <div style={{ display: "grid", gap: 22 }}>
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
        <AnalysisPanel
          mainQuestion={mainQuestion}
          disabled={loading}
          validationMessage={inputValidationMessage}
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

      {threadSuggestion && token ? (
        <ThreadSuggestionBanner
          suggestion={threadSuggestion}
          onCreate={handleCreateThread}
          onDismiss={() => setThreadSuggestion(null)}
        />
      ) : null}

    </div>
  );

  const tabBtnStyle = (tab: "brief" | "dashboard" | "charts"): React.CSSProperties => ({
    padding: "9px 22px",
    borderRadius: 999,
    border: activeTab === tab ? "1px solid rgba(80,120,180,0.6)" : "1px solid rgba(161,187,224,0.18)",
    background: activeTab === tab ? "rgba(80,120,180,0.85)" : "transparent",
    color: activeTab === tab ? "#e5f0ff" : "#8ab4f0",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
  });

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "26px 18px 64px",
        background:
          "radial-gradient(circle at top right, rgba(72, 93, 123, 0.2) 0%, transparent 35%), radial-gradient(circle at bottom left, rgba(72, 97, 131, 0.12) 0%, transparent 30%), linear-gradient(180deg, #0a0f16 0%, #05090f 100%)",
      }}
    >
      {/* Tab navigation */}
      <nav
        style={{
          maxWidth: 1600,
          margin: "0 auto 20px",
          display: "flex",
          gap: 8,
          borderBottom: "1px solid rgba(186,205,231,0.1)",
          paddingBottom: 16,
        }}
      >
        <button type="button" style={tabBtnStyle("brief")} onClick={() => setActiveTab("brief")}>
          Brief
        </button>
        <button type="button" style={tabBtnStyle("dashboard")} onClick={() => setActiveTab("dashboard")}>
          Dashboard
        </button>
        <button type="button" style={tabBtnStyle("charts")} onClick={() => setActiveTab("charts")}>
          Wykresy
        </button>
      </nav>

      {/* Dashboard tab */}
      {activeTab === "dashboard" && (
        <div style={{ maxWidth: 1600, margin: "0 auto" }}>
          <Dashboard />
        </div>
      )}

      {/* Charts tab */}
      {activeTab === "charts" && (
        <div style={{ maxWidth: 1600, margin: "0 auto" }}>
          <Charts />
        </div>
      )}

      {/* Brief tab */}
      {activeTab === "brief" && (
        <>
          {user && token ? (
            <div
              style={{
                maxWidth: 1600,
                margin: "0 auto",
                display: "grid",
                gridTemplateColumns: "1fr 340px",
                gap: 22,
                alignItems: "start",
              }}
            >
              {leftColumn}
              <div style={{ position: "sticky", top: 26 }}>
                <ThreadsPanel
                  threads={threads}
                  loading={threadLoading}
                  creating={threadCreating}
                  refreshingAll={threadRefreshingAll}
                  refreshingId={threadRefreshingId}
                  error={threadError}
                  selectedId={selectedThread?.id ?? null}
                  onSelect={(thread) => setSelectedThread(thread)}
                  onCreate={handleCreateThread}
                  onRefresh={handleRefreshThread}
                  onRefreshAll={handleRefreshAll}
                  onDelete={handleDeleteThread}
                />
              </div>

              {/* Thread detail modal */}
              {selectedThread && (
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 100,
                    background: "rgba(5,9,15,0.82)",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "center",
                    padding: "40px 18px 40px",
                    overflowY: "auto",
                  }}
                  onClick={(e) => { if (e.target === e.currentTarget) setSelectedThread(null); }}
                >
                  <div style={{ width: "100%", maxWidth: 860 }}>
                    <ThreadDetail thread={selectedThread} onClose={() => setSelectedThread(null)} />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ maxWidth: 1180, margin: "0 auto" }}>
              {leftColumn}
            </div>
          )}
        </>
      )}
    </main>
  );
}
