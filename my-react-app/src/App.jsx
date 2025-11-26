import React, { useState, useCallback, useEffect } from 'react';
import './App.css';
import { Sidebar } from './components/Sidebar.jsx';
import { TopBar } from './components/TopBar.jsx';
import { AudioPlayback } from './components/AudioPlayback.jsx';
import { FourierTransform } from './components/FourierTransform.jsx';
import { Spectrogram } from './components/Spectrogram.jsx';
import { EqualizerControls } from './components/EqualizerControls.jsx';
import { AudioSeparation } from './components/AudioSeparation.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { uploadAndProcessFFT, updateEqualizerGains } from './services/backendService';
import { loadAudioFile } from './services/audioService';

const STORAGE_KEY = 'equalizer-custom-bands';

function App() {
  // State management
  const [currentMode, setCurrentMode] = useState('generic');
  const [currentSubMode, setCurrentSubMode] = useState(undefined);
  const [showSpectrograms, setShowSpectrograms] = useState(false);
  const [uploadedAudioFile, setUploadedAudioFile] = useState(null);
  const [inputAudioBuffer, setInputAudioBuffer] = useState(null);
  const [outputAudioBuffer, setOutputAudioBuffer] = useState(null);
  const [fftData, setFftData] = useState(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  
  const getInitialBands = () => [
    { startFreq: 0, endFreq: 5000, gain: 1 },
    { startFreq: 5000, endFreq: 10000, gain: 1 },
    { startFreq: 10000, endFreq: 15000, gain: 1 },
    { startFreq: 15000, endFreq: 24000, gain: 1 }  // Extended to cover Nyquist frequency (22.05kHz)
  ];

  const [customBands, setCustomBands] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) {
          return parsed;
        }
      }
      // Initial default bands - divide 20kHz into 4 equal parts
      const initialBands = getInitialBands();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initialBands));
      return initialBands;
    } catch (e) {
      console.error('Error loading bands from localStorage:', e);
      const initialBands = getInitialBands();
      return initialBands;
    }
  });
  
  // Add processing flag to prevent concurrent equalizer updates
  const [isProcessingEqualizer, setIsProcessingEqualizer] = useState(false);

  // Synchronized playback state for both audio playbacks
  const [playbackState, setPlaybackState] = useState({
    isPlaying: false,
    isPaused: false,
    time: 0,
    speed: 1,
    zoom: 1,
    pan: 0,
  });

  // Save custom bands to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customBands));
    } catch (e) {
      console.error('Error saving bands to localStorage:', e);
    }
  }, [customBands]);

  // Event handlers
  const handleModeChange = useCallback((mode, subMode) => {
    setCurrentMode(mode);
    setCurrentSubMode(subMode);
    console.log('Mode changed to:', mode, subMode);
  }, []);

  const handleToggleSpectrograms = useCallback(() => {
    setShowSpectrograms(prev => !prev);
  }, []);

  const handleAddBand = useCallback((band) => {
    setCustomBands(prevBands => [...prevBands, band]);
    console.log('Band added:', band);
  }, []);

  const handleRemoveBand = useCallback((index) => {
    setCustomBands(prevBands => prevBands.filter((_, i) => i !== index));
  }, []);

  const handleBandGainChange = useCallback((index, newGain) => {
    setCustomBands(prevBands => {
      const updatedBands = [...prevBands];
      if (updatedBands[index]) {
        updatedBands[index] = { ...updatedBands[index], gain: newGain };
      }
      return updatedBands;
    });
  }, []);

  const handleEqualizerChange = useCallback(async (bands) => {
    if (!uploadedAudioFile) {
      console.warn('No audio file uploaded');
      return;
    }
    
    // Prevent concurrent updates
    if (isProcessingEqualizer) {
      console.log('Already processing equalizer update, skipping...');
      return;
    }

    setIsProcessingEqualizer(true);
    try {
      console.log('Updating equalizer gains:', bands);
      
      // Send updated gains to backend
      const result = await updateEqualizerGains(uploadedAudioFile, bands);
      console.log('Equalizer update complete:', result);
      console.log('Backend returned:', {
        hasOutputUrl: !!result.outputAudioUrl,
        modifiedWav: result.modifiedWav,
        appliedAdjustments: result.appliedAdjustments?.length || 0
      });
      
      // Update FFT data
      setFftData(result);
      
      // Load the new output audio ONLY if backend returned a WAV file
      if (result.outputAudioUrl) {
        console.log('Loading output audio from:', result.outputAudioUrl);
        const outputBuffer = await loadAudioFile(result.outputAudioUrl);
        setOutputAudioBuffer(outputBuffer);
        console.log('Updated output audio loaded successfully');
      } else {
        console.log('No output audio URL returned from backend');
        console.log('This means no gains were applied (all gains = 1.0?)');
        // Reset output to input when no modifications
        setOutputAudioBuffer(inputAudioBuffer);
      }
    } catch (error) {
      console.error('Error updating equalizer:', error);
      alert(`Failed to update equalizer: ${error.message}`);
    } finally {
      setIsProcessingEqualizer(false);
    }
  }, [uploadedAudioFile, isProcessingEqualizer, inputAudioBuffer]);

  const handleResetBands = useCallback(() => {
    const initialBands = getInitialBands();
    setCustomBands(initialBands);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initialBands));
    } catch (e) {
      console.error('Error resetting bands in localStorage:', e);
    }
  }, []);

  const handleLoadSettings = useCallback((settings) => {
    if (settings.mode) setCurrentMode(settings.mode);
    if (typeof settings.showSpectrograms === 'boolean') setShowSpectrograms(settings.showSpectrograms);
    if (settings.customBands) {
      setCustomBands(settings.customBands);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.customBands));
      } catch (e) {
        console.error('Error saving loaded bands:', e);
      }
    }
  }, []);

  const handleAudioUpload = useCallback(async (file, audioBuffer) => {
    console.log('Audio uploaded:', file.name);
    console.log('AudioBuffer received:', audioBuffer ? `${audioBuffer.duration.toFixed(2)}s` : 'null');
    
    // Validate audioBuffer
    if (!audioBuffer) {
      console.error('No audio buffer provided');
      alert('Failed to load audio file. Please try again.');
      return;
    }
    
    setIsLoadingAudio(true);
    
    try {
      // Reset gains to default when uploading new file
      const initialBands = getInitialBands();
      setCustomBands(initialBands);
      // Also save to localStorage to ensure persistence
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initialBands));
      } catch (e) {
        console.error('Error saving reset bands:', e);
      }
      console.log('Reset gains to default (1.0x):', initialBands);
      
      // Set uploaded file
      setUploadedAudioFile(file);
      
      // For equalizer modes, process with backend to get FFT (no gains applied initially)
      if (currentMode === 'generic' || currentMode === 'music' || currentMode === 'animal' || currentMode === 'human') {
        console.log('Processing audio with backend (no gains)...');
        
        // Upload to backend WITHOUT any gain adjustments (empty bands array)
        const result = await uploadAndProcessFFT(file, []);
        console.log('Backend FFT processing complete:', result);
        
        // Store FFT data
        setFftData(result);
        
        // Set both input and output to original audio (no processing yet)
        // Since no gains were applied, output = input
        console.log('Setting audio buffers...');
        setInputAudioBuffer(audioBuffer);
        setOutputAudioBuffer(audioBuffer);
        
        console.log('Audio buffers set successfully');
        
        // Small delay to ensure state updates complete before rendering
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        // For separation modes, just show input initially
        setInputAudioBuffer(audioBuffer);
        setOutputAudioBuffer(audioBuffer);
        
        // Small delay to ensure state updates complete before rendering
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error('Error processing audio:', error);
      alert(`Failed to process audio: ${error.message}`);
      // Fallback to showing input as output
      setInputAudioBuffer(audioBuffer);
      setOutputAudioBuffer(audioBuffer);
    } finally {
      console.log('Hiding loading state...');
      setIsLoadingAudio(false);
      console.log('Upload process complete');
    }
  }, [currentMode]);

  return (
    <div className="app">
      {/* Fixed Left Sidebar */}
      <Sidebar 
        currentMode={currentMode}
        currentSubMode={currentSubMode}
        onModeChange={handleModeChange}
      />

      {/* Fixed Top Bar */}
      <TopBar 
        currentMode={currentMode}
        showSpectrograms={showSpectrograms}
        onToggleSpectrograms={handleToggleSpectrograms}
        onAddBand={currentMode === 'generic' ? handleAddBand : undefined}
        existingBands={customBands}
        onLoadSettings={handleLoadSettings}
        onAudioUpload={handleAudioUpload}
        isAIMode={currentSubMode === 'ai'}
      />

      {/* Main Content Area */}
      <div className="main-content">
        <ErrorBoundary>
          {isLoadingAudio ? (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '100%',
              gap: '1rem',
              fontSize: '1.5rem',
              color: '#fbbf24'
            }}>
              <div>⏳ Processing audio with backend...</div>
              <div style={{ fontSize: '1rem', color: '#94a3b8' }}>
                Computing FFT, generating spectrograms, and processing audio...
              </div>
            </div>
          ) : currentSubMode === 'ai' ? (
            <AudioSeparation 
              uploadedFile={uploadedAudioFile} 
              currentMode={currentMode}
              showSpectrograms={showSpectrograms}
            />
          ) : (
            <>
            <div className="content-grid">
              {/* Left Column - 50% - Audio Playbacks */}
              <div className="left-column">
                <AudioPlayback 
                  label="Input Signal"
                  variant="input"
                  playbackState={playbackState}
                  onPlaybackStateChange={setPlaybackState}
                  audioBuffer={inputAudioBuffer}
                  isProcessing={false}
                />
                <AudioPlayback 
                  label="Output Signal (Processed)"
                  variant="output"
                  playbackState={playbackState}
                  onPlaybackStateChange={setPlaybackState}
                  audioBuffer={outputAudioBuffer}
                  isProcessing={false}
                />
              </div>

              {/* Right Column - 50% - Fourier Transforms */}
              <div className="right-column">
                <FourierTransform 
                  label="Fourier Transform - Linear Scale"
                  scaleType="linear"
                  audioBuffer={inputAudioBuffer}
                  outputAudioBuffer={outputAudioBuffer}
                />
                <FourierTransform 
                  label="Fourier Transform - Audiogram"
                  scaleType="audiogram"
                  audioBuffer={inputAudioBuffer}
                  outputAudioBuffer={outputAudioBuffer}
                />
              </div>
            </div>

            {/* Full Width - Equalizer Controls */}
            <div className="equalizer-section">
              <EqualizerControls 
                mode={currentMode}
                subMode={currentSubMode}
                customBands={customBands}
                onRemoveBand={handleRemoveBand}
                onResetBands={handleResetBands}
                onBandGainChange={handleBandGainChange}
                audioFile={uploadedAudioFile}
                onEqualizerChange={handleEqualizerChange}
              />
            </div>

            {/* Full Width - Spectrograms (Always rendered, toggle visibility) */}
            <div className="spectrograms-section" style={{ display: showSpectrograms ? 'grid' : 'none' }}>
              <Spectrogram label="Input Spectrogram" audioBuffer={inputAudioBuffer} spectrogramData={fftData} isOutput={false} />
              <Spectrogram label="Output Spectrogram" audioBuffer={outputAudioBuffer} spectrogramData={fftData} isOutput={true} />
            </div>
          </>
        )}
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default App;
