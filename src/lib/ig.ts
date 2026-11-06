import "server-only";
import { igPosts as mcPosts, igTimeline as mcTimeline, metricoolConfigured, type IgPost, type Point } from "./metricool";
import { graphPosts, graphTimeline, instagramConnected } from "./instagram";

/**
 * Instagram verisi için tek kapı. Sıra:
 *  1) Instagram'ın kendi bağlantısı (uygulama içinden "Instagram ile bağlan")
 *  2) Metricool API (token varsa)
 */
export type IgSource = "instagram" | "metricool" | null;

export async function igSource(): Promise<IgSource> {
  if (await instagramConnected()) return "instagram";
  if (metricoolConfigured()) return "metricool";
  return null;
}

type Metric = "followers" | "followersGained" | "reach" | "views" | "postsInteractions";

export async function igTimeline(metric: Metric, days: number): Promise<Point[]> {
  const src = await igSource();
  if (src === "instagram") {
    switch (metric) {
      case "followers": {
        // follower_count günlük net değişim verir → kümülatif seriye çevir
        const daily = await graphTimeline("follower_count", days);
        const total = await currentFollowers();
        let run = total;
        const out: Point[] = [];
        for (let i = daily.length - 1; i >= 0; i--) {
          out.unshift({ day: daily[i].day, value: run });
          run -= daily[i].value;
        }
        return out;
      }
      case "followersGained":
        return (await graphTimeline("follower_count", days)).map((p) => ({ ...p, value: Math.max(0, p.value) }));
      case "reach":
        return graphTimeline("reach", days);
      case "views":
        return graphTimeline("views", days);
      case "postsInteractions":
        return graphTimeline("total_interactions", days);
    }
  }
  if (src === "metricool") return mcTimeline(metric, days);
  return [];
}

export async function igPosts(days: number): Promise<IgPost[]> {
  const src = await igSource();
  if (src === "instagram") return graphPosts(days);
  if (src === "metricool") return mcPosts(days);
  return [];
}

async function currentFollowers(): Promise<number> {
  const { getIgToken } = await import("./instagram");
  const t = await getIgToken();
  if (!t) return 0;
  const r = await fetch(`https://graph.instagram.com/v22.0/me?fields=followers_count&access_token=${t.token}`, { cache: "no-store" });
  if (!r.ok) return 0;
  return ((await r.json()) as { followers_count?: number }).followers_count ?? 0;
}

export type { IgPost, Point };
