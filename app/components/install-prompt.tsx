"use client";

import { useEffect, useState } from "react";

export default function InstallPrompt() {
  const [prompt, setPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  if (!prompt) return null;

  return (
    <button
      onClick={() => prompt.prompt()}
      className="fixed bottom-28 right-4 z-50 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black shadow-lg"
    >
      Install Relay
    </button>
  );
}