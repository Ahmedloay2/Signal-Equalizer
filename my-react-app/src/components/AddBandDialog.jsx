import React, { useState } from "react";

export const AddBandDialog = ({ onAddBand, existingBands }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [startFreq, setStartFreq] = useState(100);
  const [endFreq, setEndFreq] = useState(500);
  const [gain, setGain] = useState(1);
  const [error, setError] = useState("");

  const checkOverlap = (start, end) => {
    for (const band of existingBands) {
      const bandLow = band.low !== undefined ? band.low : band.startFreq;
      const bandHigh = band.high !== undefined ? band.high : band.endFreq;
      if ((start >= bandLow && start <= bandHigh) ||
          (end >= bandLow && end <= bandHigh) ||
          (start <= bandLow && end >= bandHigh)) {
        return true;
      }
    }
    return false;
  };

  const handleAdd = () => {
    setError("");
    
    if (startFreq >= endFreq) {
      setError("Start frequency must be less than end frequency");
      return;
    }
    
    if (checkOverlap(startFreq, endFreq)) {
      setError("This frequency range overlaps with an existing band");
      return;
    }
    
    onAddBand({ 
      low: startFreq, 
      high: endFreq, 
      gain 
    });
    
    setStartFreq(100);
    setEndFreq(500);
    setGain(1);
    setIsOpen(false);
  };

  return (
    <>
      <button className="btn btn-sm" onClick={() => setIsOpen(true)}>
        ➕ Add Band
      </button>

      {isOpen && (
        <div className="modal-overlay" onClick={() => setIsOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Add Frequency Band</h3>
            <div className="modal-body">
              {error && (
                <div style={{ background: '#dc2626', color: 'white', padding: '0.5rem', borderRadius: '0.25rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                  {error}
                </div>
              )}
              <div className="form-group">
                <label>Start Frequency: {startFreq}Hz</label>
                <input
                  type="range"
                  min="20"
                  max="19000"
                  step="10"
                  value={startFreq}
                  onChange={(e) => setStartFreq(Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label>End Frequency: {endFreq}Hz</label>
                <input
                  type="range"
                  min="30"
                  max="20000"
                  step="10"
                  value={endFreq}
                  onChange={(e) => setEndFreq(Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label>Initial Gain: {gain.toFixed(2)}x</label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.01"
                  value={gain}
                  onChange={(e) => setGain(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setIsOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleAdd}>
                Add Band
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
