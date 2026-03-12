import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Relay",
    short_name: "Relay",
    description: "The marketplace for serious sneaker resellers.",
    start_url: "/",
    display: "standalone",
    background_color: "#06070a",
    theme_color: "#06070a",
    orientation: "portrait",
    icons: [
      {
        src: "/branding/relay-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/branding/relay-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/branding/relay-icon-1024.png",
        sizes: "1024x1024",
        type: "image/png",
      },
    ],
  };
}