import React, { useState, useEffect } from "react";

const getSliderLabels = (mode, subMode) => {
  if (mode === "music") {
    return [
      { label: "Drums", range: "50-172Hz" },
      { label: "Bass", range: "41-392Hz" },
      { label: "Flute", range: "120-561Hz" },
      { label: "Cello", range: "120-202Hz" },
      { label: "Violing", range: "200-1000Hz" },
    ];
  } else if (mode === "animal") {
    return [
      { label: "Dog", range: "300-5000Hz" },
      { label: "Tiger", range: "0-300Hz" },
      { label: "Bird", range: "2.9-9kHz" },
      { label: "Elephant", range: "150-1000Hz" }
    ];
  } else if (mode === "human") {
    return [
      { label: "Male ", range: "0-586Hz" },
      { label: "Female ", range: "195-500Hz" },
      { label: "Child Female", range: "345-700Hz" },
      { label: "Chile Male", range: "0-125Hz" },
      { label: "Speech Clarity", range: "2-4KHz" },
      { label: "Sibilance", range: "4-8KHz" }
    ];
  }
  return [];
};

export const EqualizerControls = ({ 
  mode, 
  subMode = "normal", 
  customBands = [], 
  onRemoveBand, 
  onResetBands, 
  onBandGainChange,
  audioFile,
  onEqualizerChange
}) => {
  const defaultLabels = getSliderLabels(mode, subMode);
  const labels = mode === "generic" ? customBands : defaultLabels;
  const [values, setValues] = useState(() => {
    if (mode === "generic") {
      return customBands.map(b => b?.gain || 1);
    }
    return defaultLabels.map(() => 1);
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const debounceTimerRef = React.useRef(null);
  const latestValuesRef = React.useRef(values);
  
  // Keep ref in sync with state
  React.useEffect(() => {
    latestValuesRef.current = values;
  }, [values]);

  useEffect(() => {
    if (mode === "generic") {
      const newValues = customBands.map(b => typeof b.gain === 'number' ? b.gain : 1);
      setValues(newValues);
      console.log('EqualizerControls: Updated values from customBands:', newValues);
    } else {
      setValues(labels.map(() => 1));
    }
  }, [mode, customBands]);

  const handleReset = () => {
    setValues(labels.map(() => 1));
    if (onResetBands) {
      onResetBands();
    }
  };

  const handleSliderChange = (index, newValue) => {
    const clampedValue = Math.max(0, Math.min(2, newValue));
    const newValues = [...values];
    newValues[index] = clampedValue;
    setValues(newValues);
    
    // Update the band's gain in parent component for generic mode
    if (mode === "generic" && onBandGainChange) {
      onBandGainChange(index, clampedValue);
    }
    
    // Debounce: Clear existing timer and start new one
    // This ensures that ANY slider change resets the 1-second countdown
    // Only after 2 second of NO changes will the API be called
    if (audioFile && onEqualizerChange) {
      // Cancel any pending API call
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        console.log(`EqualizerControls: Timer reset - slider ${index} changed to ${clampedValue.toFixed(3)}x`);
      } else {
        console.log(`EqualizerControls: Timer started - slider ${index} changed to ${clampedValue.toFixed(3)}x`);
      }
      
      // Show processing indicator to let user know changes are pending
      setIsProcessing(true);
      
      // Start new 2-second countdown
      debounceTimerRef.current = setTimeout(async () => {
        console.log('EqualizerControls: 1 second elapsed with no changes - calling API now');
        try {
          // Use the latest values from ref to avoid stale closure
          const currentValues = latestValuesRef.current;
          
          // Build bands array with proper frequency ranges and current gains
          const bands = labels.map((label, idx) => {
            const currentGain = currentValues[idx];
            
            if (mode === "generic") {
              return {
                low: customBands[idx]?.low !== undefined ? customBands[idx].low : (customBands[idx]?.startFreq || 0),
                high: customBands[idx]?.high !== undefined ? customBands[idx].high : (customBands[idx]?.endFreq || 20000),
                gain: currentGain
              };
            }
            
            // Map proper frequency ranges for preset modes
            let low = 0, high = 20000;
            
            if (mode === "music") {
              const ranges = [
                [50, 172],    // Drums
                [41, 392],    // Bass
                [300, 561],   // Flute
                [120, 202],  // cello
                [200, 1000],  // Violin
              ];
              if (idx < ranges.length) {
                [low, high] = ranges[idx];
              }
            } else if (mode === "animal") {
              const ranges = [
                [300, 5000],   // Dog
                [2900, 9000],  // Bird
                [0, 300],     //Tiger
                [150, 1000],     // Elephant
              ];
              if (idx < ranges.length) {
                [low, high] = ranges[idx];
              }
            } else if (mode === "human") {
              const ranges = [
                [0, 586],    // Male 1
                [195, 500],   // Female 1
                [345, 700],   // Child Female
                [0, 125],    // Child Male
                [2000, 4000],   // Speech Clarity
                [4000, 8000]     // Sibilance
              ];
              if (idx < ranges.length) {
                [low, high] = ranges[idx];
              }
            }
            
            return {
              low,
              high,
              gain: currentGain
            };
          });
          
          console.log('EqualizerControls: Sending bands with actual gains:', bands);
          console.log('Current slider values:', currentValues);
          console.log('Bands detail:', bands.map((b, i) => `Band ${i+1}: ${b.low}-${b.high}Hz @ ${b.gain.toFixed(3)}x`).join(', '));
          await onEqualizerChange(bands);
        } catch (error) {
          console.error('Equalizer processing error:', error);
          alert(`Equalizer error: ${error.message}`);
        } finally {
          setIsProcessing(false);
        }
      }, 2000);
    }
  };

  const averageGain = values.length > 0 
    ? (values.reduce((sum, val) => sum + val, 0) / values.length).toFixed(2)
    : '1.00';
  
  // Cleanup debounce timer on unmount
  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="equalizer-controls">
      <div className="equalizer-header">
        <h3>
          Equalizer Controls {subMode === "ai" && "(AI Mode)"}
          <span style={{ marginLeft: '1rem', color: '#94a3b8', fontSize: '0.75rem' }}>
            Avg Gain: {averageGain}x
          </span>
          {isProcessing && (
            <span style={{ marginLeft: '1rem', color: '#fbbf24', fontSize: '0.75rem' }}>
              ⏳ Processing...
            </span>
          )}
          {!audioFile && (
            <span style={{ marginLeft: '1rem', color: '#94a3b8', fontSize: '0.75rem' }}>
              (Upload audio file to enable)
            </span>
          )}
        </h3>
        <button className="btn btn-sm" onClick={handleReset}>
          🔄 Reset
        </button>
      </div>

      <div className="equalizer-sliders">
        {labels.map((label, index) => {
          const isGeneric = mode === "generic";
          const bandLabel = isGeneric 
            ? `${customBands[index]?.low !== undefined ? customBands[index].low : (customBands[index]?.startFreq || 0)}-${customBands[index]?.high !== undefined ? customBands[index].high : (customBands[index]?.endFreq || 0)}Hz`
            : label.label;
          const frequencyRange = isGeneric ? "" : label.range;
          const sliderValue = values[index] || 0;
          
          // Debug logging for generic mode
          if (isGeneric && index === 0) {
            console.log('EqualizerControls: Band labels:', labels.length, 'bands');
            console.log('EqualizerControls: Slider values:', values);
            console.log('EqualizerControls: CustomBands:', customBands);
          }
          
          return (
            <div key={`${bandLabel}-${index}`} className="slider-container">
              {isGeneric && onRemoveBand && (
                <button
                  className="remove-band-btn"
                  onClick={() => onRemoveBand(index)}
                >
                  ✕
                </button>
              )}
              <span className="slider-value">{sliderValue.toFixed(2)}x</span>
              <div className="slider-wrapper">
                <input
                  type="range"
                  orient="vertical"
                  min="0"
                  max="2"
                  step="0.01"
                  value={sliderValue}
                  onChange={(e) => handleSliderChange(index, Number(e.target.value))}
                  className="vertical-slider"
                />
              </div>
              <span className="slider-label">{bandLabel}</span>
              {frequencyRange && <span className="slider-freq-range">{frequencyRange}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
