import { createContext, useContext, type ReactNode } from "react";
import {
  AirVent,
  BookOpen,
  Building2,
  Camera,
  Check,
  ChevronRight,
  CalendarDays,
  ClipboardCheck,
  Cloud,
  Factory,
  FileText,
  Flag,
  Fuel,
  GraduationCap,
  Handshake,
  HardHat,
  Home,
  KeyRound,
  Leaf,
  PenLine,
  Pickaxe,
  PhoneCall,
  Rocket,
  Route,
  Search,
  Smartphone,
  Sun,
  Table2,
  Target,
  Truck,
  Users,
  Workflow,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { HandoffValue } from "@/lib/sales-handoff";
import { cn } from "@/lib/utils";
import type { HomeworkKey, WelcomeView } from "@/lib/welcome";

/**
 * The welcome page's shared presentation primitives: the icon lookup, the
 * edit-in-place `<T>`, and the Frame/Tile/Tick/PhoneMock building blocks
 * every screen — Plan or Kickoff — is built from. Pulled out of
 * welcome-page.tsx so the Kickoff composition (kickoff-view.tsx) can reuse
 * them without a circular import between the two leaf files.
 */

export type WelcomeMode = "internal" | "shared";

export type ScreenArgs = {
  page: number;
  qr: { url: string; dataUrl: string } | null;
  mode: WelcomeMode;
  onTick: ((key: HomeworkKey, done: boolean) => Promise<void> | void) | undefined;
  /** The customer answers (or confirms) one of the handoff's questions. */
  onAnswer: ((key: string, value: HandoffValue) => Promise<void> | void) | undefined;
  /** The customer hands the ball back on a solution they tested. */
  onBall: ((solutionId: string) => Promise<void> | void) | undefined;
  icsBase: string | null;
};
export type Screen = { key: string; label: string; render: (a: ScreenArgs) => ReactNode };

/**
 * EDIT IN PLACE. Every line of copy on the page is a <T> with a key. Internal
 * mode, not presenting: click it, type, click away — the new words save on
 * the deal and the customer's link, the PDF and the PowerPoint all show
 * them. Escape while editing puts the page's own words back. Anywhere else
 * a <T> is plain text, so the layout is the same pixels in every mode.
 */
export const EditCtx = createContext<{
  overrides: Record<string, string>;
  onEdit: ((key: string, text: string | null) => Promise<void> | void) | null;
}>({ overrides: {}, onEdit: null });

export function T({ k, children }: { k: string; children: string }) {
  const { overrides, onEdit } = useContext(EditCtx);
  const edited = k in overrides;
  const text = overrides[k] ?? children;
  if (!onEdit) return <>{text}</>;
  return (
    <span
      className="wp-edit"
      data-edited={edited || undefined}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      title={edited ? "Edited — Esc puts the original back" : "Click to edit"}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.currentTarget.textContent = children;
          e.currentTarget.blur();
          if (edited) void onEdit(k, null);
        }
      }}
      onBlur={(e) => {
        const next = (e.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim();
        if (next === text) return;
        void onEdit(k, next === "" || next === children ? null : next);
      }}
    >
      {text}
    </span>
  );
}

/** A key that survives a rename of the thing it names: "Dana Whitfield" → "dana-whitfield". */
export function tkey(...parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== "")
    .map((p) =>
      String(p)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    )
    .join(".");
}

const ICONS: Record<string, LucideIcon> = {
  HardHat,
  Fuel,
  Zap,
  Sun,
  Leaf,
  Building2,
  AirVent,
  Home,
  Pickaxe,
  Route,
  Wrench,
  Factory,
  Truck,
  KeyRound,
  ClipboardCheck,
  Flag,
  PhoneCall,
  Target,
  Rocket,
  Users,
  Smartphone,
  Workflow,
  BookOpen,
  FileText,
  Table2,
  Cloud,
  CalendarDays,
  GraduationCap,
  Search,
  Handshake,
};

export function Icon({
  name,
  className,
  strokeWidth = 1.75,
}: {
  name: string;
  className?: string;
  strokeWidth?: number;
}) {
  const C = ICONS[name] ?? ClipboardCheck;
  return <C className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}

export function Frame({
  children,
  k,
  eyebrow,
  title,
  accent,
  lede,
  band,
  bandIcon,
  page,
  dark,
  done,
}: {
  children: ReactNode;
  /** The screen's key: the prefix of every editable line on it. */
  k: string;
  eyebrow: string;
  /** The headline. `accent` is the run rendered in blue. */
  title: string;
  accent?: string;
  lede?: string;
  band?: string;
  bandIcon?: string;
  page: number;
  dark?: boolean;
  /** This phase is behind us: the screen greys and says so. */
  done?: boolean;
}) {
  return (
    <section className={cn("wp-screen", dark && "is-dark", done && "is-past")}>
      <div className="wp-blob" />
      <div className="wp-dots" />
      {done ? (
        <span className="wp-past-chip">
          <Check className="h-3 w-3" strokeWidth={3} /> Completed
        </span>
      ) : null}
      <header className="wp-head">
        <img
          src={
            dark ? "/branding/gocanvas-wordmark-white.png" : "/branding/gocanvas-wordmark-navy.png"
          }
          alt="GoCanvas"
          className="wp-logo"
        />
      </header>
      <div className="wp-body">
        <p className="wp-eyebrow">
          <T k={`${k}.eyebrow`}>{eyebrow}</T>
        </p>
        <h2 className="wp-title">
          <T k={`${k}.title`}>{title}</T>{" "}
          {accent ? (
            <span className="wp-accent">
              <T k={`${k}.accent`}>{accent}</T>
            </span>
          ) : null}
        </h2>
        <div className="wp-rule" />
        {lede ? (
          <p className="wp-lede">
            <T k={`${k}.lede`}>{lede}</T>
          </p>
        ) : null}
        <div className="wp-content">{children}</div>
      </div>
      {band ? (
        <div className="wp-band">
          {bandIcon ? (
            <span className="wp-band-icon">
              <Icon name={bandIcon} className="h-5 w-5" />
            </span>
          ) : null}
          <p>
            <T k={`${k}.band`}>{band}</T>
          </p>
        </div>
      ) : null}
      <footer className="wp-foot">
        <span>gocanvas.com</span>
        <span>{String(page).padStart(2, "0")}</span>
      </footer>
      <div className="wp-stripe">
        <i />
        <i />
        <i />
      </div>
    </section>
  );
}

