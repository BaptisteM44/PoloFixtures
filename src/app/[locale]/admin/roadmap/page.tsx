import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { RoadmapBoard } from "@/components/RoadmapBoard";

export default async function AdminRoadmapPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "ADMIN" && role !== "SUPERADMIN") redirect("/");

  const items = await prisma.roadmapItem.findMany({ orderBy: { order: "asc" } });

  return (
    <div className="page">
      <h1>Roadmap</h1>
      <AdminNav />
      <RoadmapBoard items={items} />
    </div>
  );
}
