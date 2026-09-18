import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ImagePlus } from "lucide-react";

import { saveBranding, uploadOrgLogo } from "@/lib/org-branding.functions";
import { INTERFACE_THEMES, NAV_SCHEMES, schemeFor, type InterfaceTheme } from "@/lib/org-branding";
import type { ThemeChoice } from "@/lib/interface-theme";
import { useOrgBranding } from "@/lib/use-branding";
import { useThemeChoice } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

/**
 * Make this deployment look like the team that uses it: their mark, their name
 * for the product, and a nav colour.
 *
 * The colour is chosen from a fixed set rather than a hex field, and that is a
 * deliberate limit rather than an unfinished one. Contrast is not a matter of
 * taste — the person picking a brand colour is not necessarily the person who
 * has to read the nav for eight hours — so each preset is a matched set of
 * surface, text, muted text, active row and border that stays legible together.
 * Every swatch below previews the real thing.
 */

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

/** What each theme looks like, in miniature: the real values, not a guess. */
const THEME_SWATCH: Record<
  InterfaceTheme,
  {
    bg: string;
    nav: string;
    card: string;
    line: string;
    ink: string;
    primary: string;
    accent: string;
    font: string;
  }
> = {
  classic: {
    bg: "oklch(0.945 0.004 250)",
    nav: "oklch(0.925 0.005 250)",
    card: "#ffffff",
    line: "oklch(0.8 0.008 250)",
    ink: "oklch(0.2 0.014 250)",
    primary: "oklch(0.3 0.02 250)",
    accent: "oklch(0.6 0.08 200)",
    font: '"IBM Plex Sans", system-ui, sans-serif',
  },
  gocanvas: {
    bg: "#f3f5f9",
    nav: "#072b57",
    card: "#ffffff",
    line: "#d6effb",
    ink: "#072b57",
    primary: "#039de7",
    accent: "#f37021",
    font: '"Plus Jakarta Sans", system-ui, sans-serif',
  },
};
const MAX_BYTES = 1_000_000;

