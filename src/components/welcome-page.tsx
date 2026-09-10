import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AirVent,
  ArrowLeft,
  Building2,
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

import { INTEGRATION_TIERS, daysToValue, shortDay } from "@/lib/onboarding-timeline";
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
    <Plan key="plan" view={view} />,
    <Together key="together" view={view} mode={mode} onTick={onTick} />,
    <FirstForm key="form" view={view} />,
    <DaySeven key="seven" view={view} />,
    <Next key="next" view={view} />,
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
            Closed {shortDay(t.closeDate)}. Kickoff {shortDay(t.milestones[1]?.date ?? t.closeDate)}
            . Your first form in the field by {shortDay(t.liveDate)} — built with you, not for you.
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
              <span className="wp-art-chip is-a">
                <Icon name="ClipboardCheck" className="h-6 w-6" />
              </span>
              <span className="wp-art-chip is-b">
                <Icon name="Smartphone" className="h-6 w-6" />
              </span>
              <span className="wp-art-chip is-c">
                <Icon name="Rocket" className="h-6 w-6" />
              </span>
            </div>
          )}
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

function Plan({ view }: { view: WelcomeView }) {
  const t = view.timeline;
  return (
    <Frame
      page={2}
      eyebrow="The plan at a glance"
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
            <span className="wp-node-label">{m.label}</span>
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
      page={3}
      eyebrow="How we work together"
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
      page={4}
      eyebrow="Your first form"
      title="The star of"
      accent="the show"
      lede="One workflow, one crew, real jobs. Everything else waits until this one has been proven in the field."
      band="Proven in the field before anything is connected to it. That is what makes the mapping right later."
      bandIcon="Target"
    >
      <div className="wp-form-grid">
        <div className="wp-card is-tint wp-form-card">
          {view.photoUrl ? (
            <div className="wp-card-photo">
              <img src={view.photoUrl} alt="" />
            </div>
          ) : null}
          <div className="wp-card-head">
            <Tile name={view.icon} size="lg" tone="blue" />
            <h3>{f?.name ?? "To be chosen on the kickoff call"}</h3>
          </div>
          <p className="wp-card-body">
            {f?.objective ??
              "We pick the starting point together from the form library, in the words your crews already use."}
          </p>
          <p className="wp-card-source">{source}</p>
        </div>
        <div className="wp-rows">
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

function DaySeven({ view }: { view: WelcomeView }) {
  const working = view.timeline.milestones.find((m) => m.key === "working");
  const agenda: Array<[string, string]> = [
    ["5 min", "Debrief the homework and what you found in the account"],
    ["15 min", "Finish the form together — your hands on the keyboard"],
    ["5 min", "Logic, routing and the notifications the office wants"],
    ["5 min", "Name the field tester and book the field-test window"],
  ];
  return (
    <Frame
      page={5}
      eyebrow={`Day ${view.timeline.milestones[view.timeline.milestones.length - 1]?.day ?? 7}`}
      title="What good looks like on"
      accent={shortDay(view.timeline.liveDate)}
      band="If any of the four on the left is not true on day seven, we are not done — and we say so."
      bandIcon="Flag"
    >
      <div className="wp-seven">
        <div className="wp-outcomes">
          <Row icon="Smartphone" head="Same day">
            Your crew submits from the phone, on the job, with photos and a signature.
          </Row>
          <Row icon="Building2" head="One place">
            The office sees the work as it happens — no retyping, no Friday pile.
          </Row>
          <Row icon="ClipboardCheck" head="Zero">
            The first report goes out without anyone touching a spreadsheet.
          </Row>
          <Row icon="Users" head="Heard">
            The crew has asked for a change, and it was made the same day.
          </Row>
        </div>
        <div className="wp-card wp-agenda">
          <div className="wp-card-head">
            <Tile name="Wrench" tone="navy" />
            <div>
              <h3>The 30-minute working session</h3>
              <p className="wp-card-sub">
                {working ? `${shortDay(working.date)} · ${working.minutes ?? 30} minutes` : "Day 3"}
              </p>
            </div>
          </div>
          <ol className="wp-agenda-list">
            {agenda.map(([m, w]) => (
              <li key={w}>
                <b>{m}</b>
                <span>{w}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Frame>
  );
}

function Next({ view }: { view: WelcomeView }) {
  const integ = view.timeline.integration;
  if (integ.weeks > 0 && integ.startsOn) {
    const tiers = INTEGRATION_TIERS.filter((x) => x.tier >= 1);
    return (
      <Frame
        page={6}
        eyebrow="After the form is live"
        title="Then we connect it"
        accent={integ.target ? `to ${integ.target}` : "to your systems"}
        lede={`Starts ${shortDay(integ.startsOn)}, the business day after your form is live. About ${integ.weeks} week${integ.weeks === 1 ? "" : "s"}.`}
        band="The form first, always. Field mapping is the whole of an integration, and it cannot be right until a crew has used the form on a real job."
        bandIcon="Route"
      >
        <div className="wp-tiers">
          {tiers.map((x) => (
            <div key={x.tier} className={cn("wp-tier", x.tier === integ.tier && "is-on")}>
              <span className="wp-tier-no">Tier {x.tier}</span>
              <span className="wp-tier-name">{x.name}</span>
              <span className="wp-tier-wk">
                {x.weeks ? `${x.weeks} wk${x.weeks === 1 ? "" : "s"}` : "—"}
              </span>
            </div>
          ))}
        </div>
        <div className="wp-card wp-integ">
          <div className="wp-card-head">
            <Tile name="Workflow" tone="blue" />
            <div>
              <h3>{integ.name} integration — what that means</h3>
              <p className="wp-card-sub">
                {integ.summary} We map the fields from the form your crew has already run — which is
                why it comes second.
              </p>
            </div>
          </div>
          <div className="wp-bar">
            <div className="wp-bar-track">
              <div className="wp-bar-head" />
              <span className="wp-bar-mark" />
            </div>
            <div className="wp-bar-labels">
              <span className="is-navy">Form live · {shortDay(view.timeline.liveDate)}</span>
              <span>Integration starts · {shortDay(integ.startsOn)}</span>
              <span>Target finish · {integ.endsOn ? shortDay(integ.endsOn) : "to be agreed"}</span>
            </div>
          </div>
        </div>
      </Frame>
    );
  }
  const cards = view.nextUseCases.slice(0, 3);
  return (
    <Frame
      page={6}
      eyebrow="After the form is live"
      title="Your next"
      accent="use cases"
      lede="Three forms your industry runs next. You will build these yourselves — that is the point of the first seven days."
      band="Support is built in: the same team, the same working-session format, whenever the next form is ready to start."
      bandIcon="Users"
    >
      <div className="wp-three">
        {cards.length === 0 ? (
          <p className="wp-lede">
            We will pick these together once the first form is in the field.
          </p>
        ) : null}
        {cards.map((c, i) => (
          <div key={c.name} className="wp-card wp-usecase">
            <div className="wp-usecase-top">
              <Tile name={view.icon} size="lg" tone={i === 0 ? "navy" : "blue"} />
              <span className="wp-usecase-no">{String(i + 1).padStart(2, "0")}</span>
            </div>
            <h3>{c.name}</h3>
            {c.objective ? <p className="wp-card-body">{c.objective}</p> : null}
          </div>
        ))}
      </div>
    </Frame>
  );
}
