"use client";

import ContinentMap, { type ContinentKey } from "./ContinentMap";
import styles from "./HudBriefForm.module.css";

type RegionOption = {
  key: ContinentKey;
  label: string;
};

type AnalysisPanelProps = {
  regionOptions: RegionOption[];
  selectedRegions: ContinentKey[];
  mainQuestion: string;
  disabled?: boolean;
  validationMessage: string | null;
  onToggleRegion: (region: ContinentKey) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onMainQuestionChange: (value: string) => void;
};

export default function AnalysisPanel({
  regionOptions,
  selectedRegions,
  mainQuestion,
  disabled = false,
  validationMessage,
  onToggleRegion,
  onSelectAll,
  onClearAll,
  onMainQuestionChange,
}: AnalysisPanelProps) {
  return (
    <section className={styles.analysisWrap}>
      <h2 className={styles.analysisTitle}>Obszary analizy / Pytanie strategiczne</h2>
      <div className={styles.analysisGrid}>
        <div className={styles.leftPanel}>
          <h3 className={styles.regionTitle}>Regiony analizy</h3>
          <ContinentMap selected={selectedRegions} onToggle={onToggleRegion} disabled={disabled} />
          <div className={styles.chipsWrap}>
            {selectedRegions.length ? (
              selectedRegions.map((region) => {
                const label = regionOptions.find((item) => item.key === region)?.label || region;
                return (
                  <button
                    key={region}
                    type="button"
                    className={styles.chip}
                    onClick={() => onToggleRegion(region)}
                    disabled={disabled}
                  >
                    {label}
                  </button>
                );
              })
            ) : (
              <span className={styles.helper}>Brak wybranych regionow.</span>
            )}
          </div>
          <div className={styles.miniActions}>
            <button type="button" className={styles.tinyBtn} onClick={onSelectAll} disabled={disabled}>
              Zaznacz wszystko
            </button>
            <button type="button" className={styles.tinyBtn} onClick={onClearAll} disabled={disabled}>
              Odznacz wszystko
            </button>
          </div>
        </div>
        <div className={styles.rightPanel}>
          <h3 className={styles.regionTitle}>Pytanie strategiczne</h3>
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
              Najwyzszy priorytet ma wpisane pytanie. Jesli zostawisz je puste, brief uzyje Twojego profilu i wybranych regionow.
            </p>
          )}
          <p className={styles.helper}>Priorytet: pytanie {"->"} profil {"->"} regiony</p>
        </div>
      </div>
    </section>
  );
}
