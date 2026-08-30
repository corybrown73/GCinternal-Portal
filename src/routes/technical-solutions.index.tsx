import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { NoRows, StatusChip } from "@/components/record";
import { getTechnicalSolutions } from "@/lib/hub.functions";
import { humanize } from "@/lib/hub-format";
import { cn } from "@/lib/utils";

const solutionsQuery = queryOptions({
  queryKey: ["technical-solutions"],
  queryFn: () => getTechnicalSolutions(),
});

const SORTS = ["customer", "solution", "requirement", "owner", "status"] as const;
type SortKey = (typeof SORTS)[number];

type SolutionSearch = {
  owner?: string;
  status?: string;
  sort: SortKey;
  dir: "asc" | "desc";
};

export const Route = createFileRoute("/technical-solutions/")({
  head: () => ({
    meta: [
      { title: "Technical Solutions — Implementation Hub" },
      {
        name: "description",
        content:
          "Every technical solution across customer implementations, with owner, status, the requirement it implements and what is needed next.",
      },
      { property: "og:title", content: "Technical Solutions — Implementation Hub" },
      {
        property: "og:description",
        content: "Cross-customer technical solutions queue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): SolutionSearch => {
    const raw = search as { owner?: unknown; status?: unknown; sort?: unknown; dir?: unknown };
    const out: SolutionSearch = {
      sort: (SORTS as readonly string[]).includes(String(raw.sort))
        ? (raw.sort as SortKey)
        : "customer",
      dir: raw.dir === "desc" ? "desc" : "asc",
    };
    if (typeof raw.owner === "string") out.owner = raw.owner;
    if (typeof raw.status === "string") out.status = raw.status;
    return out;
  },
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(solutionsQuery);
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load technical solutions: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-[13px]">No technical solutions found.</div>,
  component: SolutionsQueue,
});

function SolutionsQueue() {
  const { data } = useSuspenseQuery(solutionsQuery);
  const { owner, status, sort, dir } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const setSearch = (patch: Record<string, unknown>) =>
    navigate({ search: (prev: SolutionSearch) => ({ ...prev, ...patch }) });

  const toggleSort = (key: SortKey) =>
    setSearch({ sort: key, dir: sort === key && dir === "asc" ? "desc" : "asc" });

  const owners = [...new Set(data.map((r) => r.owner_name).filter(Boolean))] as string[];
  const statuses = [...new Set(data.map((r) => r.status).filter(Boolean))];

  const rows = data
    .filter((r) => (owner ? r.owner_name === owner : true))
    .filter((r) => (status ? r.status === status : true))
    .sort((a, b) => {
      const factor = dir === "asc" ? 1 : -1;
      switch (sort) {
        case "solution":
          return factor * a.title.localeCompare(b.title);
        case "requirement":
          return factor * (a.requirement_title ?? "").localeCompare(b.requirement_title ?? "");
        case "owner":
          return factor * (a.owner_name ?? "").localeCompare(b.owner_name ?? "");
        case "status":
          return factor * a.status.localeCompare(b.status);
        default:
          return factor * a.customer_name.localeCompare(b.customer_name);
      }
    });

  const Th = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <th className="px-3 py-1.5 font-medium">
      <button
        type="button"
        onClick={() => toggleSort(sortKey)}
        className="inline-flex items-center gap-1 uppercase tracking-[0.1em] hover:text-foreground"
      >
        {label}
        {sort === sortKey ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    </th>
  );

  return (
    <>
      <PageHeader
        title="Technical Solutions"
        description="Every technical solution across customers, with the requirement it implements and what it needs next."
        actions={
          <span className="font-mono text-[11px] text-muted-foreground">
            {rows.length} / {data.length}
          </span>
        }
      />
      <PageBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <FilterGroup
            label="Owner"
            value={owner}
            options={owners.map((o) => ({ value: o, label: o }))}
            onChange={(v) => setSearch({ owner: v })}
          />
          <FilterGroup
            label="Status"
            value={status}
            options={statuses.map((s) => ({ value: s, label: humanize(s) }))}
            onChange={(v) => setSearch({ status: v })}
          />
        </div>

        <div className="w-full overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-surface text-[10px] text-muted-foreground">
              <tr>
                <Th label="Customer / implementation" sortKey="customer" />
                <Th label="Solution" sortKey="solution" />
                <Th label="Requirement" sortKey="requirement" />
                <Th label="Owner" sortKey="owner" />
                <Th label="Status" sortKey="status" />
                <th className="px-3 py-1.5 font-medium uppercase tracking-[0.1em]">
                  What&apos;s needed next
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="group align-top hover:bg-muted/60">
                  <td className="px-3 py-1.5">
                    <div className="text-[13px] font-medium">{r.customer_name}</div>
                    <div className="text-[11px] text-muted-foreground">{r.implementation_name}</div>
                  </td>
                  <td className="px-3 py-1.5">
                    <Link
                      to="/technical-solutions/$id"
                      params={{ id: r.id }}
                      className="text-[13px] font-medium hover:underline"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="max-w-[220px] px-3 py-1.5 text-[12px] text-muted-foreground">
                    {r.requirement_title ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 text-[12px]">{r.owner_name ?? "Unassigned"}</td>
                  <td className="px-3 py-1.5">
                    <StatusChip status={r.status} />
                  </td>
                  <td className="max-w-[280px] px-3 py-1.5 text-[12px] text-muted-foreground">
                    {r.next_needed}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <NoRows label="No technical solutions match these filters." />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </PageBody>
    </>
  );
}

function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={cn(
          "rounded-sm border border-border px-1.5 py-0.5 text-[11px]",
          value === undefined
            ? "border-primary bg-primary text-primary-foreground"
            : "bg-card text-muted-foreground hover:text-foreground",
        )}
      >
        All
      </button>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(value === o.value ? undefined : o.value)}
          className={cn(
            "rounded-sm border border-border px-1.5 py-0.5 text-[11px]",
            value === o.value
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
