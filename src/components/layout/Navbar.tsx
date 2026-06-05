"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut, Settings, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function Navbar() {
  const pathname = usePathname();
  const { currentUser: user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigationLinks = [
    { href: "/", label: "Home" },
    { href: "/api", label: "API" },
  ];

  const isActive = (path: string) => {
    if (path === "/" && pathname === "/") return true;
    return pathname.startsWith(path) && path !== "/";
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 h-[72px] bg-relay-bg/80 backdrop-blur-xl border-b border-white/10">
      <div className="h-full px-4 md:px-6 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex-shrink-0">
          <Image
            src="/branding/logo-darkmode.png"
            alt="Relay"
            width={75}
            height={27}
            className="object-contain"
            priority
          />
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8">
          {navigationLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? "text-relay-accent"
                  : "text-white/60 hover:text-relay-text"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-relay-accent flex items-center justify-center text-relay-bg font-semibold text-sm">
                  {user.full_name?.[0]?.toUpperCase() || "U"}
                </div>
                <span className="text-sm text-relay-text hidden sm:block">
                  {user.full_name}
                </span>
              </button>

              {/* User Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-relay-bg/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-lg overflow-hidden">
                  <Link
                    href={user?.username ? `/profile/${user.username}` : '/settings'}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-relay-text hover:bg-white/[0.04] transition-colors"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <User size={16} />
                    Profile
                  </Link>
                  <Link
                    href="/settings"
                    className="flex items-center gap-3 px-4 py-3 text-sm text-relay-text hover:bg-white/[0.04] transition-colors"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Settings size={16} />
                    Settings
                  </Link>
                  <button
                    onClick={() => {
                      signOut();
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-white/[0.04] transition-colors border-t border-white/10"
                  >
                    <LogOut size={16} />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Link href="/auth/login">
                <button className="relay-button-secondary">Sign In</button>
              </Link>
              <Link href="/auth/signup">
                <button className="relay-button-primary">Get Started</button>
              </Link>
            </div>
          )}

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-white/[0.08] transition-colors"
          >
            {mobileMenuOpen ? (
              <X size={24} className="text-relay-text" />
            ) : (
              <Menu size={24} className="text-relay-text" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-relay-bg/95 backdrop-blur-xl border-b border-white/10">
          <div className="px-4 py-4 space-y-2">
            {navigationLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? "bg-relay-accent text-relay-bg"
                    : "text-relay-text hover:bg-white/[0.04]"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {!user && (
              <>
                <Link
                  href="/auth/login"
                  className="block px-4 py-2 rounded-lg text-sm font-medium text-relay-text hover:bg-white/[0.04] transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/signup"
                  className="block px-4 py-2 rounded-lg text-sm font-medium bg-relay-accent text-relay-bg transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
