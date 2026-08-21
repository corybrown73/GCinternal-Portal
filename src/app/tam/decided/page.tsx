const MESSAGES: Record<string, { title: string; body: string }> = {
  approved: {
    title: "Request approved ✓",
    body: "The requester has been notified by email and the account now shows an approved TAM request.",
  },
  declined: {
    title: "Request declined",
    body: "The requester has been notified by email.",
  },
  expired: {
    title: "This link has expired or was already used",
    body: "The request may have been decided already. You can review it in the portal's TAM Requests page.",
  },
  invalid: {
    title: "This link isn't valid",
    body: "The link may be incomplete or tampered with. Open the portal to decide the request there.",
  },
};

export default async function TamDecidedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const msg = MESSAGES[status ?? ""] ?? MESSAGES.invalid;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2 text-2xl font-bold text-emerald-700 dark:text-emerald-400">
          GoCanvas
        </div>
        <h1 className="mb-2 text-lg font-semibold">{msg.title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{msg.body}</p>
      </div>
    </div>
  );
}
