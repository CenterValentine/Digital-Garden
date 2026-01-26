/**
 * Enhanced Audio Player
 *
 * Features:
 * - Custom controls matching design system
 * - Play/pause, seek, volume
 * - Playback speed control
 * - Waveform visualization
 * - Loop and shuffle options
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
  SkipForward,
  SkipBack,
  Download,
  Repeat,
  Repeat1,
} from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

interface AudioPlayerProps {
  downloadUrl: string;
  fileName: string;
  mimeType: string;
  title: string;
  onDownload: () => void;
  contentId: string;
}

export function AudioPlayer({ downloadUrl, fileName, mimeType, title, onDownload, contentId }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>([]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Play/pause
  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
      startVisualization();
    }
  };

  // Seek
  const handleSeek = (value: number[]) => {
    if (!audioRef.current) return;
    const time = value[0];
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  // Skip forward/backward
  const skipForward = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.min(audioRef.current.currentTime + 10, duration);
  };

  const skipBackward = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(audioRef.current.currentTime - 10, 0);
  };

  // Volume
  const handleVolumeChange = (value: number[]) => {
    if (!audioRef.current) return;
    const vol = value[0];
    audioRef.current.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const newMuted = !isMuted;
    audioRef.current.muted = newMuted;
    setIsMuted(newMuted);
  };

  // Playback speed
  const cyclePlaybackRate = () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
    toast.success(`Playback speed: ${nextRate}x`);
  };

  // Loop
  const toggleLoop = () => {
    if (!audioRef.current) return;
    const newLoop = !isLooping;
    audioRef.current.loop = newLoop;
    setIsLooping(newLoop);
    toast.success(newLoop ? "Loop enabled" : "Loop disabled");
  };

  // Format time (seconds to MM:SS)
  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Waveform visualization
  const startVisualization = () => {
    if (!audioRef.current || !canvasRef.current) return;

    // Initialize Web Audio API if not already done
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new AudioContext();
        const source = audioContextRef.current.createMediaElementSource(audioRef.current);
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 2048;
        source.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current.destination);
      } catch (err) {
        console.error("Web Audio API error:", err);
        return;
      }
    }

    drawWaveform();
  };

  const drawWaveform = () => {
    if (!canvasRef.current || !analyserRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);

      analyserRef.current!.getByteTimeDomainData(dataArray);

      // Clear canvas
      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw waveform
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#3b82f6"; // Blue waveform
      ctx.beginPath();

      const sliceWidth = (canvas.width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      // Draw progress indicator
      const progress = currentTime / duration;
      if (isFinite(progress)) {
        ctx.fillStyle = "rgba(59, 130, 246, 0.3)";
        ctx.fillRect(0, 0, canvas.width * progress, canvas.height);
      }
    };

    draw();
  };

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handleProgress = () => {
      if (audio.buffered.length > 0) {
        setBuffered(audio.buffered.end(audio.buffered.length - 1));
      }
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("progress", handleProgress);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("progress", handleProgress);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
        case "l":
          e.preventDefault();
          toggleLoop();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, volume]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-black/40 to-black/20">
      {/* Title */}
      <div className="flex-none p-6 border-b border-white/10">
        <h2 className="text-xl font-semibold text-white mb-2">{title}</h2>
        <p className="text-sm text-gray-400">{fileName}</p>
      </div>

      {/* Waveform visualization */}
      <div className="flex-1 flex items-center justify-center p-8">
        <canvas
          ref={canvasRef}
          width={800}
          height={200}
          className="w-full max-w-4xl h-48 bg-black/20 rounded-lg border border-white/10"
        />
      </div>

      {/* Audio element (hidden) */}
      {/* Use streaming URL to avoid CORS issues with Web Audio API */}
      <audio
        ref={audioRef}
        src={`/api/content/content/${contentId}/download?stream=true`}
        preload="metadata"
        crossOrigin="anonymous"
      />

      {/* Controls */}
      <div className="flex-none">
        {/* Progress bar */}
        <div className="px-6 pb-4">
          <div className="flex items-center gap-4 mb-2">
            <span className="text-sm text-white/80 min-w-[50px] text-right">
              {formatTime(currentTime)}
            </span>
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              className="cursor-pointer flex-1"
            />
            <span className="text-sm text-white/80 min-w-[50px]">
              {formatTime(duration)}
            </span>
          </div>
          {/* Buffer indicator */}
          <div className="relative w-full h-1 mx-auto" style={{ maxWidth: "calc(100% - 120px)", marginLeft: "70px" }}>
            <div
              className="absolute h-1 bg-white/20 rounded"
              style={{ width: `${(buffered / duration) * 100}%` }}
            />
          </div>
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-between px-6 py-4 bg-black/40 backdrop-blur-sm border-t border-white/10">
          <div className="flex items-center gap-4">
            {/* Loop */}
            <Button
              onClick={toggleLoop}
              variant="ghost"
              size="sm"
              className={`text-white hover:bg-white/10 ${isLooping ? "text-blue-400" : ""}`}
              title="Loop (L)"
            >
              {isLooping ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
            </Button>

            {/* Skip back */}
            <Button
              onClick={skipBackward}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              title="Skip back 10s (←)"
            >
              <SkipBack className="h-5 w-5" />
            </Button>

            {/* Play/Pause */}
            <Button
              onClick={togglePlay}
              variant="ghost"
              size="lg"
              className="text-white hover:bg-white/10 h-12 w-12"
            >
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            </Button>

            {/* Skip forward */}
            <Button
              onClick={skipForward}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              title="Skip forward 10s (→)"
            >
              <SkipForward className="h-5 w-5" />
            </Button>

            {/* Playback speed */}
            <Button
              onClick={cyclePlaybackRate}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10 min-w-[50px]"
              title="Playback speed"
            >
              {playbackRate}x
            </Button>
          </div>

          <div className="flex items-center gap-4">
            {/* Volume */}
            <Button
              onClick={toggleMute}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              title="Mute (M)"
            >
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

            {/* Download */}
            <Button
              onClick={onDownload}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="flex-none p-2 bg-black/20 border-t border-white/10">
          <div className="flex items-center justify-center gap-4 text-xs text-white/60">
            <span>Space/K Play</span>
            <span>←/→ Skip</span>
            <span>↑/↓ Volume</span>
            <span>M Mute</span>
            <span>L Loop</span>
          </div>
        </div>
      </div>
    </div>
  );
}
