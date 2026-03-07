import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }
  
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("profile_id", user.id)
    .eq("is_read", false);

  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, is_read, related_order_id, related_listing_id, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-5xl">
          <p>Failed to load notifications: {error.message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Relay
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-3 text-slate-600">
          Stay on top of activity across your Relay account.
        </p>

        <div className="mt-8 space-y-4">
          {notifications?.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <p className="text-slate-600">No notifications yet.</p>
            </div>
          ) : (
            notifications?.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-3xl border p-5 shadow-sm ${
                  notification.is_read
                    ? "border-slate-200 bg-white"
                    : "border-blue-200 bg-blue-50"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {notification.title}
                    </h2>
                    <p className="mt-2 text-slate-600">
                      {notification.body || "No additional details."}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-3">
                      {notification.related_order_id && (
                        <Link
                          href={`/orders/${notification.related_order_id}`}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                        >
                          View Order
                        </Link>
                      )}

                      {notification.related_listing_id && (
                        <Link
                          href={`/listings/${notification.related_listing_id}`}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                        >
                          View Listing
                        </Link>
                      )}

                      {notification.type === "message" && (
                        <Link
                          href="/messages"
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                        >
                          Open Inbox
                        </Link>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-slate-500">
                    {new Date(notification.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}