import { createAccountAction } from "../../actions";

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800";

export default function NewAccountPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-xl font-semibold">New account</h1>
      <form
        action={createAccountAction}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium">
            Account name *
          </label>
          <input id="name" name="name" required className={inputCls} placeholder="Acme Manufacturing" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="domain" className="mb-1 block text-sm font-medium">
              Domain
            </label>
            <input id="domain" name="domain" className={inputCls} placeholder="acme.com" />
          </div>
          <div>
            <label htmlFor="arr" className="mb-1 block text-sm font-medium">
              ARR ($)
            </label>
            <input id="arr" name="arr" type="number" min="0" step="1" className={inputCls} />
          </div>
        </div>
        <div>
          <label htmlFor="salesforce_id" className="mb-1 block text-sm font-medium">
            Salesforce ID
          </label>
          <input id="salesforce_id" name="salesforce_id" className={inputCls} placeholder="0018b00002QzXyz" />
        </div>
        <div>
          <label htmlFor="summary" className="mb-1 block text-sm font-medium">
            Summary
          </label>
          <textarea id="summary" name="summary" rows={3} className={inputCls} />
        </div>
        <button
          type="submit"
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Create account
        </button>
      </form>
    </div>
  );
}
