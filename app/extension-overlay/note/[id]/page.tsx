import { OverlayFrameClient } from "../../OverlayFrameClient";

type Params = Promise<{ id: string }>;

export default async function ExtensionOverlayNotePage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  return <OverlayFrameClient kind="note" contentId={id} />;
}
