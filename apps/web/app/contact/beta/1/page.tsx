"use client";

import React, { useState } from "react";
import {
  BackgroundBoxes,
  NoiseBackground,
  MovingBorder,
  StatefulButtons,
  EvervaultCard,
  Card3D,
  HeroSections,
  BackgroundGradient,
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
import { Input } from "@/components/client/ui/input";
import { Textarea } from "@/components/client/ui/textarea";
import { Button } from "@/components/client/ui/button";
import { Badge } from "@/components/client/ui/badge";
import {
  Mail,
  MessageSquare,
  Send,
  MapPin,
  Phone,
  Github,
  Twitter,
  Linkedin,
  Calendar,
  Clock,
  Globe,
} from "lucide-react";

export default function ContactBeta1Page() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle form submission
    console.log("Form submitted:", formData);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const contactMethods = [
    {
      title: "Email",
      description: "Send me a message",
      value: "hello@example.com",
      icon: Mail,
      color: "gold" as const,
      action: "mailto:hello@example.com",
    },
    {
      title: "Social",
      description: "Connect on social media",
      value: "@username",
      icon: Twitter,
      color: "leaf" as const,
      action: "https://twitter.com",
    },
    {
      title: "Schedule",
      description: "Book a meeting",
      value: "30 min call",
      icon: Calendar,
      color: "neon" as const,
      action: "#",
    },
  ];

  const socialLinks = [
    { name: "GitHub", icon: Github, href: "https://github.com", color: "shale" as const },
    { name: "Twitter", icon: Twitter, href: "https://twitter.com", color: "gold" as const },
    { name: "LinkedIn", icon: Linkedin, href: "https://linkedin.com", color: "leaf" as const },
  ];

  const availability = [
    { day: "Monday - Friday", time: "9:00 AM - 6:00 PM" },
    { day: "Weekend", time: "Limited availability" },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <HeroSections color="shale" className="min-h-[50vh] relative overflow-hidden">
        <NoiseBackground color="shale" className="absolute inset-0 opacity-30" />
        <div className="container mx-auto px-4 py-20 text-center relative z-10">
          <div className="mb-6">
            <MessageSquare className="w-16 h-16 mx-auto text-gold-primary" />
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-gold-primary via-gold-light to-leaf-primary bg-clip-text text-transparent">
            Get In Touch
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
            Have a project in mind? Want to collaborate? Or just say hello? I'd
            love to hear from you.
          </p>
        </div>
      </HeroSections>

      {/* Contact Methods Section */}
      <BackgroundGradient color="shale" className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-12 text-gold-primary">
            Ways to Reach Me
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-16">
            {contactMethods.map((method, index) => {
              const Icon = method.icon;
              return (
                <EvervaultCard
                  key={index}
                  color={method.color}
                  className="p-8 text-center group hover:scale-105 transition-transform cursor-pointer"
                  onClick={() => {
                    if (method.action.startsWith("http") || method.action.startsWith("mailto")) {
                      window.open(method.action, "_blank");
                    }
                  }}
                >
                  <Icon className="w-12 h-12 mx-auto mb-4 text-gold-primary group-hover:text-leaf-primary transition-colors" />
                  <h3 className="text-xl font-semibold mb-2 text-foreground">
                    {method.title}
                  </h3>
                  <p className="text-muted-foreground mb-3">{method.description}</p>
                  <p className="text-gold-primary font-medium">{method.value}</p>
                </EvervaultCard>
              );
            })}
          </div>
        </div>
      </BackgroundGradient>

      {/* Main Contact Form Section */}
      <WavyBackground color="shale" className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
            {/* Contact Form */}
            <Card className="border-gold-primary/20">
              <CardHeader>
                <CardTitle className="text-2xl text-gold-primary">
                  Send a Message
                </CardTitle>
                <CardDescription>
                  Fill out the form below and I'll get back to you as soon as
                  possible.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label
                      htmlFor="name"
                      className="text-sm font-medium text-foreground"
                    >
                      Name
                    </label>
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      placeholder="Your name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="border-gold-primary/20 focus:border-gold-primary"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="email"
                      className="text-sm font-medium text-foreground"
                    >
                      Email
                    </label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="your.email@example.com"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      className="border-gold-primary/20 focus:border-gold-primary"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="subject"
                      className="text-sm font-medium text-foreground"
                    >
                      Subject
                    </label>
                    <Input
                      id="subject"
                      name="subject"
                      type="text"
                      placeholder="What's this about?"
                      value={formData.subject}
                      onChange={handleChange}
                      required
                      className="border-gold-primary/20 focus:border-gold-primary"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="message"
                      className="text-sm font-medium text-foreground"
                    >
                      Message
                    </label>
                    <Textarea
                      id="message"
                      name="message"
                      placeholder="Tell me more about your project or inquiry..."
                      value={formData.message}
                      onChange={handleChange}
                      required
                      rows={6}
                      className="border-gold-primary/20 focus:border-gold-primary resize-none"
                    />
                  </div>

                  <MovingBorder className="w-full rounded-md" color="gold">
                    <Button
                      type="submit"
                      className="w-full bg-gold-primary hover:bg-gold-light text-white"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Send Message
                    </Button>
                  </MovingBorder>
                </form>
              </CardContent>
            </Card>

            {/* Additional Info */}
            <div className="space-y-6">
              {/* Availability Card */}
              <Card3D color="gold" className="p-6">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-4">
                    <Clock className="w-6 h-6 text-gold-primary" />
                    <CardTitle className="text-xl">Availability</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {availability.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between pb-3 border-b border-gold-primary/20 last:border-0"
                      >
                        <span className="text-foreground font-medium">
                          {item.day}
                        </span>
                        <span className="text-muted-foreground">
                          {item.time}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card3D>

              {/* Social Links */}
              <Card className="border-leaf-primary/20">
                <CardHeader>
                  <CardTitle className="text-xl flex items-center gap-3">
                    <Globe className="w-6 h-6 text-leaf-primary" />
                    Connect Online
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    {socialLinks.map((social, index) => {
                      const Icon = social.icon;
                      return (
                        <a
                          key={index}
                          href={social.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-col items-center p-4 rounded-lg border border-gold-primary/20 hover:border-gold-primary/40 transition-colors group"
                        >
                          <Icon className="w-8 h-8 mb-2 text-gold-primary group-hover:text-leaf-primary transition-colors" />
                          <span className="text-sm text-foreground">
                            {social.name}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Response */}
              <Card className="border-neon-primary/20 bg-gradient-to-br from-neon-primary/5 to-transparent">
                <CardHeader>
                  <CardTitle className="text-xl flex items-center gap-3">
                    <MessageSquare className="w-6 h-6 text-neon-primary" />
                    Response Time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    I typically respond within{" "}
                    <span className="font-semibold text-foreground">
                      24-48 hours
                    </span>
                    . For urgent matters, please use the contact methods above.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </WavyBackground>

      {/* CTA Section */}
      <BackgroundBoxes color="shale" className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-6 text-gold-primary">
            Let's Work Together
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Whether you have a project in mind or just want to connect, I'm
            always open to new opportunities and conversations.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <StatefulButtons
              color="gold"
              className="px-8 py-3"
              onClick={() => window.open("mailto:hello@example.com", "_blank")}
            >
              Start a Conversation
            </StatefulButtons>
            <StatefulButtons
              color="leaf"
              className="px-8 py-3"
              onClick={() => window.open("#", "_blank")}
            >
              Schedule a Call
            </StatefulButtons>
          </div>
        </div>
      </BackgroundBoxes>
    </div>
  );
}

