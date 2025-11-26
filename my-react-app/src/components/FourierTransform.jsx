import React, { useRef, useEffect, useState } from 'react';

/**
 * Convert backend FFT data to magnitude spectrum for visualization
 */
const convertBackendFFTToSpectrum = (fftReal, fftImag, sampleRate, fftSize) => {
  if (!fftReal || !fftImag) {
    throw new Error('No FFT data provided');
  }

  // Backend returns full FFT, we only need first half for visualization
  const bufferLength = Math.floor(fftSize / 2);
  const magnitudes = new Float32Array(bufferLength);
  const frequencies = new Float32Array(bufferLength);
  
  // Calculate frequencies and magnitudes
  for (let i = 0; i < bufferLength; i++) {
    frequencies[i] = (i * sampleRate) / fftSize;
    // Magnitude = sqrt(real^2 + imag^2)
    magnitudes[i] = Math.sqrt(fftReal[i] * fftReal[i] + fftImag[i] * fftImag[i]);
  }
  
  return { frequencies, magnitudes, sampleRate, fftSize, bufferLength };
};

export const FourierTransform = ({ 
  label = "Fourier Transform",
  scaleType = "linear",
  backendFFTData = null  // Use backend FFT data instead of audio buffers
}) => {
  const canvasRef = useRef(null);
  const [inputFftData, setInputFftData] = useState(null);
  const [outputFftData, setOutputFftData] = useState(null);

  // Process backend FFT data when it changes
  useEffect(() => {
    if (!backendFFTData) {
      setInputFftData(null);
      setOutputFftData(null);
      return;
    }

    try {
      const { originalFftReal, originalFftImag, fftReal, fftImag, sampleRate, fftSize, hasModifications } = backendFFTData;
      
      if (!fftReal || !fftImag) {
        console.warn('FourierTransform: Missing processed FFT data from backend');
        return;
      }

      // Convert original FFT (before equalizer)
      if (originalFftReal && originalFftImag) {
        const inputSpectrum = convertBackendFFTToSpectrum(originalFftReal, originalFftImag, sampleRate, fftSize);
        setInputFftData(inputSpectrum);
      } else {
        setInputFftData(null);
      }
      
      // Convert processed FFT (after equalizer)
      const outputSpectrum = convertBackendFFTToSpectrum(fftReal, fftImag, sampleRate, fftSize);
      setOutputFftData(outputSpectrum);
      
      // Find min/max magnitude iteratively to avoid stack overflow
      let minMag = Infinity, maxMag = -Infinity;
      for (let i = 0; i < outputSpectrum.magnitudes.length; i++) {
        const mag = outputSpectrum.magnitudes[i];
        if (mag < minMag) minMag = mag;
        if (mag > maxMag) maxMag = mag;
      }
      
      console.log('FourierTransform: Loaded FFT comparison', {
        fftSize,
        sampleRate,
        hasModifications,
        hasOriginal: !!(originalFftReal && originalFftImag),
        frequencyRange: [outputSpectrum.frequencies[0], outputSpectrum.frequencies[outputSpectrum.frequencies.length - 1]],
        outputMagnitudeRange: [minMag, maxMag]
      });
    } catch (error) {
      console.error('FourierTransform: Error processing backend FFT:', error);
    }
  }, [backendFFTData]);

  const drawSpectrum = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // If no output data available, don't draw
    if (!outputFftData) {
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
    const hasInputData = inputFftData && inputFftData.magnitudes;
    const hasOutputData = outputFftData && outputFftData.magnitudes;
    
    if (!hasOutputData) return;
    
    const outputFreqs = outputFftData.frequencies;
    const outputMags = outputFftData.magnitudes;
    
    // Calculate max magnitude for normalization (iterate to avoid stack overflow)
    let maxMag = 0;
    for (let i = 0; i < outputMags.length; i++) {
      if (outputMags[i] > maxMag) maxMag = outputMags[i];
    }
    if (hasInputData) {
      const inputMags = inputFftData.magnitudes;
      for (let i = 0; i < inputMags.length; i++) {
        if (inputMags[i] > maxMag) maxMag = inputMags[i];
      }
    }
    
    if (maxMag === 0) {
      console.warn('FourierTransform: All magnitudes are zero!');
      return;
    }

    // Draw frequency response
    if (hasInputData) {
      // Dual spectrum - show both input (green) and output (purple) for comparison
      const inputFreqs = inputFftData.frequencies;
      const inputMags = inputFftData.magnitudes;
      const normInput = inputMags.map(m => m / maxMag);
      const normOutput = outputMags.map(m => m / maxMag);
      
      // Draw input spectrum (original - before equalizer)
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();

      let inputPointsDrawn = 0;
      for (let i = 0; i < normInput.length; i++) {
        let x;
        if (scaleType === "audiogram") {
          const freq = inputFreqs[i];
          if (freq < 125 || freq > 8000) continue;
          // Proper log scale: log10(freq/125) / log10(8000/125)
          const logScale = Math.log10(freq / 125) / Math.log10(8000 / 125);
          x = padding.left + logScale * chartWidth;
        } else {
          x = padding.left + (i / normInput.length) * chartWidth;
        }
        
        const value = Math.min(1, Math.max(0, normInput[i]));
        const y = padding.top + chartHeight - (value * chartHeight * 0.8);
        
        if (inputPointsDrawn === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        inputPointsDrawn++;
      }
      ctx.stroke();

      // Draw output spectrum (processed - after equalizer)
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();

      let outputPointsDrawn = 0;
      for (let i = 0; i < normOutput.length; i++) {
        let x;
        if (scaleType === "audiogram") {
          const freq = outputFreqs[i];
          if (freq < 125 || freq > 8000) continue;
          // Proper log scale: log10(freq/125) / log10(8000/125)
          const logScale = Math.log10(freq / 125) / Math.log10(8000 / 125);
          x = padding.left + logScale * chartWidth;
        } else {
          x = padding.left + (i / normOutput.length) * chartWidth;
        }
        
        const value = Math.min(1, Math.max(0, normOutput[i]));
        const y = padding.top + chartHeight - (value * chartHeight * 0.8);
        
        if (outputPointsDrawn === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        outputPointsDrawn++;
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      // Add legend
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(padding.left, 5, 15, 8);
      ctx.fillStyle = '#e4e4e7';
      ctx.font = '11px sans-serif';
      ctx.fillText('Original', padding.left + 20, 12);
      
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(padding.left + 90, 5, 15, 8);
      ctx.fillStyle = '#e4e4e7';
      ctx.fillText('Equalized', padding.left + 110, 12);
    } else {
      // Single spectrum showing PROCESSED audio only
      const normOutput = outputMags.map(m => m / maxMag);
      
      const gradient = ctx.createLinearGradient(padding.left, 0, width - padding.right, 0);
      gradient.addColorStop(0, '#3b82f6');
      gradient.addColorStop(0.5, '#8b5cf6');
      gradient.addColorStop(1, '#a855f7');
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2.5;
      ctx.beginPath();

      let pointsDrawn = 0;
      for (let i = 0; i < normOutput.length; i++) {
        let x;
        if (scaleType === "audiogram") {
          const freq = outputFreqs[i];
          if (freq < 125 || freq > 8000) continue;
          // Proper log scale: log10(freq/125) / log10(8000/125)
          const logScale = Math.log10(freq / 125) / Math.log10(8000 / 125);
          x = padding.left + logScale * chartWidth;
        } else {
          x = padding.left + (i / normOutput.length) * chartWidth;
        }
        
        const value = Math.min(1, Math.max(0, normOutput[i]));
        const y = padding.top + chartHeight - (value * chartHeight * 0.8);
        
        if (pointsDrawn === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        pointsDrawn++;
      }
      
      if (pointsDrawn > 0) {
        ctx.stroke();
      }
    }

    // Draw X-axis labels (frequency)
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    
    if (scaleType === "audiogram") {
      const frequencies = [125, 250, 500, 1000, 2000, 4000, 8000];
      frequencies.forEach((freq) => {
        const logScale = Math.log10(freq / 125) / Math.log10(8000 / 125);
        const x = padding.left + logScale * chartWidth;
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
  }, [scaleType, inputFftData, outputFftData]);

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
