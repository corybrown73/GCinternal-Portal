import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("portal_profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  if (profile?.role !== "admin") redirect("/pipeline");

  const cards = [
    {
      href: "/admin/api-keys",
      title: "API keys",
      body: "Mint and revoke keys for Zapier, Salesforce, and the Gong agent.",
    },
    {
      href: "/admin/import",
      title: "CSV import",
      body: "Upload Salesforce exports to create or update accounts in bulk.",
    },
    {
      href: "/tam-requests",
      title: "TAM approvals",
      body: "Pending TAM requests can be approved or declined from the TAM Requests page.",
    },
  ];

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Admin</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border border-slate-200 bg-white p-4 hover:border-emerald-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-600"
          >
            <h2 className="mb-1 font-semibold">{c.title}</h2>
            <p className="text-sm text-slate-500">{c.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
