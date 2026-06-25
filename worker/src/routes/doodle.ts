import { Hono } from "hono";
import { Env } from "../types";

export const doodleRoute = new Hono<{ Bindings: Env }>();

const DOODLES = [
  { url: "2026/world-cup-2026-the-art-of-the-long-ball-6753651837111116-2xa.gif", title: "FIFA World Cup 2026" },
  { url: "2025/earth-day-2025-6753651837110746.2-2x.png", title: "Earth Day 2025" },
  { url: "2024/halloween-2024-6753651837110311.2-2xa.gif", title: "Halloween 2024" },
  { url: "2025/celebrating-cherry-blossom-season-copy-6753651837110757-2xa.gif", title: "Cherry Blossom Season" },
  { url: "2025/new-years-day-2025-6753651837110593-2xa.gif", title: "New Year's Day 2025" },
  { url: "2025/nba-playoffs-2025-am-6753651837110780.2-2xa.gif", title: "NBA Playoffs 2025" },
  { url: "2025/celebrating-house-music-6753651837110601.2-2xa.gif", title: "House Music" },
  { url: "2026/la-fete-de-la-musique-2026-6753651837111133-2xa.gif", title: "Fête de la Musique 2026" },
  { url: "2026/fathers-day-2026-june-21-6753651837110939-2xa.gif", title: "Father's Day 2026" },
  { url: "2026/juneteenth-2026-6753651837111175-2x.png", title: "Juneteenth 2026" },
];

doodleRoute.get("/doodle", (c) => {
  const shuffled = [...DOODLES].sort(() => Math.random() - 0.5);
  return c.json(shuffled.slice(0, 3));
});
