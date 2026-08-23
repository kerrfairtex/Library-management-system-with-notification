import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TRAC Library — Library Management System",
    short_name: "TRAC Library",
    description:
      "TRAC Library Management System — Institute of Agricultural Sciences, Bongao, Tawi-Tawi.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f4f4",
    theme_color: "#408540",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
