"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/is-native";

export default function NativeNavbarGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const [native, setNative] = useState(false);

  useEffect(() => {
    setNative(isNativeApp());
  }, []);

  if (native) return null;

  return <>{children}</>;
}