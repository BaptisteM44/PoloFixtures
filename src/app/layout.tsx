import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PoloFixtures",
  description: "Bike Polo Tournament Platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}

