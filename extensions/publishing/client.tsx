"use client";

import { PUBLISHING_EXTENSION_ID } from "./manifest";
import { PublishingViewMode } from "./components/view-mode/PublishingViewMode";
import type { ExtensionRuntime } from "@/lib/extensions/types";

// W2 blocks
import { Gallery } from "./blocks/gallery";
import { HeroImage } from "./blocks/hero-image";
// W3 blocks
import { PostCard } from "./blocks/post-card";
import { ProjectCard } from "./blocks/project-card";
import { RecentPosts } from "./blocks/recent-posts";
// W4 blocks
import { Timeline } from "./blocks/timeline";
import { StatBlock } from "./blocks/stat-block";
import { MetricsStrip } from "./blocks/metrics-strip";
import { ProcessSteps } from "./blocks/process-steps";
// W5 blocks
import { TestimonialCard } from "./blocks/testimonial-card";
import { CtaBanner } from "./blocks/cta-banner";
// W6 blocks
import { VideoEmbed } from "./blocks/video-embed";
// W7 blocks
import { FaqAccordion } from "./blocks/faq-accordion";
import { FeatureList } from "./blocks/feature-list";
// W8 blocks
import { PersonCard } from "./blocks/person-card";
import { NewsletterSignup } from "./blocks/newsletter-signup";
// W9 blocks
import { LogoStrip } from "./blocks/logo-strip";
import { SocialLinks } from "./blocks/social-links";
import { PricingCard } from "./blocks/pricing-card";
// W10 blocks
import { Spacer } from "./blocks/spacer";
import { SkillBadges } from "./blocks/skill-badges";
import { BookmarkCard } from "./blocks/bookmark-card";
import { TagCloud } from "./blocks/tag-cloud";

export const publishingExtensionRuntime: ExtensionRuntime = {
  id: PUBLISHING_EXTENSION_ID,
  leftSidebarPanel: PublishingViewMode,
  editorClientExtensions: [
    // W2
    Gallery,
    HeroImage,
    // W3
    PostCard,
    ProjectCard,
    RecentPosts,
    // W4
    Timeline,
    StatBlock,
    MetricsStrip,
    ProcessSteps,
    // W5
    TestimonialCard,
    CtaBanner,
    // W6
    VideoEmbed,
    // W7
    FaqAccordion,
    FeatureList,
    // W8
    PersonCard,
    NewsletterSignup,
    // W9
    LogoStrip,
    SocialLinks,
    PricingCard,
    // W10
    Spacer,
    SkillBadges,
    BookmarkCard,
    TagCloud,
  ],
};