export function Tile({
  name,
  size = "md",
  tone = "light",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  tone?: "light" | "blue" | "navy";
}) {
  return (
    <span className={cn("wp-tile", `is-${size}`, `is-${tone}`)}>
      <Icon name={name} className="wp-tile-icon" />
    </span>
  );
}

export function Tick({ k, children }: { k?: string; children: ReactNode }) {
  return (
    <li className="wp-tick">
      <span className="wp-tick-dot">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      <span>{k && typeof children === "string" ? <T k={k}>{children}</T> : children}</span>
    </li>
  );
}

/* ------------------------------------------------------ the phone mock */

/**
 * The customer's first form, on a phone, drawn in CSS. The reference deck's
 * strongest element is a device with a form in it; this one shows THEIR
 * form name with fields their industry recognises, so the cover says
 * "this is yours" before a word is read.
 */
type FieldKind = "text" | "select" | "photo" | "sign";
const FIELDS: Record<string, Array<[string, FieldKind]>> = {
  "oil & gas": [
    ["Well / lease", "select"],
    ["Load volume (bbl)", "text"],
    ["Driver", "select"],
    ["Ticket photo", "photo"],
    ["Customer signature", "sign"],
  ],
  construction: [
    ["Project", "select"],
    ["Crew on site", "text"],
    ["Hazards identified", "text"],
    ["Site photos", "photo"],
    ["Foreman signature", "sign"],
  ],
  utilities: [
    ["Asset / pole ID", "text"],
    ["Condition", "select"],
    ["Reading", "text"],
    ["Photo", "photo"],
    ["Technician signature", "sign"],
  ],
  hvac: [
    ["Customer", "select"],
    ["Unit / model", "text"],
    ["Work performed", "text"],
    ["Before / after photos", "photo"],
    ["Customer signature", "sign"],
  ],
  roofing: [
    ["Property", "select"],
    ["Roof condition", "select"],
    ["Measurements", "text"],
    ["Photos", "photo"],
    ["Homeowner signature", "sign"],
  ],
  "field service": [
    ["Customer", "select"],
    ["Job type", "select"],
    ["Parts used", "text"],
    ["Photo of work", "photo"],
    ["Customer signature", "sign"],
  ],
  manufacturing: [
    ["Line / station", "select"],
    ["Checklist", "select"],
    ["Defects found", "text"],
    ["Photo", "photo"],
    ["Inspector signature", "sign"],
  ],
  logistics: [
    ["Vehicle", "select"],
    ["Route / stop", "text"],
    ["Condition check", "select"],
    ["Photo", "photo"],
    ["Driver signature", "sign"],
  ],
};
const DEFAULT_FIELDS: Array<[string, FieldKind]> = [
  ["Customer / site", "select"],
  ["Job details", "text"],
  ["Status", "select"],
  ["Photos", "photo"],
  ["Signature", "sign"],
];

export function PhoneMock({ view, className }: { view: WelcomeView; className?: string }) {
  const fields = FIELDS[(view.industry ?? "").trim().toLowerCase()] ?? DEFAULT_FIELDS;
  const title = view.firstForm?.name ?? "Your first form";
  return (
    <div className={cn("wp-phone", className)}>
      <div className="wp-phone-screen">
        <div className="wp-phone-top">
          <img src="/branding/gocanvas-wordmark-white.png" alt="" />
          <span>{view.clientName.split(" ").slice(0, 2).join(" ")}</span>
        </div>
        <div className="wp-phone-title">{title}</div>
        <ul className="wp-phone-fields">
          {fields.map(([label, kind]) => (
            <li key={label} className={cn("wp-field", `is-${kind}`)}>
              <span className="wp-field-label">{label}</span>
              {kind === "text" ? <span className="wp-field-line" /> : null}
              {kind === "select" ? (
                <span className="wp-field-select">
                  <span className="wp-field-line" />
                  <ChevronRight className="h-3 w-3" />
                </span>
              ) : null}
              {kind === "photo" ? (
                <span className="wp-field-photo">
                  <Camera className="h-4 w-4" />
                  <i />
                  <i />
                </span>
              ) : null}
              {kind === "sign" ? (
                <span className="wp-field-sign">
                  <svg viewBox="0 0 120 28" aria-hidden="true">
                    <path
                      d="M4 20c10-18 16-14 20-4s8 10 16-2 12-10 18 0 10 8 18-4 12-6 20 2 10 6 18-2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  <PenLine className="h-3 w-3" />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="wp-phone-submit">Submit</div>
      </div>
    </div>
  );
}
