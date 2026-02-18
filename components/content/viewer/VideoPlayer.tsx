/**
 * Enhanced Video Player
 *
 * Features:
 * - Custom controls matching design system
 * - Play/pause, seek, volume
 * - Playback speed control
 * - Fullscreen mode
 * - Picture-in-picture
 * - Keyboard shortcuts
 * - Time display and progress bar
 */

"use client";

import { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipForward,
  SkipBack,
  Download,
  PictureInPicture2,
} from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

interface VideoPlayerProps {
  downloadUrl: string;
  fileName: string;
  mimeType: string;
  title: string;
  onDownload: () => void;
}

export function VideoPlayer({ downloadUrl, fileName, mimeType, title, onDownload }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffered, setBuffered] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Play/pause
  const togglePlay = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  // Seek
  const handleSeek = (value: number[]) => {
    if (!videoRef.current) return;
    const time = value[0];
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  // Skip forward/backward
  const skipForward = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 10, duration);
  };

  const skipBackward = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
  };

  // Volume
  const handleVolumeChange = (value: number[]) => {
    if (!videoRef.current) return;
    const vol = value[0];
    videoRef.current.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const newMuted = !isMuted;
    videoRef.current.muted = newMuted;
    setIsMuted(newMuted);
  };

  // Playback speed
  const cyclePlaybackRate = () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }
    toast.success(`Playback speed: ${nextRate}x`);
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  // Picture-in-picture
  const togglePictureInPicture = async () => {
    if (!videoRef.current) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.error("PiP error:", err);
      toast.error("Picture-in-picture not supported");
    }
  };

  // Format time (seconds to MM:SS)
  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Auto-hide controls
  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(video.duration);
    const handleProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("progress", handleProgress);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("progress", handleProgress);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!containerRef.current) return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skipBackward();
          break;
        case "ArrowRight":
          e.preventDefault();
          skipForward();
          break;
        case "ArrowUp":
          e.preventDefault();
          handleVolumeChange([Math.min(volume + 0.1, 1)]);
          break;
        case "ArrowDown":
          e.preventDefault();
          handleVolumeChange([Math.max(volume - 0.1, 0)]);
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "p":
          e.preventDefault();
          togglePictureInPicture();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, volume]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-black min-h-full"
      onMouseMove={resetControlsTimeout}
      onMouseEnter={() => setShowControls(true)}
    >
      {/* Video element */}
      <div className="flex-shrink-0 relative flex items-center justify-center p-4">
        <video
          ref={videoRef}
          src={downloadUrl}
          className="max-w-full max-h-full"
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
        >
          Your browser does not support the video tag.
        </video>

        {/* Click overlay for play/pause */}
        {!isPlaying && (
          <div
            className="absolute inset-0 flex items-center justify-center cursor-pointer"
            onClick={togglePlay}
          >
            <div className="bg-black/60 backdrop-blur-sm rounded-full p-6 hover:bg-black/80 transition-colors">
              <Play className="h-16 w-16 text-white" />
            </div>
          </div>
        )}

        {/* Buffering indicator */}
        {isPlaying && currentTime < buffered && (
          <div className="absolute top-4 right-4 text-sm text-white/60 bg-black/40 px-3 py-1 rounded backdrop-blur-sm">
            Buffering...
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        className={`flex-none transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Progress bar */}
        <div className="px-4 pt-2">
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={handleSeek}
            className="cursor-pointer"
          />
          {/* Buffer indicator */}
          <div className="relative w-full h-1 -mt-1">
            <div
              className="absolute h-1 bg-white/20 rounded"
              style={{ width: `${(buffered / duration) * 100}%` }}
            />
          </div>
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            {/* Play/Pause */}
            <Button onClick={togglePlay} variant="ghost" size="sm" className="text-white hover:bg-white/10">
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>

            {/* Skip buttons */}
            <Button onClick={skipBackward} variant="ghost" size="sm" className="text-white hover:bg-white/10" title="Skip back 10s (←)">
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button onClick={skipForward} variant="ghost" size="sm" className="text-white hover:bg-white/10" title="Skip forward 10s (→)">
              <SkipForward className="h-4 w-4" />
            </Button>

            {/* Volume */}
            <Button onClick={toggleMute} variant="ghost" size="sm" className="text-white hover:bg-white/10">
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            <div className="w-24">
              <Slider
                value={[isMuted ? 0 : volume]}
                max={1}
                step={0.01}
                onValueChange={handleVolumeChange}
                className="cursor-pointer"
              />
            </div>

            {/* Time display */}
            <span className="text-sm text-white/80 min-w-[100px]">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Playback speed */}
            <Button
              onClick={cyclePlaybackRate}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              title="Playback speed"
            >
              {playbackRate}x
            </Button>

            {/* Picture-in-picture */}
            <Button
              onClick={togglePictureInPicture}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              title="Picture-in-picture (P)"
            >
              <PictureInPicture2 className="h-4 w-4" />
            </Button>

            {/* Fullscreen */}
            <Button
              onClick={toggleFullscreen}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              title="Fullscreen (F)"
            >
              {isFullscreen ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Maximize className="h-4 w-4" />
              )}
            </Button>

            {/* Download */}
            <Button onClick={onDownload} variant="ghost" size="sm" className="text-white hover:bg-white/10">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      {showControls && (
        <div className="flex-none p-2 bg-black/60 backdrop-blur-sm border-t border-white/10">
          <div className="flex items-center justify-center gap-4 text-xs text-white/60">
            <span>Space/K Play</span>
            <span>←/→ Skip</span>
            <span>↑/↓ Volume</span>
            <span>M Mute</span>
            <span>F Fullscreen</span>
            <span>P PiP</span>
          </div>
        </div>
      )}
    </div>
  );
}
