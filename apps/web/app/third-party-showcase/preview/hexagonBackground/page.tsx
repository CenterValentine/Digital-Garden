import { HexagonBackgroundDemo } from "@/components/third-party/animate-ui/HexagonBackgroundDemo";

export default function HexagonBackgroundPreview() {
  return (
    <div
      className="w-full h-screen min-h-screen relative"
      style={{ height: "100vh" }}
    >
      <HexagonBackgroundDemo />
    </div>
  );
}
