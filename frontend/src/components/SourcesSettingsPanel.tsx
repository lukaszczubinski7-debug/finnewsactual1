"use client";

// Zweryfikowane źródła + suwak zaufania (trust level)
// trust_level 0.0 = LLM ignoruje priorytet źródeł
// trust_level 1.0 = LLM korzysta WYŁĄCZNIE ze zweryfikowanych źródeł

type SourceCategory = "X" | "YT" | "Bank" | "Web";

type VerifiedSource = {
  name: string;
  handle: string;
  url: string;
  category: SourceCategory;
  topics: string[];
  description: string;
};

const VERIFIED_SOURCES: VerifiedSource[] = [
  // X (Twitter)
  {
    name: "Mariusz Hojda",
    handle: "k0g00t",
    url: "https://x.com/k0g00t",
    category: "X",
    topics: ["Giełda PL", "GPW"],
    description: "Analityk polskiej giełdy (GPW)",
  },
  {
    name: "M.v. Cunha",
    handle: "mvcinvesting",
    url: "https://x.com/mvcinvesting",
    category: "X",
    topics: ["Giełda US", "S&P500"],
    description: "Inwestor US equity",
  },
  {
    name: "Agrippa Investment",
    handle: "Agrippa_Inv",
    url: "https://x.com/Agrippa_Inv",
    category: "X",
    topics: ["Giełda US", "Makro"],
    description: "US giełda i komentarze rynkowe",
  },
  {
    name: "Jurek Tomaszewski",
    handle: "JJTomaszewski",
    url: "https://x.com/JJTomaszewski",
    category: "X",
    topics: ["Giełda PL", "Giełda US"],
    description: "Polska i US giełda",
  },
  // YouTube
  {
    name: "Good Times Bad Times PL",
    handle: "UCTTzMDoVCbaX6K1CwKsRJsQ",
    url: "https://www.youtube.com/@goodtimesbadtimespl",
    category: "YT",
    topics: ["Makro", "Gospodarka"],
    description: "Makroekonomia i rynki finansowe",
  },
];

const CATEGORY_META: Record<SourceCategory, { label: string; color: string; bg: string; icon: string }> = {
  X: { label: "X / Twitter", color: "#c8deff", bg: "rgba(30,50,90,0.5)", icon: "✕" },
  YT: { label: "YouTube", color: "#f08080", bg: "rgba(80,20,20,0.4)", icon: "▶" },
  Bank: { label: "Banki / Instytucje", color: "#90d0a0", bg: "rgba(20,60,30,0.4)", icon: "🏦" },
  Web: { label: "Serwisy WWW", color: "#c0a0e0", bg: "rgba(50,20,80,0.4)", icon: "🌐" },
};

const CATEGORIES = (Object.keys(CATEGORY_META) as SourceCategory[]).filter(
  (c) => VERIFIED_SOURCES.some((s) => s.category === c)
);

function trustLabel(v: number): string {
  if (v === 0) return "Wyłączone";
  if (v <= 0.25) return "Niska";
  if (v <= 0.5) return "Umiarkowana";
  if (v <= 0.75) return "Wysoka";
  return "Wyłącznie";
}

function trustColor(v: number): string {
  if (v === 0) return "#4a6890";
  if (v <= 0.3) return "#6a9ac8";
  if (v <= 0.6) return "#8abcf0";
  if (v <= 0.9) return "#60c080";
  return "#f0c060";
}

type Props = {
  trustLevel: number;           // 0.0 – 1.0
  onTrustChange: (v: number) => void;
  saving?: boolean;
};

