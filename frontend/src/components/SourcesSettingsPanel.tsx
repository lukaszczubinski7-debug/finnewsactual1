"use client";

import { useEffect, useState } from "react";

// trust_level 0.0 = LLM ignoruje priorytet źródeł
// trust_level 1.0 = LLM korzysta WYŁĄCZNIE ze zweryfikowanych źródeł
// Każde źródło ma własną wagę (0–1) przechowywaną w localStorage.
// Efektywne zaufanie = globalTrustLevel * sourceWeight

const WEIGHTS_KEY = "finnews_source_weights";

type SourceCategory = "X" | "YT" | "Instytucja";

type VerifiedSource = {
  name: string;
  handle: string;
  url: string;
  category: SourceCategory;
  group?: string;
  topics: string[];
  description: string;
};

const VERIFIED_SOURCES: VerifiedSource[] = [
  // ── X / Twitter ─────────────────────────────────────────────────────────
  { name: "Mariusz Hojda", handle: "k0g00t", url: "https://x.com/k0g00t", category: "X", group: "Giełda PL", topics: ["Giełda PL", "GPW"], description: "Analizy spółek GPW, komentarze do wyników, walory małe/mid-cap" },
  { name: "Jurek Tomaszewski", handle: "JJTomaszewski", url: "https://x.com/JJTomaszewski", category: "X", group: "Giełda PL", topics: ["Giełda PL", "Giełda US", "Makro"], description: "GPW + US, makro, portfel, opinie o spółkach" },
  { name: "M.v. Cunha", handle: "mvcinvesting", url: "https://x.com/mvcinvesting", category: "X", group: "Giełda US", topics: ["Giełda US", "Fundamenty"], description: "Analizy spółek US, fundamenty, wyceny" },
  { name: "Agrippa Investment", handle: "Agrippa_Inv", url: "https://x.com/Agrippa_Inv", category: "X", group: "Giełda US", topics: ["Giełda US", "Makro", "Sentyment"], description: "Ogólny komentarz rynkowy US, sentyment, makro" },
  { name: "AiBreakfast", handle: "AiBreakfast", url: "https://x.com/AiBreakfast", category: "X", group: "AI / Tech", topics: ["AI", "Technologia"], description: "Daily AI news digest po polsku" },
  { name: "Anthropic", handle: "AnthropicAI", url: "https://x.com/AnthropicAI", category: "X", group: "AI / Tech", topics: ["AI", "Claude", "Bezpieczeństwo AI"], description: "Ogłoszenia Anthropic, Claude, bezpieczeństwo AI" },
  { name: "Bielik LLM", handle: "bielikllm", url: "https://x.com/bielikllm", category: "X", group: "AI / Tech", topics: ["AI", "Polskie AI"], description: "Polski LLM, polskie AI R&D" },
  { name: "Gemini App", handle: "GeminiApp", url: "https://x.com/GeminiApp", category: "X", group: "AI / Tech", topics: ["AI", "Google"], description: "Produkty Google Gemini" },
  { name: "Google", handle: "Google", url: "https://x.com/Google", category: "X", group: "AI / Tech", topics: ["AI", "Technologia"], description: "Produkty, badania, AI Google" },
  { name: "Google Labs", handle: "GoogleLabs", url: "https://x.com/GoogleLabs", category: "X", group: "AI / Tech", topics: ["AI", "R&D"], description: "Eksperymenty i innowacje Google" },
  { name: "Google Research", handle: "GoogleResearch", url: "https://x.com/GoogleResearch", category: "X", group: "AI / Tech", topics: ["AI", "R&D"], description: "Badania Google AI/ML" },
  { name: "Grok", handle: "grok", url: "https://x.com/grok", category: "X", group: "AI / Tech", topics: ["AI", "xAI"], description: "xAI / Grok updates" },
  { name: "jxmnop", handle: "jxmnop", url: "https://x.com/jxmnop", category: "X", group: "AI / Tech", topics: ["AI", "LLM", "Tooling"], description: "Insiderskie AI, modele, tooling" },
  { name: "Andrej Karpathy", handle: "karpathy", url: "https://x.com/karpathy", category: "X", group: "AI / Tech", topics: ["AI", "Deep Learning", "LLM"], description: "Głęboka technika AI, edukacja, LLM internals" },
  { name: "Remigiusz Kinas", handle: "KinasRemek", url: "https://x.com/KinasRemek", category: "X", group: "AI / Tech", topics: ["AI", "Polskie AI"], description: "Polskie AI, praktyczne zastosowania" },
  { name: "NotebookLM", handle: "NotebookLM", url: "https://x.com/NotebookLM", category: "X", group: "AI / Tech", topics: ["AI", "Produktywność"], description: "NotebookLM updates, produktywność AI" },
  { name: "Perplexity AI", handle: "perplexity_ai", url: "https://x.com/perplexity_ai", category: "X", group: "AI / Tech", topics: ["AI", "Search", "Produktywność"], description: "AI search, produktywność" },
  { name: "Seb Kondracki", handle: "SebKondracki", url: "https://x.com/SebKondracki", category: "X", group: "AI / Tech", topics: ["AI", "Polskie AI"], description: "Polskie AI, praktyczne zastosowania" },
  { name: "Hubert Walas", handle: "hubertwalas_", url: "https://x.com/hubertwalas_", category: "X", group: "Geopolityka", topics: ["Geopolityka", "Bezpieczeństwo", "Polska/Europa"], description: "Geopolityka, bezpieczeństwo, Polska/Europa" },
  // ── YouTube ──────────────────────────────────────────────────────────────
  { name: "Good Times Bad Times PL", handle: "GoodTimesBadTimesPL", url: "https://www.youtube.com/@GoodTimesBadTimesPL", category: "YT", topics: ["Geopolityka", "Stosunki między.", "Konflikty"], description: "Geopolityka, stosunki międzynarodowe, konflikty" },
  { name: "Giełda Inwestycje Trading", handle: "GiełdaInwestycjeTrading", url: "https://www.youtube.com/@GiełdaInwestycjeTrading", category: "YT", topics: ["GPW", "Analiza techniczna", "Spółki"], description: "Technikalia GPW, AT, spółki" },
  { name: "Strefa Inwestorów", handle: "StrefaInwestorow", url: "https://www.youtube.com/@StrefaInwestorow", category: "YT", topics: ["GPW", "Makro PL", "Wywiady"], description: "Wywiady, wyniki spółek GPW, makro PL" },
  { name: "Droga Inwestora", handle: "droga.inwestor", url: "https://www.youtube.com/@droga.inwestora", category: "YT", topics: ["GPW", "Portfel", "Długoterminowe"], description: "Długoterminowe inwestowanie, portfel, GPW" },
  { name: "DC-Economics", handle: "DC-Economics", url: "https://www.youtube.com/@DC-Economics", category: "YT", topics: ["Obligacje", "Makro", "Geopolityka ekonom.", "Stopy proc."], description: "Obligacje, makro, geopolityka ekonomiczna, stopy procentowe" },
  // ── Instytucje Polskie ───────────────────────────────────────────────────
  { name: "NBP", handle: "nbp", url: "https://nbp.pl", category: "Instytucja", group: "Polska", topics: ["Stopy proc.", "Inflacja", "PKB", "Waluty"], description: "Stopy procentowe, raporty o inflacji (RPP), bilans płatniczy, kursy walut, projekcje PKB" },
  { name: "GUS", handle: "gus", url: "https://new.stat.gov.pl", category: "Instytucja", group: "Polska", topics: ["CPI/PPI", "PKB", "Rynek pracy", "Sprzedaż"], description: "CPI/PPI, PKB, rynek pracy (bezrobocie, wynagrodzenia), produkcja przemysłowa, sprzedaż detaliczna" },
  { name: "KNF", handle: "knf", url: "https://www.knf.gov.pl", category: "Instytucja", group: "Polska", topics: ["Nadzór GPW", "Bankowość", "Fundusze"], description: "Nadzór nad GPW i instytucjami finansowymi, raporty sektora bankowego i ubezpieczeniowego" },
  { name: "Ministerstwo Finansów", handle: "mf", url: "https://www.gov.pl/web/finanse", category: "Instytucja", group: "Polska", topics: ["Budżet", "Dług pub.", "Obligacje skarbowe"], description: "Wykonanie budżetu (miesięcznie), dług publiczny, deficyt, emisje obligacji skarbowych" },
  // ── Instytucje Europejskie ───────────────────────────────────────────────
  { name: "Eurostat", handle: "eurostat", url: "https://ec.europa.eu/eurostat", category: "Instytucja", group: "Europa / UE", topics: ["PKB UE", "Inflacja HICP", "Rynek pracy UE"], description: "Statystyki UE: PKB, inflacja HICP, rynek pracy, handel, dług i deficyt" },
  { name: "ECB / EBC", handle: "ecb", url: "https://ecb.europa.eu", category: "Instytucja", group: "Europa / UE", topics: ["Stopy EBC", "Projekcje makro", "Stabilność fin."], description: "Decyzje o stopach EBC, projekcje makro strefy euro, statystyki monetarne EZ" },
  { name: "EBA", handle: "eba", url: "https://eba.europa.eu", category: "Instytucja", group: "Europa / UE", topics: ["Stres-testy", "Kapitał banków", "NPL"], description: "Stres-testy banków UE, raporty o kapitałach i płynności sektora bankowego" },
  // ── Instytucje USA ───────────────────────────────────────────────────────
  { name: "Federal Reserve", handle: "federalreserve", url: "https://federalreserve.gov", category: "Instytucja", group: "USA", topics: ["FOMC", "Stopy USD", "Beige Book", "Dot-plot"], description: "Decyzje FOMC o stopach, Beige Book (8×/rok), projekcje dot-plot, statystyki monetarne" },
  { name: "BLS", handle: "bls", url: "https://bls.gov", category: "Instytucja", group: "USA", topics: ["NFP", "Bezrobocie US", "CPI", "PPI"], description: "NFP (Non-Farm Payrolls), stopa bezrobocia U3/U6, CPI, PPI, indeks wynagrodzeń ECI" },
  { name: "BEA", handle: "bea", url: "https://bea.gov", category: "Instytucja", group: "USA", topics: ["PKB US", "PCE", "Dochody osob."], description: "PKB USA (advance/second/third), PCE/Core PCE (inflacja Fed), dochody i wydatki osobiste" },
  { name: "US Treasury", handle: "treasury", url: "https://home.treasury.gov", category: "Instytucja", group: "USA", topics: ["Obligacje US", "Budżet", "Dług pub."], description: "Emisje obligacji skarbowych, saldo budżetowe (MTS), dług publiczny, krzywa rentowności" },
  { name: "SEC", handle: "sec", url: "https://sec.gov", category: "Instytucja", group: "USA", topics: ["10-K/10-Q", "Insider trans.", "IPO/S-1"], description: "Raporty spółek (10-K, 10-Q, 8-K, S-1), insider transactions (Form 4), proxy statements" },
  { name: "EIA", handle: "eia", url: "https://eia.gov", category: "Instytucja", group: "USA", topics: ["Ropa", "Gaz", "Zapasy energ."], description: "Zapasy ropy i produktów (tygodniowo), produkcja ropy USA, gaz ziemny, prognozy STEO" },
  { name: "FHFA", handle: "fhfa", url: "https://fhfa.gov", category: "Instytucja", group: "USA", topics: ["Ceny domów HPI", "Hipoteki"], description: "Indeks cen domów (HPI miesięcznie/kwartalnie), nadzór nad Fannie Mae/Freddie Mac" },
  { name: "Census Bureau", handle: "census", url: "https://census.gov", category: "Instytucja", group: "USA", topics: ["Sprzedaż domów", "Dobra trwałe", "Handel"], description: "Sprzedaż domów (nowe i istniejące), zamówienia na dobra trwałe, dane demograficzne" },
];

