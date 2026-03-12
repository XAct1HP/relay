"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageCircle, PlusSquare, Package, User } from "lucide-react";
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
    { href: "/sell", icon: PlusSquare, label: "Sell" },
    { href: "/orders", icon: Package, label: "Orders" },
    {
      href: profileHref,
      icon: User,
      label: "Profile",
      matchPrefix: "/profile/",
    },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#06070a]/95 backdrop-blur-xl md:hidden">
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.matchPrefix
            ? pathname.startsWith(item.matchPrefix)
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.label}
              href={item.href}
              className="flex min-h-16 flex-col items-center justify-center gap-1 px-1"
            >
              <Icon
                size={21}
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