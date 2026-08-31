import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus } from "lucide-react";

import { uploadCustomerLogo } from "@/lib/hub.functions";
import { cn } from "@/lib/utils";

/**
 * The customer's logo, top-left beside their name.
 *
 * Sized to the heading and letterboxed with object-contain rather than cropped:
 * a squashed logo reads as carelessness about the customer, which is the
 * opposite of why it is here. A wide wordmark and a square badge both survive.
 *
 * The image is decorative — the customer's name sits immediately beside it — so
 * alt is empty rather than making a screen reader announce the name twice.
 *
 * With no logo set this is a quiet placeholder, not an empty gap: something has
 * to be clickable for a logo ever to arrive, but it should not shout on the
 * hundreds of records that will never have one.
 *
 * There is no `canEdit` prop on purpose. Authorization in this app lives on the
 * server — uploadCustomerLogo runs behind requireInternalAuth — and a prop here
 * would imply a client-side check that does not exist and cannot be trusted.
 * Anyone who can load this page is internal.
 */

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_BYTES = 1_000_000;

/**
 * `subject` picks which record the logo belongs to. A deal and the customer it
 * becomes both want one — the kickoff deck is built pre-sale and is the
 * document that most needs the logo — and they share a bucket, a column name
 * and this component so the two never drift into looking different.
 */
export function CustomerLogo({
  subject = "customer",
  customerId,
  customerName,
  logoUrl,
}: {
  subject?: "customer" | "deal";
  customerId: string;
  customerName: string;
  logoUrl: string | null;
}) {
  const qc = useQueryClient();
  const upload = useServerFn(uploadCustomerLogo);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      // Read as base64 to match the attachment upload path already in the app,
      // rather than introducing a second, different transport for one image.
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.readAsDataURL(file);
      });
      return upload({
        data: {
          subject,
          customerId,
          fileName: file.name,
          contentType: file.type as "image/png",
          dataBase64,
        },
      });
    },
    onSuccess: async () => {
      setError(null);
      await qc.invalidateQueries({
        queryKey: subject === "deal" ? ["deal", customerId] : ["customer360", customerId],
      });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Upload failed."),
  });

  const pick = (file: File | undefined) => {
    if (!file) return;
    // Checked here as well as server-side so the person gets the reason
    // instantly rather than after a round trip that ends in a rejection.
    if (!ACCEPT.split(",").includes(file.type)) {
      setError("PNG, JPEG, WebP or GIF only. SVG is not accepted.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That file is ${Math.round(file.size / 1000)}kB. The limit is 1MB.`);
      return;
    }
    setError(null);
    mutation.mutate(file);
  };

  const image = logoUrl ? (
    <img src={logoUrl} alt="" className="h-7 w-7 rounded-sm object-contain" loading="lazy" />
  ) : null;

  return (
    <span className="relative inline-flex flex-col">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          // Reset so choosing the same file twice still fires a change.
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={mutation.isPending}
        title={logoUrl ? `Replace ${customerName}'s logo` : `Add ${customerName}'s logo`}
        aria-label={logoUrl ? `Replace ${customerName}'s logo` : `Add ${customerName}'s logo`}
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm",
          "hover:ring-1 hover:ring-ring disabled:opacity-50",
          !logoUrl && "border border-dashed border-border text-muted-foreground",
        )}
      >
        {mutation.isPending ? (
          <span className="text-[9px]">…</span>
        ) : (
          (image ?? <ImagePlus className="h-3.5 w-3.5" aria-hidden />)
        )}
      </button>
      {error ? (
        <span
          role="alert"
          className="absolute top-8 left-0 z-10 w-56 rounded-sm border border-border bg-background px-2 py-1 text-[11px] text-status-blocked-foreground shadow-sm"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
