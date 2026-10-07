/**
 * The Salesforce include rule, as data: which won opportunities are ours.
 * Pure and client-safe — the admin page edits it, the poll compiles it to
 * SOQL (src/lib/server/salesforce-poll.ts).
 */
export type FieldOp = "eq" | "ne" | "in" | "not_in" | "contains" | "gte" | "lte" | "true" | "false";

export type FieldCondition = {
  kind: "field";
  field: string;
  op: FieldOp;
  values: string[];
};

export type ProductsCondition = {
  kind: "products";
  /** Match the product's Name or its Family. */
  by: "name" | "family";
  /** Any one of these makes the group's products test true. Case-insensitive. */
  values: string[];
};

export type IncludeCondition = FieldCondition | ProductsCondition;

export type IncludeGroup = {
  label: string;
  conditions: IncludeCondition[];
  /** The onboarding type a deal matched by this group gets, when the map did not set one. */
  path: "new_logo" | "existing" | "dm_conversion" | "field_fusion" | null;
};

export type IncludeRule = { groups: IncludeGroup[] };

export const FIELD_OP_LABEL: Record<FieldOp, string> = {
  eq: "is",
  ne: "is not",
  in: "is one of",
  not_in: "is none of",
  contains: "contains",
  gte: "is at least",
  lte: "is at most",
  true: "is checked",
  false: "is not checked",
};

/** Cory's rule, as the tab starts: new logos, and AM deals with a solution on them. */
export const DEFAULT_INCLUDE_RULE: IncludeRule = {
  groups: [
    {
      label: "New logo",
      conditions: [
        { kind: "field", field: "Type", op: "in", values: ["New Business", "New Logo"] },
      ],
      path: "new_logo",
    },
    {
      label: "AM deal with a solution",
      conditions: [
        {
          kind: "field",
          field: "Type",
          op: "in",
          values: ["Existing Business", "Existing Customer", "Add-On", "Upsell", "Expansion"],
        },
        { kind: "products", by: "name", values: ["Form Build", "Integration", "Analytics"] },
      ],
      path: "existing",
    },
  ],
};
