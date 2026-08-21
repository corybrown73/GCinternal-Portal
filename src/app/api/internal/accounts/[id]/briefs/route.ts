import { createClient } from "@/lib/supabase/server";
import { generateBrief } from "@/lib/brief/generate";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: { code: "unauthorized", message: "Sign in first" } }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const brief = await generateBrief(id, user.id);
    return Response.json({ brief });
  } catch (e) {
    return Response.json(
      { error: { code: "generation_failed", message: e instanceof Error ? e.message : "Unknown error" } },
      { status: 500 }
    );
  }
}