export default function SourcesSettingsPanel({ trustLevel, onTrustChange, saving }: Props) {
  const pct = Math.round(trustLevel * 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Trust slider ──────────────────────────────────────────────── */}
      <div style={{
        background: "rgba(12,20,36,0.7)",
        border: "1px solid rgba(80,120,180,0.2)",
        borderRadius: 12,
        padding: "18px 20px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#c8deff" }}>
            Poziom zaufania do źródeł
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
            color: trustColor(trustLevel),
            minWidth: 80, textAlign: "right",
          }}>
            {trustLabel(trustLevel)} · {pct}%
          </span>
        </div>

        {/* Slider */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            type="range"
            min={0} max={1} step={0.05}
            value={trustLevel}
            onChange={(e) => onTrustChange(parseFloat(e.target.value))}
            disabled={saving}
            style={{
              width: "100%",
              accentColor: trustColor(trustLevel),
              cursor: saving ? "not-allowed" : "pointer",
              height: 4,
            }}
          />
        </div>

        {/* Skala opisowa */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#3a5068", letterSpacing: "0.06em" }}>
          <span>0 — wyłączone</span>
          <span>0.5 — preferuje</span>
          <span>1 — wyłącznie</span>
        </div>

        {/* Opis bieżącego poziomu */}
        <div style={{
          marginTop: 12,
          padding: "9px 12px",
          background: "rgba(20,35,60,0.6)",
          borderRadius: 8,
          border: "1px solid rgba(60,90,130,0.2)",
          fontSize: 10, color: "#6a8aaa", lineHeight: 1.6,
        }}>
          {trustLevel === 0 && "LLM traktuje wszystkie źródła jednakowo — swobodne szukanie."}
          {trustLevel > 0 && trustLevel < 0.5 && "LLM lekko preferuje zweryfikowane źródła, ale korzysta też z innych."}
          {trustLevel >= 0.5 && trustLevel < 1 && "LLM mocno preferuje zweryfikowane źródła przy wyszukiwaniu tweetów i newsów."}
          {trustLevel === 1 && "LLM przeszukuje WYŁĄCZNIE zweryfikowane konta X i kanały YT. Inne źródła ignorowane."}
        </div>

        {saving && (
          <div style={{ marginTop: 8, fontSize: 9, color: "#4a6890", letterSpacing: "0.06em" }}>
            Zapisywanie...
          </div>
        )}
      </div>

      {/* ── Verified sources list ─────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {CATEGORIES.map((cat) => {
          const meta = CATEGORY_META[cat];
          const sources = VERIFIED_SOURCES.filter((s) => s.category === cat);
          return (
            <div key={cat} style={{
              background: "rgba(12,20,36,0.6)",
              border: "1px solid rgba(80,120,180,0.15)",
              borderRadius: 10,
              overflow: "hidden",
            }}>
              {/* Header grupy */}
              <div style={{
                padding: "10px 16px",
                background: meta.bg,
                borderBottom: "1px solid rgba(80,120,180,0.12)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 12, opacity: 0.8 }}>{meta.icon}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: meta.color,
                }}>
                  {meta.label}
                </span>
                <span style={{
                  marginLeft: "auto", fontSize: 9, color: "#3a5068",
                  background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "2px 8px",
                }}>
                  {sources.length}
                </span>
              </div>

              {/* Lista źródeł */}
              {sources.map((src, i) => (
                <div key={src.handle} style={{
                  padding: "12px 16px",
                  borderBottom: i < sources.length - 1 ? "1px solid rgba(60,90,130,0.12)" : "none",
                  display: "flex", alignItems: "flex-start", gap: 12,
                }}>
                  {/* Avatar/icon */}
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                    background: meta.bg, border: `1px solid ${meta.color}22`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: meta.color,
                  }}>
                    {src.name.charAt(0).toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 11, fontWeight: 600, color: meta.color,
                          textDecoration: "none",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                        onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                      >
                        {src.name}
                      </a>
                      {src.category === "X" && (
                        <span style={{ fontSize: 9, color: "#3a5068" }}>@{src.handle}</span>
                      )}
                    </div>

                    <div style={{ fontSize: 9, color: "#4a6890", marginTop: 2, lineHeight: 1.5 }}>
                      {src.description}
                    </div>

                    {/* Tematy */}
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                      {src.topics.map((t) => (
                        <span key={t} style={{
                          fontSize: 8, padding: "2px 7px", borderRadius: 8,
                          background: "rgba(30,50,90,0.6)",
                          border: "1px solid rgba(60,90,130,0.25)",
                          color: "#5a7aa0", letterSpacing: "0.04em",
                        }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Trust indicator */}
                  <div style={{
                    flexShrink: 0, display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 3,
                  }}>
                    <div style={{
                      width: 6, height: 40, borderRadius: 3,
                      background: "rgba(20,35,60,0.8)",
                      border: "1px solid rgba(60,90,130,0.2)",
                      position: "relative", overflow: "hidden",
                    }}>
                      <div style={{
                        position: "absolute", bottom: 0, left: 0, right: 0,
                        height: `${pct}%`,
                        background: trustColor(trustLevel),
                        borderRadius: 3,
                        transition: "height 0.3s ease",
                      }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Dodaj źródło (placeholder) */}
      <div style={{
        padding: "12px 16px",
        border: "1px dashed rgba(60,90,130,0.3)",
        borderRadius: 10,
        textAlign: "center",
        fontSize: 10, color: "#3a5068",
        letterSpacing: "0.06em",
      }}>
        + Dodaj nowe źródło — wkrótce
      </div>
    </div>
  );
}
