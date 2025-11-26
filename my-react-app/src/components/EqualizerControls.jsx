import React, { useState, useEffect } from "react";

const getSliderLabels = (mode, subMode) => {
  if (mode === "music") {
    return [
      { label: "Drums", range: "60-200Hz" },
      { label: "Bass", range: "80-250Hz" },
      { label: "Guitar", range: "200-800Hz" },
      { label: "Piano", range: "250-4kHz" },
      { label: "Vocals", range: "300-3.5kHz" },
      { label: "Synth", range: "500-8kHz" }
    ];
  } else if (mode === "animal") {
    return [
      { label: "Dog", range: "500-1kHz" },
      { label: "Cat", range: "600-1.5kHz" },
      { label: "Bird", range: "1-8kHz" },
      { label: "Whale", range: "20-200Hz" },
      { label: "Elephant", range: "15-100Hz" },
      { label: "Wolf", range: "400-800Hz" }
    ];
  } else if (mode === "human") {
    return [
      { label: "Male 1", range: "85-180Hz" },
      { label: "Female 1", range: "165-255Hz" },
      { label: "Child", range: "250-400Hz" },
      { label: "Male 2", range: "85-180Hz" },
      { label: "Female 2", range: "165-255Hz" },
      { label: "Elder", range: "80-200Hz" }
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

  useEffect(() => {
    if (mode === "generic") {
      setValues(customBands.map(b => typeof b.gain === 'number' ? b.gain : 1));
    } else {
      setValues(labels.map(() => 1));
    }
  }, [mode, customBands.length]);

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
    
    // Debounce: wait 800ms after last slider change before processing
    if (audioFile && onEqualizerChange) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      
      // Show processing indicator immediately
      setIsProcessing(true);
      
      debounceTimerRef.current = setTimeout(async () => {
        try {
          // Build bands array from current values (use newValues which has all updated gains)
          const bands = labels.map((label, idx) => {
            if (mode === "generic") {
              return {
                low: customBands[idx]?.startFreq || customBands[idx]?.low || 0,
                high: customBands[idx]?.endFreq || customBands[idx]?.high || 20000,
                gain: newValues[idx] || 1.0  // Use individual band's gain from newValues
              };
            }
            return {
              low: 0,
              high: 20000,
              gain: newValues[idx] || 1.0  // Use individual band's gain from newValues
            };
          });
          
          console.log('EqualizerControls: Sending bands to backend:', bands);
          await onEqualizerChange(bands);
        } catch (error) {
          console.error('Equalizer processing error:', error);
          alert(`Equalizer error: ${error.message}`);
        } finally {
          setIsProcessing(false);
        }
      }, 800);
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
            ? `${customBands[index]?.low || customBands[index]?.startFreq || 0}-${customBands[index]?.high || customBands[index]?.endFreq || 0}Hz`
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
                <div className="slider-middle-line"></div>
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
