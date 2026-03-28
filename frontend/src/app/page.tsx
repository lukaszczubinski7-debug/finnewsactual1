"use client";

import { useEffect, useState } from "react";

import AuthProfilePanel from "../components/AuthProfilePanel";
import Dashboard from "../components/Dashboard";
import HeaderBar from "../components/HeaderBar";
import ResearchPanel from "../components/ResearchPanel";
import StructuredBriefsPanel from "../components/StructuredBriefsPanel";
import ThreadDetail from "../components/ThreadDetail";
import ThreadsPanel from "../components/ThreadsPanel";
import ThreadSuggestionBanner from "../components/ThreadSuggestion";
import styles from "../components/HudBriefForm.module.css";
import {
  createThread, deleteMe, deleteThread, getMe, getPreferences, getThreads,
  login, patchPreferences, postBrief, postResearch, refreshAllThreads, refreshThread,
  register, suggestThread,
} from "../lib/api";
import type {
  APIError, AuthUser, BriefContext, BriefRequest, BriefResponse, ResearchResponse, Thread,
  ThreadCreateRequest, ThreadSuggestion, UserPreference,
} from "../lib/types";

const AUTH_TOKEN_KEY = "finnews_access_token";
type AuthMode = "closed" | "login" | "register" | "profile";
type ActiveTab = "centrum" | "dashboard";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Page() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("centrum");
  const [isMobile, setIsMobile] = useState(false);

  // Auth
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("closed");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [preferences, setPreferences] = useState<UserPreference | null>(null);
  const [preferenceLoading, setPreferenceLoading] = useState(false);

  // Research
  const [researchQuery, setResearchQuery] = useState("");
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchResult, setResearchResult] = useState<ResearchResponse | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);

  // Structured briefs
  const [structuredBriefId, setStructuredBriefId] = useState<string | null>(null);
  const [structuredBriefResult, setStructuredBriefResult] = useState<BriefResponse | null>(null);
  const [structuredBriefError, setStructuredBriefError] = useState<string | null>(null);

  // Thread Memory
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [threadSuggestion, setThreadSuggestion] = useState<ThreadSuggestion | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadCreating, setThreadCreating] = useState(false);
  const [threadRefreshingId, setThreadRefreshingId] = useState<number | null>(null);
  const [threadRefreshingAll, setThreadRefreshingAll] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Restore session
  useEffect(() => {
    const savedToken = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (!savedToken) return;
    setToken(savedToken);
    setAuthLoading(true);
    void getMe(savedToken)
      .then((u) => setUser(u))
      .catch(() => {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  // Load threads on login
  useEffect(() => {
    if (!token || !user) { setThreads([]); setSelectedThread(null); return; }
    setThreadLoading(true);
    void getThreads(token)
      .then((data) => setThreads(data))
      .catch(() => setThreadError("Nie udało się pobrać wątków."))
      .finally(() => setThreadLoading(false));
  }, [token, user]);

  // ── Auth handlers ──────────────────────────────────────────────────────

  const loadPreferences = async (activeToken: string) => {
    setPreferenceLoading(true);
    try {
      const pref = await getPreferences(activeToken);
      setPreferences(pref);
    } catch (e) {
      setAuthError((e as APIError).message || "Nie udało się pobrać preferencji.");
    } finally {
      setPreferenceLoading(false);
    }
  };

  const handleLogin = async (email: string, password: string) => {
    setAuthLoading(true); setAuthError(null);
    try {
      const resp = await login({ email, password });
      setToken(resp.access_token); setUser(resp.user);
      window.localStorage.setItem(AUTH_TOKEN_KEY, resp.access_token);
      setAuthMode("closed");
    } catch (e) {
      const err = e as APIError;
      if (err.status === 401) setAuthError("Nieprawidłowy email lub hasło.");
      else if (err.status === 0 || err.status === 500) setAuthError("Serwer niedostępny.");
      else setAuthError(err.message || "Logowanie nie powiodło się.");
    } finally { setAuthLoading(false); }
  };

  const handleRegister = async (email: string, password: string) => {
    if (!EMAIL_REGEX.test(email.trim())) { setAuthError("Podaj poprawny email"); return; }
    setAuthLoading(true); setAuthError(null);
    try {
      await register({ email, password });
      await handleLogin(email, password);
    } catch (e) {
      const err = e as APIError;
      if (err.status === 422) setAuthError("Podaj poprawny adres email.");
      else if (err.status === 409) setAuthError("Konto z tym emailem już istnieje.");
      else if (err.status === 0 || err.status === 500) setAuthError("Serwer niedostępny.");
      else setAuthError(err.message || "Rejestracja nie powiodła się.");
    } finally { setAuthLoading(false); }
  };

  const handleLogout = () => {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    setToken(null); setUser(null); setPreferences(null); setAuthMode("closed");
  };

  const handleDeleteAccount = async () => {
    setAuthLoading(true); setAuthError(null);
    try { if (token) await deleteMe(token); } catch { /* ignore */ } finally {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      setToken(null); setUser(null); setPreferences(null); setAuthMode("closed"); setAuthLoading(false);
    }
  };

  const handleSavePreferences = async (payload: UserPreference) => {
    if (!token) { setAuthError("Brak sesji."); return; }
    setAuthLoading(true); setAuthError(null);
    try {
      const saved = await patchPreferences(token, payload);
      setPreferences(saved); setAuthMode("closed");
    } catch (e) {
      setAuthError((e as APIError).message || "Nie udało się zapisać preferencji.");
    } finally { setAuthLoading(false); }
  };

  // ── Research handler ───────────────────────────────────────────────────

  const handleResearch = async (overrideQuery?: string) => {
    const q = overrideQuery !== undefined ? overrideQuery : researchQuery.trim();
    setResearchLoading(true);
    setResearchError(null);
    setResearchResult(null);
    setThreadSuggestion(null);
    try {
      const result = await postResearch(q, token ?? undefined);
      setResearchResult(result);
      if (token && q) {
        const fakeBrief = {
          status: "ok" as const,
          style: "mid" as const,
          context: "Research",
          window_hours: 24,
          continents: [],
          focus: { geo_focus: "", custom_query: q },
          summary: { watki: [], tl_dr: result.report.slice(0, 200) },
          sources: [],
        } as BriefResponse;
        void suggestThread(token, fakeBrief).then((s) => {
          if (s?.suggest) setThreadSuggestion(s);
        }).catch(() => {});
      }
    } catch (e) {
      const err = e as APIError;
      setResearchError(err.message || "Nie udało się wygenerować raportu.");
    } finally {
      setResearchLoading(false);
    }
  };

  // ── Structured brief handler ───────────────────────────────────────────

  const handleStructuredBrief = async (id: string, context: BriefContext) => {
    setStructuredBriefId(id);
    setStructuredBriefResult(null);
    setStructuredBriefError(null);
    setResearchResult(null);
    setResearchError(null);
    setThreadSuggestion(null);
    try {
      const ALL_CONTINENTS: BriefRequest["continents"] = ["NA", "EU", "AS", "ME", "SA", "AF", "OC"];
      const result = await postBrief(
        {
          continents: ALL_CONTINENTS,
          tickers: "",
          query: "",
          context,
          geo_focus: "",
          debug: false,
          window_hours: 72,
          list_limit: 30,
          summary_k: 5,
          style: "normalnie",
        },
        token ?? undefined,
      );
      setStructuredBriefResult(result);
      if (token) {
        void suggestThread(token, result).then((s) => {
          if (s?.suggest) setThreadSuggestion(s);
        }).catch(() => {});
      }
    } catch (e) {
      setStructuredBriefError((e as APIError).message || "Nie udało się wygenerować briefu.");
    } finally {
      setStructuredBriefId(null);
    }
  };

  // ── Thread handlers ────────────────────────────────────────────────────

  const handleCreateThread = async (req: ThreadCreateRequest) => {
    if (!token) return;
    setThreadCreating(true); setThreadError(null); setThreadSuggestion(null);
    try {
      const t = await createThread(token, req);
      setThreads((p) => [t, ...p]); setSelectedThread(t);
    } catch (e) {
      setThreadError((e as APIError).message || "Nie udało się utworzyć wątku.");
    } finally { setThreadCreating(false); }
  };

  const handleRefreshThread = async (threadId: number) => {
    if (!token) return;
    setThreadRefreshingId(threadId); setThreadError(null);
    try {
      const updated = await refreshThread(token, threadId);
      setThreads((p) => p.map((t) => (t.id === threadId ? updated : t)));
      if (selectedThread?.id === threadId) setSelectedThread(updated);
    } catch (e) {
      setThreadError((e as APIError).message || "Nie udało się odświeżyć wątku.");
    } finally { setThreadRefreshingId(null); }
  };

  const handleRefreshAll = async () => {
    if (!token) return;
    setThreadRefreshingAll(true); setThreadError(null);
    try {
      await refreshAllThreads(token);
      const updated = await getThreads(token);
      setThreads(updated);
      if (selectedThread) {
        const upd = updated.find((t) => t.id === selectedThread.id);
        if (upd) setSelectedThread(upd);
      }
    } catch (e) {
      setThreadError((e as APIError).message || "Nie udało się odświeżyć wątków.");
    } finally { setThreadRefreshingAll(false); }
  };

  const handleDeleteThread = async (threadId: number) => {
    if (!token) return;
    setThreadError(null);
    try {
      await deleteThread(token, threadId);
      setThreads((p) => p.filter((t) => t.id !== threadId));
      if (selectedThread?.id === threadId) setSelectedThread(null);
    } catch (e) {
      setThreadError((e as APIError).message || "Nie udało się usunąć wątku.");
    }
  };

  // ── Nav button style (desktop sidebar) ───────────────────────────────

  const navBtnStyle = (tab: ActiveTab): React.CSSProperties => ({
    width: "100%", padding: "10px 14px",
    borderRadius: 9, border: "none", cursor: "pointer",
    fontWeight: 600, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
    textAlign: "left",
    color: activeTab === tab ? "#f0f6ff" : "#4a6890",
    background: activeTab === tab ? "rgba(60,96,160,0.55)" : "transparent",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  });

  // ── Desktop sidebar ────────────────────────────────────────────────────

  const sidebar = (
    <aside style={{
      width: 200, flexShrink: 0,
      display: "flex", flexDirection: "column", gap: 6,
      padding: "20px 10px",
      background: "rgba(8,14,24,0.7)",
      borderRight: "1px solid rgba(100,140,200,0.1)",
      minHeight: "100vh",
      position: "sticky", top: 0, alignSelf: "flex-start",
      overflowX: "hidden",
    }}>
      <div style={{
        padding: "10px 12px", marginBottom: 10,
        borderRadius: 9, background: "rgba(20,35,60,0.6)",
        border: "1px solid rgba(80,120,180,0.2)",
      }}>
        {user ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                background: "rgba(50,90,160,0.5)",
                border: "1px solid rgba(80,130,210,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15, fontWeight: 700, color: "#90c0f0",
                flexShrink: 0,
              }}>
                {user.email.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: 9, color: "#4a6890", letterSpacing: "0.05em", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Zalogowano</span>
            </div>
            <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
              <button onClick={() => { setAuthError(null); setAuthMode("profile"); if (token) void loadPreferences(token); }} style={{
                flex: 1, fontSize: 10, padding: "4px 0", background: "rgba(30,50,90,0.7)",
                border: "1px solid rgba(80,120,180,0.25)", borderRadius: 6, color: "#6a9ac8", cursor: "pointer" }}>
                Profil
              </button>
              <button onClick={handleLogout} style={{
                flex: 1, fontSize: 10, padding: "4px 0", background: "rgba(30,50,90,0.7)",
                border: "1px solid rgba(80,120,180,0.25)", borderRadius: 6, color: "#6a9ac8", cursor: "pointer" }}>
                Wyloguj
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <button onClick={() => { setAuthError(null); setAuthMode("login"); }} style={{
              fontSize: 11, padding: "7px 0", background: "rgba(40,70,130,0.6)",
              border: "1px solid rgba(80,130,200,0.3)", borderRadius: 7, color: "#90c0f0", cursor: "pointer", fontWeight: 600 }}>
              Zaloguj
            </button>
            <button onClick={() => { setAuthError(null); setAuthMode("register"); }} style={{
              fontSize: 11, padding: "7px 0", background: "transparent",
              border: "1px solid rgba(60,90,140,0.3)", borderRadius: 7, color: "#4a6890", cursor: "pointer" }}>
              Załóż konto
            </button>
          </div>
        )}
      </div>

      <button type="button" style={navBtnStyle("centrum")} onClick={() => setActiveTab("centrum")}
        onMouseEnter={(e) => { if (activeTab !== "centrum") (e.currentTarget as HTMLButtonElement).style.color = "#8ab4d8"; }}
        onMouseLeave={(e) => { if (activeTab !== "centrum") (e.currentTarget as HTMLButtonElement).style.color = "#4a6890"; }}>
        Centrum informacji
      </button>
      <button type="button" style={navBtnStyle("dashboard")} onClick={() => setActiveTab("dashboard")}
        onMouseEnter={(e) => { if (activeTab !== "dashboard") (e.currentTarget as HTMLButtonElement).style.color = "#8ab4d8"; }}
        onMouseLeave={(e) => { if (activeTab !== "dashboard") (e.currentTarget as HTMLButtonElement).style.color = "#4a6890"; }}>
        Dashboard
      </button>
    </aside>
  );

  // ── Mobile top bar ─────────────────────────────────────────────────────

  const mobileTopBar = (
    <div style={{
      position: "sticky", top: 0, zIndex: 30,
      background: "rgba(8,14,24,0.97)",
      backdropFilter: "blur(10px)",
      borderBottom: "1px solid rgba(100,140,200,0.12)",
      padding: "12px 14px",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.16em",
        textTransform: "uppercase", color: "#c8deff", flexShrink: 0,
      }}>
        RT
      </span>

      <div style={{ flex: 1, display: "flex", gap: 6 }}>
        {(["centrum", "dashboard"] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, fontSize: 9, padding: "6px 8px",
              borderRadius: 7, border: "none", cursor: "pointer",
              fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
              background: activeTab === tab ? "rgba(60,96,160,0.65)" : "rgba(20,32,54,0.7)",
              color: activeTab === tab ? "#f0f6ff" : "#4a6890",
              transition: "all 0.15s",
            }}
          >
            {tab === "centrum" ? "Centrum" : "Dashboard"}
          </button>
        ))}
      </div>

      {user ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <button
            onClick={() => { setAuthError(null); setAuthMode("profile"); if (token) void loadPreferences(token); }}
            style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "rgba(50,90,160,0.5)",
              border: "1px solid rgba(80,130,210,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, color: "#90c0f0", cursor: "pointer",
            }}
          >
            {user.email.charAt(0).toUpperCase()}
          </button>
          <button
            onClick={handleLogout}
            style={{
              fontSize: 9, padding: "5px 8px", background: "rgba(20,35,60,0.7)",
              border: "1px solid rgba(60,90,130,0.3)", borderRadius: 6,
              color: "#4a6890", cursor: "pointer", letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Wyloguj
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          <button
            onClick={() => { setAuthError(null); setAuthMode("login"); }}
            style={{
              fontSize: 9, padding: "6px 10px", background: "rgba(40,70,130,0.6)",
              border: "1px solid rgba(80,130,200,0.3)", borderRadius: 7,
              color: "#90c0f0", cursor: "pointer", fontWeight: 600,
              letterSpacing: "0.06em", textTransform: "uppercase",
            }}
          >
            Zaloguj
          </button>
          <button
            onClick={() => { setAuthError(null); setAuthMode("register"); }}
            style={{
              fontSize: 9, padding: "6px 10px", background: "transparent",
              border: "1px solid rgba(60,90,140,0.3)", borderRadius: 7,
              color: "#4a6890", cursor: "pointer",
              letterSpacing: "0.06em", textTransform: "uppercase",
            }}
          >
            Konto
          </button>
        </div>
      )}
    </div>
  );

  // ── ThreadsPanel props (shared) ────────────────────────────────────────

  const threadsPanelProps = {
    threads, loading: threadLoading, creating: threadCreating,
    refreshingAll: threadRefreshingAll, refreshingId: threadRefreshingId,
    error: threadError, selectedId: selectedThread?.id ?? null,
    onSelect: (t: Thread) => setSelectedThread(t),
    onCreate: handleCreateThread,
    onRefresh: handleRefreshThread,
    onRefreshAll: handleRefreshAll,
    onDelete: handleDeleteThread,
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top right, rgba(72,93,123,0.2) 0%, transparent 35%), radial-gradient(circle at bottom left, rgba(72,97,131,0.12) 0%, transparent 30%), linear-gradient(180deg, #0a0f16 0%, #05090f 100%)",
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      overflowX: "hidden",
    }}>
      {isMobile ? mobileTopBar : sidebar}

      <div style={{
        flex: 1, minWidth: 0,
        padding: isMobile ? "12px 12px 30px" : "26px 20px 64px",
        display: "flex",
        gap: isMobile ? 12 : 20,
        alignItems: "flex-start",
        flexDirection: isMobile ? "column" : "row",
      }}>

        {/* Auth modal */}
        {authMode !== "closed" && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(4,8,14,0.92)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            padding: isMobile ? "12px 10px" : "60px 18px",
            overflowY: "auto",
          }}
            onClick={(e) => { if (e.target === e.currentTarget) setAuthMode("closed"); }}>
            <div style={{ width: "100%", maxWidth: 520 }} className={styles.panel}>
              <AuthProfilePanel
                user={user} authMode={authMode} loading={authLoading} error={authError}
                preference={preferences} preferenceLoading={preferenceLoading}
                onOpenLogin={() => { setAuthError(null); setAuthMode("login"); }}
                onOpenRegister={() => { setAuthError(null); setAuthMode("register"); }}
                onOpenProfile={() => { if (!token) { setAuthError("Brak sesji."); return; } setAuthError(null); setAuthMode("profile"); void loadPreferences(token); }}
                onClose={() => setAuthMode("closed")}
                onLogin={handleLogin} onRegister={handleRegister} onLogout={handleLogout}
                onDeleteAccount={handleDeleteAccount} onSavePreferences={handleSavePreferences}
              />
            </div>
          </div>
        )}

        {/* ── Dashboard tab ──────────────────────────────────────────── */}
        {activeTab === "dashboard" && (
          <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
            <Dashboard />
          </div>
        )}

        {/* ── Centrum informacji tab ─────────────────────────────────── */}
        {activeTab === "centrum" && (
          <>
            {/* Main content column */}
            <div style={{ flex: 1, minWidth: 0, width: "100%", display: "flex", flexDirection: "column", gap: isMobile ? 10 : 16 }}>

              {/* Header panel */}
              <section className={styles.panel}>
                <HeaderBar />
              </section>

              <section className={styles.panel} style={{ display: "flex", flexDirection: "column", gap: 20, padding: "16px 14px" }}>
                <StructuredBriefsPanel
                  onGenerate={handleStructuredBrief}
                  loadingId={structuredBriefId}
                  disabled={researchLoading}
                  isMobile={isMobile}
                />

                {structuredBriefError && !structuredBriefId && (
                  <div style={{ padding: "10px 14px", color: "#f87171", fontSize: 12, background: "rgba(90,20,20,0.2)", borderRadius: 8, border: "1px solid rgba(248,113,113,0.15)" }}>
                    {structuredBriefError}
                  </div>
                )}
              </section>

              {/* Structured brief result */}
              {structuredBriefResult && !structuredBriefId && (
                <section className={styles.panel} style={{ padding: "16px 14px" }}>
                  {(() => {
                    const r = structuredBriefResult;
                    const summary = r.summary as Record<string, unknown>;
                    let text = "";
                    if (typeof summary.tl_dr === "string") text += summary.tl_dr + "\n\n";
                    if (Array.isArray(summary.watki)) {
                      for (const w of summary.watki as Array<{title?: string; body?: string}>) {
                        if (w.title) text += `## ${w.title}\n`;
                        if (w.body) text += `${w.body}\n\n`;
                      }
                    }
                    if (!text && typeof summary.summary === "string") text = summary.summary;
                    if (!text) text = JSON.stringify(summary, null, 2);
                    const lines = text.split("\n");
                    return (
                      <div>
                        <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(120,160,210,0.5)", marginBottom: 10 }}>
                          Brief — {r.context}
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.7, color: "#b0cce8" }}>
                          {lines.map((line, i) => {
                            const t = line.trim();
                            if (!t) return <div key={i} style={{ height: 6 }} />;
                            if (t.startsWith("## ")) return <div key={i} style={{ fontWeight: 700, color: "#d0e8ff", fontSize: 14, marginTop: 12, marginBottom: 3 }}>{t.slice(3)}</div>;
                            if (t.startsWith("- ") || t.startsWith("• ")) return <div key={i} style={{ paddingLeft: 14, marginBottom: 2 }}><span style={{ color: "#3a6090", marginRight: 5 }}>•</span>{t.slice(2)}</div>;
                            return <div key={i} style={{ marginBottom: 3 }}>{t}</div>;
                          })}
                        </div>
                        {r.sources.length > 0 && (
                          <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid rgba(80,120,180,0.15)" }}>
                            <div style={{ fontSize: 9, color: "#1e3555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>Źródła</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              {r.sources.slice(0, 5).map((s, i) => (
                                <div key={i} style={{ display: "flex", gap: 6 }}>
                                  <span style={{ fontSize: 9, color: "#1e3555" }}>{i + 1}.</span>
                                  {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#3a6090", textDecoration: "none" }}>{s.title}</a> : <span style={{ fontSize: 11, color: "#3a6090" }}>{s.title}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div style={{ marginTop: 10, textAlign: "right" }}>
                          <button onClick={() => { setStructuredBriefResult(null); setStructuredBriefError(null); }} style={{ fontSize: 10, color: "#2a4870", background: "transparent", border: "1px solid rgba(50,80,130,0.25)", borderRadius: 5, padding: "3px 10px", cursor: "pointer" }}>
                            ✕ Wyczyść
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </section>
              )}

              <section className={styles.panel} style={{ padding: "16px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div style={{ flex: 1, height: "1px", background: "rgba(50,80,130,0.18)" }} />
                  <span style={{ fontSize: 9, color: "rgba(80,120,170,0.4)", letterSpacing: "0.14em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Research — własne zapytanie</span>
                  <div style={{ flex: 1, height: "1px", background: "rgba(50,80,130,0.18)" }} />
                </div>
                <ResearchPanel
                  query={researchQuery}
                  loading={researchLoading}
                  result={researchResult}
                  error={researchError}
                  onQueryChange={setResearchQuery}
                  onSubmit={handleResearch}
                  onClear={() => { setResearchQuery(""); setResearchResult(null); setResearchError(null); setThreadSuggestion(null); }}
                />
              </section>

              {/* Thread suggestion */}
              {threadSuggestion && token && (
                <ThreadSuggestionBanner
                  suggestion={threadSuggestion}
                  onCreate={handleCreateThread}
                  onDismiss={() => setThreadSuggestion(null)}
                />
              )}

              {/* ThreadsPanel below content on mobile */}
              {isMobile && user && token && (
                <section className={styles.panel} style={{ padding: "14px 12px" }}>
                  <ThreadsPanel {...threadsPanelProps} />
                </section>
              )}
            </div>

            {/* ThreadsPanel right column on desktop */}
            {!isMobile && user && token && (
              <div style={{ width: 280, flexShrink: 0, position: "sticky", top: 26 }}>
                <ThreadsPanel {...threadsPanelProps} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Thread detail modal */}
      {selectedThread && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(5,9,15,0.88)",
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          padding: isMobile ? "8px 8px" : "40px 18px",
          overflowY: "auto",
        }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedThread(null); }}>
          <div style={{ width: "100%", maxWidth: 860 }}>
            <ThreadDetail thread={selectedThread} onClose={() => setSelectedThread(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
