import { withValidManifest } from "@coinbase/onchainkit/minikit";
import { minikitConfig } from "../../../minikit.config";

export async function GET() {
  const manifest = withValidManifest(minikitConfig);
  return Response.json({
    ...manifest,
    frame: {
      name: minikitConfig.miniapp.name,
      iconUrl: minikitConfig.miniapp.iconUrl,
      homeUrl: minikitConfig.miniapp.homeUrl,
      imageUrl: minikitConfig.miniapp.heroImageUrl,
      buttonTitle: `Launch ${minikitConfig.miniapp.name}`,
      description: minikitConfig.miniapp.description,
      primaryCategory: minikitConfig.miniapp.primaryCategory,
      tags: minikitConfig.miniapp.tags,
    },
  });
}
