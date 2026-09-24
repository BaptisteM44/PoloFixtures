import { AdminNav } from "@/components/AdminNav";
import { PollResultsDetail } from "@/components/PollResultsDetail";

export default function AdminPollResultsPage({ params }: { params: { id: string } }) {
  return (
    <div className="page">
      <AdminNav />
      <PollResultsDetail pollId={params.id} backHref="/admin/polls" />
    </div>
  );
}
