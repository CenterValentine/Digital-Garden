import { PUBLISHING_EXTENSION_ID } from "./manifest";
import type { ExtensionServerRuntime } from "@/lib/extensions/types";

// W2 blocks
import { ServerGallery } from "./blocks/gallery";
import { ServerHeroImage } from "./blocks/hero-image";
// W3 blocks
import { ServerPostCard } from "./blocks/post-card";
import { ServerProjectCard } from "./blocks/project-card";
import { ServerRecentPosts } from "./blocks/recent-posts";
// W4 blocks
import { ServerTimeline } from "./blocks/timeline";
import { ServerStatBlock } from "./blocks/stat-block";
import { ServerMetricsStrip } from "./blocks/metrics-strip";
import { ServerProcessSteps } from "./blocks/process-steps";
// W5 blocks
import { ServerTestimonialCard } from "./blocks/testimonial-card";
import { ServerCtaBanner } from "./blocks/cta-banner";
// W6 blocks
import { ServerVideoEmbed } from "./blocks/video-embed";
// W7 blocks
import { ServerFaqAccordion } from "./blocks/faq-accordion";
import { ServerFeatureList } from "./blocks/feature-list";
// W8 blocks
import { ServerPersonCard } from "./blocks/person-card";
import { ServerNewsletterSignup } from "./blocks/newsletter-signup";
// W9 blocks
import { ServerLogoStrip } from "./blocks/logo-strip";
import { ServerSocialLinks } from "./blocks/social-links";
import { ServerPricingCard } from "./blocks/pricing-card";
// W10 blocks
import { ServerSpacer } from "./blocks/spacer";
import { ServerSkillBadges } from "./blocks/skill-badges";
import { ServerBookmarkCard } from "./blocks/bookmark-card";
import { ServerTagCloud } from "./blocks/tag-cloud";

export const publishingExtensionServerRuntime: ExtensionServerRuntime = {
  id: PUBLISHING_EXTENSION_ID,
  editorServerExtensions: [
    // W2
    ServerGallery,
    ServerHeroImage,
    // W3
    ServerPostCard,
    ServerProjectCard,
    ServerRecentPosts,
    // W4
    ServerTimeline,
    ServerStatBlock,
    ServerMetricsStrip,
    ServerProcessSteps,
    // W5
    ServerTestimonialCard,
    ServerCtaBanner,
    // W6
    ServerVideoEmbed,
    // W7
    ServerFaqAccordion,
    ServerFeatureList,
    // W8
    ServerPersonCard,
    ServerNewsletterSignup,
    // W9
    ServerLogoStrip,
    ServerSocialLinks,
    ServerPricingCard,
    // W10
    ServerSpacer,
    ServerSkillBadges,
    ServerBookmarkCard,
    ServerTagCloud,
  ],
};
