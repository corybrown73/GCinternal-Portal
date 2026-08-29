// Cron endpoint auth: requests must carry `Authorization: Bearer ${CRON_SECRET}`.
// Vercel sends this header automatically on scheduled invocations when the
// CRON_SECRET environment variable is set on the project.
export async function authenticateCronRequest(
  request: Request,
): Promise<Response | null> {
  const secret = process.env['CRON_SECRET'];
  if (!secret) {
    return new Response('Server configuration error: CRON_SECRET is not set', { status: 500 });
  }

  const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get('authorization') ?? '');
  const token = match?.[1];
  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { createHash, timingSafeEqual } = await import('node:crypto');
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  if (!timingSafeEqual(digest(token), digest(secret))) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}
