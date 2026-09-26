import { pageMetadata } from "@/lib/page-metadata";

// La page est un composant client : son titre est déclaré ici.
export async function generateMetadata() {
  return pageMetadata("forgot_password");
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
