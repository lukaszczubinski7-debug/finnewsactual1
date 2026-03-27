"use client";

import type { MarketCategory } from "../lib/types";

interface MarketPersonalizeModalProps {
  categories: MarketCategory[];
  selectedTickers: Set<string>;
  onToggle: (ticker: string) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}

export default function MarketPersonalizeModal({
  categories,
  selectedTickers,
  onToggle,
  onSave,
  onClose,
  saving,
}: MarketPersonalizeModalProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(5,9,15,0.85)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 18px",
        overflowY: "auto",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 680,
          border: "1px solid rgba(160,186,222,0.28)",
          borderRadius: 18,
          background: "linear-gradient(180deg, rgba(24,30,38,0.99) 0%, rgba(13,18,25,0.99) 100%)",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05), 0 24px 56px rgba(2,6,13,0.7)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid rgba(199,214,236,0.18)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2
            style={{
              margin: 0,
              color: "#e8efff",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Personalizuj dashboard
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid rgba(160,186,222,0.28)",
              borderRadius: 8,
              color: "#92a9cb",
              cursor: "pointer",
              padding: "4px 10px",
              fontSize: 13,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 18px", display: "grid", gap: 20 }}>
          {categories.map((cat) => (
            <div key={cat.name}>
              <p
                style={{
                  margin: "0 0 10px",
                  color: "#92a9cb",
                  fontSize: 11,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                {cat.name}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: 8,
                }}
              >
                {cat.instruments.map((inst) => {
                  const checked = selectedTickers.has(inst.ticker);
                  return (
                    <label
                      key={inst.ticker}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        border: `1px solid ${checked ? "rgba(140,180,255,0.4)" : "rgba(120,148,188,0.22)"}`,
                        borderRadius: 10,
                        padding: "8px 10px",
                        background: checked ? "rgba(60,90,140,0.22)" : "rgba(14,20,30,0.6)",
                        cursor: "pointer",
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(inst.ticker)}
                        style={{ accentColor: "#6fa3ef", cursor: "pointer" }}
                      />
                      <div>
                        <p style={{ margin: 0, color: "#dce9ff", fontSize: 12, fontWeight: 600 }}>
                          {inst.name}
                        </p>
                        <p
                          style={{
                            margin: "1px 0 0",
                            color: "#5a7498",
                            fontSize: 10,
                            letterSpacing: "0.08em",
                          }}
                        >
                          {inst.ticker}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 18px 18px",
            borderTop: "1px solid rgba(165,190,221,0.18)",
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              border: "1px solid rgba(163,185,215,0.4)",
              borderRadius: 10,
              padding: "9px 18px",
              color: "#d8e4f7",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: "linear-gradient(180deg, rgba(51,63,80,0.9), rgba(30,38,51,0.94))",
              cursor: "pointer",
            }}
          >
            Anuluj
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              border: "1px solid rgba(195,214,239,0.44)",
              borderRadius: 10,
              padding: "9px 18px",
              color: "#f4f9ff",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: saving
                ? "rgba(40,60,90,0.6)"
                : "linear-gradient(180deg, #4c6d99, #2d4361)",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Zapisywanie..." : "Zapisz"}
          </button>
        </div>
      </div>
    </div>
  );
}
