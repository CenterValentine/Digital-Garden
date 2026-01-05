"use client";

import React, { useState } from "react";
import {
  EvervaultCard,
  ExpandableCard,
  StickyScrollReveal,
  HeroParallax,
  AnimatedTabs,
  Testimonials,
  DraggableCard,
  CardsSections,
  DottedGlowBackground,
  WavyBackground,
} from "@/components/client/third-party/aceternity";
import { GradientBackground } from "@/components/client/third-party/animate-ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/client/ui/card";
import { Badge } from "@/components/client/ui/badge";
import {
  Code,
  Palette,
  Rocket,
  Heart,
  BookOpen,
  Award,
  Coffee,
  Music,
  Camera,
  Sparkles,
  Target,
  Users,
  Zap,
  Globe,
  Layers,
} from "lucide-react";

export default function AboutBeta2Page() {
  const [activeTab, setActiveTab] = useState("skills");

  const expertise = [
    {
      title: "Full-Stack Development",
      description: "React, Next.js, TypeScript, Node.js",
      icon: Code,
      color: "gold" as const,
    },
    {
      title: "Design Systems",
      description: "Creating cohesive UI/UX experiences",
      icon: Palette,
      color: "leaf" as const,
    },
    {
      title: "Product Strategy",
      description: "From concept to launch",
      icon: Rocket,
      color: "neon" as const,
    },
    {
      title: "Team Leadership",
      description: "Building and mentoring teams",
      icon: Users,
      color: "shale" as const,
    },
  ];

  const projects = [
    {
      title: "Digital Garden Platform",
      description: "A knowledge management system",
      tech: ["Next.js", "Prisma", "PostgreSQL"],
      icon: Globe,
    },
    {
      title: "Design System",
      description: "Comprehensive component library",
      tech: ["React", "TypeScript", "Tailwind"],
      icon: Layers,
    },
    {
      title: "Open Source Tools",
      description: "Contributing to the community",
      tech: ["TypeScript", "Node.js"],
      icon: Sparkles,
    },
  ];

  const testimonials = [
    {
      name: "Team Member",
      role: "Senior Developer",
      content:
        "An exceptional collaborator who brings both technical expertise and creative vision to every project.",
    },
    {
      name: "Client",
      role: "Product Manager",
      content:
        "Delivered beyond expectations with attention to detail and user experience that sets the standard.",
    },
    {
      name: "Mentor",
      role: "Tech Lead",
      content:
        "A natural leader who elevates the entire team through knowledge sharing and innovative thinking.",
    },
  ];

  const values = [
    {
      title: "Excellence",
      description: "Pursuing perfection in every detail",
      icon: Target,
      color: "gold" as const,
    },
    {
      title: "Innovation",
      description: "Pushing boundaries and exploring new ideas",
      icon: Zap,
      color: "neon" as const,
    },
    {
      title: "Empathy",
      description: "Understanding users and their needs",
      icon: Heart,
      color: "leaf" as const,
    },
  ];

  return (
    <div className="min-h-screen relative">
      {/* Hero Section with Parallax */}
      <HeroParallax color="shale" className="min-h-screen flex items-center justify-center">
        <GradientBackground color="gold" className="absolute inset-0 -z-10" />
        <div className="container mx-auto px-4 py-32 text-center relative z-10">
          <div className="mb-8">
            <Sparkles className="w-16 h-16 mx-auto text-gold-primary mb-6" />
          </div>
          <h1 className="text-6xl md:text-8xl font-bold mb-6 text-gold-primary">
            About
          </h1>
          <p className="text-2xl md:text-3xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Crafting digital experiences with passion, precision, and purpose
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Badge variant="outline" className="px-4 py-2 text-base">
              Developer
            </Badge>
            <Badge variant="outline" className="px-4 py-2 text-base">
              Designer
            </Badge>
            <Badge variant="outline" className="px-4 py-2 text-base">
              Creator
            </Badge>
          </div>
        </div>
      </HeroParallax>

      {/* Sticky Scroll Reveal Section */}
      <StickyScrollReveal color="shale" className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-12 text-gold-primary">
            Expertise
          </h2>
          <CardsSections className="max-w-6xl mx-auto">
            {expertise.map((item, index) => {
              const Icon = item.icon;
              return (
                <EvervaultCard
                  key={index}
                  color={item.color}
                  className="p-8 min-h-[250px] flex flex-col justify-center group hover:scale-105 transition-transform"
                >
                  <div className="mb-6">
                    <Icon className="w-12 h-12 mx-auto text-gold-primary group-hover:text-leaf-primary transition-colors" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3 text-center text-foreground">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground text-center">
                    {item.description}
                  </p>
                </EvervaultCard>
              );
            })}
          </CardsSections>
        </div>
      </StickyScrollReveal>

      {/* Animated Tabs Section */}
      <WavyBackground color="shale" className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-12 text-gold-primary">
            Explore
          </h2>
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-center mb-8">
              <AnimatedTabs
                color="gold"
                tabs={["skills", "projects", "values"]}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            </div>

            <div className="min-h-[400px]">
              {activeTab === "skills" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    { name: "TypeScript", level: "Expert" },
                    { name: "React", level: "Expert" },
                    { name: "Next.js", level: "Advanced" },
                    { name: "Node.js", level: "Advanced" },
                  ].map((skill, index) => (
                    <ExpandableCard
                      key={index}
                      color="shale"
                      className="p-6 border border-gold-primary/20 hover:border-gold-primary/40 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-semibold text-foreground">
                          {skill.name}
                        </span>
                        <Badge variant="outline" className="text-gold-primary">
                          {skill.level}
                        </Badge>
                      </div>
                    </ExpandableCard>
                  ))}
                </div>
              )}

              {activeTab === "projects" && (
                <div className="space-y-6">
                  {projects.map((project, index) => {
                    const Icon = project.icon;
                    return (
                      <Card
                        key={index}
                        className="border-gold-primary/20 hover:border-gold-primary/40 transition-colors"
                      >
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-4">
                              <Icon className="w-8 h-8 text-gold-primary" />
                              <div>
                                <CardTitle>{project.title}</CardTitle>
                                <CardDescription className="mt-1">
                                  {project.description}
                                </CardDescription>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {project.tech.map((tech, techIndex) => (
                              <Badge
                                key={techIndex}
                                variant="outline"
                                className="text-sm"
                              >
                                {tech}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {activeTab === "values" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {values.map((value, index) => {
                    const Icon = value.icon;
                    return (
                      <DraggableCard
                        key={index}
                        color={value.color}
                        className="p-8 text-center"
                      >
                        <Icon className="w-12 h-12 mx-auto mb-4 text-gold-primary" />
                        <h3 className="text-xl font-semibold mb-2 text-foreground">
                          {value.title}
                        </h3>
                        <p className="text-muted-foreground">
                          {value.description}
                        </p>
                      </DraggableCard>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </WavyBackground>

      {/* Testimonials Section */}
      <DottedGlowBackground color="shale" className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-12 text-gold-primary">
            What People Say
          </h2>
          <div className="max-w-4xl mx-auto">
            <Testimonials color="gold" testimonials={testimonials} />
          </div>
        </div>
      </DottedGlowBackground>

      {/* Interests Section with Expandable Cards */}
      <div className="py-20 bg-gradient-to-br from-shale-dark to-shale-mid">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-12 text-gold-primary">
            Beyond the Screen
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {[
              { name: "Photography", icon: Camera },
              { name: "Music", icon: Music },
              { name: "Coffee", icon: Coffee },
              { name: "Reading", icon: BookOpen },
            ].map((interest, index) => {
              const Icon = interest.icon;
              return (
                <ExpandableCard
                  key={index}
                  color="shale"
                  className="p-8 text-center group hover:scale-105 transition-all border border-gold-primary/20 hover:border-gold-primary/40"
                >
                  <Icon className="w-12 h-12 mx-auto mb-4 text-gold-primary group-hover:text-leaf-primary transition-colors" />
                  <h3 className="text-lg font-semibold text-foreground">
                    {interest.name}
                  </h3>
                </ExpandableCard>
              );
            })}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <HeroParallax color="shale" className="py-20">
        <GradientBackground color="leaf" className="absolute inset-0 -z-10 opacity-50" />
        <div className="container mx-auto px-4 text-center relative z-10">
          <Award className="w-16 h-16 mx-auto mb-6 text-gold-primary" />
          <h2 className="text-4xl font-bold mb-6 text-gold-primary">
            Let's Build Something Amazing
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Always open to new opportunities, collaborations, and interesting
            conversations.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Badge variant="outline" className="px-6 py-3 text-lg">
              Available for Consulting
            </Badge>
            <Badge variant="outline" className="px-6 py-3 text-lg">
              Open to Collaborations
            </Badge>
          </div>
        </div>
      </HeroParallax>
    </div>
  );
}

