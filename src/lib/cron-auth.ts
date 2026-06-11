import "server-only";

export function assertCronAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    throw new Error("Unauthorized");
  }
}
