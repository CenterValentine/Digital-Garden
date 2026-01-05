"use client";

import React from "react";
import {
  AuroraBackground,
  BentoGrid,
  Card3D,
  WobbleCard,
  FeatureSections,
  HeroSections,
  BackgroundGradient,
} from "@/components/client/third-party/aceternity";
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
} from "lucide-react";

export default function AboutBetaPage() {
  const skills = [
    {
      title: "Full-Stack Development",
      description: "Building scalable web applications",
      icon: Code,
      color: "gold" as const,
    },
    {
      title: "UI/UX Design",
      description: "Creating beautiful user experiences",
      icon: Palette,
      color: "leaf" as const,
    },
    {
      title: "Product Innovation",
      description: "Turning ideas into reality",
      icon: Rocket,
      color: "neon" as const,
    },
    {
      title: "Open Source",
      description: "Contributing to the community",
      icon: Heart,
      color: "shale" as const,
    },
  ];

  const timelineItems = [
    {
      title: "Senior Software Engineer",
      description: "Leading development of innovative web applications",
      date: "2023 - Present",
    },
    {
      title: "Full-Stack Developer",
      description: "Built scalable applications using modern tech stacks",
      date: "2021 - 2023",
    },
    {
      title: "Software Engineer",
      description: "Developed and maintained production systems",
      date: "2019 - 2021",
    },
    {
      title: "Computer Science Degree",
      description: "Graduated with focus on software engineering",
      date: "2015 - 2019",
    },
  ];

  const interests = [
    { name: "Photography", icon: Camera },
    { name: "Music", icon: Music },
    { name: "Coffee", icon: Coffee },
    { name: "Reading", icon: BookOpen },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <HeroSections color="shale" className="min-h-[60vh]">
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-gold-primary via-gold-light to-leaf-primary bg-clip-text text-transparent">
            About Me
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
            Passionate developer, designer, and creator building the future of
            digital experiences
          </p>
        </div>
      </HeroSections>

      {/* Skills Section with Bento Grid */}
      <FeatureSections color="shale" className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-12 text-gold-primary">
            What I Do
          </h2>
          <BentoGrid className="max-w-6xl mx-auto">
            {skills.map((skill, index) => {
              const Icon = skill.icon;
              return (
                <Card3D
                  key={index}
                  color={skill.color}
                  className="p-6 flex flex-col items-center justify-center text-center min-h-[200px]"
                >
                  <div className="mb-4">
                    <Icon className="w-12 h-12 mx-auto text-gold-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground">
                    {skill.title}
                  </h3>
                  <p className="text-muted-foreground">{skill.description}</p>
                </Card3D>
              );
            })}
          </BentoGrid>
        </div>
      </FeatureSections>

      {/* Timeline Section */}
      <AuroraBackground color="shale" className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-12 text-gold-primary">
            Journey
          </h2>
          <div className="max-w-4xl mx-auto">
            <div className="space-y-8">
              {timelineItems.map((item, index) => (
                <div
                  key={index}
                  className="relative flex gap-6 items-start group"
                >
                  <div className="flex flex-col items-center">
                    <div className="w-4 h-4 rounded-full bg-gold-primary group-hover:bg-leaf-primary transition-colors" />
                    {index < timelineItems.length - 1 && (
                      <div className="w-0.5 h-full min-h-[60px] bg-gold-primary/30 mt-2" />
                    )}
                  </div>
                  <div className="flex-1 pb-8">
                    <Card className="border-gold-primary/20 hover:border-gold-primary/40 transition-colors">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-xl">{item.title}</CardTitle>
                          <Badge variant="outline" className="text-gold-primary">
                            {item.date}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <CardDescription className="text-base">
                          {item.description}
                        </CardDescription>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AuroraBackground>

      {/* Interests Section with Wobble Cards */}
      <FeatureSections color="shale" className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-12 text-gold-primary">
            Beyond Code
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {interests.map((interest, index) => {
              const Icon = interest.icon;
              return (
                <WobbleCard
                  key={index}
                  color="shale"
                  className="p-8 text-center group hover:scale-105 transition-transform"
                >
                  <Icon className="w-12 h-12 mx-auto mb-4 text-gold-primary group-hover:text-leaf-primary transition-colors" />
                  <h3 className="text-lg font-semibold text-foreground">
                    {interest.name}
                  </h3>
                </WobbleCard>
              );
            })}
          </div>
        </div>
      </FeatureSections>

      {/* Values Section */}
      <BackgroundGradient color="shale" className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-12 text-gold-primary">
            Core Values
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="border-gold-primary/30">
              <CardHeader>
                <Award className="w-10 h-10 mb-4 text-gold-primary" />
                <CardTitle>Excellence</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Striving for the highest quality in everything I create
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-leaf-primary/30">
              <CardHeader>
                <Heart className="w-10 h-10 mb-4 text-leaf-primary" />
                <CardTitle>Empathy</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Building products that truly serve and understand users
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-neon-primary/30">
              <CardHeader>
                <Rocket className="w-10 h-10 mb-4 text-neon-primary" />
                <CardTitle>Innovation</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Pushing boundaries and exploring new possibilities
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </BackgroundGradient>

      {/* CTA Section */}
      <HeroSections color="shale" className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-6 text-gold-primary">
            Let's Connect
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Interested in collaborating or just want to chat? I'd love to hear
            from you.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Badge variant="outline" className="px-6 py-2 text-lg">
              Available for Projects
            </Badge>
            <Badge variant="outline" className="px-6 py-2 text-lg">
              Open to Opportunities
            </Badge>
          </div>
        </div>
      </HeroSections>
    </div>
  );
}

