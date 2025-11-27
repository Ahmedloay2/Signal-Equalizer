import React, { useRef, useEffect, useState } from 'react';

export const AudioPlayback = ({ label, variant, playbackState, onPlaybackStateChange, audioBuffer = null, inputAudioBuffer = null, isProcessing = false }) => {
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioSourceRef = useRef(null);
  const startTimeRef = useRef(0);
  const pauseTimeRef = useRef(0);
  const animationFrameRef = useRef(null);
  const [actualDuration, setActualDuration] = useState(0);
  const waveformData = useRef(null);
  const normalizationScale = useRef(1.0);
  
  // Generate waveform from audio buffer
  useEffect(() => {
    if (!audioBuffer) {
      setActualDuration(0);
      waveformData.current = null;
      normalizationScale.current = 1.0;
      return;
    }

    try {
      setActualDuration(audioBuffer.duration);
      
      // Generate waveform data (downsample for visualization)
      const rawData = audioBuffer.getChannelData(0);
      const samples = 2000; // Number of samples for waveform
      const blockSize = Math.floor(rawData.length / samples);
      const filteredData = new Float32Array(samples);
      
      for (let i = 0; i < samples; i++) {
        const start = blockSize * i;
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(rawData[start + j]);
        }
        filteredData[i] = sum / blockSize;
      }
      
      // Calculate signal max
      let signalMax = 0;
      for (let i = 0; i < rawData.length; i++) {
        const val = Math.abs(rawData[i]);
        if (val > signalMax) signalMax = val;
      }
      
      // For output signal, use the same scale as input for direct comparison
      if (variant === 'output' && inputAudioBuffer) {
        const inputData = inputAudioBuffer.getChannelData(0);
        let inputMax = 0;
        for (let i = 0; i < inputData.length; i++) {
          const val = Math.abs(inputData[i]);
          if (val > inputMax) inputMax = val;
        }
        
        // Use the same scale as input (0.8 / inputMax)
        if (inputMax > 0) {
          normalizationScale.current = 0.8 / inputMax;
          console.log(`AudioPlayback (output): Using input scale - inputMax: ${inputMax.toFixed(4)}, outputMax: ${signalMax.toFixed(4)}, scale: ${normalizationScale.current.toFixed(4)}`);
        } else {
          normalizationScale.current = 1.0;
        }
      } else {
        // For input or standalone signals, normalize to own max
        if (signalMax > 0) {
          // Normalize to use 80% of available space (leaves headroom)
          normalizationScale.current = 0.8 / signalMax;
        } else {
          normalizationScale.current = 1.0;
        }
      }
      
      waveformData.current = filteredData;
      console.log(`AudioPlayback (${variant}): Waveform generated, duration: ${audioBuffer.duration.toFixed(2)}s`);
    } catch (error) {
      console.error(`AudioPlayback (${variant}): Error generating waveform:`, error);
    }
  }, [audioBuffer, inputAudioBuffer, variant]);
  
  const duration = actualDuration || 10;
  const { isPlaying, isPaused, time, speed } = playbackState || {
    isPlaying: false,
    isPaused: false,
    time: 0,
    speed: 1
  };
  
  // Always use zoom=1 and pan=0 for true comparison between input/output
  const zoom = 1;
  const pan = 0;

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    // Clear canvas
    ctx.fillStyle = '#0f1419';
    ctx.fillRect(0, 0, width, height);

    const data = waveformData.current;
    
    // Show empty state if no data
    if (!data) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      if (isProcessing) {
        ctx.fillText('Processing audio...', width / 2, height / 2);
      } else {
        ctx.fillText('Upload audio file', width / 2, height / 2);
      }
      return;
    }
    
    const color = variant === 'input' ? '#22c55e' : '#8b5cf6';
    
    // Draw waveform
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const visibleSamples = Math.floor(data.length / zoom);
    const startSample = Math.floor(pan * (data.length - visibleSamples));
    const samplesPerPixel = visibleSamples / width;

    for (let x = 0; x < width; x++) {
      const sampleIndex = Math.floor(startSample + x * samplesPerPixel);
      if (sampleIndex >= data.length) break;
      
      const sample = data[sampleIndex] * normalizationScale.current;
      // Use 90% of height for better visualization (leave 10% headroom)
      const y = height / 2 - (sample * height * 0.45);
      
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw center line
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Draw playhead if playing
    if (isPlaying && !isPaused) {
      const progress = time / duration;
      const playheadX = progress * width;
      
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
  }, [variant, zoom, pan, isPlaying, isPaused, time, duration, audioBuffer, isProcessing]);

  // Animation loop for playhead
  useEffect(() => {
    if (!isPlaying || isPaused || !onPlaybackStateChange) return;

    let animationId;
    let lastTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const deltaTime = (now - lastTime) / 1000; // Convert to seconds
      lastTime = now;

      const newTime = time + deltaTime * speed;
      
      if (newTime >= duration) {
        onPlaybackStateChange({
          ...playbackState,
          isPlaying: false,
          time: duration
        });
        return;
      }

      onPlaybackStateChange({
        ...playbackState,
        time: newTime
      });

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isPlaying, isPaused, time, speed, duration, playbackState, onPlaybackStateChange]);

  const handlePlay = () => {
    if (!onPlaybackStateChange || !audioBuffer) return;
    
    // If already playing, do nothing
    if (isPlaying && !isPaused) return;
    
    // Create audio context if needed
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Stop any currently playing audio
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      audioSourceRef.current = null;
    }
    
    // Create new audio source
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = speed;
    source.connect(audioContextRef.current.destination);
    
    // Start from current time (resume from pause or start from beginning)
    const startOffset = isPaused ? time : (time > duration - 0.1 ? 0 : time);
    startTimeRef.current = audioContextRef.current.currentTime - startOffset;
    source.start(0, startOffset);
    audioSourceRef.current = source;
    
    // Handle when playback ends naturally
    source.onended = () => {
      if (audioSourceRef.current === source && onPlaybackStateChange) {
        onPlaybackStateChange({
          ...playbackState,
          isPlaying: false,
          isPaused: false,
          time: 0
        });
        audioSourceRef.current = null;
      }
    };
    
    onPlaybackStateChange({
      ...playbackState,
      isPlaying: true,
      isPaused: false,
    });
  };

  const handlePause = () => {
    if (!onPlaybackStateChange || !isPlaying) return;
    
    // Stop audio source
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      audioSourceRef.current = null;
    }
    
    // Save current time before pausing
    onPlaybackStateChange({
      ...playbackState,
      isPaused: true,
      isPlaying: false,
      time: time // Keep current time
    });
  };

  const handleStop = () => {
    if (!onPlaybackStateChange) return;
    
    // Stop audio source
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      audioSourceRef.current = null;
      audioSourceRef.current = null;
    }
    
    onPlaybackStateChange({
      ...playbackState,
      isPlaying: false,
      isPaused: false,
      time: 0,
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.stop();
        } catch (e) {
          // Ignore
        }
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const handleReset = () => {
    if (!onPlaybackStateChange) return;
    onPlaybackStateChange({
      ...playbackState,
      time: 0,
      speed: 1,
      zoom: 1,
      pan: 0,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', height: '100%', minHeight: 0 }} className="audio-playback">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#e4e4e7', margin: 0 }}>{label}</h3>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={handlePlay}
            disabled={isPlaying && !isPaused}
            className={`control-btn ${isPlaying && !isPaused ? 'playing' : 'stopped'}`}
            style={{ padding: '0.25rem 0.5rem', border: '1px solid #334155', borderRadius: '0.25rem', color: '#e4e4e7', cursor: 'pointer', fontSize: '0.75rem', transition: 'all 0.2s ease' }}
          >
            ▶
          </button>
          <button
            onClick={handlePause}
            disabled={!isPlaying || isPaused}
            className={`control-btn ${isPaused ? 'paused' : 'stopped'}`}
            style={{ padding: '0.25rem 0.5rem', border: '1px solid #334155', borderRadius: '0.25rem', color: '#e4e4e7', cursor: 'pointer', fontSize: '0.75rem', transition: 'all 0.2s ease' }}
          >
            ⏸
          </button>
          <button
            onClick={handleStop}
            className="control-btn stopped"
            style={{ padding: '0.25rem 0.5rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.25rem', color: '#e4e4e7', cursor: 'pointer', fontSize: '0.75rem', transition: 'all 0.2s ease' }}
          >
            ⏹
          </button>
          <button
            onClick={handleReset}
            className="control-btn stopped"
            style={{ padding: '0.25rem 0.5rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.25rem', color: '#e4e4e7', cursor: 'pointer', fontSize: '0.75rem', transition: 'all 0.2s ease' }}
          >
            🔄
          </button>
        </div>
      </div>

      <div style={{ flex: 1, background: '#0f1419', border: '1px solid #1e293b', borderRadius: '0.375rem', overflow: 'hidden', minHeight: 0 }}>
        <canvas ref={canvasRef} className="waveform-canvas" style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.625rem' }}>
        <div>
          <label style={{ color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
            Speed: {speed.toFixed(1)}x
          </label>
          <input
            type="range"
            value={speed}
            onChange={(e) => onPlaybackStateChange({ ...playbackState, speed: Number(e.target.value) })}
            min="0.25"
            max="4"
            step="0.25"
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label style={{ color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
            Zoom: {zoom.toFixed(1)}x
          </label>
          <input
            type="range"
            value={zoom}
            onChange={(e) => onPlaybackStateChange({ ...playbackState, zoom: Number(e.target.value) })}
            min="1"
            max="10"
            step="0.5"
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label style={{ color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
            Pan: {(pan * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            value={pan}
            onChange={(e) => onPlaybackStateChange({ ...playbackState, pan: Number(e.target.value) })}
            min="0"
            max="1"
            step="0.01"
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </div>
  );
};
