import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Poloperator",
  description: "Bike Polo Tournament Platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}

