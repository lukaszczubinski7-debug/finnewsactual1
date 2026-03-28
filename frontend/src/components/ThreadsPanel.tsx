"use client";

import { useState } from "react";
import type { Thread, ThreadCreateRequest } from "../lib/types";

type Props = {
  threads: Thread[];
  loading: boolean;
  creating: boolean;
  refreshingId: number | null;
  refreshingAll: boolean;
  error: string | null;
  selectedId: number | null;
  onCreate: (req: ThreadCreateRequest) => void;
  onRefresh: (id: number) => void;
  onRefreshAll: () => void;
  onDelete: (id: number) => void;
  onSelect: (thread: Thread) => void;
};

const HORIZON_OPTIONS: { value: 7 | 30 | 90; label: string }[] = [
  { value: 7, label: "7 dni" },
  { value: 30, label: "30 dni" },
  { value: 90, label: "90 dni" },
];

const cardStyle: React.CSSProperties = {
  background: "rgba(19,28,40,0.95)",
  border: "1px solid rgba(186,205,231,0.18)",
  borderRadius: 14,
  padding: "16px 20px",
  display: "grid",
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  color: "#8ab4f0",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  background: "rgba(10,16,25,0.8)",
  border: "1px solid rgba(161,187,224,0.28)",
  borderRadius: 8,
  padding: "10px 14px",
  color: "#dce9ff",
  fontSize: 15,
  width: "100%",
  boxSizing: "border-box",
};

function statusBadge(thread: Thread): React.ReactNode {
  if (thread.status === "initializing" || thread.status === "refreshing") {
    return (
      <span style={{ color: "#f0c060", fontSize: 12 }}>
        ⏳ {thread.status === "initializing" ? "Inicjalizacja..." : "Odświeżanie..."}
      </span>
    );
  }
  if (thread.new_events_count > 0) {
    return (
      <span style={{ color: "#f07070", fontSize: 12, fontWeight: 700 }}>
        🔴 {thread.new_events_count} nowe
      </span>
    );
  }
  return <span style={{ color: "#60d090", fontSize: 12 }}>✅ Aktualny</span>;
}

export default function ThreadsPanel({
  threads,
  loading,
  creating,
  refreshingId,
  refreshingAll,
  error,
  selectedId,
  onCreate,
  onRefresh,
  onRefreshAll,
  onDelete,
  onSelect,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [extraContext, setExtraContext] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      assets: null,
      horizon_days: 30,
      extra_context: extraContext.trim() || null,
    });
    setName("");
    setExtraContext("");
    setShowForm(false);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, color: "#c6d8f4", fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Wątki
        </h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {threads.length > 0 && (
            <button
              type="button"
              onClick={onRefreshAll}
              disabled={refreshingAll || loading}
              style={{
                padding: "7px 14px",
                borderRadius: 999,
                border: "1px solid rgba(161,187,224,0.3)",
                background: "rgba(27,39,56,0.8)",
                color: "#9fb6d8",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {refreshingAll ? "Odświeżanie..." : "↻ Odśwież wszystkie"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            style={{
              padding: "7px 16px",
              borderRadius: 999,
              border: "none",
              background: "rgba(80,120,180,0.85)",
              color: "#e5f0ff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            + Nowy wątek
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: "#ffd7d7", fontSize: 13, padding: "8px 14px", background: "rgba(200,60,60,0.15)", borderRadius: 8 }}>
          {error}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div style={cardStyle}>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={labelStyle}>Nazwa wątku *</div>
              <input
                style={{ ...inputStyle, marginTop: 6 }}
                placeholder="np. Konflikt Iran-Izrael"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={500}
              />
            </div>
            <div>
              <div style={labelStyle}>Dodatkowy kontekst</div>
              <textarea
                style={{ ...inputStyle, marginTop: 6, height: 60, resize: "vertical" }}
                placeholder="np. skupiam się na wpływie na ropę"
                value={extraContext}
                onChange={(e) => setExtraContext(e.target.value)}
                maxLength={1000}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!name.trim() || creating}
                style={{
                  padding: "9px 20px",
                  borderRadius: 999,
                  border: "none",
                  background: name.trim() ? "rgba(80,120,180,0.9)" : "rgba(60,80,120,0.4)",
                  color: "#e5f0ff",
                  cursor: name.trim() ? "pointer" : "default",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {creating ? "Tworzenie..." : "Utwórz wątek"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{
                  padding: "9px 16px",
                  borderRadius: 999,
                  border: "1px solid rgba(161,187,224,0.28)",
                  background: "transparent",
                  color: "#9fb6d8",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Creating indicator */}
      {creating && (
        <div style={{ ...cardStyle, border: "1px solid rgba(80,120,180,0.4)" }}>
          <div style={{ color: "#8ab4f0", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
            Tworzenie wątku... AI analizuje temat (~30s)
          </div>
        </div>
      )}

      {/* Thread list */}
      {loading && threads.length === 0 && (
        <div style={{ color: "#9fb6d8", fontSize: 14 }}>Ładowanie wątków...</div>
      )}

      {!loading && !creating && threads.length === 0 && !showForm && (
        <div style={{ color: "#6a8aaa", fontSize: 14 }}>
          Brak wątków. Kliknij &ldquo;+ Nowy wątek&rdquo; by zacząć śledzić temat.
        </div>
      )}

      {threads.map((thread) => (
        <div
          key={thread.id}
          style={{
            ...cardStyle,
            cursor: "pointer",
            border: selectedId === thread.id
              ? "1px solid rgba(80,120,180,0.7)"
              : cardStyle.border,
            background: selectedId === thread.id
              ? "rgba(30,45,68,0.98)"
              : cardStyle.background,
          }}
          onClick={() => onSelect(thread)}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#dce9ff", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                📌 {thread.name}
              </div>
              <div style={{ color: "#7a9abc", fontSize: 12 }}>
                {thread.last_refreshed_at
                  ? `Ostatnio: ${new Date(thread.last_refreshed_at).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                  : "Nie odświeżony"}
                {thread.assets ? ` · ${thread.assets}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
              {statusBadge(thread)}
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRefresh(thread.id); }}
                  disabled={refreshingId === thread.id || thread.status !== "ready"}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(161,187,224,0.28)",
                    background: "transparent",
                    color: "#9fb6d8",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {refreshingId === thread.id ? "..." : "↻"}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(thread.id); }}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(200,80,80,0.3)",
                    background: "transparent",
                    color: "#f07878",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
