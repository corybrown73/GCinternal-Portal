/**
 * Starting a partner implementation, as one call to the database. The
 * customer (when the deal has none), the implementation, its first history
 * row and the partner journey's stages and tasks are created in one
 * transaction by create_partner_implementation (migration 0083). A failure
 * anywhere in it writes nothing, the customer included.
 */

/** The deal's SOW fields, carried onto the implementation as they stand on the deal. */
export type PartnerStartSow = {
  sow_reference: string | null;
  sow_signed_date: string | null;
  sow_value: number | string | null;
  sow_document_url: string | null;
  sow_document_name: string | null;
  sow_document_path: string | null;
};

/** The fields for a customer created by this start. */
export type NewCustomerFields = {
  name: string;
  arr?: number | string | null;
  industry?: string | null;
  salesforce_account_id?: string | null;
  logo_path?: string | null;
};

export type PartnerStartInput = {
  dealId: string;
  implementationName: string;
  partnerKey: string;
  sow: PartnerStartSow;
  /** The customer the deal already points at. Null means create one from `newCustomer`. */
  customerId: string | null;
  newCustomer: NewCustomerFields | null;
  enteredBy: string | null;
  actorProfile: string | null;
  at: string;
};

/** The arguments create_partner_implementation takes, built from the start. */
export function partnerStartArgs(input: PartnerStartInput) {
  if (!input.customerId && !input.newCustomer) {
    throw new Error(
      "A partner start needs a customer: an existing one, or the fields for a new one.",
    );
  }
  return {
    p_customer_id: input.customerId,
    p_new_customer: input.customerId ? null : input.newCustomer,
    p_deal_id: input.dealId,
    p_name: input.implementationName,
    p_partner_key: input.partnerKey,
    p_sow: input.sow,
    p_entered_by: input.enteredBy,
    p_actor_profile: input.actorProfile,
    p_at: input.at,
  };
}

/** The part of the database client a start uses: one remote procedure call. */
export type PartnerStartClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type PartnerStarted = {
  implementationId: string;
  customerId: string;
  customerCreated: boolean;
};

/**
 * Start the partner implementation. Exactly one call is made. If it fails,
 * nothing was written, so the caller has nothing to clean up, and the error
 * says so.
 */
export async function startPartnerImplementation(
  client: PartnerStartClient,
  input: PartnerStartInput,
): Promise<PartnerStarted> {
  const { data, error } = await client.rpc(
    "create_partner_implementation",
    partnerStartArgs(input),
  );
  const row = data as {
    implementation_id?: unknown;
    customer_id?: unknown;
    customer_created?: unknown;
  } | null;
  if (
    error ||
    !row ||
    typeof row.implementation_id !== "string" ||
    typeof row.customer_id !== "string"
  ) {
    throw new Error(
      `The partner implementation was not started, so nothing was written. ${error?.message ?? "No implementation was returned."}`,
    );
  }
  return {
    implementationId: row.implementation_id,
    customerId: row.customer_id,
    customerCreated: row.customer_created === true,
  };
}
