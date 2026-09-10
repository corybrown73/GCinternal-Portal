import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AirVent,
  ArrowLeft,
  Building2,
  Camera,
  ChevronRight,
  Cloud,
  FileText,
  PenLine,
  Table2,
  Check,
  ClipboardCheck,
  Copy,
  Download,
  Factory,
  Flag,
  Fuel,
  HardHat,
  Home,
  KeyRound,
  Leaf,
  Link2,
  Pickaxe,
  PhoneCall,
  Play,
  Printer,
  Rocket,
  Route,
  Smartphone,
  Sun,
  Target,
  Truck,
  Users,
  Workflow,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { daysToValue, shortDay } from "@/lib/onboarding-timeline";
import { HOMEWORK_KEYS, type HomeworkKey, type WelcomeView } from "@/lib/welcome";
import { cn } from "@/lib/utils";

/**
 * The welcome page: six screens, one source.
 *
 * DESIGNED AT 1280×720 AND SCALED. Every screen is laid out on a fixed
 * stage and the stage is zoomed to fit whatever is looking at it: the
 * portal's preview, the customer's browser, a projector in present mode,
 * and the print dialog at exactly 1:1 on a 13.33in × 7.5in page. That is
 * why the PDF and the presentation are the same pixels — there is no second
 * layout to drift.
 *
 * THE LOOK is the reference deck the team already likes: white ground, a
 * soft blue field in one corner, a dotted pattern, a heavy headline with one
 * word in blue and a short orange rule, icons in white tiles, cards with a
 * blue-tinted hairline, a navy band for the one line to remember, and the
 * three-colour stripe at the foot.
 */

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
};

