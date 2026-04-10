"use server";

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "ADMIN" && role !== "SUPERADMIN") throw new Error("Unauthorized");
}

export async function createRoadmapItemAction(data: {
  title: string;
  description?: string;
  type: string;
  priority: string;
}) {
  await requireAdmin();
  const maxOrder = await prisma.roadmapItem.aggregate({ _max: { order: true } });
  await prisma.roadmapItem.create({
    data: {
      title: data.title,
      description: data.description || null,
      type: data.type,
      priority: data.priority,
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });
  revalidatePath("/admin/roadmap");
}

export async function updateRoadmapItemAction(id: string, data: {
  title?: string;
  description?: string;
  type?: string;
  priority?: string;
  status?: string;
}) {
  await requireAdmin();
  await prisma.roadmapItem.update({ where: { id }, data });
  revalidatePath("/admin/roadmap");
}

export async function deleteRoadmapItemAction(id: string) {
  await requireAdmin();
  await prisma.roadmapItem.delete({ where: { id } });
  revalidatePath("/admin/roadmap");
}

export async function moveRoadmapItemAction(id: string, direction: "up" | "down") {
  await requireAdmin();
  const item = await prisma.roadmapItem.findUnique({ where: { id } });
  if (!item) return;

  const neighbor = await prisma.roadmapItem.findFirst({
    where: direction === "up"
      ? { order: { lt: item.order } }
      : { order: { gt: item.order } },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return;

  await prisma.roadmapItem.update({ where: { id: item.id }, data: { order: neighbor.order } });
  await prisma.roadmapItem.update({ where: { id: neighbor.id }, data: { order: item.order } });
  revalidatePath("/admin/roadmap");
}
