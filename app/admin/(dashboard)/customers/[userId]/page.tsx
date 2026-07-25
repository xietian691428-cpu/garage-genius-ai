import CustomerDetailPanel from "@/components/admin/CustomerDetailPanel";

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <CustomerDetailPanel userId={userId} />;
}
