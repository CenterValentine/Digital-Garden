import { GravityStarsBackgroundDemo } from "@/components/third-party/animate-ui/GravityStarsBackgroundDemo";

// https://animate-ui.com/docs/components/backgrounds/gravity-stars

export default function GravityStarsBackgroundPreview() {
  return (
    <div className="w-full h-screen min-h-screen" style={{ height: "100vh" }}>
      <GravityStarsBackgroundDemo className="h-screen" />
    </div>
  );
}
