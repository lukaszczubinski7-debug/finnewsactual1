"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteYoutubeChannel,
  deleteYoutubeSource,
  getYoutubeChannels,
  getYoutubeSources,
  postYoutubeChannel,
  postYoutubeSource,
  refreshYoutubeChannels,
} from "../lib/api";
import type { YoutubeChannel, YoutubeSource } from "../lib/types";

type Tab = "films" | "channels";

// ── Loading dots ──────────────────────────────────────────────────────────────

function Dots() {
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          display: "inline-block", width: 4, height: 4, borderRadius: "50%",
          background: "#3a6090", animation: `ytpulse 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
      <style>{`@keyframes ytpulse{0%,80%,100%{opacity:0.2}40%{opacity:1}}`}</style>
    </span>
  );
}

// ── Source Card ───────────────────────────────────────────────────────────────

function SourceCard({ src, onDelete }: { src: YoutubeSource; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [hovDel, setHovDel] = useState(false);

  const summaryLines = (src.summary || "").split("\n").filter(Boolean);

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(100,140,200,0.1)",
      borderRadius: 10, overflow: "hidden", marginBottom: 10,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px" }}>
        {/* Thumbnail */}
        <a href={src.video_url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
          <img
            src={`https://img.youtube.com/vi/${src.video_id}/mqdefault.jpg`}
            alt=""
            style={{ width: 80, height: 45, objectFit: "cover", borderRadius: 5, display: "block" }}
          />
        </a>
        <div style={{ flex: 1, minWidth: 0 }}>
          <a href={src.video_url} target="_blank" rel="noopener noreferrer"
            style={{ color: "#c0d8f4", fontSize: 12, fontWeight: 600, textDecoration: "none",
              display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {src.title || src.video_id}
          </a>
          {src.channel_name && (
            <div style={{ fontSize: 10, color: "#2a4870", marginTop: 2 }}>{src.channel_name}</div>
          )}
          <div style={{ marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}>
            {src.status === "pending" || src.status === "processing" ? (
              <span style={{ fontSize: 10, color: "#3a6090", display: "flex", alignItems: "center", gap: 5 }}>
                <Dots /> przetwarzanie...
              </span>
            ) : src.status === "error" ? (
              <span style={{ fontSize: 10, color: "#f87171" }}>{src.error_msg || "Błąd"}</span>
            ) : (
              <button onClick={() => setExpanded((p) => !p)} style={{
                background: "none", border: "none", color: "#3a6090", cursor: "pointer",
                fontSize: 10, padding: 0, textDecoration: "underline" }}>
                {expanded ? "Zwiń ▲" : "Pokaż podsumowanie ▼"}
              </button>
            )}
            {src.language && src.status === "ready" && (
              <span style={{ fontSize: 9, color: "#1e3555", background: "rgba(30,50,90,0.4)",
                padding: "1px 5px", borderRadius: 3 }}>{src.language.toUpperCase()}</span>
            )}
          </div>
        </div>
        <button
          onClick={onDelete}
          onMouseEnter={() => setHovDel(true)}
          onMouseLeave={() => setHovDel(false)}
          style={{ background: hovDel ? "rgba(80,20,20,0.8)" : "rgba(30,45,70,0.8)",
            border: `1px solid ${hovDel ? "rgba(248,113,113,0.4)" : "rgba(80,110,160,0.25)"}`,
            borderRadius: 5, color: hovDel ? "#f87171" : "rgba(120,160,200,0.5)",
            cursor: "pointer", fontSize: 11, padding: "3px 7px", flexShrink: 0, transition: "all 0.15s" }}>
          ✕
        </button>
      </div>

      {/* Summary */}
      {expanded && src.summary && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid rgba(100,140,200,0.06)" }}>
          <div style={{ paddingTop: 10 }}>
            {summaryLines.map((line, i) => (
              <p key={i} style={{
                margin: "0 0 6px", fontSize: 12, color: line.startsWith("•") ? "#b0cce8" : "#8ab0d0",
                lineHeight: 1.5, paddingLeft: line.startsWith("•") ? 0 : 0,
              }}>
                {line}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Channel Card ──────────────────────────────────────────────────────────────

function ChannelCard({ ch, onDelete }: { ch: YoutubeChannel; onDelete: () => void }) {
  const [hovDel, setHovDel] = useState(false);
  const fetched = ch.last_fetched_at
    ? new Date(ch.last_fetched_at).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "nie pobrano";

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(100,140,200,0.1)",
      borderRadius: 10, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 8,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#c0d8f4",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {ch.name || ch.channel_id}
        </div>
        <div style={{ fontSize: 10, color: "#2a4870", marginTop: 2 }}>
          Ostatnie pobr.: {fetched}
        </div>
      </div>
      <a href={ch.channel_url} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 10, color: "#2a4870", textDecoration: "none", flexShrink: 0 }}>YT ↗</a>
      <button
        onClick={onDelete}
        onMouseEnter={() => setHovDel(true)}
        onMouseLeave={() => setHovDel(false)}
        style={{ background: hovDel ? "rgba(80,20,20,0.8)" : "rgba(30,45,70,0.8)",
          border: `1px solid ${hovDel ? "rgba(248,113,113,0.4)" : "rgba(80,110,160,0.25)"}`,
          borderRadius: 5, color: hovDel ? "#f87171" : "rgba(120,160,200,0.5)",
          cursor: "pointer", fontSize: 11, padding: "3px 7px", flexShrink: 0, transition: "all 0.15s" }}>
        ✕
      </button>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function YoutubePanel({ token }: { token: string }) {
  const [tab, setTab] = useState<Tab>("films");
  const [sources, setSources] = useState<YoutubeSource[]>([]);
  const [channels, setChannels] = useState<YoutubeChannel[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSources = useCallback(async () => {
    try { setSources(await getYoutubeSources(token)); } catch {}
  }, [token]);

  const loadChannels = useCallback(async () => {
    try { setChannels(await getYoutubeChannels(token)); } catch {}
  }, [token]);

  useEffect(() => {
    void loadSources();
    void loadChannels();
  }, [loadSources, loadChannels]);

  // Poll while any source is processing
  useEffect(() => {
    const hasPending = sources.some((s) => s.status === "pending" || s.status === "processing");
    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(() => void loadSources(), 4000);
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [sources, loadSources]);

  const handleAddFilm = async () => {
    if (!urlInput.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const src = await postYoutubeSource(token, urlInput.trim());
      setSources((p) => [src, ...p.filter((s) => s.id !== src.id)]);
      setUrlInput("");
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Błąd dodawania.");
    } finally {
      setAdding(false);
    }
  };

  const handleAddChannel = async () => {
    if (!urlInput.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const ch = await postYoutubeChannel(token, urlInput.trim());
      setChannels((p) => [ch, ...p.filter((c) => c.id !== ch.id)]);
      setUrlInput("");
      // New videos will appear after a moment
      setTimeout(() => void loadSources(), 5000);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Błąd dodawania kanału.");
    } finally {
      setAdding(false);
    }
  };

  const handleRefreshChannels = async () => {
    setRefreshing(true);
    try {
      await refreshYoutubeChannels(token);
      setTimeout(() => { void loadSources(); void loadChannels(); }, 3000);
    } catch {}
    finally { setRefreshing(false); }
  };

  const handleDeleteSource = async (id: number) => {
    try {
      await deleteYoutubeSource(token, id);
      setSources((p) => p.filter((s) => s.id !== id));
    } catch {}
  };

  const handleDeleteChannel = async (id: number) => {
    try {
      await deleteYoutubeChannel(token, id);
      setChannels((p) => p.filter((c) => c.id !== id));
    } catch {}
  };

  const inputStyle: React.CSSProperties = {
    flex: 1, padding: "8px 11px", background: "rgba(8,14,26,0.8)",
    border: "1px solid rgba(60,100,160,0.3)", borderRadius: 7,
    color: "#c0d8f4", fontSize: 12, outline: "none",
  };

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    padding: "8px 14px", background: disabled ? "rgba(15,28,50,0.4)" : "rgba(40,70,140,0.6)",
    border: `1px solid ${disabled ? "rgba(30,50,90,0.3)" : "rgba(70,120,210,0.4)"}`,
    borderRadius: 7, color: disabled ? "#1e3050" : "#a0c8f0",
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700,
    whiteSpace: "nowrap" as const,
  });

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["films", "channels"] as Tab[]).map((t) => {
          const labels: Record<Tab, string> = { films: "Filmy", channels: "Kanały" };
          const active = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "5px 14px", borderRadius: 6,
              background: active ? "rgba(40,70,140,0.6)" : "rgba(14,26,50,0.4)",
              border: `1px solid ${active ? "rgba(70,120,210,0.45)" : "rgba(40,70,120,0.2)"}`,
              color: active ? "#a0c8f0" : "#2a4870",
              cursor: "pointer", fontSize: 11, fontWeight: active ? 700 : 400,
            }}>
              {labels[t]}
            </button>
          );
        })}
        {tab === "channels" && (
          <button onClick={handleRefreshChannels} disabled={refreshing} style={{ ...btnStyle(refreshing), marginLeft: "auto" }}>
            {refreshing ? "Pobieranie..." : "↻ Odśwież kanały"}
          </button>
        )}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { tab === "films" ? void handleAddFilm() : void handleAddChannel(); } }}
          placeholder={tab === "films" ? "Wklej URL YouTube (film)" : "Wklej URL kanału YouTube"}
          style={inputStyle}
        />
        <button
          onClick={tab === "films" ? handleAddFilm : handleAddChannel}
          disabled={adding || !urlInput.trim()}
          style={btnStyle(adding || !urlInput.trim())}>
          {adding ? "Dodawanie..." : "+ Dodaj"}
        </button>
      </div>

      {error && (
        <div style={{ color: "#f87171", fontSize: 11, marginBottom: 10, padding: "6px 10px",
          background: "rgba(90,20,20,0.25)", borderRadius: 6, border: "1px solid rgba(248,113,113,0.2)" }}>
          {error}
        </div>
      )}

      {/* Content */}
      {tab === "films" && (
        <>
          {sources.length === 0 && (
            <div style={{ color: "#1e3555", fontSize: 12, textAlign: "center", padding: "30px 0" }}>
              Brak filmów. Wklej URL YouTube żeby dodać.
            </div>
          )}
          {sources.map((s) => (
            <SourceCard key={s.id} src={s} onDelete={() => void handleDeleteSource(s.id)} />
          ))}
        </>
      )}

      {tab === "channels" && (
        <>
          {channels.length === 0 && (
            <div style={{ color: "#1e3555", fontSize: 12, textAlign: "center", padding: "30px 0" }}>
              Brak kanałów. Dodaj URL kanału YouTube.
            </div>
          )}
          {channels.map((c) => (
            <ChannelCard key={c.id} ch={c} onDelete={() => void handleDeleteChannel(c.id)} />
          ))}
          {channels.length > 0 && (
            <p style={{ color: "#1e3555", fontSize: 10, textAlign: "center", marginTop: 8 }}>
              Filmy z kanałów pojawiają się w zakładce Filmy
            </p>
          )}
        </>
      )}
    </div>
  );
}
