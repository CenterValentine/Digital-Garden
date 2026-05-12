import { OverlayFrameClient } from "../../OverlayFrameClient";

type Params = Promise<{ id: string }>;

export default async function ExtensionOverlayExternalPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  return <OverlayFrameClient kind="external" contentId={id} />;
}
