import { AdminNav } from "@/components/AdminNav";
import { AdminPolls } from "@/components/AdminPolls";

export default function AdminPollsPage() {
  return (
    <div className="page">
      <AdminNav />
      <h1 style={{ fontFamily: "var(--font-display)", marginTop: 16 }}>📊 Sondages</h1>
      <AdminPolls />
    </div>
  );
}
