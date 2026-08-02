import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Coach Assistant",
    short_name: "Coach Assistant",
    description: "Your leads, voice, and content in one coach operating system.",
    start_url: "/command-center",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAF8F3",
    theme_color: "#FAF8F3",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
