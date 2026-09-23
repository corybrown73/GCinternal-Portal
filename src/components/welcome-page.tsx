import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AirVent,
  ArrowLeft,
  Building2,
  CalendarPlus,
  Camera,
  QrCode,
  Smartphone as SmartphoneIcon,
  ChevronRight,
  Cloud,
  FileText,
  PenLine,
  Table2,
  Check,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  EyeOff,
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
  BookOpen,
} from "lucide-react";

import {
  dayCounter,
  daysToValue,
  dayLabel,
  localIso,
  shortDay,
  type Phase,
  type ServicePlan,
  type Timeline,
} from "@/lib/onboarding-timeline";
import { HOMEWORK_KEYS, isScreenShown, type HomeworkKey, type WelcomeView } from "@/lib/welcome";
import { whenLabel } from "@/lib/welcome-events";
import { speakerNotes } from "@/lib/welcome-notes";
import { exportWelcomePptx, pptxFileName } from "@/components/welcome-export";
import { GOCANVAS_APP } from "@/lib/app-links";
import { firstName } from "@/lib/team-profile";
import { cn } from "@/lib/utils";
import { BrandMarkTile } from "@/components/brand-mark";
import { KIND_MARKS, markForService, type BrandMark } from "@/lib/brand-marks";

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
  BookOpen,
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
  onMarkSent,
  onEditText,
  backHref,
  notesHref,
  icsBase,
  onToggleScreen,
}: {
  view: WelcomeView;
  mode: WelcomeMode;
  /** Internal: a line of the page rewritten in place. Null restores the page's own words. */
  onEditText?: ((key: string, text: string | null) => Promise<void> | void) | undefined;
  /** The customer's page ticks its homework; the internal preview shows the ticks. */
  onTick?: (key: HomeworkKey, done: boolean) => Promise<void> | void;
  /** Internal: issue or copy the customer's link. Resolves to the URL. */
  onCopyLink?: () => Promise<string>;
  /** Internal: the link went to the customer, by whatever channel. */
  onMarkSent?: () => Promise<void> | void;
  backHref?: string | null;
  /** Internal: the talk track for this customer. */
  notesHref?: string | null;
  /** Shared: the calendar-file route for this link, e.g. /api/welcome-ics/<token>. */
  icsBase?: string | null;
  /** Internal: switch a screen off (or on) for this customer. Saved on the deal. */
  onToggleScreen?: ((key: string, hidden: boolean) => Promise<void> | void) | undefined;
}) {
  const [present, setPresent] = useState(false);
  const [at, setAt] = useState(0);
  // The customer's link as a QR for the room: from the record when one has
  // been issued, so it is there on every load, not only in the session that
  // minted it. Minting again replaces it.
  const qr =
    view.shareUrl && view.qrDataUrl ? { url: view.shareUrl, dataUrl: view.qrDataUrl } : null;
  const [showQr, setShowQr] = useState(true);
  const mintForQr = onCopyLink
    ? async () => {
        const url = await onCopyLink();
        setShowQr(true);
        return url;
      }
    : undefined;
  // Every screen the page can show, in order. The presenter can switch any
  // of them off for this customer; page numbers follow what is shown, so a
  // plan with two later phases and nothing hidden numbers to nine.
  const all = screenList(view);
  const visible = all.filter((sc) => isScreenShown(sc.key, view.hiddenScreens));
  const hidden = new Set(
    all.filter((sc) => !isScreenShown(sc.key, view.hiddenScreens)).map((sc) => sc.key),
  );
  const total = visible.length;
  const screens = visible.map((sc, i) =>
    sc.render({
      page: i + 1,
      qr: showQr ? qr : null,
      mode,
      onTick,
      icsBase: icsBase ?? null,
    }),
  );

  // Present mode: a hint the first time, gone after a few seconds.
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (!present) return;
    setHint(true);
    const id = setTimeout(() => setHint(false), 3500);
    return () => clearTimeout(id);
  }, [present]);

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
  }, [present, total]);

  const editing = mode === "internal" && !present && Boolean(onEditText);
  return (
    <EditCtx.Provider
      value={{ overrides: view.textOverrides ?? {}, onEdit: editing ? (onEditText ?? null) : null }}
    >
      <div className={cn("gc-welcome", present && "is-present", editing && "is-editing")}>
        {mode === "internal" ? (
          <Toolbar
            view={view}
            onPresent={() => {
              setAt(0);
              setPresent(true);
            }}
            onCopyLink={mintForQr}
            onMarkSent={onMarkSent}
            onExportPptx={async (report) => {
              // Every visible screen, unzoomed, with the talk track as notes.
              const notes = speakerNotes(view);
              const byKey = new Map(notes.sections.map((sec) => [sec.key, sec]));
              await exportWelcomePptx({
                screens: visible.map((sc, i) =>
                  sc.render({
                    page: i + 1,
                    qr: showQr ? qr : null,
                    mode: "shared",
                    onTick: undefined,
                    icsBase: null,
                  }),
                ),
                notes: visible.map((sc) => {
                  const sec =
                    byKey.get(sc.key) ??
                    (sc.key.startsWith("phase-")
                      ? byKey.get(`phase-${view.timeline.phases[0]?.phase}`)
                      : undefined);
                  if (!sec) return "";
                  return [
                    ...sec.say,
                    "",
                    `Why: ${sec.why}`,
                    "",
                    ...sec.ifTheyAsk.map((q) => `If they ask "${q.q}": ${q.a}`),
                  ].join("\n");
                }),
                fileName: pptxFileName(view.clientName),
                title: `${view.clientName} — onboarding plan`,
                onProgress: report,
              });
            }}
            qrReady={Boolean(qr)}
            showQr={showQr}
            onToggleQr={() => setShowQr((v) => !v)}
            backHref={backHref ?? null}
            notesHref={notesHref ?? null}
          />
        ) : null}
        {mode === "shared" ? <SharedBar view={view} icsBase={icsBase ?? null} /> : null}

        {present ? (
          <div className="wp-present" onClick={() => setAt((i) => Math.min(total - 1, i + 1))}>
            <Stage key={at} fit="both">
              {screens[at]}
            </Stage>
            {hint ? (
              <div className="wp-present-hint">← → to move · Esc to leave · click to advance</div>
            ) : null}
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
          <div className="wp-shell">
            {mode === "internal" ? (
              <ScreenMenu all={all} hidden={hidden} onToggle={onToggleScreen} />
            ) : null}
            <div className="wp-scroll">
              {visible.map((sc, i) => (
                <div key={sc.key} id={`wp-screen-${sc.key}`}>
                  <Stage fit="width">{screens[i]}</Stage>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </EditCtx.Provider>
  );
}

type ScreenArgs = {
  page: number;
  qr: { url: string; dataUrl: string } | null;
  mode: WelcomeMode;
  onTick: ((key: HomeworkKey, done: boolean) => Promise<void> | void) | undefined;
  icsBase: string | null;
};
type Screen = { key: string; label: string; render: (a: ScreenArgs) => ReactNode };

/** The screens in order, each with the key the presenter switches it by. */
function screenList(view: WelcomeView): Screen[] {
  const t = view.timeline;
  return [
    { key: "cover", label: "Cover", render: (a) => <Cover key="cover" view={view} qr={a.qr} /> },
    {
      key: "team",
      label: "Your team",
      render: (a) => <Team key="team" view={view} page={a.page} />,
    },
    {
      key: "overview",
      label: "At a glance",
      render: (a) => <Overview key="overview" view={view} page={a.page} />,
    },
    {
      key: "plan",
      label: t.training
        ? t.phases.length || t.alongside.length
          ? "Phase 1 · training"
          : "The two weeks"
        : t.phases.length || t.alongside.length
          ? "Phase 1 · the form"
          : "The first form",
      render: (a) => <Plan key="plan" view={view} page={a.page} />,
    },
    ...t.phases.map((ph): Screen => ({
      key: `phase-${ph.phase}`,
      label: `${ph.label} · ${ph.services.map((x) => x.name).join(" + ")}`,
      render: (a) => <PhaseScreen key={`phase-${ph.phase}`} view={view} phase={ph} page={a.page} />,
    })),
    {
      key: "together",
      label: "What's expected",
      render: (a) => (
        <Together key="together" view={view} mode={a.mode} onTick={a.onTick} page={a.page} />
      ),
    },
    ...(view.helpPicks.length
      ? [
          {
            key: "help",
            label: "Jump start your journey",
            render: (a: ScreenArgs) => <HelpScreen key="help" view={view} page={a.page} />,
          } satisfies Screen,
        ]
      : []),
    {
      key: "form",
      label: "How we get there",
      render: (a) => <FirstForm key="form" view={view} page={a.page} />,
    },
    {
      key: "business",
      label: "Let's get into business",
      render: (a) => <Business key="business" view={view} icsBase={a.icsBase} page={a.page} />,
    },
  ];
}

/**
 * The left-hand menu: every screen, on or off for this customer. Off means
 * off everywhere — the preview, present mode, the PDF and the customer's
 * link — because the page is one source.
 */
function ScreenMenu({
  all,
  hidden,
  onToggle,
}: {
  all: Screen[];
  hidden: Set<string>;
  onToggle: ((key: string, hidden: boolean) => Promise<void> | void) | undefined;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  let n = 0;
  return (
    <aside className="wp-side print:hidden">
      <p className="wp-side-title">Screens</p>
      <ol className="wp-side-list">
        {all.map((sc) => {
          const off = hidden.has(sc.key);
          const no = off ? null : ++n;
          return (
            <li key={sc.key} className={cn("wp-side-item", off && "is-off")}>
              <a href={off ? undefined : `#wp-screen-${sc.key}`} className="wp-side-link">
                <span className="wp-side-no">{no ? String(no).padStart(2, "0") : "—"}</span>
                <span className="wp-side-label">{sc.label}</span>
              </a>
              {onToggle ? (
                <button
                  type="button"
                  className="wp-side-eye"
                  title={off ? "Show this screen" : "Hide this screen for this customer"}
                  disabled={busy === sc.key}
                  onClick={async () => {
                    setBusy(sc.key);
                    try {
                      await onToggle(sc.key, !off);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {off ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="wp-side-hint">Hidden screens are hidden for the customer too.</p>
    </aside>
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

/** Today, set after mount so the server's date never disagrees with the browser's. */
function useToday(): string | null {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(localIso());
    const id = setInterval(() => setToday(localIso()), 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

/** The day counter, as a chip: "Day 3 of 7 · Live Fri, Sep 18 · in 4 business days". */
function DayChip({ view }: { view: WelcomeView }) {
  const today = useToday();
  if (!today) return null;
  const c = dayCounter(view.timeline, today);
  return (
    <span className={cn("wp-daychip", `is-${c.state}`)} title={c.detail}>
      <b>{c.label}</b>
      <span>{c.detail}</span>
    </span>
  );
}

function Toolbar({
  view,
  onPresent,
  onCopyLink,
  onMarkSent,
  onExportPptx,
  backHref,
  notesHref,
  qrReady,
  showQr,
  onToggleQr,
}: {
  view: WelcomeView;
  onPresent: () => void;
  onCopyLink?: (() => Promise<string>) | undefined;
  onMarkSent?: (() => Promise<void> | void) | undefined;
  /** Every visible screen as a full-bleed slide. Reports progress while it renders. */
  onExportPptx?: ((report: (done: number, total: number) => void) => Promise<void>) | undefined;
  backHref: string | null;
  notesHref: string | null;
  qrReady: boolean;
  showQr: boolean;
  onToggleQr: () => void;
}) {
  const [copied, setCopied] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [pptx, setPptx] = useState<"idle" | "busy" | "failed">("idle");
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [sent, setSent] = useState<"idle" | "busy">("idle");
  const copy = async () => {
    if (!onCopyLink) return;
    setCopied("busy");
    let url: string | null = null;
    try {
      url = view.shareUrl ?? (await onCopyLink());
    } catch {
      setCopied("failed");
      setTimeout(() => setCopied("idle"), 2500);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied("done");
    } catch {
      // The link exists even when the clipboard refused (a minted link is a
      // slow await, and some browsers drop the permission by then). The
      // next click copies it without minting again.
      setCopied(view.shareUrl ? "failed" : "done");
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
        <DayChip view={view} />
        {view.sharedAt || view.openedAt ? (
          <span className="wp-toolbar-meta">
            {view.sharedAt ? `Link sent ${shortDay(view.sharedAt.slice(0, 10))}` : "Link"}
            {view.openedAt
              ? ` · opened ${shortDay(view.openedAt.slice(0, 10))}`
              : " · not opened yet"}
          </span>
        ) : view.shareUrl ? (
          <span className="wp-toolbar-meta">Link ready · not sent yet</span>
        ) : null}
        <EditHint />
        {onMarkSent && view.shareUrl && !view.sharedAt && !view.openedAt ? (
          <button
            type="button"
            className="wp-tool"
            disabled={sent === "busy"}
            title="You sent the customer their link — by email, text, however. The checklist ticks on this, not on copying."
            onClick={async () => {
              setSent("busy");
              try {
                await onMarkSent();
              } finally {
                setSent("idle");
              }
            }}
          >
            <Check className="h-3.5 w-3.5" /> {sent === "busy" ? "Saving…" : "Mark as sent"}
          </button>
        ) : null}
      </div>
      <div className="wp-toolbar-right">
        {qrReady ? (
          <button
            type="button"
            className="wp-tool"
            onClick={onToggleQr}
            title="Show or hide the QR code on the cover"
          >
            <QrCode className="h-3.5 w-3.5" /> {showQr ? "Hide QR" : "Show QR"}
          </button>
        ) : null}
        {notesHref ? (
          <a href={notesHref} className="wp-tool" target="_blank" rel="noreferrer">
            <FileText className="h-3.5 w-3.5" /> Speaker notes
          </a>
        ) : null}
        <button type="button" className="wp-tool" onClick={onPresent}>
          <Play className="h-3.5 w-3.5" /> Present
        </button>
        <button type="button" className="wp-tool" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> PDF
        </button>
        {onExportPptx ? (
          <button
            type="button"
            className="wp-tool"
            disabled={pptx === "busy"}
            title="Every screen as a slide, exactly as it looks here — the talk track in the notes"
            onClick={async () => {
              setPptx("busy");
              setProgress(null);
              try {
                await onExportPptx((done, total) => setProgress([done, total]));
                setPptx("idle");
              } catch (e) {
                console.error("[welcome] pptx export failed", e);
                setPptx("failed");
                setTimeout(() => setPptx("idle"), 3000);
              } finally {
                setProgress(null);
              }
            }}
          >
            <Download className="h-3.5 w-3.5" />{" "}
            {pptx === "busy"
              ? progress
                ? `Slide ${progress[0]} of ${progress[1]}…`
                : "Rendering…"
              : pptx === "failed"
                ? "Could not build it"
                : "PowerPoint"}
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
                  : view.shareUrl
                    ? "Copy customer link"
                    : "Create customer link"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EditHint() {
  const { onEdit } = useContext(EditCtx);
  if (!onEdit) return null;
  return (
    <span
      className="wp-toolbar-meta"
      title="Every line on the page. Changes show on the customer's link, the PDF and the PowerPoint."
    >
      Click any text to edit it · Esc puts the original back
    </span>
  );
}

function SharedBar({ view, icsBase }: { view: WelcomeView; icsBase: string | null }) {
  const p = view.timeline.progress;
  return (
    <div className="wp-toolbar is-shared print:hidden">
      <div className="wp-toolbar-left">
        <img src="/branding/gocanvas-wordmark-navy.png" alt="GoCanvas" className="h-5 w-auto" />
        <DayChip view={view} />
        <span className="wp-toolbar-meta">
          {view.timeline.training
            ? "Your GoCanvas training plan"
            : view.path === "existing"
              ? "Your services plan"
              : view.path === "dm_conversion"
                ? "Your conversion plan"
                : "Your onboarding plan"}
          {p.done ? ` · ${p.done} of ${p.total} steps done` : ""}
        </span>
      </div>
      <div className="wp-toolbar-right">
        {icsBase ? (
          <a href={icsBase} className="wp-tool">
            <CalendarPlus className="h-3.5 w-3.5" /> Add all dates to calendar
          </a>
        ) : null}
        <button type="button" className="wp-tool" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Save as PDF
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- shared pieces */

/**
 * EDIT IN PLACE. Every line of copy on the page is a <T> with a key. Internal
 * mode, not presenting: click it, type, click away — the new words save on
 * the deal and the customer's link, the PDF and the PowerPoint all show
 * them. Escape while editing puts the page's own words back. Anywhere else
 * a <T> is plain text, so the layout is the same pixels in every mode.
 */
const EditCtx = createContext<{
  overrides: Record<string, string>;
  onEdit: ((key: string, text: string | null) => Promise<void> | void) | null;
}>({ overrides: {}, onEdit: null });

function T({ k, children }: { k: string; children: string }) {
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
function tkey(...parts: Array<string | number | null | undefined>): string {
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

function Frame({
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

function Tick({ k, children }: { k?: string; children: ReactNode }) {
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

function Cover({ view, qr }: { view: WelcomeView; qr?: { url: string; dataUrl: string } | null }) {
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
            {t.training
              ? "GoCanvas training plan"
              : view.path === "existing"
                ? "Services plan"
                : view.path === "dm_conversion"
                  ? "Conversion plan"
                  : "Onboarding plan"}{" "}
            · {view.industry ?? "Your team"} ·{" "}
            {t.phases.length
              ? `Phase ${t.currentPhase} of ${t.phases.length + 1}`
              : `${daysToValue(t)} business days to value`}
          </p>
          <h1 className="wp-title is-hero">
            {t.training ? (
              <>
                Let&apos;s get your crew <span className="wp-accent">up and running</span>
              </>
            ) : view.path === "existing" ? (
              <>
                Let&apos;s take your <span className="wp-accent">workflow further</span>
              </>
            ) : view.path === "dm_conversion" ? (
              <>
                Let&apos;s move your forms <span className="wp-accent">over, one at a time</span>
              </>
            ) : (
              <>
                Let&apos;s bring your <span className="wp-accent">workflow to life</span>
              </>
            )}
          </h1>
          <div className="wp-rule" />
          <p className="wp-cover-name">
            <T k="cover.name">{view.clientName}</T>
          </p>
          <p className="wp-lede">
            <T k="cover.lede">
              {view.path === "existing"
                ? `Welcome back as of ${shortDay(t.closeDate)}. Form review ${shortDay(t.milestones[1]?.date ?? t.closeDate)}. Your form ready for the integration by ${shortDay(t.liveDate)} — optimised with you, not for you.`
                : t.training
                  ? `Welcome aboard as of ${shortDay(t.closeDate)}. First training call ${shortDay(t.milestones[1]?.date ?? t.closeDate)}. Three short calls over two weeks, and your crew is live by ${shortDay(t.liveDate)} — trained on your jobs, not ours.`
                  : `Welcome aboard as of ${shortDay(t.closeDate)}. Kickoff ${shortDay(t.milestones[1]?.date ?? t.closeDate)}. Your first form in the field by ${shortDay(t.liveDate)} — built with you, not for you.`}
            </T>
          </p>
          <div className="wp-pills">
            <span className="wp-pill">
              <Tile name="Wrench" size="sm" tone="blue" /> Build
            </span>
            <span className="wp-pill">
              <Tile name="Smartphone" size="sm" tone="blue" /> Collect in the field
            </span>
            <span className="wp-pill">
              <Tile name="Workflow" size="sm" tone="blue" /> Connect
            </span>
          </div>
          {view.lead ? (
            <p className="wp-prepared">
              <T k="cover.prepared">{`Prepared by ${view.lead}, GoCanvas onboarding`}</T>
            </p>
          ) : null}
          {qr ? (
            <div className="wp-qr">
              <img src={qr.dataUrl} alt="" />
              <span>
                <b>Scan for your plan</b>
                Your dates, your part, on your phone.
              </span>
            </div>
          ) : null}
        </div>
        <div className="wp-cover-art">
          {view.photoUrl ? (
            <div className="wp-photo">
              <img src={view.photoUrl} alt="" />
              <span className="wp-photo-cap">
                <Icon name={view.icon} className="h-3.5 w-3.5" />
                {view.industry ?? "Your industry"}
              </span>
            </div>
          ) : (
            <div className="wp-art">
              <div className="wp-art-ring" />
              <div className="wp-art-disc">
                <Icon name={view.icon} className="wp-art-icon" strokeWidth={1.5} />
              </div>
            </div>
          )}
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

function Team({ view, page }: { view: WelcomeView; page: number }) {
  const t = view.team;
  const people: Array<{
    name: string;
    role: string;
    does: string;
    icon: string;
    side: "gocanvas" | "client";
    photoUrl?: string | null;
    bookingUrl?: string | null;
  }> = [];
  if (t.lead)
    people.push({
      name: t.lead,
      role: `${t.leadCard?.title ?? "Onboarding lead"}, GoCanvas`,
      does:
        t.leadCard?.bio ??
        (view.timeline.training
          ? "Runs all three calls, trains the crew on real jobs, watches the first submissions."
          : view.path === "existing"
            ? "Runs both calls, reviews the form with you, watches the first real submissions through."
            : "Runs both calls, builds the first form with you, watches the first submissions."),
      icon: "Wrench",
      side: "gocanvas",
      photoUrl: t.leadCard?.photoUrl ?? null,
      bookingUrl: t.leadCard?.bookingUrl ?? null,
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
    does: roleBlurb(t.champion?.role ?? null, "champion"),
    icon: "Flag",
    side: "client",
  });
  let nth = 0;
  for (const o of t.others ?? []) {
    if (people.some((p) => p.name === o.name)) continue;
    people.push({
      name: o.name,
      role: o.role ? `${o.role}, ${view.clientName}` : view.clientName,
      does: o.does ?? roleBlurb(o.role ?? null, nth++ === 0 ? "other" : "other2"),
      icon: "Users",
      side: "client",
    });
  }
  people.push({
    name: view.fieldTester ?? "Your field tester",
    role: `Field tester, ${view.clientName}`,
    does: "One crew, real jobs, from the field-test day. What they say is what we fix.",
    icon: "HardHat",
    side: "client",
  });
  return (
    <Frame
      k="team"
      page={page}
      eyebrow="Your team"
      title="Two teams,"
      accent="one plan"
      lede="Small on purpose. Everyone here has a job in the next two weeks."
      band="Over fifteen years of onboarding field teams says this is what works, and what gets value fast. Questions go to your onboarding lead by name."
      bandIcon="PhoneCall"
    >
      <div className="wp-team">
        <div className={cn("wp-people", people.length > 4 && "is-five")}>
          {people.map((p) => (
            <div key={p.name + p.role} className={cn("wp-person", `is-${p.side}`)}>
              {p.photoUrl ? (
                <img src={p.photoUrl} alt="" className="wp-avatar" />
              ) : (
                <Tile name={p.icon} tone={p.side === "client" ? "navy" : "blue"} />
              )}
              <div className="wp-person-text">
                <p className="wp-person-name">{p.name}</p>
                <p className="wp-person-role">
                  <T k={tkey("team", p.name, "role")}>{p.role}</T>
                </p>
                <p className="wp-person-does">
                  <T k={tkey("team", p.name, "does")}>{p.does}</T>
                </p>
                {p.bookingUrl ? (
                  <a href={p.bookingUrl} target="_blank" rel="noreferrer" className="wp-book">
                    <CalendarPlus className="h-3 w-3" /> Book time with {firstName(p.name)}
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <div className="wp-team-photo is-phone">
          <div className="wp-team-art" />
          <PhoneMock view={view} className="is-team" />
          <span className="wp-team-photo-cap">
            <Icon name="Smartphone" className="h-3.5 w-3.5" />
            {view.firstForm?.name ?? (view.timeline.training ? "Your jobs" : "Your first form")}, on
            the crew&apos;s phone
          </span>
        </div>
      </div>
    </Frame>
  );
}

/** The plan's internal labels, said the way a customer hears them. */
const CUSTOMER_LABEL: Record<string, string> = {
  close: "Welcome aboard",
};

/**
 * The whole project on one screen, without the detail: how many phases,
 * how long each is, how much of the customer's time it takes, and where
 * they are. The detail lives on each phase's own screen.
 */
function Overview({ view, page }: { view: WelcomeView; page: number }) {
  const t = view.timeline;
  const live = t.milestones.find((m) => m.key === "live");
  const kickoff = t.milestones.find((m) => m.key === "kickoff");
  const working = t.milestones.find((m) => m.key === "working");
  const wk = (n: number) => `${n} wk${n === 1 ? "" : "s"}`;
  const cards = [
    {
      key: 1,
      label: "Phase 1",
      names: [
        view.firstForm?.name ?? (t.training ? "Crew training" : "Your first form"),
        ...t.alongside.map((x) => x.name),
      ],
      marks: [
        t.training ? KIND_MARKS.training : KIND_MARKS.form,
        ...t.alongside.map((x) => markForService({ kind: x.kind, name: x.name })),
      ] as BrandMark[],
      length: `${live?.day ?? 7} business days`,
      when: t.liveDoneOn
        ? `Live ${shortDay(t.liveDoneOn)}`
        : `${shortDay(t.closeDate)} → ${shortDay(t.liveDate)}`,
      yourTime: phaseOneTime(t, kickoff?.minutes ?? 60, working?.minutes ?? 30),
      gate: "Starts the day we begin",
      done: Boolean(t.liveDoneOn),
      now: t.currentPhase === 1,
      tentative: false,
    },
    ...t.phases.map((ph) => {
      const longest = Math.max(...ph.services.map((x) => x.weeks));
      const calls = ph.services.reduce(
        (acc, x) =>
          acc +
          x.milestones.filter((m) => m.kind === "call").reduce((a, m) => a + (m.minutes ?? 0), 0),
        0,
      );
      return {
        key: ph.phase,
        label: ph.label,
        names: ph.services.map((x) => x.name),
        marks: ph.services.map((x) => markForService({ kind: x.kind, name: x.name })),
        length: wk(longest),
        when: ph.done
          ? `Done ${shortDay(ph.endsOn!)}`
          : `${ph.tentative ? "Earliest " : ""}${shortDay(ph.startsOn!)} → ${shortDay(ph.endsOn!)}`,
        yourTime: `${calls || 30} min on ${ph.services.length > 1 ? "kickoff calls" : "a kickoff call"} · a short review`,
        gate: ph.gate,
        done: ph.done,
        now: t.currentPhase === ph.phase && !ph.done,
        tentative: ph.tentative,
      };
    }),
  ];
  const count = cards.length;
  return (
    <Frame
      k="overview"
      page={page}
      eyebrow="At a glance"
      title={
        count === 1
          ? "One phase,"
          : `${["", "One", "Two", "Three", "Four", "Five"][count] ?? count} phases,`
      }
      accent={t.training ? "training first" : "the form first"}
      lede="The shape of the whole project. Each phase has its own screen with the detail — this is how long, how much of your time, and where we are."
      band={
        t.allDone
          ? "Every phase is live. From here the same team runs the working-session format for whatever you add."
          : `You are on ${cards.find((c) => c.now)?.label.toLowerCase() ?? "phase 1"}. ${t.training ? "Nothing after the training starts until the crew has run real jobs on their own." : "Nothing after the form starts until a crew has run the form on real jobs."}`
      }
      bandIcon="Route"
    >
      <div className={cn("wp-ov-row", count > 3 && "is-many")}>
        {cards.map((c) => (
          <div
            key={c.key}
            className={cn(
              "wp-card wp-ov-card",
              c.done && "is-done",
              c.now && "is-now",
              c.tentative && "is-tentative",
            )}
          >
            <div className="wp-ov-head">
              <span className="wp-phase2-tag">{c.label}</span>
              {c.done ? (
                <span className="wp-ov-status is-done">
                  <Check className="h-3 w-3" strokeWidth={3} /> Done
                </span>
              ) : c.now ? (
                <span className="wp-ov-status is-now">You are here</span>
              ) : (
                <span className="wp-ov-status">Later</span>
              )}
            </div>
            <div className="wp-ov-marks">
              {c.marks.map((m, i) => (
                <BrandMarkTile
                  key={`${m.title}-${i}`}
                  mark={m}
                  size="md"
                  override={m.tool ? (view.toolMarks?.[m.tool] ?? null) : null}
                />
              ))}
            </div>
            <h3 className="wp-ov-name">{c.names.join(" + ")}</h3>
            <dl className="wp-ov-facts">
              <div>
                <dt>How long</dt>
                <dd>{c.length}</dd>
              </div>
              <div>
                <dt>When</dt>
                <dd>{c.when}</dd>
              </div>
              <div>
                <dt>Your time</dt>
                <dd>{c.yourTime}</dd>
              </div>
              <div>
                <dt>Opens</dt>
                <dd>{c.gate}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function Plan({ view, page }: { view: WelcomeView; page: number }) {
  const t = view.timeline;
  const existing = view.path === "existing";
  const today = useToday();
  // The step today sits on: the last one whose date is today or earlier and
  // is not yet done. Nothing is marked before the close or after live.
  const todayKey =
    today && today >= t.closeDate && today <= t.liveDate
      ? ([...t.milestones].reverse().find((m) => m.date <= today && !m.doneOn)?.key ?? null)
      : null;
  const days = t.milestones[t.milestones.length - 1]?.day ?? 7;
  return (
    <Frame
      k="plan"
      page={page}
      done={Boolean(t.liveDoneOn)}
      eyebrow="Your timeline"
      title={
        t.training
          ? t.phases.length
            ? "Phase 1: two weeks to a"
            : "Two weeks to a"
          : existing
            ? t.existingBuild === "customer"
              ? "Phase 1: your build,"
              : "Phase 1: your form,"
            : t.phases.length
              ? "Phase 1: three training days to a"
              : "Three training days to a"
      }
      accent={
        t.training
          ? "crew that runs it"
          : existing
            ? t.existingBuild === "customer"
              ? "frozen and integration-ready"
              : "integration-ready"
            : "form in the field"
      }
      lede={
        t.training
          ? "Three thirty-minute calls, a little to do between calls, a week of real jobs in between. Every step below has an owner."
          : existing
            ? t.existingBuild === "customer"
              ? "A kickoff that splits the work, your build with a date, a check-in, real jobs through it, and a freeze. Two weeks, and every step below has an owner."
              : t.existingBuild === "us"
                ? "Three sixty-minute training calls with you driving, real jobs between them. Every step below has an owner."
                : `A review call, a short optimisation session, a few real jobs through it. ${["", "One", "Two", "Three", "Four", "Five", "Six", "Seven"][days] ?? days} business days, and every day below has an owner.`
            : "Three sixty-minute training calls with you driving, a week of real jobs between them. We teach and build together, and by day 3 you build forms without us. Every step below has an owner."
      }
      band={
        t.training
          ? `Live on ${shortDay(t.liveDate)}. Nobody should be left guessing on a job — we drive the pace, and your crew owns the jobs.`
          : existing
            ? `Ready on ${shortDay(t.liveDate)}. An integration reads specific fields — a form optimised for it first is what makes the mapping right, first time.`
            : `Live on ${shortDay(t.liveDate)}. No account should stall waiting on a form — we drive the pace, and you own the form.`
      }
      bandIcon="Rocket"
    >
      <div className="wp-rail">
        <div className="wp-rail-line" />
        {t.milestones.map((m) => (
          <div
            key={m.key}
            className={cn(
              "wp-node",
              m.key === "live" && "is-live",
              m.key === todayKey && "is-today",
            )}
          >
            <span className="wp-node-day">
              {m.key === todayKey ? <i className="wp-today-tag">Today</i> : null}
              {dayLabel(m)}
            </span>
            <span className={cn("wp-node-tile", m.doneOn && "is-done")}>
              <Tile name={m.icon} size="lg" tone={m.key === "live" ? "navy" : "blue"} />
              {m.doneOn ? (
                <span className="wp-done-badge" title={`Done ${shortDay(m.doneOn)}`}>
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              ) : null}
            </span>
            <span className="wp-node-label">
              <T k={tkey("plan", m.key, "label")}>{CUSTOMER_LABEL[m.key] ?? m.label}</T>
            </span>
            <span className={cn("wp-node-date", m.moved && "is-moved", m.doneOn && "is-done")}>
              {m.doneOn ? `Done ${shortDay(m.doneOn)}` : whenLabel(m, t.timezone)}
            </span>
            <Owner owner={m.owner} />
            {m.minutes ? <span className="wp-node-min">{m.minutes} min</span> : null}
            <span className="wp-node-detail">
              <T k={tkey("plan", m.key, "detail")}>{m.detail}</T>
            </span>
          </div>
        ))}
      </div>
      {t.alongside.length ? (
        <div className="wp-alongside">
          <p className="wp-alongside-title">
            Alongside the form, from the kickoff call
            {t.alongside.length > 1 ? ` · ${t.alongside.length} at the same time` : ""}
          </p>
          <div className={cn("wp-alongside-row", t.alongside.length > 2 && "is-many")}>
            {t.alongside.map((svc) => (
              <div key={svc.id} className={cn("wp-alongside-card", svc.doneOn && "is-done")}>
                <span className="wp-node-tile">
                  <Tile name={svc.icon} size="sm" tone={svc.doneOn ? "navy" : "blue"} />
                  {svc.doneOn ? (
                    <span className="wp-done-badge is-sm">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                  ) : null}
                </span>
                <span className="wp-alongside-text">
                  <b>
                    {svc.name}
                    <small>
                      {" "}
                      · {svc.label.toLowerCase()} ·{" "}
                      {svc.doneOn
                        ? `live ${shortDay(svc.doneOn)}`
                        : `${shortDay(svc.startsOn)} → ${shortDay(svc.endsOn)}`}
                    </small>
                  </b>
                  <span>
                    <em>We need from you:</em> {svc.needs}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {t.phases.length ? (
        <p className="wp-next-hint">
          After the form:{" "}
          {t.phases.length === 1
            ? "phase 2 has its own screen, next."
            : `phases 2 to ${t.phases[t.phases.length - 1]!.phase} each have their own screen, next.`}
        </p>
      ) : null}
      <div className="wp-legend">
        <span>
          <Owner owner="gocanvas" /> we do it, you hear about it
        </span>
        <span>
          <Owner owner="client" /> your part before the next call, fifteen minutes
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

/**
 * One screen per phase after the form. The form's screen stays the form's;
 * everything on the order that comes after it gets its own page, with the
 * whole map at the top so the customer can see where they are.
 */
function PhaseScreen({ view, phase: ph, page }: { view: WelcomeView; phase: Phase; page: number }) {
  const t = view.timeline;
  const map = [
    {
      phase: 1,
      label: "Phase 1",
      name: [
        view.firstForm?.name ?? (t.training ? "Crew training" : "Your first form"),
        ...t.alongside.map((x) => x.name),
      ].join(" + "),
      when: t.liveDoneOn ? `Live ${shortDay(t.liveDoneOn)}` : `Live ${shortDay(t.liveDate)}`,
      done: Boolean(t.liveDoneOn),
      now: t.currentPhase === 1,
      tentative: false,
    },
    ...t.phases.map((x) => ({
      phase: x.phase,
      label: x.label,
      name: x.services.map((y) => y.name).join(" + "),
      when: x.done
        ? `Done ${shortDay(x.endsOn!)}`
        : `${x.tentative ? "Earliest " : ""}${shortDay(x.startsOn!)} → ${shortDay(x.endsOn!)}`,
      done: x.done,
      now: t.currentPhase === x.phase && !x.done,
      tentative: x.tentative,
    })),
  ];
  const names = ph.services.map((x) => x.name).join(" + ");
  const accent =
    ph.services.length > 2 || names.length > 44 ? `${ph.services.length} things at once` : names;
  const lede = ph.done
    ? `Done ${shortDay(ph.endsOn!)}. ${ph.gate}.`
    : ph.tentative
      ? `${ph.gate} — earliest ${shortDay(ph.startsOn!)}. ${ph.services.length > 1 ? "Both worked on at the same time." : "Dates are estimates until then."}`
      : `${ph.gate}, so it runs ${shortDay(ph.startsOn!)} to ${shortDay(ph.endsOn!)}.${ph.services.length > 1 ? " Both worked on at the same time." : ""}`;
  const band =
    ph.phase === 2
      ? "The form first, always. Field mapping, PDFs and dashboards are built on real submissions, which is why they come second."
      : `${ph.label} opens with its own thirty-minute kickoff to gather the final details — the ones we cannot know until the form is real.`;
  const compact = ph.services.length > 2;
  return (
    <Frame
      k={`phase-${ph.phase}`}
      page={page}
      done={ph.done}
      eyebrow={`After the form · ${ph.label}`}
      title={`${ph.label}:`}
      accent={accent}
      lede={lede}
      band={band}
      bandIcon="Route"
    >
      <div className="wp-phasemap">
        {map.map((p, i) => (
          <div key={p.phase} className="wp-phasemap-item">
            <div
              className={cn(
                "wp-phasemap-chip",
                p.done && "is-done",
                p.now && "is-now",
                p.tentative && "is-tentative",
                p.phase === ph.phase && "is-this",
              )}
            >
              <span className="wp-phasemap-no">{p.label}</span>
              <span className="wp-phasemap-name">{p.name}</span>
              <span className="wp-phasemap-when">{p.when}</span>
              {p.now ? <span className="wp-phasemap-here">You are here</span> : null}
            </div>
            {i < map.length - 1 ? <span className="wp-phasemap-arrow" /> : null}
          </div>
        ))}
      </div>
      <div
        className={cn(
          "wp-svc-cards",
          compact && "is-compact",
          ph.services.length === 2 && "is-two",
        )}
      >
        {ph.services.map((svc) => (
          <div
            key={svc.id}
            className={cn(
              "wp-card wp-svc-card",
              ph.tentative && "is-tentative",
              svc.doneOn && "is-done",
            )}
          >
            <div className="wp-svc-head">
              <span className="wp-node-tile is-sm">
                <Tile name={svc.icon} tone={svc.doneOn ? "navy" : "blue"} />
                {svc.doneOn ? (
                  <span className="wp-done-badge is-sm">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                ) : null}
              </span>
              <span className="wp-svc-text">
                <b>{svc.name}</b>
                <small>
                  {svc.label}
                  {svc.tier ? ` · tier ${svc.tier}` : ""} · {svc.weeks} wk
                  {svc.weeks === 1 ? "" : "s"}
                </small>
              </span>
              <span className="wp-svc-when">
                {svc.doneOn
                  ? `Live ${shortDay(svc.doneOn)}`
                  : `${ph.tentative ? "Earliest " : ""}${shortDay(svc.startsOn)} → ${shortDay(svc.endsOn)}`}
              </span>
            </div>
            {compact ? (
              <p className="wp-svc-steps-line">{svc.milestones.map((m) => m.label).join(" → ")}</p>
            ) : (
              <div className="wp-svc-rail">
                <div className="wp-svc-rail-line" />
                {svc.milestones.map((m) => (
                  <div key={m.key} className={cn("wp-svc-step", m.doneOn && "is-done")}>
                    <span className="wp-node-tile">
                      <Tile name={m.icon} size="sm" tone={m.doneOn ? "navy" : "light"} />
                      {m.doneOn ? (
                        <span className="wp-done-badge is-sm">
                          <Check className="h-2.5 w-2.5" strokeWidth={3} />
                        </span>
                      ) : null}
                    </span>
                    <span className="wp-svc-step-label">{m.label}</span>
                    <span className={cn("wp-svc-step-date", m.doneOn && "is-done")}>
                      {m.doneOn
                        ? `Done ${shortDay(m.doneOn)}`
                        : `${ph.tentative ? "≈ " : ""}${whenLabel(m, t.timezone)}`}
                    </span>
                    <span className="wp-svc-step-owner">
                      <Owner owner={m.owner} />
                      {m.minutes ? <span className="wp-node-min">{m.minutes} min</span> : null}
                    </span>
                    <span className="wp-svc-step-detail">{m.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Frame>
  );
}

/**
 * "Get started on your own": the help-centre articles for the features the
 * calls flagged, each with why in the customer's words. On the customer's
 * page every link is tracked through /go; the internal preview links direct.
 */
function HelpScreen({ view, page }: { view: WelcomeView; page: number }) {
  const picks = view.helpPicks;
  return (
    <Frame
      k="help"
      page={page}
      eyebrow="Jump start your journey"
      title="Key features"
      accent="your team discussed"
      lede="From your calls with us: the features your team said would make the difference, and how to do each one yourself. Open one, try it on a real job, and bring the question to the next call."
      band="Every article here is one your team asked about. Between calls, this is where to start."
      bandIcon="BookOpen"
    >
      <div className="wp-help">
        {picks.map((p) => (
          <a
            key={p.article_id}
            className="wp-help-card"
            href={view.goBase ? `${view.goBase}/${p.article_id}` : p.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            <Tile name="BookOpen" size="lg" tone="blue" />
            <div>
              {p.when ? <span className="wp-help-when">{p.when}</span> : null}
              <h3>{p.title}</h3>
              <p>
                <T k={`help.${p.article_id}.why`}>
                  {p.why || "One of the features that came up on your calls."}
                </T>
              </p>
            </div>
          </a>
        ))}
      </div>
    </Frame>
  );
}

function Together({
  view,
  mode,
  onTick,
  page,
}: {
  view: WelcomeView;
  mode: WelcomeMode;
  page: number;
  onTick?: ((key: HomeworkKey, done: boolean) => Promise<void> | void) | undefined;
}) {
  const due = view.timeline.milestones.find((m) => m.key === "homework");
  const [busy, setBusy] = useState<string | null>(null);
  const existing = view.path === "existing";
  // The homework text comes from the plan's kickoff step, so the two paths
  // ask for different things under the same three tick boxes.
  const homeworkText =
    view.timeline.milestones.find((m) => m.key === "kickoff")?.homework ??
    HOMEWORK.map((h) => h.text);
  const homework = HOMEWORK.map((h, i) => ({ key: h.key, text: homeworkText[i] ?? h.text }));
  return (
    <Frame
      k="together"
      page={page}
      eyebrow="What's expected"
      title={existing ? "We optimise it" : "We build it"}
      accent="with you, not for you"
      lede={
        existing
          ? "A form you adjusted yourself is one you will keep right — and the integration built on it stays right."
          : "A form you built yourself is one you will change yourself — and the second use case shows up on its own."
      }
      band={
        existing
          ? "Fifteen minutes on your side means the optimisation session starts from your real form and your real output."
          : "Fifteen minutes on your side means the second session starts from a live account, not a blank one."
      }
      bandIcon="Users"
    >
      <div className="wp-two">
        <div className="wp-card">
          <div className="wp-card-head">
            <Tile name="Users" tone="blue" />
            <h3>We bring</h3>
          </div>
          <ul className="wp-ticks">
            {existing ? (
              <>
                <Tick k="together.we.1">
                  A field-by-field read of your form against what the integration needs
                </Tick>
                <Tick k="together.we.2">
                  The changes, made live on the call, with you watching every field
                </Tick>
                <Tick k="together.we.3">
                  The mapping, named the way the office system names things
                </Tick>
                <Tick k="together.we.4">
                  Someone watching the first real submissions come through
                </Tick>
              </>
            ) : (
              <>
                <Tick k="together.we.5">
                  A starting point from the form library, in your vocabulary
                </Tick>
                <Tick k="together.we.6">
                  The build, live on the call, with you watching every field
                </Tick>
                <Tick k="together.we.7">The logic, routing and notifications the office needs</Tick>
                <Tick k="together.we.8">Someone watching the first submissions come in</Tick>
              </>
            )}
          </ul>
        </div>
        <div className="wp-card">
          <div className="wp-card-head">
            <Tile name="HardHat" tone="blue" />
            <h3>You bring</h3>
          </div>
          <ul className="wp-ticks">
            {existing ? (
              <>
                <Tick k="together.you.1">
                  The form the integration reads from, as your crews run it today
                </Tick>
                <Tick k="together.you.2">
                  One example of the output the office needs on the other side
                </Tick>
                <Tick k="together.you.3">Who owns the field mapping on your side, by name</Tick>
                <Tick k="together.you.4">
                  The last changes, made by you, in the optimisation session
                </Tick>
              </>
            ) : (
              <>
                <Tick k="together.you.5">
                  How the job actually runs — the process, not the org chart
                </Tick>
                <Tick k="together.you.6">One field user willing to try it on real work</Tick>
                <Tick k="together.you.7">The customer or site list, so nothing is typed twice</Tick>
                <Tick k="together.you.8">
                  The last changes, made by you, in the working session
                </Tick>
              </>
            )}
          </ul>
        </div>
      </div>
      <div className="wp-homework">
        <p className="wp-homework-title">
          Your part before the {existing ? "optimisation" : "working"} session
          {due ? ` · due ${shortDay(due.date)}` : ""}
        </p>
        <div className="wp-homework-row">
          {homework.map((h) => {
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
                <span>
                  <T k={tkey("together", "homework", h.key)}>{h.text}</T>
                </span>
              </button>
            );
          })}
        </div>
        {view.timeline.alongside.length ? (
          <ul className="wp-homework-extra">
            {view.timeline.alongside.map((svc) => (
              <li key={svc.id}>
                <b>For {svc.name}:</b> {svc.needs}
                {needTiming(svc, due?.date ?? null)}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="wp-getapp">
          <SmartphoneIcon className="h-4 w-4" />
          <span>Get the GoCanvas app:</span>
          <a href={GOCANVAS_APP.ios} target="_blank" rel="noreferrer" className="wp-store">
            App Store
          </a>
          <a href={GOCANVAS_APP.android} target="_blank" rel="noreferrer" className="wp-store">
            Google Play
          </a>
          <a href={GOCANVAS_APP.any} target="_blank" rel="noreferrer" className="wp-store is-plain">
            gocanvas.com/m
          </a>
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

function FirstForm({ view, page }: { view: WelcomeView; page: number }) {
  const at = (key: string) => view.timeline.milestones.find((m) => m.key === key);
  const f = view.firstForm;
  const phase2 = view.timeline.phases[0] ?? null;
  const live = shortDay(view.timeline.liveDate);
  const existing = view.path === "existing";
  const lastDay = view.timeline.milestones[view.timeline.milestones.length - 1]?.day ?? 7;
  const today =
    view.currentProcess ??
    (existing
      ? "The form works in the field, but the office still retypes what it collects into the other system."
      : view.path === "dm_conversion"
        ? "The crew runs your forms in Device Magic today; the office works from what it sends. Same jobs, same forms — moved over one at a time, starting with the one they use most."
        : view.timeline.training
          ? "The app is on the phones, but nobody has walked the crew through a real job on it yet — so it waits, and the old way carries on."
          : "Paper on the truck, photos on somebody's phone, and the office retyping it all at the end of the week.");
  return (
    <Frame
      k="form"
      page={page}
      eyebrow="How we get there"
      title="From today to"
      accent={`day ${["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][lastDay] ?? lastDay}`}
      band={
        existing
          ? `Optimised before anything is connected to it. That is what makes the mapping right, first time.`
          : `Proven in the field before anything is connected to it. That is what makes the mapping right later.`
      }
      bandIcon="Target"
    >
      <div className="wp-journey">
        <div className="wp-journey-col is-now">
          <span className="wp-journey-tag">Today</span>
          <div className="wp-journey-art">
            <div className="wp-paper">
              <FileText className="h-7 w-7" />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
          <h3>How it runs now</h3>
          {view.currentProcess && view.currentProcessSource !== "person" ? (
            // The brief's paraphrase, or the generic line: said plainly, not
            // put in the customer's mouth with quotation marks.
            <p className="wp-journey-quote">
              <T k="form.now">{today}</T>
            </p>
          ) : (
            <p className="wp-journey-quote">
              &ldquo;
              <T k="form.now">{today}</T>
              &rdquo;
            </p>
          )}
          <ul className="wp-journey-pains">
            {existing ? (
              <>
                <li>Retyped into the office system</li>
                <li>Fields named two ways</li>
                <li>Nothing connected</li>
              </>
            ) : (
              <>
                <li>Retyped</li>
                <li>Late</li>
                <li>No photos, no signature</li>
              </>
            )}
          </ul>
        </div>
        <span className="wp-journey-arrow" />
        <div className="wp-journey-col is-then">
          <span className="wp-journey-tag is-blue">
            Day {lastDay} · {live}
          </span>
          <div className="wp-journey-art">
            <PhoneMock view={view} className="is-flow" />
          </div>
          <h3>
            {f?.name ?? (view.timeline.training ? "Your crew" : "Your first form")}
            {existing
              ? ", ready for the integration"
              : view.timeline.training
                ? ", running it on every job"
                : " in the field"}
          </h3>
          <p>
            {existing ? (
              <>
                Reviewed together{" "}
                {at("kickoff") ? shortDay(at("kickoff")!.date) : "on the review call"}, adjusted by
                your hands{" "}
                {at("working") ? shortDay(at("working")!.date) : "in the optimisation session"}, run
                on real jobs by {view.fieldTester ?? "your crew"}.
              </>
            ) : (
              <>
                Built live {at("kickoff") ? shortDay(at("kickoff")!.date) : "on the kickoff"},
                finished by your hands{" "}
                {at("working") ? shortDay(at("working")!.date) : "in the working session"}, proven
                by {view.fieldTester ?? "your field tester"} on real jobs.
              </>
            )}
            {view.timeline.alongside.length
              ? ` Alongside it: ${view.timeline.alongside.map((x) => x.name).join(" + ")}.`
              : ""}
          </p>
          <ul className="wp-journey-wins">
            {existing ? (
              <>
                <li>Every field the integration needs</li>
                <li>Named the way the office system names them</li>
                <li>Proven on real submissions</li>
              </>
            ) : (
              <>
                <li>Same day in the office</li>
                <li>Photos and a signature on every one</li>
                <li>Nothing retyped</li>
              </>
            )}
          </ul>
        </div>
        <span className="wp-journey-arrow" />
        <div className="wp-journey-col is-future">
          <span className="wp-journey-tag is-navy">{phase2 ? "After the form" : "Then"}</span>
          <div className="wp-journey-art">
            <div className="wp-office">
              <span className="wp-office-tile">
                <Cloud className="h-6 w-6" />
              </span>
              <span className="wp-office-tile">
                <Table2 className="h-6 w-6" />
              </span>
              <span className="wp-office-tile">
                <Workflow className="h-6 w-6" />
              </span>
              <span className="wp-office-tile is-pdf" title="A PDF from every submission">
                <FileText className="h-6 w-6" />
              </span>
            </div>
          </div>
          <h3>
            <T k="form.future.head">
              {phase2 ? "Connected to the office" : "The next forms, built by you"}
            </T>
          </h3>
          <p>
            {phase2
              ? `Once the form is proven on real jobs, the rest of your order builds on it — ${view.timeline.phases.length === 1 ? "phase 2, on its own screen" : `phases 2 to ${view.timeline.phases[view.timeline.phases.length - 1]!.phase}, each on its own screen`}.`
              : view.nextUseCases.length
                ? `${view.nextUseCases.map((n) => n.name).join(" · ")}. Same team, same working-session format, whenever you are ready.`
                : view.timeline.training
                  ? "We pick them together once the crew is running it on their own."
                  : "We pick them together once the first form is in the field."}
          </p>
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

function Business({
  view,
  icsBase,
  page,
}: {
  view: WelcomeView;
  icsBase: string | null;
  page: number;
}) {
  const t = view.timeline;
  // The whole plan's last day, when there is more than the form.
  const planEnd = t.phases.length ? (t.phases[t.phases.length - 1]?.endsOn ?? null) : null;
  const kickoff = t.milestones.find((m) => m.key === "kickoff");
  const working = t.milestones.find((m) => m.key === "working");
  // The training plan's third call: the last step before live, when it is a call.
  const adjust = t.milestones.find((m) => m.key === "adjust");
  const third = adjust && adjust.kind === "call" ? adjust : null;
  const integ = t.integration;
  const next = view.nextUseCases.slice(0, 3);
  return (
    <Frame
      k="business"
      page={page}
      eyebrow="Let's get into business"
      title={third ? "Three calls, then" : "Two calls, then"}
      accent="it's yours"
      band={
        planEnd
          ? `${t.training ? "Crew live" : view.path === "existing" ? "Form ready" : "First form live"} on ${shortDay(t.liveDate)}; everything in your plan live by ${shortDay(planEnd)}. If any of the three on the right is not true that day, we are not done — and we say so.`
          : `${view.path === "existing" ? "Ready" : "Live"} on ${shortDay(t.liveDate)}. If any of the three on the right is not true that day, we are not done — and we say so.`
      }
      bandIcon="Rocket"
    >
      <div className="wp-business">
        <div className="wp-calls">
          <div className="wp-call">
            <Tile name="PhoneCall" size="lg" tone="blue" />
            <div>
              <p className="wp-call-when">
                {kickoff ? whenLabel(kickoff, t.timezone) : "Day 1"} · {kickoff?.minutes ?? 60} min
                {icsBase && kickoff ? (
                  <a className="wp-call-ics" href={`${icsBase}?event=kickoff`}>
                    <CalendarPlus className="h-3 w-3" /> Add to calendar
                  </a>
                ) : null}
              </p>
              <h3>
                <T k="business.call1.head">{kickoff?.label ?? "Kickoff & build session"}</T>
              </h3>
              <p>
                <T k="business.call1.body">
                  {t.training
                    ? "How to find your way around the admin portal, and how to build a form — you build one with us on the call, start to finish. You leave with three things to do before the next call."
                    : t.existingBuild === "customer"
                      ? "You build the form, we build the integration. Agree the split out loud: which form, by when, and the fields the integration needs from it. You leave with three things to do before the next call."
                      : t.existingBuild === "review"
                        ? "Walk the form the integration reads from, field by field, and decide together what it needs. You leave with three things to do before the next call."
                        : "Meet, agree how we work, and build the first form live on the call — your hands on the keyboard, we guide. You leave with three things to do before the next call."}
                </T>
              </p>
            </div>
          </div>
          <div className="wp-call">
            <Tile name="Wrench" size="lg" tone="blue" />
            <div>
              <p className="wp-call-when">
                {working ? whenLabel(working, t.timezone) : "Day 3"} · {working?.minutes ?? 30} min
                {icsBase && working ? (
                  <a className="wp-call-ics" href={`${icsBase}?event=working`}>
                    <CalendarPlus className="h-3 w-3" /> Add to calendar
                  </a>
                ) : null}
              </p>
              <h3>
                <T k="business.call2.head">{working?.label ?? "Working session"}</T>
              </h3>
              <p>
                <T k="business.call2.body">
                  {t.training
                    ? "Load your client or parts list as reference data, add the advanced calculations your jobs need, and build the PDF the office receives."
                    : t.existingBuild === "customer"
                      ? "A check-in on your build. The fields the integration needs are there, or we say which are missing — while there is still time."
                      : t.existingBuild === "review"
                        ? "Your hands on the keyboard. The fields the integration needs, named the way the other system names them, then a few real jobs through it."
                        : "Your hands on the keyboard. Finish the form, add the logic and notifications, hand it to the field tester."}
                </T>
              </p>
            </div>
          </div>
          {third ? (
            <div className="wp-call">
              <Tile name="Target" size="lg" tone="blue" />
              <div>
                <p className="wp-call-when">
                  {whenLabel(third, t.timezone)} · {third.minutes ?? 30} min
                  {icsBase ? (
                    <a className="wp-call-ics" href={`${icsBase}?event=adjust`}>
                      <CalendarPlus className="h-3 w-3" /> Add to calendar
                    </a>
                  ) : null}
                </p>
                <h3>
                  <T k="business.call3.head">{third.label}</T>
                </h3>
                <p>
                  <T k="business.call3.body">
                    Submissions, reports and exports: where the data lands, how the office works
                    from it, and what to connect it to next.
                  </T>
                </p>
              </div>
            </div>
          ) : null}
          <div className="wp-after">
            {t.phases.length ? (
              <>
                <p className="wp-after-title">
                  After the form:{" "}
                  {t.phases.length === 1
                    ? "phase 2"
                    : `phases 2 to ${t.phases[t.phases.length - 1]!.phase}`}
                  , on {t.phases.length === 1 ? "its" : "their"} own screen
                  {t.phases.length === 1 ? "" : "s"}
                </p>
                <p className="wp-after-body">
                  Each one opens with a thirty-minute kickoff to gather the final details. The form
                  first, always — nothing there starts until a crew has run it on real jobs.
                </p>
              </>
            ) : (
              <>
                <p className="wp-after-title">Then, the next ones — built by you</p>
                <p className="wp-after-body">
                  {next.length
                    ? next.map((n) => n.name).join(" · ")
                    : t.training
                      ? "We pick these together once the crew is running it on their own."
                      : "We pick these together once the first form is in the field."}
                </p>
              </>
            )}
          </div>
        </div>
        <div className="wp-card wp-good">
          <p className="wp-good-eyebrow">What good looks like on {shortDay(t.liveDate)}</p>
          {view.team.lead ? (
            <p className="wp-good-contact">
              {view.team.leadCard?.photoUrl ? (
                <img src={view.team.leadCard.photoUrl} alt="" className="wp-avatar is-sm" />
              ) : (
                <Tile name="PhoneCall" size="sm" tone="blue" />
              )}
              <span>
                <b>{view.team.lead}</b>, your{" "}
                {view.team.leadCard?.title?.toLowerCase() ?? "onboarding lead"}
                {view.team.leadEmail ? (
                  <>
                    {" · "}
                    <a href={`mailto:${view.team.leadEmail}`}>{view.team.leadEmail}</a>
                  </>
                ) : null}
                {view.team.leadCard?.bookingUrl ? (
                  <>
                    {" · "}
                    <a href={view.team.leadCard.bookingUrl} target="_blank" rel="noreferrer">
                      Book time with {firstName(view.team.lead)}
                    </a>
                  </>
                ) : null}
              </span>
            </p>
          ) : null}
          <ul className="wp-ticks">
            <Tick k="business.good.1">
              Your crew submits from the phone, on the job, with photos and a signature.
            </Tick>
            <Tick k="business.good.2">
              The office sees the work as it happens — no retyping, no Friday pile.
            </Tick>
            <Tick k="business.good.3">
              The crew asked for a change, and it was made the same day.
            </Tick>
          </ul>
          <div className="wp-good-cta">
            <span className="wp-good-cta-label">Your next step</span>
            <span className="wp-good-cta-text">
              Accept the {view.path === "existing" ? "review call" : "kickoff"} invite for{" "}
              {kickoff ? shortDay(kickoff.date) : "day one"} and download the app.
            </span>
            <span className="wp-good-cta-links">
              <a href={GOCANVAS_APP.ios} target="_blank" rel="noreferrer">
                App Store
              </a>
              <a href={GOCANVAS_APP.android} target="_blank" rel="noreferrer">
                Google Play
              </a>
            </span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ---------- deck arithmetic and wording ---------- */

/**
 * The customer's time in phase 1: every call on the phase, the form's two
 * and each service's, plus the homework. The old line counted the form's
 * two calls only and read "90 minutes" to a customer whose Monday held
 * three and a half hours of sessions.
 */
function phaseOneTime(t: Timeline, kickoffMinutes: number, workingMinutes: number): string {
  const serviceCalls = t.alongside.flatMap((svc) =>
    svc.milestones.filter((m) => m.kind === "call" && m.minutes),
  );
  // The training plan's third call, when there is one.
  const extra = t.milestones.filter(
    (m) => m.kind === "call" && m.key !== "kickoff" && m.key !== "working",
  );
  const minutes =
    kickoffMinutes +
    workingMinutes +
    extra.reduce((sum, m) => sum + (m.minutes ?? 0), 0) +
    serviceCalls.reduce((sum, m) => sum + (m.minutes ?? 0), 0);
  const calls = 2 + extra.length + serviceCalls.length;
  const homework = 15 + 5 * t.alongside.length;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const time = h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
  return `${time} on ${calls} call${calls === 1 ? "" : "s"} · ${homework} min on your side`;
}

/** When a service's ask is needed, next to the shared homework due date. */
function needTiming(svc: ServicePlan, homeworkDue: string | null): string {
  // The SOW wrote its own deadline into the ask ("within 10 business days
  // of kickoff"): repeating a different one beside it is the contradiction.
  if (/within \d+|by [A-Z][a-z]{2}|no later than|business days/i.test(svc.needs)) return "";
  const first = svc.milestones.find((m) => m.kind === "call") ?? svc.milestones[0];
  if (!first) return "";
  if (homeworkDue && first.date > homeworkDue) return ` Needed by ${shortDay(first.date)}.`;
  return ` Bring it to the ${first.label.toLowerCase()} on ${shortDay(first.date)}.`;
}

const EXEC = /vp|vice president|president|ceo|coo|cfo|owner|sponsor|director|buyer|principal/i;
const OPS = /operations|\bops\b|manager|superintendent|foreman|supervisor|lead|coordinator/i;
const OFFICE = /admin|office|dispatch|controller|accounting|billing|bookkeep|hr\b/i;
const SYSTEMS = /\bit\b|systems|technology|erp|data|analyst|engineer|integration/i;
const FIELD = /field|technician|tech\b|crew|inspector|assessor|driver/i;

/**
 * One line on what a customer-side person does, from their title. Two people
 * on one slide never get the same line: the second unnamed role gets the
 * second wording.
 */
function roleBlurb(role: string | null, slot: "champion" | "other" | "other2"): string {
  const r = role ?? "";
  if (EXEC.test(r))
    return slot === "champion"
      ? "Sponsors the project on your side. Decides what good looks like, and what comes next."
      : "Sponsors the project. Hears the results at the end and decides what comes next.";
  if (SYSTEMS.test(r))
    return "Owns the systems end: logins, the data we load, and the integration when there is one.";
  if (OFFICE.test(r))
    return "Runs the office side: what happens after a submission — the export, the PDF, the follow-up.";
  if (FIELD.test(r)) return "In the field. Runs the form on real jobs and says what to fix.";
  if (OPS.test(r) || slot === "champion")
    return slot === "champion"
      ? "Owns the plan on your side. Makes the last changes to the form in the working session."
      : "Owns the day-to-day. Decides what the form asks and who runs it first.";
  return slot === "other2"
    ? "Named on the calls. Reviews the form before the crew gets it."
    : "Named on the calls. Signs off on the parts that touch their work.";
}
