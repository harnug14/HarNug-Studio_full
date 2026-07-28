import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HarNug Studio",
    short_name: "HarNug Studio",
    description: "AI Creator Studio for YouTube Shorts",
    start_url: "/",
    display: "standalone", // Wajib "standalone" agar LEPAS DARI CHROME!
    background_color: "#0d0d0d",
    theme_color: "#0d0d0d",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
