import React, { useRef, useEffect, useState } from 'react';

/**
 * Generate FFT data from audio buffer using Web Audio API
 * This is client-side visualization only - processing happens on backend
 */
const generateFFTData = (audioBuffer, fftSize = 2048) => {
  if (!audioBuffer) {
    throw new Error('No audio buffer provided');
  }

  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  
  // Simple client-side FFT for visualization only
  const bufferLength = fftSize / 2;
  const magnitudes = new Float32Array(bufferLength);
  const frequencies = new Float32Array(bufferLength);
  
  // Calculate frequencies
  for (let i = 0; i < bufferLength; i++) {
    frequencies[i] = (i * sampleRate) / fftSize;
  }
  
  // Take middle section for analysis
  const startSample = Math.floor((channelData.length - fftSize) / 2);
  const analysisData = channelData.slice(startSample, startSample + fftSize);
  
  // Simple DFT for visualization
  for (let k = 0; k < bufferLength; k++) {
    let real = 0;
    let imag = 0;
    
    for (let n = 0; n < Math.min(fftSize, analysisData.length); n++) {
      const angle = (-2 * Math.PI * k * n) / fftSize;
      real += analysisData[n] * Math.cos(angle);
      imag += analysisData[n] * Math.sin(angle);
    }
    
    magnitudes[k] = Math.sqrt(real * real + imag * imag) / fftSize;
  }
  
  return { frequencies, magnitudes, sampleRate, fftSize, bufferLength };
};

export const FourierTransform = ({ 
  label = "Fourier Transform",
  scaleType = "linear",
  audioBuffer = null,
  outputAudioBuffer = null
}) => {
  const canvasRef = useRef(null);
  const [fftData, setFftData] = useState(null);
  const [outputFftData, setOutputFftData] = useState(null);

  // Generate FFT data from audio buffers (client-side visualization only)
  useEffect(() => {
    if (audioBuffer) {
      try {
        const data = generateFFTData(audioBuffer, 2048);
        setFftData(data);
        console.log('FourierTransform: FFT generated for input (visualization only)');
      } catch (error) {
        console.error('FourierTransform: Error generating input FFT:', error);
      }
    } else {
      setFftData(null);
    }
  }, [audioBuffer]);

  useEffect(() => {
    if (outputAudioBuffer) {
      try {
        const data = generateFFTData(outputAudioBuffer, 2048);
        setOutputFftData(data);
        console.log('FourierTransform: FFT generated for output (visualization only)');
      } catch (error) {
        console.error('FourierTransform: Error generating output FFT:', error);
      }
    } else {
      setOutputFftData(null);
    }
  }, [outputAudioBuffer]);

  const drawSpectrum = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // If no data available, don't draw
    if (!fftData) {
      ctx.fillStyle = '#0f1419';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Upload audio file to see frequency analysis', width / 2, height / 2);
      return;
    }
    
    // Add padding to prevent clipping
    const padding = { top: 15, right: 15, bottom: 30, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Clear canvas
    ctx.fillStyle = '#0f1419';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    for (let i = 0; i <= 10; i++) {
      const x = padding.left + (chartWidth / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Get data for plotting
    const inputFreqs = fftData.frequencies;
    const inputMags = fftData.magnitudes;
    const outputFreqs = outputFftData?.frequencies;
    const outputMags = outputFftData?.magnitudes;

    // Normalize magnitudes for visualization (0-1 range)
    const maxMag = Math.max(...inputMags, ...(outputMags || []));
    const normInput = inputMags.map(m => m / maxMag);
    const normOutput = outputMags?.map(m => m / maxMag);

    // Draw frequency responses
    if (outputFftData && normOutput) {
      // Dual spectrum (comparison mode - show both input and output)
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();

      for (let i = 0; i < normInput.length; i++) {
        let x;
        if (scaleType === "audiogram") {
          const freq = inputFreqs[i];
          if (freq < 125) continue;
          x = padding.left + (Math.log10(freq / 125) / Math.log10(8000 / 125)) * chartWidth;
        } else {
          x = padding.left + (i / normInput.length) * chartWidth;
        }
        
        const value = Math.min(1, normInput[i]);
        const y = padding.top + chartHeight - (value * chartHeight * 0.8);
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Draw second frequency response (output)
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();

      for (let i = 0; i < normOutput.length; i++) {
        let x;
        if (scaleType === "audiogram") {
          const freq = outputFreqs[i];
          if (freq < 125) continue;
          x = padding.left + (Math.log10(freq / 125) / Math.log10(8000 / 125)) * chartWidth;
        } else {
          x = padding.left + (i / normOutput.length) * chartWidth;
        }
        
        const value = Math.min(1, normOutput[i]);
        const y = padding.top + chartHeight - (value * chartHeight * 0.8);
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      // Add legend
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(padding.left, 5, 15, 8);
      ctx.fillStyle = '#e4e4e7';
      ctx.font = '11px sans-serif';
      ctx.fillText('Input', padding.left + 20, 12);
      
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(padding.left + 80, 5, 15, 8);
      ctx.fillStyle = '#e4e4e7';
      ctx.fillText('Output', padding.left + 100, 12);
    } else {
      // Single spectrum
      const gradient = ctx.createLinearGradient(padding.left, 0, width - padding.right, 0);
      gradient.addColorStop(0, '#3b82f6');
      gradient.addColorStop(0.5, '#8b5cf6');
      gradient.addColorStop(1, '#a855f7');
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2.5;
      ctx.beginPath();

      for (let i = 0; i < normInput.length; i++) {
        let x;
        if (scaleType === "audiogram") {
          const freq = inputFreqs[i];
          if (freq < 125) continue;
          x = padding.left + (Math.log10(freq / 125) / Math.log10(8000 / 125)) * chartWidth;
        } else {
          x = padding.left + (i / normInput.length) * chartWidth;
        }
        
        const value = Math.min(1, normInput[i]);
        const y = padding.top + chartHeight - (value * chartHeight * 0.8);
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // Draw X-axis labels (frequency)
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    
    if (scaleType === "audiogram") {
      const frequencies = [125, 250, 500, 1000, 2000, 4000, 8000];
      frequencies.forEach((freq) => {
        const x = padding.left + Math.log10(freq / 125 + 1) / Math.log10(65) * chartWidth;
        ctx.fillText(freq >= 1000 ? `${freq/1000}k` : `${freq}`, x, height - 8);
      });
    } else {
      for (let i = 0; i <= 5; i++) {
        const x = padding.left + (chartWidth / 5) * i;
        const freq = (i * 4);
        ctx.fillText(`${freq}k`, x, height - 8);
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      drawSpectrum();
    };

    updateSize();
    window.addEventListener('resize', updateSize);

    return () => window.removeEventListener('resize', updateSize);
  }, [scaleType, fftData, outputFftData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#e4e4e7', margin: 0 }}>{label}</h3>
        <span style={{ fontSize: '0.625rem', color: '#94a3b8' }}>
          {scaleType === "audiogram" ? "Audiogram" : "Linear"}
        </span>
      </div>

      <div style={{ flex: 1, background: '#0f1419', border: '1px solid #1e293b', borderRadius: '0.375rem', overflow: 'hidden', minHeight: 0 }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
    </div>
  );
};

export default FourierTransform;
