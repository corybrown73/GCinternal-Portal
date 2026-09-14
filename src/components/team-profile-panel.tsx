import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarPlus, ImagePlus, Trash2 } from "lucide-react";

import { Panel } from "@/components/record";
import {
  getTeamCardFn,
  removeTeamPhotoFn,
  saveTeamProfileFn,
  uploadTeamPhotoFn,
} from "@/lib/team-profile.functions";
import { firstName } from "@/lib/team-profile";
import { cn } from "@/lib/utils";

/**
 * My profile: what the customer sees of me. A photo, a title, a booking
 * link and a line or two. Lands on the welcome page's team screen and the
 * closing screen the moment a deal is assigned to me.
 */
export function TeamProfilePanel({ profileId }: { profileId?: string | undefined }) {
  const qc = useQueryClient();
  const load = useServerFn(getTeamCardFn);
  const save = useServerFn(saveTeamProfileFn);
  const upload = useServerFn(uploadTeamPhotoFn);
  const remove = useServerFn(removeTeamPhotoFn);
  const key = ["team-card", profileId ?? "me"];
  const card = useQuery({
    queryKey: key,
    queryFn: () => load({ data: profileId ? { profileId } : {} }),
  });
  const [title, setTitle] = useState<string | null>(null);
  const [booking, setBooking] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const c = card.data;
  const titleValue = title ?? c?.title ?? "";
  const bookingValue = booking ?? c?.bookingUrl ?? "";
  const bioValue = bio ?? c?.bio ?? "";
  const dirty =
    (title !== null && title !== (c?.title ?? "")) ||
    (booking !== null && booking !== (c?.bookingUrl ?? "")) ||
    (bio !== null && bio !== (c?.bio ?? ""));

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          ...(profileId ? { profileId } : {}),
          title: titleValue.trim() || null,
          bookingUrl: bookingValue.trim() || null,
          bio: bioValue.trim() || null,
        },
      }),
    onMutate: () => setError(null),
    onSuccess: () => {
      setTitle(null);
      setBooking(null);
      setBio(null);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => setError((e as Error).message),
  });
  const photoMut = useMutation({
    mutationFn: async (file: File) => {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onerror = () => reject(new Error("Could not read that photo."));
        r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
        r.readAsDataURL(file);
      });
      return upload({
        data: {
          ...(profileId ? { profileId } : {}),
          image: { fileName: file.name, contentType: file.type, dataBase64 } as never,
        },
      });
    },
    onMutate: () => setError(null),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: (e) => setError((e as Error).message),
  });
  const removeMut = useMutation({
    mutationFn: () => remove({ data: profileId ? { profileId } : {} }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: (e) => setError((e as Error).message),
  });

  const input =
    "w-full rounded-sm border border-border bg-background px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary";
  const busy = saveMut.isPending || photoMut.isPending || removeMut.isPending;

  return (
    <Panel
      title={profileId ? `${c?.name ?? "Profile"} — as the customer sees them` : "My profile"}
      meta="On the welcome page's team screen and closing screen"
      level="primary"
    >
      <div className="grid grid-cols-1 gap-4 p-3 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2">
          {c?.photoUrl ? (
            <img src={c.photoUrl} alt="" className="h-24 w-24 rounded-2xl object-cover shadow-sm" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-muted text-[11px] text-muted-foreground">
              No photo
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) photoMut.mutate(f);
              e.target.value = "";
            }}
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="h-3 w-3" />
              {photoMut.isPending ? "Uploading…" : c?.photoUrl ? "Change" : "Add photo"}
            </button>
            {c?.photoUrl ? (
              <button
                type="button"
                className="rounded-sm border border-border p-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
                disabled={busy}
                title="Remove the photo"
                onClick={() => removeMut.mutate()}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          <p className="max-w-[9rem] text-center text-[10.5px] text-muted-foreground">
            A square headshot, plain background. Shown at 48px.
          </p>
        </div>
        <div className="space-y-2.5">
          <label className="block space-y-1 text-[11px] text-muted-foreground">
            Title, as the customer reads it
            <input
              className={input}
              value={titleValue}
              placeholder="Implementation Specialist"
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block space-y-1 text-[11px] text-muted-foreground">
            Booking link — the page shows “Book time with {firstName(c?.name)}”
            <input
              className={input}
              value={bookingValue}
              placeholder="https://calendly.com/you/30min"
              disabled={busy}
              onChange={(e) => setBooking(e.target.value)}
            />
          </label>
          <label className="block space-y-1 text-[11px] text-muted-foreground">
            A line or two, first person (optional)
            <textarea
              rows={2}
              className={input}
              value={bioValue}
              placeholder="I run the first two calls and watch the first submissions come in. Fifteen years of field forms."
              disabled={busy}
              onChange={(e) => setBio(e.target.value)}
            />
          </label>
          {error ? (
            <p role="alert" className="text-[12px] text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cn(
                "rounded-sm bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-60",
              )}
              disabled={busy || !dirty}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? "Saving…" : "Save"}
            </button>
            {c?.bookingUrl ? (
              <a
                href={c.bookingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline"
              >
                <CalendarPlus className="h-3 w-3" /> Test the link
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </Panel>
  );
}
