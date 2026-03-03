type LoadingStateProps = {
  isMultiRegion?: boolean;
};

export default function LoadingState({ isMultiRegion = false }: LoadingStateProps) {
  return (
    <section
      aria-live="polite"
      style={{
        padding: "20px 24px",
        borderRadius: 16,
        border: "1px solid #d6dde8",
        background: "linear-gradient(135deg, #fffdf8 0%, #f3f7ff 100%)",
        color: "#17324d",
      }}
    >
      <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
        {isMultiRegion ? "Pobieram newsy z wielu regionow..." : "Pobieram newsy..."}
      </p>
      <p style={{ margin: "8px 0 0", color: "#4d6278" }}>
        {isMultiRegion
          ? "To trwa dluzej, bo backend zbiera i laczy wiele strumieni newsowych."
          : "Zbieram publikacje, oceniam ich waznosc i skladam finalne podsumowanie."}
      </p>
    </section>
  );
}
