import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type UnreadConversationRow = {
  conversationId: string;
  unreadCount: number;
  latestMessage: string;
  latestCreatedAt: string;
  otherUsername: string;
};

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

  const [{ data: unreadMessages }, { data: notifications, error }] =
    await Promise.all([
      supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, created_at, read_at")
        .is("read_at", null)
        .neq("sender_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("notifications")
        .select(
          "id, type, title, body, is_read, related_order_id, related_listing_id, related_conversation_id, created_at"
        )
        .eq("profile_id", user.id)
        .neq("type", "message")
        .order("created_at", { ascending: false }),
    ]);

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-5xl">
          <p>Failed to load notifications: {error.message}</p>
        </div>
      </main>
    );
  }

  const unreadByConversation = new Map<
    string,
    {
      unreadCount: number;
      latestMessage: string;
      latestCreatedAt: string;
    }
  >();

  for (const msg of unreadMessages ?? []) {
    if (!unreadByConversation.has(msg.conversation_id)) {
      unreadByConversation.set(msg.conversation_id, {
        unreadCount: 1,
        latestMessage: msg.content,
        latestCreatedAt: msg.created_at,
      });
    } else {
      const existing = unreadByConversation.get(msg.conversation_id)!;
      existing.unreadCount += 1;
    }
  }

  const unreadConversationRows: UnreadConversationRow[] = await Promise.all(
    Array.from(unreadByConversation.entries()).map(async ([conversationId, info]) => {
      const { data: conversation } = await supabase
        .from("conversations")
        .select("buyer_id, seller_id")
        .eq("id", conversationId)
        .single();

      const otherUserId =
        conversation?.buyer_id === user.id
          ? conversation?.seller_id
          : conversation?.buyer_id;

      const { data: otherProfile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", otherUserId)
        .maybeSingle();

      return {
        conversationId,
        unreadCount: info.unreadCount,
        latestMessage: info.latestMessage,
        latestCreatedAt: info.latestCreatedAt,
        otherUsername: otherProfile?.username ?? "unknown-user",
      };
    })
  );

  unreadConversationRows.sort(
    (a, b) =>
      new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime()
  );

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

        <div className="mt-8 space-y-8">
          <section>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold text-slate-900">
                Unread Messages
              </h2>
              <p className="text-sm text-slate-500">
                {unreadConversationRows.length} conversation
                {unreadConversationRows.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="mt-4 space-y-4">
              {unreadConversationRows.length === 0 ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                  <p className="text-slate-600">No unread messages.</p>
                </div>
              ) : (
                unreadConversationRows.map((conversation) => (
                  <div
                    key={conversation.conversationId}
                    className="rounded-3xl border border-blue-200 bg-blue-50 p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          New messages from @{conversation.otherUsername}
                        </h3>
                        <p className="mt-2 text-slate-600">
                          {conversation.latestMessage}
                        </p>
                        <p className="mt-3 text-sm text-slate-500">
                          {conversation.unreadCount} unread
                        </p>

                        <div className="mt-4">
                          <Link
                            href={`/messages/${conversation.conversationId}`}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                          >
                            Open Conversation
                          </Link>
                        </div>
                      </div>

                      <p className="text-sm text-slate-500">
                        {new Date(conversation.latestCreatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold text-slate-900">
                Activity
              </h2>
              <p className="text-sm text-slate-500">
                {notifications?.length ?? 0} item
                {(notifications?.length ?? 0) === 1 ? "" : "s"}
              </p>
            </div>

            <div className="mt-4 space-y-4">
              {notifications?.length === 0 ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                  <p className="text-slate-600">No additional notifications yet.</p>
                </div>
              ) : (
                notifications?.map((notification) => (
                  <div
                    key={notification.id}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          {notification.title}
                        </h3>
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

                          {notification.related_conversation_id && (
                            <Link
                              href={`/messages/${notification.related_conversation_id}`}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                            >
                              Open Conversation
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
          </section>
        </div>
      </div>
    </main>
  );
}