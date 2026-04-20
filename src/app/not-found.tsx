import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#06070a] flex items-center justify-center px-4">
      <div className="text-center">
        {/* 404 Text */}
        <div className="mb-8">
          <h1 className="text-9xl sm:text-[10rem] font-black text-white mb-4 leading-none">
            404
          </h1>
          <div className="h-1 w-20 bg-[#5f8fff] rounded-full mx-auto mb-8"></div>
        </div>

        {/* Message */}
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Page Not Found</h2>
        <p className="text-white/60 text-lg mb-8 max-w-md mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved. Let&apos;s get you back on
          track.
        </p>

        {/* Branding */}
        <div className="mb-8">
          <p className="text-white/40 text-sm uppercase tracking-widest">Relay</p>
          <p className="text-white/30 text-xs mt-1">Premium Shoe Reselling</p>
        </div>

        {/* CTA */}
        <Link
          href="/"
          className="inline-block px-8 py-3 bg-[#5f8fff] hover:bg-[#7ca6ff] text-white font-semibold rounded-full transition-colors"
        >
          Go Home
        </Link>
      </div>
    </div>
  )
}
