"use client";

import type { ThreadCreateRequest, ThreadSuggestion } from "../lib/types";

type Props = {
  suggestion: ThreadSuggestion;
  onCreate: (req: ThreadCreateRequest) => void;
  onDismiss: () => void;
};

export default function ThreadSuggestionBanner({ suggestion, onCreate, onDismiss }: Props) {
  if (!suggestion.suggest || !suggestion.name) return null;

  const handleCreate = () => {
    onCreate({
      name: suggestion.name!,
      assets: suggestion.assets ?? null,
      horizon_days: (suggestion.horizon_days as 7 | 30 | 90) ?? 30,
      extra_context: null,
    });
  };

  return (
    <div
      style={{
        padding: "14px 18px",
        borderRadius: 14,
        border: "1px solid rgba(100,160,255,0.3)",
        background: "rgba(20,35,60,0.95)",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 18 }}>💡</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#8ab4f0", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
            AI sugeruje nowy wątek
          </div>
          <div style={{ color: "#dce9ff", fontSize: 15, fontWeight: 600 }}>
            {suggestion.name}
          </div>
          {suggestion.assets && (
            <div style={{ color: "#7a9abc", fontSize: 13, marginTop: 2 }}>
              Aktywa: {suggestion.assets}
            </div>
          )}
          {suggestion.reason && (
            <div style={{ color: "#9fb6d8", fontSize: 13, marginTop: 4 }}>
              {suggestion.reason}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={handleCreate}
          style={{
            padding: "7px 18px",
            borderRadius: 999,
            border: "none",
            background: "rgba(80,120,180,0.9)",
            color: "#e5f0ff",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Utwórz wątek
        </button>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            padding: "7px 14px",
            borderRadius: 999,
            border: "1px solid rgba(161,187,224,0.22)",
            background: "transparent",
            color: "#7a9abc",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Pomiń
        </button>
      </div>
    </div>
  );
}
