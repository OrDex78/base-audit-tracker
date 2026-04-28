const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  "http://localhost:3000";

/**
 * MiniApp configuration object. Must follow the mini app manifest specification.
 *
 * @see {@link https://docs.base.org/mini-apps/features/manifest}
 */
export const minikitConfig = {
  accountAssociation: {
    header: "eyJmaWQiOjMzMjIyNTUsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHhlOTM5N0E5ODYzZTJDNmUzQjE1ZDYwNzM1NDdFMUExRTBkMWIxMThCIn0",
    payload: "eyJkb21haW4iOiJiYXNlLWF1ZGl0LXRyYWNrZXIudmVyY2VsLmFwcCJ9",
    signature: "MHgzYjZmNTM1Y2U5MDczNmM5MDIxYzI4NDYxYjYxNGJhNjUyYjgxYzc1NzFkZTFkZWIwYmYxYzg2NGRhZDQ1NmI0MmYxMTZhMzQ5MWFmZWM2NWZlOGIzY2FmNjg5MjQ0OWVhZmJhZjUwYzZhMmJkZGFjYWNiZWU0MDVkNzlhZmNlOTFj",
  },
  baseBuilder: {
    ownerAddress: "0x5A4de32aD91B49aF46D21fbf677A5a1C19e31325",
  },
  miniapp: {
    version: "1",
    name: "Base Audit Tracker",
    subtitle: "Onchain bug registry",
    description:
      "Check verified Base contracts and timestamp security findings onchain.",
    screenshotUrls: [`${ROOT_URL}/screenshot.png`],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#000000",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "utility",
    tags: ["security", "audit", "base"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "Audit registry for Base",
    ogTitle: "Base Audit Tracker",
    ogDescription:
      "Check verified Base contracts and timestamp security findings onchain.",
    ogImageUrl: `${ROOT_URL}/hero.png`,
  },
} as const;
