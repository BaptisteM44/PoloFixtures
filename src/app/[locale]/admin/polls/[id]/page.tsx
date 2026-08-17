import { AdminNav } from "@/components/AdminNav";
import { AdminPollResults } from "@/components/AdminPollResults";

export default function AdminPollResultsPage({ params }: { params: { id: string } }) {
  return (
    <div className="page">
      <AdminNav />
      <AdminPollResults pollId={params.id} />
    </div>
  );
}
