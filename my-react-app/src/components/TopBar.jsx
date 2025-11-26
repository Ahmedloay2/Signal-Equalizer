import React, { useState } from "react";
import { AddBandDialog } from "./AddBandDialog.jsx";
import { loadAudioFile } from "../services/audioService";

export const TopBar = ({ showSpectrograms, onToggleSpectrograms, currentMode, onAddBand, existingBands, onLoadSettings, onAudioUpload, isAIMode }) => {

  const handleUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.wav,.mp3';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        console.log("File uploaded:", file.name, "Type:", file.type, "Size:", file.size);
        if (onAudioUpload) {
          try {
            // Load audio file and extract audio buffer
            const audioBuffer = await loadAudioFile(file);
            console.log(`Audio loaded: ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.sampleRate}Hz, ${audioBuffer.numberOfChannels} channels`);
            
            // Pass both the file and the audio buffer to parent
            onAudioUpload(file, audioBuffer);
          } catch (error) {
            console.error("Error loading audio file:", error);
            alert(`Failed to load audio file: ${error.message}`);
          }
        }
      }
    };
    input.click();
  };

  const handleLoadSettings = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const settings = JSON.parse(event.target.result);
            console.log("Settings loaded:", settings);
            if (onLoadSettings) {
              onLoadSettings(settings);
            }
          } catch (error) {
            console.error("Invalid settings file:", error);
            alert('Invalid settings file format');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleSaveSettings = () => {
    // Get customBands from localStorage
    let customBands = [];
    try {
      const saved = localStorage.getItem('equalizer-custom-bands');
      if (saved) customBands = JSON.parse(saved);
    } catch (e) {
      console.error('Error reading custom bands:', e);
    }
    
    const settings = {
      mode: currentMode,
      showSpectrograms,
      customBands,
      timestamp: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `equalizer-settings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <button className="btn btn-sm" onClick={handleUpload}>
          📁 Upload File
        </button>
        {currentMode === "generic" && onAddBand && !isAIMode && (
          <AddBandDialog onAddBand={onAddBand} existingBands={existingBands || []} />
        )}
      </div>

      <div className="top-bar-right">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={showSpectrograms}
            onChange={(e) => onToggleSpectrograms(e.target.checked)}
          />
          <span>{showSpectrograms ? "👁️" : "👁️‍🗨️"} Spectrograms</span>
        </label>

        <button className="btn btn-sm" onClick={handleLoadSettings}>
          📂 Load Settings
        </button>

        <button className="btn btn-sm" onClick={handleSaveSettings}>
          💾 Save Settings
        </button>
      </div>
    </header>
  );
};