function Icon({
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

export type WelcomeMode = "internal" | "shared";

export function WelcomePage({
  view,
  mode,
  onTick,
  onCopyLink,
  onDownloadPptx,
  backHref,
}: {
  view: WelcomeView;
  mode: WelcomeMode;
  /** The customer's page ticks its homework; the internal preview shows the ticks. */
  onTick?: (key: HomeworkKey, done: boolean) => Promise<void> | void;
  /** Internal: issue or copy the customer's link. Resolves to the URL. */
  onCopyLink?: () => Promise<string>;
  /** Internal: render the PowerPoint fallback and open it. */
  onDownloadPptx?: () => Promise<void>;
  backHref?: string | null;
}) {
  const [present, setPresent] = useState(false);
  const [at, setAt] = useState(0);
  const total = 6;

  // Present mode: arrow keys, space, escape. Click advances.
  useEffect(() => {
    if (!present) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPresent(false);
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        setAt((i) => Math.min(total - 1, i + 1));
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setAt((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("gc-presenting");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("gc-presenting");
    };
  }, [present]);

  const screens = [
    <Cover key="cover" view={view} />,
    <Team key="team" view={view} />,
    <Plan key="plan" view={view} />,
    <Together key="together" view={view} mode={mode} onTick={onTick} />,
    <FirstForm key="form" view={view} />,
    <Business key="business" view={view} />,
  ];

  return (
    <div className={cn("gc-welcome", present && "is-present")}>
      {mode === "internal" ? (
        <Toolbar
          view={view}
          onPresent={() => {
            setAt(0);
            setPresent(true);
          }}
          onCopyLink={onCopyLink}
          onDownloadPptx={onDownloadPptx}
          backHref={backHref ?? null}
        />
      ) : null}
      {mode === "shared" ? <SharedBar view={view} /> : null}

      {present ? (
        <div className="wp-present" onClick={() => setAt((i) => Math.min(total - 1, i + 1))}>
          <Stage fit="both">{screens[at]}</Stage>
          <div className="wp-present-hud" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setAt((i) => Math.max(0, i - 1))}
              aria-label="Previous"
            >
              ‹
            </button>
            <span>
              {at + 1} / {total}
            </span>
            <button
              type="button"
              onClick={() => setAt((i) => Math.min(total - 1, i + 1))}
              aria-label="Next"
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => setPresent(false)}
              aria-label="Exit"
              className="wp-hud-x"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="wp-scroll">
          {screens.map((s, i) => (
            <Stage key={i} fit="width">
              {s}
            </Stage>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ the stage */

const STAGE_W = 1280;
const STAGE_H = 720;

/** A 1280×720 box zoomed to fit its container. Print forces zoom 1. */
function Stage({ children, fit }: { children: ReactNode; fit: "width" | "both" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = fit === "both" ? el.clientHeight : Infinity;
    setZoom(Math.max(0.2, Math.min(w / STAGE_W, h / STAGE_H)));
  }, [fit]);
  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [measure]);
  return (
    <div ref={ref} className={cn("wp-stage-box", fit === "both" && "is-both")}>
      <div className="wp-stage" style={{ zoom, width: STAGE_W, height: STAGE_H }}>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- the chrome */

function Toolbar({
  view,
  onPresent,
  onCopyLink,
  onDownloadPptx,
  backHref,
}: {
  view: WelcomeView;
  onPresent: () => void;
  onCopyLink?: (() => Promise<string>) | undefined;
  onDownloadPptx?: (() => Promise<void>) | undefined;
  backHref: string | null;
}) {
  const [copied, setCopied] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [pptx, setPptx] = useState<"idle" | "busy">("idle");
  const copy = async () => {
    if (!onCopyLink) return;
    setCopied("busy");
    try {
      const url = await onCopyLink();
      await navigator.clipboard.writeText(url);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 2500);
  };
  return (
    <div className="wp-toolbar print:hidden">
      <div className="wp-toolbar-left">
        {backHref ? (
          <a href={backHref} className="wp-tool">
            <ArrowLeft className="h-3.5 w-3.5" /> Deal
          </a>
        ) : null}
        <span className="wp-toolbar-title">{view.clientName}</span>
        {view.sharedAt ? (
          <span className="wp-toolbar-meta">
            Link sent {shortDay(view.sharedAt.slice(0, 10))}
            {view.openedAt
              ? ` · opened ${shortDay(view.openedAt.slice(0, 10))}`
              : " · not opened yet"}
          </span>
        ) : null}
      </div>
      <div className="wp-toolbar-right">
        <button type="button" className="wp-tool" onClick={onPresent}>
          <Play className="h-3.5 w-3.5" /> Present
        </button>
        <button type="button" className="wp-tool" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> PDF
        </button>
        {onDownloadPptx ? (
          <button
            type="button"
            className="wp-tool"
            disabled={pptx === "busy"}
            onClick={async () => {
              setPptx("busy");
              try {
                await onDownloadPptx();
              } finally {
                setPptx("idle");
              }
            }}
          >
            <Download className="h-3.5 w-3.5" /> {pptx === "busy" ? "Building…" : "PowerPoint"}
          </button>
        ) : null}
        {onCopyLink ? (
          <button
            type="button"
            className="wp-tool is-primary"
            onClick={() => void copy()}
            disabled={copied === "busy"}
          >
            {copied === "done" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            {copied === "busy"
              ? "Preparing…"
              : copied === "done"
                ? "Link copied"
                : copied === "failed"
                  ? "Could not copy"
                  : view.sharedAt
                    ? "Copy new customer link"
                    : "Create customer link"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SharedBar({ view }: { view: WelcomeView }) {
  return (
    <div className="wp-toolbar is-shared print:hidden">
      <div className="wp-toolbar-left">
        <img src="/branding/gocanvas-wordmark-navy.png" alt="GoCanvas" className="h-5 w-auto" />
        <span className="wp-toolbar-meta">
          Your onboarding plan · live {shortDay(view.timeline.liveDate)}
        </span>
      </div>
      <div className="wp-toolbar-right">
        <button type="button" className="wp-tool" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Save as PDF
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- shared pieces */

function Frame({
  children,
  eyebrow,
  title,
  accent,
  lede,
  band,
  bandIcon,
  page,
  dark,
}: {
  children: ReactNode;
  eyebrow: string;
  /** The headline. `accent` is the run rendered in blue. */
  title: string;
  accent?: string;
  lede?: string;
  band?: string;
  bandIcon?: string;
  page: number;
  dark?: boolean;
}) {
  return (
    <section className={cn("wp-screen", dark && "is-dark")}>
      <div className="wp-blob" />
      <div className="wp-dots" />
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
        <p className="wp-eyebrow">{eyebrow}</p>
        <h2 className="wp-title">
          {title} {accent ? <span className="wp-accent">{accent}</span> : null}
        </h2>
        <div className="wp-rule" />
        {lede ? <p className="wp-lede">{lede}</p> : null}
        <div className="wp-content">{children}</div>
      </div>
      {band ? (
        <div className="wp-band">
          {bandIcon ? (
            <span className="wp-band-icon">
              <Icon name={bandIcon} className="h-5 w-5" />
            </span>
          ) : null}
          <p>{band}</p>
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

function Tile({
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

function Owner({ owner }: { owner: string }) {
  const label = owner === "gocanvas" ? "GoCanvas" : owner === "client" ? "You" : "Together";
  return <span className={cn("wp-owner", `is-${owner}`)}>{label}</span>;
}

function Tick({ children }: { children: ReactNode }) {
  return (
    <li className="wp-tick">
      <span className="wp-tick-dot">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      <span>{children}</span>
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

function PhoneMock({ view, className }: { view: WelcomeView; className?: string }) {
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

/* --------------------------------------------------------- the screens */

function Cover({ view }: { view: WelcomeView }) {
  const t = view.timeline;
  return (
    <section className="wp-screen is-cover">
      <div className="wp-blob is-cover" />
      <div className="wp-dots" />
      <header className="wp-head">
        <img src="/branding/gocanvas-wordmark-navy.png" alt="GoCanvas" className="wp-logo" />
        {view.clientLogoUrl ? (
          <img src={view.clientLogoUrl} alt={view.clientName} className="wp-client-logo" />
        ) : null}
      </header>
      <div className="wp-cover-grid">
        <div className="wp-cover-text">
          <p className="wp-eyebrow">
            Onboarding plan · {view.industry ?? "Your team"} · {daysToValue(t)} days to value
          </p>
          <h1 className="wp-title is-hero">
            Let&apos;s bring your <span className="wp-accent">workflow to life</span>
          </h1>
          <div className="wp-rule" />
          <p className="wp-cover-name">{view.clientName}</p>
          <p className="wp-lede">
            Welcome aboard as of {shortDay(t.closeDate)}. Kickoff{" "}
            {shortDay(t.milestones[1]?.date ?? t.closeDate)}. Your first form in the field by{" "}
            {shortDay(t.liveDate)} — built with you, not for you.
          </p>
          <div className="wp-pills">
            <span className="wp-pill">
              <Tile name="Wrench" size="sm" tone="blue" /> Build the form
            </span>
            <span className="wp-pill">
              <Tile name="Smartphone" size="sm" tone="blue" /> Collect in the field
            </span>
            <span className="wp-pill">
              <Tile name="Workflow" size="sm" tone="blue" /> Connect your systems
            </span>
          </div>
          {view.lead ? (
            <p className="wp-prepared">Prepared by {view.lead}, GoCanvas onboarding</p>
          ) : null}
        </div>
        <div className="wp-cover-art">
          {view.photoUrl ? (
            <div className="wp-photo">
              <img src={view.photoUrl} alt="" />
            </div>
          ) : (
            <div className="wp-art">
              <div className="wp-art-ring" />
              <div className="wp-art-disc">
                <Icon name={view.icon} className="wp-art-icon" strokeWidth={1.5} />
              </div>
            </div>
          )}
          <PhoneMock view={view} className="is-cover" />
          <span className="wp-art-chip is-a">
            <Icon name="ClipboardCheck" className="h-6 w-6" />
          </span>
          <span className="wp-art-chip is-b">
            <Icon name="Rocket" className="h-6 w-6" />
          </span>
        </div>
      </div>
      <footer className="wp-foot">
        <span>gocanvas.com</span>
        <span>01</span>
      </footer>
      <div className="wp-stripe">
        <i />
        <i />
        <i />
      </div>
    </section>
  );
}

function Team({ view }: { view: WelcomeView }) {
  const t = view.team;
  const people: Array<{
    name: string;
    role: string;
    does: string;
    icon: string;
    side: "gocanvas" | "client";
  }> = [];
  if (t.lead)
    people.push({
      name: t.lead,
      role: "Onboarding lead, GoCanvas",
      does: "Runs both calls, builds the first form with you, watches the first submissions.",
      icon: "Wrench",
      side: "gocanvas",
    });
  if (t.accountManager && t.accountManager !== t.lead)
    people.push({
      name: t.accountManager,
      role: "Account manager, GoCanvas",
      does: "Your commercial contact from here on. Loops in when scope changes.",
      icon: "Users",
      side: "gocanvas",
    });
  if (
    t.solutionsEngineer &&
    t.solutionsEngineer !== t.lead &&
    t.solutionsEngineer !== t.accountManager
  )
    people.push({
      name: t.solutionsEngineer,
      role: "Solutions engineer, GoCanvas",
      does: "Knows what was promised in the sale. Handles the integration when there is one.",
      icon: "Workflow",
      side: "gocanvas",
    });
  people.push({
    name: t.champion?.name ?? "Your project owner",
    role: t.champion?.role ? `${t.champion.role}, ${view.clientName}` : view.clientName,
    does: "Owns the plan on your side. Makes the last changes to the form in the working session.",
    icon: "Flag",
    side: "client",
  });
  people.push({
    name: view.fieldTester ?? "Your field tester",
    role: `Field tester, ${view.clientName}`,
    does: "One crew, real jobs, from the field-test day. What they say is what we fix.",
    icon: "HardHat",
    side: "client",
  });
  return (
    <Frame
      page={2}
      eyebrow="Your team"
      title="Two teams,"
      accent="one plan"
      lede="Small on purpose. Everyone here has a job in the next seven days, and nobody on this page is a ticket queue."
      band="Questions go to your onboarding lead directly — by name, not through a form."
      bandIcon="PhoneCall"
    >
      <div className={cn("wp-team", people.length > 4 && "is-five")}>
        {people.map((p) => (
          <div key={p.name + p.role} className={cn("wp-person", `is-${p.side}`)}>
            <Tile name={p.icon} size="lg" tone={p.side === "client" ? "navy" : "blue"} />
            <p className="wp-person-name">{p.name}</p>
            <p className="wp-person-role">{p.role}</p>
            <p className="wp-person-does">{p.does}</p>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** The plan's internal labels, said the way a customer hears them. */
const CUSTOMER_LABEL: Record<string, string> = {
  close: "Welcome aboard",
};

function Plan({ view }: { view: WelcomeView }) {
  const t = view.timeline;
  return (
    <Frame
      page={3}
      eyebrow="Your timeline"
      title="Seven days to a"
      accent="form in the field"
      lede="Two short working sessions, a little homework, one crew on real jobs. Every day below has an owner."
      band={`Live on ${shortDay(t.liveDate)}. No account should stall waiting on a form — we drive the pace, and you own the form.`}
      bandIcon="Rocket"
    >
      <div className="wp-rail">
        <div className="wp-rail-line" />
        {t.milestones.map((m) => (
          <div key={m.key} className={cn("wp-node", m.key === "live" && "is-live")}>
            <span className="wp-node-day">Day {m.day}</span>
            <Tile name={m.icon} size="lg" tone={m.key === "live" ? "navy" : "blue"} />
            <span className="wp-node-label">{CUSTOMER_LABEL[m.key] ?? m.label}</span>
            <span className={cn("wp-node-date", m.moved && "is-moved")}>{shortDay(m.date)}</span>
            <Owner owner={m.owner} />
            {m.minutes ? <span className="wp-node-min">{m.minutes} min</span> : null}
          </div>
        ))}
      </div>
      <div className="wp-legend">
        <span>
          <Owner owner="gocanvas" /> we do it, you hear about it
        </span>
        <span>
          <Owner owner="client" /> your homework, fifteen minutes
        </span>
        <span>
          <Owner owner="both" /> on a call, hands on the keyboard together
        </span>
      </div>
    </Frame>
  );
}

const HOMEWORK: Array<{ key: HomeworkKey; text: string }> = [
  { key: "app", text: "Download the GoCanvas app and log in" },
  { key: "user", text: "Add one field user who will test on a real job" },
  { key: "list", text: "Send us the customer or site list to load" },
];

function Together({
  view,
  mode,
  onTick,
}: {
  view: WelcomeView;
  mode: WelcomeMode;
  onTick?: ((key: HomeworkKey, done: boolean) => Promise<void> | void) | undefined;
}) {
  const due = view.timeline.milestones.find((m) => m.key === "homework");
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <Frame
      page={4}
      eyebrow="What's expected"
      title="We build it"
      accent="with you, not for you"
      lede="A form you built yourself is one you will change yourself — and the second use case shows up on its own."
      band="Fifteen minutes of homework means the second session starts from a live account, not a blank one."
      bandIcon="Users"
    >
      <div className="wp-two">
        <div className="wp-card">
          <div className="wp-card-head">
            <Tile name="Users" tone="blue" />
            <h3>We bring</h3>
          </div>
          <ul className="wp-ticks">
            <Tick>A starting point from the form library, in your vocabulary</Tick>
            <Tick>The build, live on the call, with you watching every field</Tick>
            <Tick>The logic, routing and notifications the office needs</Tick>
            <Tick>Someone watching the first submissions come in</Tick>
          </ul>
        </div>
        <div className="wp-card">
          <div className="wp-card-head">
            <Tile name="HardHat" tone="blue" />
            <h3>You bring</h3>
          </div>
          <ul className="wp-ticks">
            <Tick>How the job actually runs — the process, not the org chart</Tick>
            <Tick>One field user willing to try it on real work</Tick>
            <Tick>The customer or site list, so nothing is typed twice</Tick>
            <Tick>The last changes, made by you, in the working session</Tick>
          </ul>
        </div>
      </div>
      <div className="wp-homework">
        <p className="wp-homework-title">
          Your homework before the working session{due ? ` · due ${shortDay(due.date)}` : ""}
        </p>
        <div className="wp-homework-row">
          {HOMEWORK.map((h) => {
            const done = Boolean(view.homeworkDone[h.key]);
            const interactive = mode === "shared" && Boolean(onTick);
            return (
              <button
                key={h.key}
                type="button"
                className={cn("wp-check", done && "is-done", !interactive && "is-static")}
                disabled={!interactive || busy === h.key}
                onClick={async () => {
                  if (!onTick) return;
                  setBusy(h.key);
                  try {
                    await onTick(h.key, !done);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <span className="wp-check-box">
                  {done ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
                </span>
                <span>{h.text}</span>
              </button>
            );
          })}
        </div>
        {HOMEWORK_KEYS.every((k) => view.homeworkDone[k]) ? (
          <p className="wp-homework-done">
            All three done — the working session starts from a live account.
          </p>
        ) : null}
      </div>
    </Frame>
  );
}

function FirstForm({ view }: { view: WelcomeView }) {
  const at = (key: string) => view.timeline.milestones.find((m) => m.key === key);
  const f = view.firstForm;
  const source =
    f?.source === "uploaded"
      ? "Starting point: the form you already run today"
      : f?.source === "library"
        ? "Starting point: from the GoCanvas form library"
        : "Starting point: chosen together on the kickoff call";
  return (
    <Frame
      page={5}
      eyebrow="How we get there"
      title="The star of"
      accent="the show"
      band="Proven in the field before anything is connected to it. That is what makes the mapping right later."
      bandIcon="Target"
    >
      <div className="wp-form-grid">
        <div className="wp-flow">
          <div className="wp-flow-step">
            <div className="wp-paper">
              <FileText className="h-7 w-7" />
              <i />
              <i />
              <i />
              <i />
            </div>
            <span className="wp-flow-cap">The paper ticket today</span>
          </div>
          <span className="wp-flow-arrow" />
          <div className="wp-flow-step">
            <PhoneMock view={view} className="is-flow" />
            <span className="wp-flow-cap">
              On the crew&apos;s phone, {at("kickoff") ? shortDay(at("kickoff")!.date) : "day one"}
            </span>
          </div>
          <span className="wp-flow-arrow" />
          <div className="wp-flow-step">
            <div className="wp-office">
              <span className="wp-office-tile">
                <Cloud className="h-6 w-6" />
              </span>
              <span className="wp-office-tile">
                <Table2 className="h-6 w-6" />
              </span>
              <span className="wp-office-tile is-pdf">PDF</span>
            </div>
            <span className="wp-flow-cap">In the office the same day</span>
          </div>
        </div>
        <div className="wp-rows">
          <div className="wp-card is-tint wp-form-card">
            <div className="wp-card-head">
              <Tile name={view.icon} tone="blue" />
              <h3>{f?.name ?? "To be chosen on the kickoff call"}</h3>
            </div>
            <p className="wp-card-body">
              {f?.objective ??
                "We pick the starting point together from the form library, in the words your crews already use."}
            </p>
            <p className="wp-card-source">{source}</p>
          </div>
          <Row
            icon="PhoneCall"
            head={`Built live · ${at("kickoff") ? shortDay(at("kickoff")!.date) : "kickoff"}`}
          >
            On the kickoff call, from the starting point, with you watching every field go in.
          </Row>
          <Row
            icon="Wrench"
            head={`Finished together · ${at("working") ? shortDay(at("working")!.date) : "working session"}`}
          >
            Thirty minutes. Logic, notifications, and the last changes made by your hands.
          </Row>
          <Row
            icon="HardHat"
            tone="navy"
            head={`Proven on real jobs · from ${at("fieldtest") ? shortDay(at("fieldtest")!.date) : "the field test"}`}
          >
            {view.fieldTester ?? "Your field tester"} runs it on real work. We watch the submissions
            and fix what the field says.
          </Row>
        </div>
      </div>
    </Frame>
  );
}

function Row({
  icon,
  head,
  children,
  tone = "blue",
}: {
  icon: string;
  head: string;
  children: ReactNode;
  tone?: "blue" | "navy";
}) {
  return (
    <div className="wp-row">
      <Tile name={icon} tone={tone} />
      <div>
        <p className="wp-row-head">{head}</p>
        <p className="wp-row-body">{children}</p>
      </div>
    </div>
  );
}

function Business({ view }: { view: WelcomeView }) {
  const t = view.timeline;
  const kickoff = t.milestones.find((m) => m.key === "kickoff");
  const working = t.milestones.find((m) => m.key === "working");
  const integ = t.integration;
  const next = view.nextUseCases.slice(0, 3);
  return (
    <Frame
      page={6}
      eyebrow="Let's get into business"
      title="Two calls, then"
      accent="it's yours"
      band={`Live on ${shortDay(t.liveDate)}. If any of the three on the right is not true that day, we are not done — and we say so.`}
      bandIcon="Rocket"
    >
      <div className="wp-business">
        <div className="wp-calls">
          <div className="wp-call">
            <Tile name="PhoneCall" size="lg" tone="blue" />
            <div>
              <p className="wp-call-when">
                {kickoff ? shortDay(kickoff.date) : "Day 1"} · {kickoff?.minutes ?? 60} min
              </p>
              <h3>Kickoff &amp; build session</h3>
              <p>
                Meet, agree how we work, and build the first form live on the call. You leave with
                three homework items.
              </p>
            </div>
          </div>
          <div className="wp-call">
            <Tile name="Wrench" size="lg" tone="blue" />
            <div>
              <p className="wp-call-when">
                {working ? shortDay(working.date) : "Day 3"} · {working?.minutes ?? 30} min
              </p>
              <h3>Working session</h3>
              <p>
                Your hands on the keyboard. Finish the form, add the logic and notifications, hand
                it to the field tester.
              </p>
            </div>
          </div>
          <div className="wp-after">
            {integ.weeks > 0 && integ.startsOn ? (
              <>
                <p className="wp-after-title">
                  Then, from {shortDay(integ.startsOn)}:{" "}
                  {integ.target ? `connect it to ${integ.target}` : "the integration"} · about{" "}
                  {integ.weeks} week{integ.weeks === 1 ? "" : "s"}
                </p>
                <p className="wp-after-body">
                  Tier {integ.tier}, {integ.name.toLowerCase()}. The form first, always — field
                  mapping cannot be right until a crew has used it on a real job.
                </p>
              </>
            ) : (
              <>
                <p className="wp-after-title">Then, the next ones — built by you</p>
                <p className="wp-after-body">
                  {next.length
                    ? next.map((n) => n.name).join(" · ")
                    : "We pick these together once the first form is in the field."}
                </p>
              </>
            )}
          </div>
        </div>
        <div className="wp-card wp-good">
          <p className="wp-good-eyebrow">What good looks like on {shortDay(t.liveDate)}</p>
          <ul className="wp-ticks">
            <Tick>Your crew submits from the phone, on the job, with photos and a signature.</Tick>
            <Tick>The office sees the work as it happens — no retyping, no Friday pile.</Tick>
            <Tick>The crew asked for a change, and it was made the same day.</Tick>
          </ul>
          <div className="wp-good-cta">
            <span className="wp-good-cta-label">Your next step</span>
            <span className="wp-good-cta-text">
              Accept the kickoff invite for {kickoff ? shortDay(kickoff.date) : "day one"} and
              download the app.
            </span>
          </div>
        </div>
      </div>
    </Frame>
  );
}
