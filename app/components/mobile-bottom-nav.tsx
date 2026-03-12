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
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#06070a]/96 backdrop-blur-xl md:hidden">
      <div className="mx-auto grid h-[68px] max-w-7xl grid-cols-5 px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
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
                className="flex min-h-[68px] flex-col items-center justify-center gap-1 px-1"
              >
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition ${
                    active
                      ? "border-white/25 bg-white text-black"
                      : "border-white/12 bg-white/[0.08] text-white"
                  }`}
                >
                  <Icon size={20} />
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
              className="flex min-h-[68px] flex-col items-center justify-center gap-1 px-1"
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
    </nav>
  );
}