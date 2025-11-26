import React, { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { getInitialBands } from '../config/equalizerConfig';
import { applyMockEqualization, formatFrequency } from '../utils/signalUtils';

export default function EqualizerPanel({ mode, onEqualize, inputSignal }) {
  const [bands, setBands] = useState(() => getInitialBands(mode));
  const [showModal, setShowModal] = useState(false);
  const [newBand, setNewBand] = useState({ label: 'Custom Band', minFreq: 1000, maxFreq: 2000, gain: 1 });

  useEffect(() => {
    setBands(getInitialBands(mode));
  }, [mode]);

  const handleGainChange = (bandId, gain) => {
    const updatedBands = bands.map(band => 
      band.id === bandId ? { ...band, gain } : band
    );
    setBands(updatedBands);
    
    // Apply equalization using utility function
    if (inputSignal && onEqualize) {
      const equalizedSignal = applyMockEqualization(inputSignal, updatedBands);
      onEqualize(equalizedSignal);
    }
  };

  const addBand = () => {
    const band = {
      id: `band-${Date.now()}`,
      label: newBand.label || `Band ${bands.length + 1}`,
      gain: newBand.gain,
      minFreq: newBand.minFreq,
      maxFreq: newBand.maxFreq,
    };
    setBands([...bands, band]);
    setShowModal(false);
    setNewBand({ label: 'Custom Band', minFreq: 1000, maxFreq: 2000, gain: 1 });
  };

  const removeBand = (bandId) => {
    if (mode !== 'generic') return; // Only allow removing in generic mode
    setBands(bands.filter(band => band.id !== bandId));
  };

  return (
    <div className="equalizer-panel">
      <div className="panel-header">
        <h3>Equalizer Controls - {mode.charAt(0).toUpperCase() + mode.slice(1)} Mode</h3>
        {mode === 'generic' && (
          <button className="btn-add" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Add Band
          </button>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Custom Frequency Band</h3>
              <button className="btn-close-modal" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <label>
                Band Label:
                <input
                  type="text"
                  value={newBand.label}
                  onChange={(e) => setNewBand({ ...newBand, label: e.target.value })}
                  placeholder="Enter band name"
                />
              </label>
              <label>
                Min Frequency (Hz):
                <input
                  type="number"
                  value={newBand.minFreq}
                  onChange={(e) => setNewBand({ ...newBand, minFreq: parseInt(e.target.value) })}
                />
              </label>
              <label>
                Max Frequency (Hz):
                <input
                  type="number"
                  value={newBand.maxFreq}
                  onChange={(e) => setNewBand({ ...newBand, maxFreq: parseInt(e.target.value) })}
                />
              </label>
              <label>
                Initial Gain: {newBand.gain.toFixed(1)}x
                <input
                  type="range"
                  value={newBand.gain}
                  onChange={(e) => setNewBand({ ...newBand, gain: parseFloat(e.target.value) })}
                  min={0}
                  max={2}
                  step={0.1}
                  className="gain-slider"
                />
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn-confirm" onClick={addBand}>Add Band</button>
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="sliders-container">
        {bands.map((band) => (
          <div key={band.id} className="slider-item">
            {mode === 'generic' && bands.length > 1 && (
              <button 
                className="btn-remove-band" 
                onClick={() => removeBand(band.id)}
                title="Remove band"
              >
                <X size={14} />
              </button>
            )}
            <div className="slider-value">{band.gain.toFixed(1)}x</div>
            <input
              type="range"
              orient="vertical"
              value={band.gain}
              onChange={(e) => handleGainChange(band.id, parseFloat(e.target.value))}
              min={0}
              max={2}
              step={0.1}
              className="slider-vertical"
            />
            <div className="slider-label">{band.label}</div>
            <div className="slider-freq">{formatFrequency(band.minFreq)}-{formatFrequency(band.maxFreq)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
