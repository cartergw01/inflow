"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_SUBJECT_IDS,
  SUBJECT_FAMILIES,
  SUBJECTS,
  searchSubjects,
  subjectById,
  type Subject,
  type SubjectFamily,
  type SubjectFamilyId,
  type SubjectId,
} from "../lib/subjects";
import styles from "./onboarding.module.css";

const MAX_WORLDS = 5;

const SUBJECT_GLYPHS: Record<SubjectId, string> = {
  ai: "✦",
  startups: "↗",
  software: "</>",
  cybersecurity: "◇",
  gadgets: "▯",
  world: "◎",
  taiwan: "◒",
  "us-politics": "▥",
  climate: "◌",
  markets: "⌁",
  economy: "▦",
  vc: "△",
  "personal-finance": "▣",
  media: "▷",
  film: "▰",
  music: "♫",
  books: "◫",
  space: "◒",
  health: "♡",
  science: "⌬",
  nba: "◉",
  football: "⬡",
  baseball: "◓",
  "formula-1": "∞",
};

const FAMILY_GLYPHS: Record<SubjectFamilyId, string> = {
  technology: "⌁",
  world: "◎",
  business: "↗",
  culture: "◇",
  science: "✦",
  sports: "◉",
};

type JourneyStep = "origin" | "worlds" | "launch";
type SaveIntent = "chart" | "skip" | null;

const JOURNEY_STEPS: ReadonlyArray<{ id: JourneyStep; number: string; label: string }> = [
  { id: "origin", number: "01", label: "Origin" },
  { id: "worlds", number: "02", label: "Your worlds" },
  { id: "launch", number: "03", label: "Launch" },
];

const FAMILY_INDEX = new Map(SUBJECT_FAMILIES.map((family) => [family.id, family]));
const SUBJECT_INDEX = new Map(SUBJECTS.map((subject) => [subject.id, subject]));

function familyStyle(family: SubjectFamily): CSSProperties {
  return { "--family-accent": family.accent } as CSSProperties;
}

function selectedWorldStyle(subject: Subject, index: number): CSSProperties {
  const family = FAMILY_INDEX.get(subject.familyId);
  return {
    "--world-accent": family?.accent ?? "#8ba2ff",
    "--world-index": index,
  } as CSSProperties;
}

/** Ordered selection keeps the user's first-to-last world sequence intact. */
export function updateWorldSelection(
  selected: readonly SubjectId[],
  subjectId: SubjectId,
): { selection: SubjectId[]; atLimit: boolean } {
  if (selected.includes(subjectId)) {
    return { selection: selected.filter((id) => id !== subjectId), atLimit: false };
  }
  if (selected.length >= MAX_WORLDS) {
    return { selection: [...selected], atLimit: true };
  }
  return { selection: [...selected, subjectId], atLimit: false };
}

function JourneyHeader({
  step,
  query,
  onQueryChange,
}: {
  step: JourneyStep;
  query?: string;
  onQueryChange?: (value: string) => void;
}) {
  const searchId = useId();
  const activeIndex = JOURNEY_STEPS.findIndex((candidate) => candidate.id === step);

  return (
    <header className={styles.journeyHeader}>
      <div className={styles.brand} aria-label="InFlow">
        <span className={styles.brandMark} aria-hidden="true">
          <span />
        </span>
        <strong>InFlow</strong>
      </div>

      <nav className={styles.progress} aria-label="Onboarding progress">
        <svg className={styles.progressPath} viewBox="0 0 520 28" preserveAspectRatio="none" aria-hidden="true">
          <path d="M16 14 C92 14 93 23 174 14 S257 5 338 14 S424 24 504 14" />
        </svg>
        <ol>
          {JOURNEY_STEPS.map((item, index) => (
            <li
              key={item.id}
              data-state={index < activeIndex ? "complete" : index === activeIndex ? "current" : "upcoming"}
              aria-current={item.id === step ? "step" : undefined}
            >
              <span className={styles.progressDot} aria-hidden="true" />
              <span className={styles.progressNumber}>{item.number}</span>
              <span className={styles.progressLabel}>{item.label}</span>
            </li>
          ))}
        </ol>
      </nav>

      {onQueryChange ? (
        <div className={styles.searchBox}>
          <label className={styles.srOnly} htmlFor={searchId}>Find a subject</label>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="5.75" />
            <path d="m15 15 4 4" />
          </svg>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Find a subject"
            autoComplete="off"
          />
        </div>
      ) : (
        <span className={styles.headerBalance} aria-hidden="true" />
      )}
    </header>
  );
}

