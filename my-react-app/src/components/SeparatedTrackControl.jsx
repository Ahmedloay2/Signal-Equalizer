import React, { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { AudioPlayback } from './AudioPlayback';

export const SeparatedTrackControl = ({ 
  track,
  onGainChange,
  onMuteToggle,
  onSoloToggle
}) => {
  const [gainValue, setGainValue] = useState(track.gain);
  const [playbackState, setPlaybackState] = useState({
    isPlaying: false,
    isPaused: false,
    time: 0,
    speed: 1,
    zoom: 1
  });

  const handleGainChange = (e) => {
    const newGain = parseFloat(e.target.value);
    setGainValue(newGain);
    onGainChange(track.id, newGain);
  };

  return (
    <div className="separated-track-compact">
      <div className="track-header">
        <h3 className="track-name">{track.name}</h3>
        {/*<div className="track-controls">
          <button
            className={`track-btn ${track.solo ? 'active' : ''}`}
            onClick={() => onSoloToggle(track.id)}
            title="Solo"
          >
            S
          </button>
          <button
            className={`track-btn ${track.muted ? 'active' : ''}`}
            onClick={() => onMuteToggle(track.id)}
            title="Mute"
          >
            {track.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>*/}
      </div>
      
      <div className="track-playback-compact">
        <AudioPlayback 
          label=""
          variant={track.muted ? "muted" : "input"}
          playbackState={playbackState}
          onPlaybackStateChange={setPlaybackState}
          audioBuffer={track.audioBuffer}
        />
      </div>
      
      <div className="gain-control">
        <label>Gain: {gainValue.toFixed(2)}x</label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.01"
          value={gainValue}
          onChange={handleGainChange}
          className="gain-slider"
        />
      </div>
    </div>
  );
};
