import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sacrament Meeting Planner",
    short_name: "Sacrament Planner",
    description:
      "Plan sacrament meeting speakers, prayers, and hymns, and track ward speaking history",
    start_url: "/upcoming",
    display: "standalone",
    background_color: "#003057",
    theme_color: "#006184",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