function Origin({ onBegin }: { onBegin: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className={styles.stepFrame} data-view="origin">
      <JourneyHeader step="origin" />
      <section className={styles.origin} aria-labelledby="origin-title">
        <div className={styles.originCopy}>
          <p className={styles.eyebrow}>A quieter way through the noise</p>
          <h1 id="origin-title" ref={headingRef} tabIndex={-1}>Your world, in flow.</h1>
          <p>A calmer way to stay informed—built around what matters to you.</p>
        </div>

        <div className={styles.originSystem} aria-hidden="true">
          <span className={styles.orbitRing} />
          <span className={styles.orbitRing} />
          <span className={styles.orbitRing} />
          <span className={styles.orbitRing} />
          <span className={styles.orbitRing} />
          <span className={styles.orbitRing} />
          <span className={styles.originSun}><i /></span>
          <span className={styles.orbitPlanet} />
          <span className={styles.orbitPlanet} />
          <span className={styles.orbitPlanet} />
        </div>

        <button type="button" className={styles.primaryButton} onClick={onBegin}>
          <span>Begin the journey</span>
          <span className={styles.buttonArrow} aria-hidden="true">→</span>
        </button>
      </section>
    </div>
  );
}

function SubjectOption({
  subject,
  selected,
  order,
  atCapacity,
  busy,
  onToggle,
}: {
  subject: Subject;
  selected: boolean;
  order: number;
  atCapacity: boolean;
  busy: boolean;
  onToggle: (id: SubjectId) => void;
}) {
  const suffix = selected
    ? `, selected as world ${order}`
    : atCapacity
      ? ", not selected; remove a world before adding this one"
      : ", not selected";

  return (
    <li>
      <button
        type="button"
        className={styles.subjectOption}
        data-selected={selected}
        data-at-capacity={atCapacity && !selected}
        aria-pressed={selected}
        aria-label={`${subject.label}${suffix}`}
        disabled={busy}
        onClick={() => onToggle(subject.id)}
      >
        <span className={styles.subjectGlyph} aria-hidden="true">{SUBJECT_GLYPHS[subject.id]}</span>
        <span className={styles.subjectLabel}>{subject.label}</span>
        <span className={styles.selectionMark} aria-hidden="true">{selected ? order : ""}</span>
      </button>
    </li>
  );
}

function FamilyCluster({
  family,
  subjects,
  selected,
  busy,
  open,
  forcedOpen,
  onOpenChange,
  onToggle,
}: {
  family: SubjectFamily;
  subjects: Subject[];
  selected: readonly SubjectId[];
  busy: boolean;
  open: boolean;
  forcedOpen: boolean;
  onOpenChange: () => void;
  onToggle: (id: SubjectId) => void;
}) {
  const regionId = useId();
  const selectedInFamily = family.subjectIds.filter((subjectId) => selected.includes(subjectId)).length;
  const expanded = forcedOpen || open;

  return (
    <section
      className={styles.familyCluster}
      data-family={family.id}
      data-open={expanded}
      data-selected={selectedInFamily > 0}
      style={familyStyle(family)}
      aria-labelledby={`${regionId}-title`}
    >
      <h2 id={`${regionId}-title`} className={styles.familyTitle}>
        <span aria-hidden="true">{FAMILY_GLYPHS[family.id]}</span>
        {family.label}
      </h2>
      <button
        type="button"
        className={styles.familyToggle}
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={onOpenChange}
      >
        <span>
          <i aria-hidden="true">{FAMILY_GLYPHS[family.id]}</i>
          {family.label}
        </span>
        <small>{selectedInFamily} selected</small>
        <b aria-hidden="true">⌄</b>
      </button>
      <ul id={regionId} className={styles.subjectList}>
        {subjects.map((subject) => {
          const order = selected.indexOf(subject.id) + 1;
          return (
            <SubjectOption
              key={subject.id}
              subject={subject}
              selected={order > 0}
              order={order}
              atCapacity={selected.length >= MAX_WORLDS}
              busy={busy}
              onToggle={onToggle}
            />
          );
        })}
      </ul>
    </section>
  );
}

function SelectionPaths({ selected }: { selected: readonly SubjectId[] }) {
  const activeFamilies = new Set(
    selected
      .map((id) => SUBJECT_INDEX.get(id)?.familyId)
      .filter((id): id is SubjectFamilyId => Boolean(id)),
  );

  return (
    <svg className={styles.selectionPaths} viewBox="0 0 1200 650" preserveAspectRatio="none" aria-hidden="true">
      <path className={styles.basePath} d="M600 354 C440 342 400 154 188 142" />
      <path data-active={activeFamilies.has("technology")} data-family="technology" d="M600 354 C440 342 400 154 188 142" />
      <path className={styles.basePath} d="M600 354 C555 318 552 166 585 133" />
      <path data-active={activeFamilies.has("world")} data-family="world" d="M600 354 C555 318 552 166 585 133" />
      <path className={styles.basePath} d="M600 354 C752 325 792 150 1011 159" />
      <path data-active={activeFamilies.has("business")} data-family="business" d="M600 354 C752 325 792 150 1011 159" />
      <path className={styles.basePath} d="M600 354 C433 395 392 520 188 520" />
      <path data-active={activeFamilies.has("culture")} data-family="culture" d="M600 354 C433 395 392 520 188 520" />
      <path className={styles.basePath} d="M600 354 C580 418 556 498 586 535" />
      <path data-active={activeFamilies.has("science")} data-family="science" d="M600 354 C580 418 556 498 586 535" />
      <path className={styles.basePath} d="M600 354 C750 393 799 504 1018 508" />
      <path data-active={activeFamilies.has("sports")} data-family="sports" d="M600 354 C750 393 799 504 1018 508" />
    </svg>
  );
}

