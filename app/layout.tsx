import type { Metadata } from "next";
import { Inter, Source_Code_Pro } from "next/font/google";
import { SafeArea } from "@coinbase/onchainkit/minikit";
import { minikitConfig } from "@/minikit.config";
import { RootProvider } from "./rootProvider";
import "./globals.css";

const miniappEmbed = {
  version: "next",
  imageUrl: minikitConfig.miniapp.heroImageUrl,
  button: {
    title: `Launch ${minikitConfig.miniapp.name}`,
    action: {
      name: minikitConfig.miniapp.name,
      type: "launch_miniapp",
      url: minikitConfig.miniapp.homeUrl,
    },
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL("https://base-audit-tracker.vercel.app"),
    title: minikitConfig.miniapp.name,
    description: minikitConfig.miniapp.description,
    openGraph: {
      title: "Base Audit Tracker",
      description: "Audit registry for Base contracts",
      url: "https://base-audit-tracker.vercel.app",
      images: [
        {
          url: "https://base-audit-tracker.vercel.app/icon.png",
          width: 512,
          height: 512,
        },
      ],
      type: "website",
    },
    other: {
      "base:app_id": "69f09324be7ac0b217d53c8a",
      "fc:miniapp": JSON.stringify(miniappEmbed),
      "fc:frame": JSON.stringify(miniappEmbed),
      "fc:app": JSON.stringify(miniappEmbed),
    },
  };
}

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code-pro",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RootProvider>
      <html lang="en">
        <body className={`${inter.variable} ${sourceCodePro.variable}`}>
          <SafeArea>{children}</SafeArea>
        </body>
      </html>
    </RootProvider>
  );
}
