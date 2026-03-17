"use client";

import styles from "./HudBriefForm.module.css";

type AnalysisPanelProps = {
  mainQuestion: string;
  disabled?: boolean;
  validationMessage: string | null;
  onMainQuestionChange: (value: string) => void;
};

export default function AnalysisPanel({
  mainQuestion,
  disabled = false,
  validationMessage,
  onMainQuestionChange,
}: AnalysisPanelProps) {
  return (
    <section className={styles.analysisWrap}>
      <h2 className={styles.analysisTitle}>Pytanie strategiczne</h2>
      <textarea
        className={styles.textArea}
        value={mainQuestion}
        onChange={(event) => onMainQuestionChange(event.target.value)}
        disabled={disabled}
        placeholder={
          "Wpisz glowne pytanie, ktore brief ma przeanalizowac.\n\nNp. jak obecna sytuacja geopolityczna wplywa na WIG, GPW i spolki energetyczne?"
        }
      />
      {validationMessage ? (
        <p className={styles.validation}>{validationMessage}</p>
      ) : (
        <p className={styles.helper}>
          Najwyzszy priorytet ma wpisane pytanie. Jesli zostawisz je puste, brief uzyje Twojego profilu.
        </p>
      )}
    </section>
  );
}
