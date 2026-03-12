"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageCircle,
  PlusSquare,
  Package,
  User,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function MobileBottomNav() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [profileHref, setProfileHref] = useState("/onboarding");

  useEffect(() => {
    let mounted = true;

    async function loadProfileHref() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (mounted) setProfileHref("/auth/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (profile?.username) {
        setProfileHref(`/profile/${profile.username}`);
      } else {
        setProfileHref("/onboarding");
      }
    }

    loadProfileHref();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  const navItems = [
    { href: "/marketplace", icon: Home, label: "Market" },
    { href: "/messages", icon: MessageCircle, label: "Messages" },
    { href: "/sell", icon: PlusSquare, label: "Sell", isPrimary: true },
    { href: "/orders", icon: Package, label: "Orders" },
    {
      href: profileHref,
      icon: User,
      label: "Profile",
      matchPrefix: "/profile/",
    },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 md:hidden">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#06070a] via-[#06070a]/92 to-transparent" />
      <div className="mx-auto max-w-7xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="grid h-[72px] grid-cols-5 items-end rounded-[1.7rem] border border-white/10 bg-[#0a0c12]/92 px-2 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.matchPrefix
              ? pathname.startsWith(item.matchPrefix)
              : pathname.startsWith(item.href);

            if (item.isPrimary) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex min-h-[72px] flex-col items-center justify-center gap-1 px-1"
                >
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition ${
                      active
                        ? "border-white/25 bg-white text-black shadow-[0_12px_30px_rgba(255,255,255,0.18)]"
                        : "border-white/12 bg-white/[0.08] text-white"
                    }`}
                  >
                    <Icon size={21} />
                  </div>
                  <span
                    className={`text-[11px] font-semibold ${
                      active ? "text-white" : "text-white/70"
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                className="flex min-h-[72px] flex-col items-center justify-center gap-1 px-1"
              >
                <Icon
                  size={20}
                  className={active ? "text-white" : "text-white/50"}
                />
                <span
                  className={`text-[11px] font-medium ${
                    active ? "text-white" : "text-white/50"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}