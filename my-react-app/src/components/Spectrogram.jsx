import React, { useRef, useEffect, useState } from "react";

export const Spectrogram = ({ label, audioBuffer = null, spectrogramData: externalSpectrogramData = null, isOutput = false }) => {
  const canvasRef = useRef(null);
  const [spectrogramData, setSpectrogramData] = useState(null);

  // Use spectrogram data from parent (generated during FFT processing)
  useEffect(() => {
    if (!audioBuffer) {
      setSpectrogramData(null);
      return;
    }
    
    if (!externalSpectrogramData) {
      console.log('Spectrogram: Waiting for FFT data...');
      setSpectrogramData(null);
      return;
    }
    
    // Choose input or output spectrogram based on prop
    const spectrogramArray = isOutput ? externalSpectrogramData.outputSpectrogram : externalSpectrogramData.inputSpectrogram;
    
    if (!spectrogramArray || !Array.isArray(spectrogramArray) || spectrogramArray.length === 0) {
      console.log('Spectrogram: No', isOutput ? 'output' : 'input', 'data available. Data:', externalSpectrogramData);
      setSpectrogramData(null);
      return;
    }
    
    console.log('Spectrogram:', isOutput ? 'output' : 'input', 'using data from FFT processing:', externalSpectrogramData.spectrogramNumFrames, 'frames');
    
    setSpectrogramData({
      data: spectrogramArray,
      frequencies: externalSpectrogramData.spectrogramFrequencies,
      times: externalSpectrogramData.spectrogramTimes,
      sampleRate: externalSpectrogramData.sampleRate,
      numFrames: externalSpectrogramData.spectrogramNumFrames,
      freqBins: externalSpectrogramData.spectrogramNumFreqBins
    });
  }, [audioBuffer, externalSpectrogramData, isOutput]);

  const drawSpectrogram = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Skip drawing if canvas has no dimensions yet
    if (width === 0 || height === 0) {
      return;
    }

    // Clear canvas with dark background
    ctx.fillStyle = '#0f1419';
    ctx.fillRect(0, 0, width, height);
    
    // If no data available, show message
    if (!spectrogramData || !spectrogramData.data) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Upload audio file to see spectrogram', width / 2, height / 2);
      return;
    }
    
    console.log('Spectrogram: Drawing', spectrogramData.numFrames, 'frames x', spectrogramData.freqBins, 'bins');

    const labelPadding = 40;
    const chartWidth = width - labelPadding - 20;
    const chartHeight = height - labelPadding * 2;
    
    // Normalize data (backend returns dB values, find min/max for normalization)
    let maxVal = -Infinity;
    let minVal = Infinity;
    spectrogramData.data.forEach(frame => {
      frame.forEach(val => { 
        if (val > maxVal) maxVal = val;
        if (val < minVal) minVal = val;
      });
    });
    
    const range = maxVal - minVal;
    
    // Draw spectrogram directly
    const numFrames = spectrogramData.data.length;
    const freqBins = spectrogramData.data[0].length;
    
    for (let t = 0; t < numFrames; t++) {
      for (let f = 0; f < freqBins; f++) {
        // Normalize dB value to 0-1 range
        const dbValue = spectrogramData.data[t][f];
        const normalized = range > 0 ? (dbValue - minVal) / range : 0;
        
        // Apply jet colormap: blue -> cyan -> green -> yellow -> red
        const intensity = Math.pow(Math.max(0, Math.min(1, normalized)), 0.5);
        let r, g, b;
        
        if (intensity < 0.25) {
          // Dark Blue to Blue (0-0.25)
          const t = intensity / 0.25;
          r = 0;
          g = 0;
          b = Math.floor(128 + 127 * t);
        } else if (intensity < 0.5) {
          // Blue to Cyan (0.25-0.5)
          const t = (intensity - 0.25) / 0.25;
          r = 0;
          g = Math.floor(255 * t);
          b = 255;
        } else if (intensity < 0.75) {
          // Cyan to Yellow (0.5-0.75)
          const t = (intensity - 0.5) / 0.25;
          r = Math.floor(255 * t);
          g = 255;
          b = Math.floor(255 * (1 - t));
        } else {
          // Yellow to Red (0.75-1.0)
          const t = (intensity - 0.75) / 0.25;
          r = 255;
          g = Math.floor(255 * (1 - t));
          b = 0;
        }
        
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        
        const x = labelPadding + (t / numFrames) * chartWidth;
        const y = labelPadding + chartHeight - (f / freqBins) * chartHeight;
        const w = Math.ceil(chartWidth / numFrames) + 1;
        const h = Math.ceil(chartHeight / freqBins) + 1;
        
        ctx.fillRect(x, y, w, h);
      }
    }

    // Draw axes labels with better visibility
    // labelPadding already defined above
    
    // Y-axis label (Frequency) - rotated
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e4e4e7';
    ctx.font = "bold 12px sans-serif";
    ctx.fillText('Frequency (kHz)', 0, 0);
    ctx.restore();
    
    // X-axis label (Time)
    ctx.fillStyle = '#e4e4e7';
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('Time (s)', width / 2, height - 5);
    
    // Draw axis lines
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    // Y-axis line
    ctx.beginPath();
    ctx.moveTo(labelPadding, labelPadding);
    ctx.lineTo(labelPadding, height - labelPadding);
    ctx.stroke();
    // X-axis line
    ctx.beginPath();
    ctx.moveTo(labelPadding, height - labelPadding);
    ctx.lineTo(width - 20, height - labelPadding);
    ctx.stroke();
    
    // Frequency axis ticks (Y-axis) - use actual frequency data starting from 0
    ctx.fillStyle = '#94a3b8';
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = 'middle';
    const minFreq = 0; // Always start from 0 Hz
    const maxFreq = spectrogramData.frequencies[spectrogramData.frequencies.length - 1] / 1000; // Convert to kHz
    const freqRange = maxFreq - minFreq;
    
    for (let i = 0; i <= 4; i++) {
      const y = labelPadding + ((height - labelPadding * 2) / 4) * (4 - i);
      const freq = minFreq + (i / 4) * freqRange;
      ctx.fillText(`${freq.toFixed(1)}`, labelPadding - 5, y);
    }

    // Time axis ticks (X-axis) - use actual time data
    ctx.textAlign = "center";
    ctx.textBaseline = 'top';
    const maxTime = spectrogramData.times[spectrogramData.times.length - 1];
    for (let i = 0; i <= 4; i++) {
      const x = labelPadding + ((width - labelPadding - 20) / 4) * i;
      const time = (i / 4) * maxTime;
      ctx.fillText(`${time.toFixed(1)}`, x, height - labelPadding + 5);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      const newWidth = rect.width;
      const newHeight = rect.height;
      
      // Only update if dimensions are valid and have changed
      if (newWidth > 0 && newHeight > 0 && (canvas.width !== newWidth || canvas.height !== newHeight)) {
        canvas.width = newWidth;
        canvas.height = newHeight;
        console.log('Spectrogram: Canvas resized to', newWidth, 'x', newHeight);
        drawSpectrogram();
      }
    };

    // Use requestAnimationFrame to ensure DOM is ready
    const rafId = requestAnimationFrame(() => {
      updateSize();
      // Retry after a short delay if still 0x0
      if (canvas.width === 0 || canvas.height === 0) {
        setTimeout(updateSize, 50);
      }
    });
    
    window.addEventListener("resize", updateSize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateSize);
    };
  }, [spectrogramData]);
  
  // Redraw when data changes (after canvas is sized)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      drawSpectrogram();
    }
  }, [spectrogramData]);

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '0.5rem', 
      height: '100%',
      minHeight: '350px'
    }}>
      <h3 style={{ 
        fontSize: '0.875rem', 
        fontWeight: 600, 
        color: '#e4e4e7',
        margin: 0,
        padding: '0.5rem',
        background: 'linear-gradient(135deg, #0f1419 0%, #1a1a2e 100%)',
        borderRadius: '0.375rem',
        border: '1px solid #1e293b'
      }}>
        {label}
      </h3>
      <div style={{ 
        flex: 1, 
        background: '#0f1419', 
        border: '1px solid #1e293b', 
        borderRadius: '0.5rem', 
        overflow: 'hidden',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.4)'
      }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
    </div>
  );
};
