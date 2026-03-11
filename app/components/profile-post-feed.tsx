type SellerPost = {
  id: string;
  caption: string | null;
  image_url: string | null;
  created_at: string;
};

export default function ProfilePostFeed({
  posts,
  accent,
  isOwner,
}: {
  posts: SellerPost[];
  accent: string;
  isOwner: boolean;
}) {
  if (posts.length === 0) {
    return (
      <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-6 text-white/58">
        No posts yet.
      </div>
    );
  }

  return (
    <div
      className={`grid gap-5 ${
        isOwner
          ? "max-w-[1080px] sm:grid-cols-2 lg:grid-cols-3"
          : "max-w-[1400px] sm:grid-cols-2 lg:grid-cols-4"
      }`}
    >
      {posts.map((post) => (
        <article
          key={post.id}
          className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.03]"
        >
          {post.image_url && (
            <div className="relative h-64">
              <img
                src={post.image_url}
                alt="Seller post"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
            </div>
          )}

          <div className="p-5">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: accent }}
                />
                <p className="text-xs uppercase tracking-[0.18em] text-white/42">
                  Seller Post
                </p>
              </div>

              <p className="text-xs text-white/40">
                {new Date(post.created_at).toLocaleDateString()}
              </p>
            </div>

            <p className="text-sm leading-8 text-white/72">
              {post.caption || "Image-only post"}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}