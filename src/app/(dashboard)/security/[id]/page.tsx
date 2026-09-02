import { requireAdminSession } from "@/lib/auth/guard";
import SecurityReportClient from "./security-report-client";

export default async function SecurityReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminSession();
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl py-2">
      <SecurityReportClient targetId={id} />
    </div>
  );
}
