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
      className={`grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 ${
        isOwner ? "max-w-[1080px] lg:grid-cols-3" : "max-w-[1400px] lg:grid-cols-4"
      }`}
    >
      {posts.map((post) => (
        <article
          key={post.id}
          className="overflow-hidden rounded-[1.3rem] border border-white/10 bg-white/[0.03] sm:rounded-[1.5rem]"
        >
          {post.image_url && (
            <div className="relative h-56 sm:h-60 lg:h-64">
              <img
                src={post.image_url}
                alt="Seller post"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
            </div>
          )}

          <div className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: accent }}
                />
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/42 sm:text-xs">
                  Seller Post
                </p>
              </div>

              <p className="text-[11px] text-white/40 sm:text-xs">
                {new Date(post.created_at).toLocaleDateString()}
              </p>
            </div>

            <p className="text-sm leading-7 text-white/72 sm:leading-8">
              {post.caption || "Image-only post"}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}