"use client";

import { useEffect, useState } from "react";

import type { AuthUser, UserPreference } from "../lib/types";
import styles from "./HudBriefForm.module.css";

type AuthMode = "closed" | "login" | "register" | "profile";

type AuthProfilePanelProps = {
  user: AuthUser | null;
  authMode: AuthMode;
  loading: boolean;
  error: string | null;
  preference: UserPreference | null;
  preferenceLoading: boolean;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onOpenProfile: () => void;
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
  onLogout: () => void;
  onDeleteAccount: () => Promise<void>;
  onSavePreferences: (payload: UserPreference) => Promise<void>;
};

function listToText(items: string[] | null | undefined): string {
  return (items || []).join(", ");
}

function textToList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AuthProfilePanel({
  user,
  authMode,
  loading,
  error,
  preference,
  preferenceLoading,
  onOpenLogin,
  onOpenRegister,
  onOpenProfile,
  onClose,
  onLogin,
  onRegister,
  onLogout,
  onDeleteAccount,
  onSavePreferences,
}: AuthProfilePanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [searchProfileText, setSearchProfileText] = useState(preference?.search_profile_text ?? "");
  const [responseStyle, setResponseStyle] = useState(preference?.response_style ?? "");
  const [assets, setAssets] = useState(listToText(preference?.interested_assets));
  const [regions, setRegions] = useState(listToText(preference?.interested_regions));
  const [topics, setTopics] = useState(listToText(preference?.interested_topics));
  const [notes, setNotes] = useState(preference?.notes ?? "");

  useEffect(() => {
    setSearchProfileText(preference?.search_profile_text ?? "");
    setResponseStyle(preference?.response_style ?? "");
    setAssets(listToText(preference?.interested_assets));
    setRegions(listToText(preference?.interested_regions));
    setTopics(listToText(preference?.interested_topics));
    setNotes(preference?.notes ?? "");
  }, [preference]);

  return (
    <section className={styles.authWrap}>
      <div className={styles.authTopRow}>
        {!user ? (
          <>
            <button type="button" className={styles.tinyBtn} onClick={onOpenLogin}>
              Zaloguj
            </button>
            <button type="button" className={styles.tinyBtn} onClick={onOpenRegister}>
              Zaloz konto
            </button>
          </>
        ) : (
          <>
            <span className={styles.authUserEmail}>{user.email}</span>
            <button type="button" className={styles.tinyBtn} onClick={onOpenProfile}>
              Profil
            </button>
            <button type="button" className={styles.tinyBtn} onClick={onLogout} disabled={loading}>
              Wyloguj
            </button>
          </>
        )}
      </div>

      {error ? <p className={styles.validation}>{error}</p> : null}

      {authMode === "login" ? (
        <form
          className={styles.authForm}
          onSubmit={(event) => {
            event.preventDefault();
            void onLogin(email, password);
          }}
        >
          <input className={styles.smallInput} placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input
            className={styles.smallInput}
            type="password"
            placeholder="Haslo"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <div className={styles.miniActions}>
            <button type="submit" className={styles.tinyBtn} disabled={loading}>
              {loading ? "Logowanie..." : "Zaloguj"}
            </button>
            <button type="button" className={styles.tinyBtn} onClick={onClose} disabled={loading}>
              Zamknij
            </button>
          </div>
        </form>
      ) : null}

      {authMode === "register" ? (
        <form
          className={styles.authForm}
          onSubmit={(event) => {
            event.preventDefault();
            void onRegister(email, password);
          }}
        >
          <input className={styles.smallInput} placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input
            className={styles.smallInput}
            type="password"
            placeholder="Haslo (min. 8)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <div className={styles.miniActions}>
            <button type="submit" className={styles.tinyBtn} disabled={loading}>
              {loading ? "Tworzenie..." : "Zaloz konto"}
            </button>
            <button type="button" className={styles.tinyBtn} onClick={onClose} disabled={loading}>
              Zamknij
            </button>
          </div>
        </form>
      ) : null}

      {authMode === "profile" && user ? (
        <form
          className={styles.profileForm}
          onSubmit={(event) => {
            event.preventDefault();
            void onSavePreferences({
              search_profile_text: searchProfileText || null,
              response_style: null,
              interested_assets: [],
              interested_regions: [],
              interested_topics: [],
              notes: notes || null,
            });
          }}
        >
          {preferenceLoading ? <p className={styles.helper}>Ladowanie preferencji...</p> : null}

          <p style={{ margin: "0 0 4px", fontSize: 10, color: "#4a6890", letterSpacing: "0.1em", textTransform: "uppercase" }}>Kim jestem</p>
          <textarea
            className={styles.textArea}
            placeholder="np. inwestor GPW, trader FX, analityk makro"
            value={searchProfileText}
            onChange={(event) => setSearchProfileText(event.target.value)}
            style={{ minHeight: 90 }}
          />

          <p style={{ margin: "12px 0 4px", fontSize: 10, color: "#4a6890", letterSpacing: "0.1em", textTransform: "uppercase" }}>Co mnie interesuje</p>
          <textarea
            className={styles.textArea}
            placeholder="np. GPW, energetyka, USD/PLN, Bliski Wschód, Fed"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            style={{ minHeight: 90 }}
          />

          <div className={styles.miniActions}>
            <button type="submit" className={styles.tinyBtn} disabled={loading}>
              {loading ? "Zapisywanie..." : "Zapisz"}
            </button>
            <button type="button" className={styles.tinyBtn} onClick={() => void onDeleteAccount()} disabled={loading}>
              Usun konto
            </button>
            <button type="button" className={styles.tinyBtn} onClick={onClose} disabled={loading}>
              Zamknij
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