const CATEGORY_META: Record<SourceCategory, { label: string; color: string; bg: string; icon: string }> = {
  X:          { label: "X / Twitter", color: "#c8deff", bg: "rgba(30,50,90,0.5)",  icon: "✕" },
  YT:         { label: "YouTube",     color: "#f08080", bg: "rgba(80,20,20,0.4)",  icon: "▶" },
  Instytucja: { label: "Instytucje",  color: "#90d0a0", bg: "rgba(20,60,30,0.4)",  icon: "🏛" },
};

function effectiveColor(v: number): string {
  if (v <= 0)   return "#2a3a50";
  if (v <= 0.2) return "#3a5878";
  if (v <= 0.4) return "#6a9ac8";
  if (v <= 0.7) return "#8abcf0";
  if (v <= 0.9) return "#60c080";
  return "#f0c060";
}

function globalLabel(v: number): string {
  if (v === 0)    return "Wyłączone";
  if (v <= 0.25)  return "Niska";
  if (v <= 0.5)   return "Umiarkowana";
  if (v <= 0.75)  return "Wysoka";
  return "Wyłącznie";
}

type Props = {
  trustLevel: number;
  onTrustChange: (v: number) => void;
  saving?: boolean;
};

export default function SourcesSettingsPanel({ trustLevel, onTrustChange, saving }: Props) {
  const categoriesInOrder: SourceCategory[] = ["X", "YT", "Instytucja"];

  // Collapsed state — domyślnie X rozwinięte, reszta zwinięta
  const [collapsed, setCollapsed] = useState<Set<SourceCategory>>(new Set(["YT", "Instytucja"]));

  // Indywidualne wagi źródeł (0–1, domyślnie 1.0 = pełna waga)
  const [weights, setWeights] = useState<Record<string, number>>({});

  // Załaduj wagi z localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WEIGHTS_KEY);
      if (raw) setWeights(JSON.parse(raw) as Record<string, number>);
    } catch { /* ignore */ }
  }, []);

  const setWeight = (handle: string, val: number) => {
    setWeights((prev) => {
      const next = { ...prev, [handle]: val };
      try { window.localStorage.setItem(WEIGHTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const toggleSource = (handle: string) => {
    const current = weights[handle] ?? 1;
    setWeight(handle, current > 0 ? 0 : 1);
  };

  const toggleCollapse = (cat: SourceCategory) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const getWeight = (handle: string) => weights[handle] ?? 1;
  const effective = (handle: string) => Math.round(trustLevel * getWeight(handle) * 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* ── Główny suwak zaufania ──────────────────────────────────────── */}
      <div style={{
        background: "rgba(12,20,36,0.8)", border: "1px solid rgba(80,120,180,0.22)",
        borderRadius: 14, padding: "18px 20px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#c8deff" }}>
              Główny poziom zaufania
            </div>
            <div style={{ fontSize: 9, color: "#3a5068", marginTop: 2 }}>
              Skaluje wszystkie źródła jednocześnie
            </div>
          </div>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: effectiveColor(trustLevel),
            minWidth: 90, textAlign: "right",
          }}>
            {globalLabel(trustLevel)} · {Math.round(trustLevel * 100)}%
          </span>
        </div>

        <input
          type="range" min={0} max={1} step={0.05}
          value={trustLevel}
          onChange={(e) => onTrustChange(parseFloat(e.target.value))}
          disabled={saving}
          style={{ width: "100%", accentColor: effectiveColor(trustLevel), cursor: saving ? "not-allowed" : "pointer", height: 4, marginBottom: 10 }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#3a5068", letterSpacing: "0.06em", marginBottom: 12 }}>
          <span>0 — wyłączone</span>
          <span>0.5 — preferuje</span>
          <span>1 — wyłącznie</span>
        </div>

        <div style={{ padding: "8px 12px", background: "rgba(20,35,60,0.6)", borderRadius: 8, border: "1px solid rgba(60,90,130,0.2)", fontSize: 10, color: "#6a8aaa", lineHeight: 1.6 }}>
          {trustLevel === 0 && "LLM traktuje wszystkie źródła jednakowo — swobodne szukanie."}
          {trustLevel > 0 && trustLevel < 0.5 && "LLM lekko preferuje zweryfikowane źródła, ale korzysta też z innych."}
          {trustLevel >= 0.5 && trustLevel < 1 && "LLM mocno preferuje zweryfikowane źródła przy wyszukiwaniu."}
          {trustLevel === 1 && "LLM przeszukuje WYŁĄCZNIE zweryfikowane konta X i kanały YT."}
        </div>

        {saving && <div style={{ marginTop: 8, fontSize: 9, color: "#4a6890" }}>Zapisywanie...</div>}

        {/* Statystyki aktywnych źródeł */}
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {categoriesInOrder.map((cat) => {
            const catSources = VERIFIED_SOURCES.filter((s) => s.category === cat);
            const active = catSources.filter((s) => getWeight(s.handle) > 0).length;
            const meta = CATEGORY_META[cat];
            return (
              <div key={cat} style={{
                fontSize: 9, padding: "3px 10px", borderRadius: 999,
                background: "rgba(20,35,60,0.6)", border: `1px solid ${meta.color}22`,
                color: active > 0 ? meta.color : "#3a5068",
              }}>
                {meta.icon} {active}/{catSources.length} aktywnych
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Lista źródeł z rozwijaniem ─────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {categoriesInOrder.map((cat) => {
          const meta = CATEGORY_META[cat];
          const catSources = VERIFIED_SOURCES.filter((s) => s.category === cat);
          if (catSources.length === 0) return null;
          const isOpen = !collapsed.has(cat);
          const activeCount = catSources.filter((s) => getWeight(s.handle) > 0).length;
          const avgEff = catSources.length > 0
            ? Math.round(catSources.reduce((sum, s) => sum + effective(s.handle), 0) / catSources.length)
            : 0;

          // Sub-groups
          const groups = [...new Set(catSources.map((s) => s.group ?? ""))].filter(Boolean);

          return (
            <div key={cat} style={{
              background: "rgba(12,20,36,0.6)", border: "1px solid rgba(80,120,180,0.15)",
              borderRadius: 12, overflow: "hidden",
            }}>
              {/* Header — klikalny */}
              <button
                onClick={() => toggleCollapse(cat)}
                style={{
                  width: "100%", padding: "12px 16px",
                  background: isOpen ? meta.bg : "rgba(14,24,40,0.7)",
                  border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10,
                  borderBottom: isOpen ? "1px solid rgba(80,120,180,0.12)" : "none",
                  transition: "background 0.2s",
                }}
              >
                <span style={{ fontSize: 13, opacity: 0.85 }}>{meta.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: meta.color }}>
                  {meta.label}
                </span>

                {/* Aktywne źródła indicator */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
                  <span style={{
                    fontSize: 9, padding: "2px 8px", borderRadius: 999,
                    background: activeCount > 0 ? `${meta.color}18` : "rgba(0,0,0,0.3)",
                    color: activeCount > 0 ? meta.color : "#3a5068",
                    border: `1px solid ${activeCount > 0 ? meta.color + "30" : "transparent"}`,
                  }}>
                    {activeCount}/{catSources.length} aktywnych
                  </span>
                  {trustLevel > 0 && activeCount > 0 && (
                    <span style={{ fontSize: 9, color: effectiveColor(avgEff / 100) }}>
                      ∅ {avgEff}%
                    </span>
                  )}
                </div>

                {/* Expand arrow */}
                <span style={{
                  marginLeft: "auto", fontSize: 12, color: "#4a6890",
                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                  display: "inline-block",
                }}>
                  ▾
                </span>
              </button>

              {/* Zawartość — tylko gdy rozwinięte */}
              {isOpen && (
                groups.length > 0 ? (
                  groups.map((grp) => {
                    const grpSources = catSources.filter((s) => (s.group ?? "") === grp);
                    return (
                      <div key={grp}>
                        <div style={{
                          padding: "5px 16px",
                          background: "rgba(18,30,50,0.6)",
                          borderBottom: "1px solid rgba(60,90,130,0.1)",
                          fontSize: 8, fontWeight: 700, letterSpacing: "0.12em",
                          textTransform: "uppercase", color: "#4a6a88",
                          display: "flex", alignItems: "center", gap: 8,
                        }}>
                          {grp}
                          <span style={{ color: "#2a4060", fontWeight: 400 }}>
                            — {grpSources.filter((s) => getWeight(s.handle) > 0).length}/{grpSources.length}
                          </span>
                        </div>
                        {grpSources.map((src, i) => (
                          <SourceRow
                            key={src.handle}
                            src={src}
                            meta={meta}
                            isLast={i === grpSources.length - 1}
                            weight={getWeight(src.handle)}
                            globalTrust={trustLevel}
                            onWeightChange={(v) => setWeight(src.handle, v)}
                            onToggle={() => toggleSource(src.handle)}
                          />
                        ))}
                      </div>
                    );
                  })
                ) : (
                  catSources.map((src, i) => (
                    <SourceRow
                      key={src.handle}
                      src={src}
                      meta={meta}
                      isLast={i === catSources.length - 1}
                      weight={getWeight(src.handle)}
                      globalTrust={trustLevel}
                      onWeightChange={(v) => setWeight(src.handle, v)}
                      onToggle={() => toggleSource(src.handle)}
                    />
                  ))
                )
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        padding: "10px 16px", border: "1px dashed rgba(60,90,130,0.25)",
        borderRadius: 10, textAlign: "center", fontSize: 10, color: "#2a4060", letterSpacing: "0.06em",
      }}>
        + Dodaj nowe źródło — wkrótce
      </div>
    </div>
  );
}

// ── Wiersz jednego źródła ─────────────────────────────────────────────────

function SourceRow({
  src, meta, isLast, weight, globalTrust, onWeightChange, onToggle,
}: {
  src: VerifiedSource;
  meta: { label: string; color: string; bg: string; icon: string };
  isLast: boolean;
  weight: number;
  globalTrust: number;
  onWeightChange: (v: number) => void;
  onToggle: () => void;
}) {
  const effPct = Math.round(globalTrust * weight * 100);
  const disabled = weight === 0;

  return (
    <div style={{
      padding: "12px 16px",
      borderBottom: isLast ? "none" : "1px solid rgba(60,90,130,0.1)",
      display: "flex", alignItems: "flex-start", gap: 12,
      opacity: disabled ? 0.45 : 1,
      transition: "opacity 0.2s",
    }}>
      {/* Avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
        background: disabled ? "rgba(20,30,50,0.6)" : meta.bg,
        border: `1px solid ${disabled ? "#1e2e40" : meta.color + "33"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 700, color: disabled ? "#2a3a50" : meta.color,
        transition: "all 0.2s",
      }}>
        {src.name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
          <a
            href={src.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, fontWeight: 600, color: disabled ? "#3a5068" : meta.color, textDecoration: "none" }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
          >
            {src.name}
          </a>
          {src.category === "X" && (
            <span style={{ fontSize: 9, color: "#2a4060" }}>@{src.handle}</span>
          )}
        </div>
        <div style={{ fontSize: 9, color: "#4a6890", lineHeight: 1.5, marginBottom: 5 }}>
          {src.description}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {src.topics.map((t) => (
            <span key={t} style={{
              fontSize: 8, padding: "2px 6px", borderRadius: 6,
              background: "rgba(30,50,90,0.5)", border: "1px solid rgba(60,90,130,0.2)",
              color: "#4a6a90", letterSpacing: "0.04em",
            }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Kontrolka: suwak + toggle + wskaźnik */}
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, minWidth: 88 }}>
        {/* Toggle enable/disable */}
        <button
          onClick={onToggle}
          title={disabled ? "Włącz źródło" : "Wyłącz źródło"}
          style={{
            fontSize: 8, padding: "3px 9px", borderRadius: 999, cursor: "pointer",
            background: disabled ? "rgba(20,35,60,0.5)" : `${meta.color}18`,
            border: `1px solid ${disabled ? "#1e3050" : meta.color + "40"}`,
            color: disabled ? "#2a4060" : meta.color,
            letterSpacing: "0.06em", fontWeight: 700, textTransform: "uppercase",
            transition: "all 0.15s",
          }}
        >
          {disabled ? "OFF" : "ON"}
        </button>

        {/* Indywidualny suwak wagi */}
        {!disabled && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            <input
              type="range" min={0.1} max={1} step={0.1}
              value={weight}
              onChange={(e) => onWeightChange(parseFloat(e.target.value))}
              title={`Waga: ${Math.round(weight * 100)}%`}
              style={{
                width: 80, height: 3,
                accentColor: effectiveColor(globalTrust * weight),
                cursor: "pointer",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 8, color: "#3a5068" }}>
                waga {Math.round(weight * 100)}%
              </span>
              {globalTrust > 0 && (
                <span style={{
                  fontSize: 8, fontWeight: 700,
                  color: effectiveColor(globalTrust * weight),
                }}>
                  → {effPct}%
                </span>
              )}
            </div>
          </div>
        )}

        {/* Wskaźnik efektywnego zaufania (pionowy pasek) */}
        <div style={{
          width: 5, height: 28, borderRadius: 3,
          background: "rgba(20,35,60,0.8)", border: "1px solid rgba(40,60,90,0.4)",
          position: "relative", overflow: "hidden", marginTop: 2,
        }}>
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            height: `${effPct}%`,
            background: effPct === 0 ? "transparent" : effectiveColor(effPct / 100),
            borderRadius: 3, transition: "height 0.3s, background 0.3s",
          }} />
        </div>
      </div>
    </div>
  );
}
