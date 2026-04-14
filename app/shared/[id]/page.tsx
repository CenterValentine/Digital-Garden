import { redirect } from "next/navigation";

type SharedPageParams = Promise<{ id: string }>;

export default async function SharedPage({ params }: { params: SharedPageParams }) {
  const { id } = await params;
  redirect(`/share/${encodeURIComponent(id)}`);
}