export function AppearanceSettings({ canManage }: { canManage: boolean }) {
  const branding = useOrgBranding();
  const qc = useQueryClient();
  const save = useServerFn(saveBranding);
  const upload = useServerFn(uploadOrgLogo);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    await qc.invalidateQueries({ queryKey: ["org-branding"] });
  };

  const schemeMutation = useMutation({
    mutationFn: (nav_scheme: string) => save({ data: { nav_scheme } }),
    onSuccess: refresh,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Could not save."),
  });

  const themeMutation = useMutation({
    mutationFn: (theme: InterfaceTheme) => save({ data: { theme } }),
    onSuccess: refresh,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Could not save."),
  });
  const [choice, setChoice] = useThemeChoice();

  const nameMutation = useMutation({
    mutationFn: (app_name: string) => save({ data: { app_name } }),
    onSuccess: async () => {
      setName(null);
      await refresh();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Could not save."),
  });

  const logoMutation = useMutation({
    mutationFn: async (file: File) => {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.readAsDataURL(file);
      });
      return upload({
        data: {
          fileName: file.name,
          contentType: file.type as "image/png",
          dataBase64,
        },
      });
    },
    onSuccess: refresh,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Upload failed."),
  });

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) {
      setError("PNG, JPEG, WebP or GIF only. SVG is not accepted.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That file is ${Math.round(file.size / 1000)}kB. The limit is 1MB.`);
      return;
    }
    setError(null);
    logoMutation.mutate(file);
  };

  const busy =
    schemeMutation.isPending ||
    nameMutation.isPending ||
    logoMutation.isPending ||
    themeMutation.isPending;
  const current = schemeFor(branding.nav_scheme);
  const nameValue = name ?? branding.app_name;

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">Appearance</h2>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          {canManage
            ? "Your mark, your name for this tool, and the colour of the navigation. Applies to everyone."
            : "Set by an admin, manager or super admin. Shown here for reference."}
        </p>
      </header>

      <div className="space-y-4 px-4 py-3">
        {/* Logo + name, laid out the way they appear in the sidebar. */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Logo
            </span>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-sm border border-border bg-background">
                {branding.logo_url ? (
                  <img
                    src={branding.logo_url}
                    alt="The current logo"
                    className="h-full w-full object-contain p-0.5"
                  />
                ) : (
                  <ImagePlus className="h-4 w-4 text-muted-foreground" aria-hidden />
                )}
              </span>
              {canManage ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="rounded-sm border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {logoMutation.isPending ? "Uploading…" : branding.logo_url ? "Replace" : "Upload"}
                </button>
              ) : null}
            </div>
          </div>

          <label className="space-y-1">
            <span className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Name in the sidebar
            </span>
            <span className="flex items-center gap-2">
              <input
                value={nameValue}
                disabled={!canManage || busy}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                className="h-7 w-64 rounded-sm border border-border bg-background px-2 text-[12px] outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
              />
              {canManage && name !== null && name.trim() && name !== branding.app_name ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => nameMutation.mutate(name.trim())}
                  className="rounded-sm border border-border px-2 py-1 text-[11px] disabled:opacity-50"
                >
                  Save
                </button>
              ) : null}
            </span>
          </label>
        </div>

        {/* The interface theme: the team's default, then this person's own
            choice. Classic is the look the tool was built with and stays the
            default; nobody's screen changes unless they, or their admin, ask. */}
        <div className="space-y-1.5">
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Interface theme · team default
          </span>
          <div className="flex flex-wrap gap-2">
            {INTERFACE_THEMES.map((t) => {
              const active = t.key === branding.theme;
              const swatch = THEME_SWATCH[t.key];
              return (
                <button
                  key={t.key}
                  type="button"
                  disabled={!canManage || busy}
                  onClick={() => themeMutation.mutate(t.key)}
                  aria-pressed={active}
                  title={t.note}
                  className={cn(
                    "w-[200px] overflow-hidden rounded-sm border text-left disabled:cursor-default",
                    active ? "border-ring ring-1 ring-ring" : "border-border",
                  )}
                >
                  <span
                    className="flex h-12 items-center gap-1.5 px-2"
                    style={{ backgroundColor: swatch.bg, fontFamily: swatch.font }}
                  >
                    <span
                      className="h-8 w-5 rounded-[3px]"
                      style={{ backgroundColor: swatch.nav }}
                    />
                    <span
                      className="flex h-8 flex-1 flex-col justify-center gap-1 rounded-[3px] border px-1.5"
                      style={{ backgroundColor: swatch.card, borderColor: swatch.line }}
                    >
                      <span
                        className="h-1.5 w-12 rounded-full"
                        style={{ backgroundColor: swatch.ink }}
                      />
                      <span className="flex gap-1">
                        <span
                          className="h-1.5 w-6 rounded-full"
                          style={{ backgroundColor: swatch.primary }}
                        />
                        <span
                          className="h-1.5 w-3 rounded-full"
                          style={{ backgroundColor: swatch.accent }}
                        />
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center justify-between px-2 py-1 text-[11px]">
                    <span className="font-medium">{t.name}</span>
                    {active ? <Check className="h-3 w-3" aria-hidden /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {canManage
              ? "Applies to everyone who has not chosen for themselves below."
              : "The team default. Pick your own below if you prefer the other look."}
          </p>
        </div>

        <div className="space-y-1.5">
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            For you, on this browser
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["team", "Follow the team default"],
                ["classic", "Classic"],
                ["gocanvas", "GoCanvas"],
              ] as Array<[ThemeChoice, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setChoice(key)}
                aria-pressed={choice === key}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px]",
                  choice === key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Your choice stays on this browser and beats the team default. Nobody else sees it.
          </p>
        </div>

        {/* Swatches preview the real variables, so what you pick is what lands. */}
        <div className="space-y-1.5">
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Navigation colour
          </span>
          <div className="flex flex-wrap gap-2">
            {NAV_SCHEMES.map((s) => {
              const active = s.key === current.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={!canManage || busy}
                  onClick={() => schemeMutation.mutate(s.key)}
                  aria-pressed={active}
                  title={s.note}
                  className={cn(
                    "w-[132px] overflow-hidden rounded-sm border text-left disabled:cursor-default",
                    active ? "border-ring ring-1 ring-ring" : "border-border",
                  )}
                >
                  <span
                    className="flex h-11 flex-col justify-center gap-1 px-2"
                    style={{ backgroundColor: s.vars["--nav-bg"] }}
                  >
                    <span
                      className="h-1.5 w-14 rounded-full"
                      style={{ backgroundColor: s.vars["--nav-fg"] }}
                    />
                    <span
                      className="h-1.5 w-9 rounded-full"
                      style={{ backgroundColor: s.vars["--nav-muted"] }}
                    />
                  </span>
                  <span className="flex items-center justify-between gap-1 px-2 py-1">
                    <span className="text-[11px] font-medium">{s.name}</span>
                    {/* A tick as well as the ring: the selected state must not
                        depend on noticing a one-pixel border colour. */}
                    {active ? <Check className="h-3 w-3" aria-hidden /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">{current.note}</p>
        </div>

        {error ? (
          <p role="alert" className="text-[11px] text-status-blocked-foreground">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
