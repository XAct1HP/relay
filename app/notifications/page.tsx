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
      <main className="relay-page">
        <div className="relay-site-bg" />
        <div className="relay-page-shell">
          <div className="mx-auto max-w-5xl">
            <p className="text-white">Failed to load notifications: {error.message}</p>
          </div>
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
      unreadByConversation.get(msg.conversation_id)!.unreadCount += 1;
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
        conversation?.buyer_id === user.id ? conversation?.seller_id : conversation?.buyer_id;

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
    <main className="relay-page">
      <div className="relay-site-bg" />
      <div className="relay-page-shell">
        <div className="mx-auto max-w-5xl">
          <div className="relay-page-header">
            <div>
              <p className="relay-eyebrow">Relay</p>
              <h1 className="relay-title">Notifications</h1>
              <p className="relay-subtitle">
                Stay on top of activity across your Relay account.
              </p>
            </div>

            <div className="w-full rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-white backdrop-blur-xl sm:w-auto sm:min-w-[132px] sm:rounded-2xl">
              <p className="text-sm text-white/55">Unread</p>
              <p className="mt-1 text-2xl font-semibold">
                {unreadConversationRows.length + (notifications?.length ?? 0)}
              </p>
            </div>
          </div>

          <div className="mt-8 space-y-8">
            <section>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-2xl font-semibold text-white">Unread Messages</h2>
                <p className="text-sm text-white/50">
                  {unreadConversationRows.length} conversation
                  {unreadConversationRows.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="mt-4 space-y-3 sm:space-y-4">
                {unreadConversationRows.length === 0 ? (
                  <div className="relay-empty">
                    <p>No unread messages.</p>
                  </div>
                ) : (
                  unreadConversationRows.map((conversation) => (
                    <div
                      key={conversation.conversationId}
                      className="rounded-[1.5rem] border border-blue-400/20 bg-blue-500/10 p-4 text-white shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:rounded-[1.75rem] sm:p-5"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-white sm:text-lg">
                            New messages from @{conversation.otherUsername}
                          </h3>
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/75">
                            {conversation.latestMessage}
                          </p>
                          <p className="mt-3 text-sm text-white/55">
                            {conversation.unreadCount} unread
                          </p>

                          <div className="mt-4">
                            <Link
                              href={`/messages/${conversation.conversationId}`}
                              className="relay-button-secondary"
                            >
                              Open Conversation
                            </Link>
                          </div>
                        </div>

                        <p className="shrink-0 text-xs text-white/50 sm:text-sm">
                          {new Date(conversation.latestCreatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-2xl font-semibold text-white">Activity</h2>
                <p className="text-sm text-white/50">
                  {notifications?.length ?? 0} item
                  {(notifications?.length ?? 0) === 1 ? "" : "s"}
                </p>
              </div>

              <div className="mt-4 space-y-3 sm:space-y-4">
                {notifications?.length === 0 ? (
                  <div className="relay-empty">
                    <p>No additional notifications yet.</p>
                  </div>
                ) : (
                  notifications?.map((notification) => (
                    <div
                      key={notification.id}
                      className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 text-white shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:rounded-[1.75rem] sm:p-5"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-white sm:text-lg">
                            {notification.title}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-white/65">
                            {notification.body || "No additional details."}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-3">
                            {notification.related_order_id && (
                              <Link
                                href={`/orders/${notification.related_order_id}`}
                                className="relay-button-secondary"
                              >
                                View Order
                              </Link>
                            )}

                            {notification.related_listing_id && (
                              <Link
                                href={`/listings/${notification.related_listing_id}`}
                                className="relay-button-secondary"
                              >
                                View Listing
                              </Link>
                            )}

                            {notification.related_conversation_id && (
                              <Link
                                href={`/messages/${notification.related_conversation_id}`}
                                className="relay-button-secondary"
                              >
                                Open Conversation
                              </Link>
                            )}
                          </div>
                        </div>

                        <p className="shrink-0 text-xs text-white/50 sm:text-sm">
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
      </div>
    </main>
  );
}