import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: { code: "unauthorized", message: "Sign in first" } }, { status: 401 });
  }

  const { id } = await ctx.params;
  const admin = createAdminClient();
  const { data: brief } = await admin
    .from("portal_briefs")
    .select("pptx_storage_path")
    .eq("id", id)
    .maybeSingle<{ pptx_storage_path: string | null }>();

  if (!brief?.pptx_storage_path) {
    return Response.json({ error: { code: "not_found", message: "No file for this brief" } }, { status: 404 });
  }

  const { data: signed, error } = await admin.storage
    .from("portal-briefs")
    .createSignedUrl(brief.pptx_storage_path, 3600, {
      download: true,
    });
  if (error || !signed) {
    return Response.json({ error: { code: "sign_failed", message: error?.message ?? "Couldn't sign URL" } }, { status: 500 });
  }
  return Response.redirect(signed.signedUrl, 302);
}