function Worlds({
  selected,
  query,
  openFamily,
  busy,
  error,
  status,
  onQueryChange,
  onFamilyOpen,
  onToggle,
  onBack,
  onChart,
  onSkip,
}: {
  selected: readonly SubjectId[];
  query: string;
  openFamily: SubjectFamilyId | null;
  busy: SaveIntent;
  error: string | null;
  status: string;
  onQueryChange: (value: string) => void;
  onFamilyOpen: (family: SubjectFamilyId) => void;
  onToggle: (id: SubjectId) => void;
  onBack: () => void;
  onChart: () => void;
  onSkip: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const matches = useMemo(() => searchSubjects(query), [query]);
  const matchIds = useMemo(() => new Set(matches.map((subject) => subject.id)), [matches]);
  const visibleFamilies = SUBJECT_FAMILIES.map((family) => ({
    family,
    subjects: family.subjectIds
      .map((id) => SUBJECT_INDEX.get(id))
      .filter((subject): subject is Subject => subject !== undefined)
      .filter((subject) => matchIds.has(subject.id)),
  })).filter(({ subjects }) => subjects.length > 0);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className={styles.stepFrame} data-view="worlds">
      <JourneyHeader step="worlds" query={query} onQueryChange={onQueryChange} />
      <section className={styles.worlds} aria-labelledby="worlds-title">
        <header className={styles.worldsIntro}>
          <button type="button" className={styles.backButton} onClick={onBack}>← Back</button>
          <p className={styles.eyebrow}>Map your attention</p>
          <h1 id="worlds-title" ref={headingRef} tabIndex={-1}>What pulls you in?</h1>
          <p>Choose the subjects you want in orbit. InFlow will learn and reshape your universe as you read.</p>
        </header>

        <div className={styles.mobileSearch}>
          <label htmlFor="mobile-subject-search">
            <span className={styles.srOnly}>Find a subject</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="5.75" />
              <path d="m15 15 4 4" />
            </svg>
            <input
              id="mobile-subject-search"
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Find a subject"
              autoComplete="off"
            />
          </label>
        </div>

        <div className={styles.constellation} data-filtering={query.trim().length > 0}>
          <SelectionPaths selected={selected} />
          <span className={styles.chartSun} aria-hidden="true"><i /></span>
          {visibleFamilies.map(({ family, subjects }) => (
            <FamilyCluster
              key={family.id}
              family={family}
              subjects={subjects}
              selected={selected}
              busy={busy !== null}
              open={openFamily === family.id}
              forcedOpen={query.trim().length > 0}
              onOpenChange={() => onFamilyOpen(family.id)}
              onToggle={onToggle}
            />
          ))}
          {visibleFamilies.length === 0 ? (
            <div className={styles.noResults}>
              <strong>No signal found</strong>
              <p>Try a broader subject, like “science,” “money,” or “music.”</p>
              <button type="button" onClick={() => onQueryChange("")}>Clear search</button>
            </div>
          ) : null}
        </div>

        <div className={styles.selectionStatus} aria-live="polite" aria-atomic="true">
          <span aria-hidden="true" />
          <strong>{selected.length} {selected.length === 1 ? "world" : "worlds"} selected</strong>
          <small>{status}</small>
        </div>

        {error ? (
          <div className={styles.errorMessage} role="alert">
            <span aria-hidden="true">!</span>
            <p>{error}</p>
          </div>
        ) : null}

        <footer className={styles.pickerActions}>
          <div className={styles.mobileCount} aria-hidden="true">
            <span />
            {selected.length}/{MAX_WORLDS}
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onChart}
            disabled={busy !== null || selected.length === 0}
          >
            <span>{busy === "chart" ? "Charting your universe…" : "Chart my universe"}</span>
            <span className={styles.buttonArrow} aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            className={styles.skipButton}
            onClick={onSkip}
            disabled={busy !== null}
          >
            {busy === "skip" ? "Saving…" : "Skip for now"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function Launch({ selected, onEnter, onEdit }: {
  selected: readonly SubjectId[];
  onEnter: () => void;
  onEdit: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const subjects = selected
    .map((id) => subjectById(id))
    .filter((subject): subject is Subject => Boolean(subject));

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className={styles.stepFrame} data-view="launch">
      <JourneyHeader step="launch" />
      <section className={styles.launch} aria-labelledby="launch-title">
        <header className={styles.launchCopy}>
          <p className={styles.eyebrow}>Coordinates locked</p>
          <h1 id="launch-title" ref={headingRef} tabIndex={-1}>Your universe is taking shape.</h1>
          <p>
            {subjects.length} {subjects.length === 1 ? "world" : "worlds"}, one evolving news universe—ready to move with you.
          </p>
        </header>

        <div className={styles.launchSystem} aria-hidden="true">
          <span className={styles.launchOrbit} />
          <span className={styles.launchOrbit} />
          <span className={styles.launchCore}><i /></span>
          {subjects.map((subject, index) => (
            <span
              key={subject.id}
              className={`${styles.miniWorld} ${styles[`miniWorld${index + 1}`]}`}
              style={selectedWorldStyle(subject, index)}
            >
              <i>{SUBJECT_GLYPHS[subject.id]}</i>
              <b>{subject.label}</b>
            </span>
          ))}
        </div>

        <ul className={styles.launchWorldList} aria-label="Your selected worlds">
          {subjects.map((subject, index) => (
            <li key={subject.id} style={selectedWorldStyle(subject, index)}>
              <span aria-hidden="true" />
              {subject.label}
            </li>
          ))}
        </ul>

        <div className={styles.launchActions}>
          <button type="button" className={styles.primaryButton} onClick={onEnter}>
            <span>Explore my universe</span>
            <span className={styles.buttonArrow} aria-hidden="true">→</span>
          </button>
          <button type="button" className={styles.editButton} onClick={onEdit}>Edit my worlds</button>
        </div>
      </section>
    </div>
  );
}

export function Onboarding({ nextPath = "/universe" }: { nextPath?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<JourneyStep>("origin");
  const [selected, setSelected] = useState<SubjectId[]>(() => [...DEFAULT_SUBJECT_IDS]);
  const [saved, setSaved] = useState<SubjectId[]>(() => [...DEFAULT_SUBJECT_IDS]);
  const [query, setQuery] = useState("");
  const [openFamily, setOpenFamily] = useState<SubjectFamilyId | null>("technology");
  const [busy, setBusy] = useState<SaveIntent>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Choose up to five worlds.");

  const toggleSubject = (subjectId: SubjectId) => {
    setError(null);
    const { selection, atLimit } = updateWorldSelection(selected, subjectId);
    const subject = subjectById(subjectId);
    if (atLimit) {
      setStatus("Five is the limit. Remove a world before adding another.");
    } else if (selection.includes(subjectId)) {
      setStatus(`${subject?.label ?? "World"} added as world ${selection.length}.`);
    } else {
      setStatus(`${subject?.label ?? "World"} removed. ${selection.length} ${selection.length === 1 ? "world remains" : "worlds remain"}.`);
    }
    setSelected(selection);
  };

  const persist = async (interests: readonly SubjectId[], intent: Exclude<SaveIntent, null>) => {
    setBusy(intent);
    setError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interests }),
      });
      const payload = await response.json().catch(() => null) as
        | { ok?: boolean; interests?: SubjectId[]; error?: { message?: string } }
        | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message || "Your worlds could not be saved.");
      }
      const persisted = Array.isArray(payload.interests) && payload.interests.length > 0
        ? payload.interests
        : [...interests];
      setSaved(persisted);
      setSelected(persisted);
      setStep("launch");
    } catch (caught) {
      const detail = caught instanceof Error && caught.message !== "Failed to fetch"
        ? caught.message
        : "We couldn't reach InFlow.";
      setError(`${detail} Your choices are still here—try again.`);
    } finally {
      setBusy(null);
    }
  };

  if (step === "origin") {
    return (
      <main className={styles.shell}>
        <Origin onBegin={() => setStep("worlds")} />
      </main>
    );
  }

  if (step === "launch") {
    return (
      <main className={styles.shell}>
        <Launch
          selected={saved}
          onEnter={() => {
            router.replace(nextPath);
            router.refresh();
          }}
          onEdit={() => setStep("worlds")}
        />
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <Worlds
        selected={selected}
        query={query}
        openFamily={openFamily}
        busy={busy}
        error={error}
        status={status}
        onQueryChange={setQuery}
        onFamilyOpen={(family) => setOpenFamily((current) => current === family ? null : family)}
        onToggle={toggleSubject}
        onBack={() => setStep("origin")}
        onChart={() => void persist(selected, "chart")}
        onSkip={() => void persist(DEFAULT_SUBJECT_IDS, "skip")}
      />
    </main>
  );
}
