import React, { useState, useRef, useEffect } from 'react';
import { Scissors } from 'lucide-react';
import { separateInstruments, separateVoices } from '../services/backendService';
import { loadAudioFile } from '../services/audioService';
import { SeparatedTrackControl } from './SeparatedTrackControl';
import { FourierTransform } from './FourierTransform';
import { Spectrogram } from './Spectrogram';
import { AudioPlayback } from './AudioPlayback';

export const AudioSeparation = ({ uploadedFile, currentMode, showSpectrograms, inputAudioBuffer: parentInputAudioBuffer }) => {
  const [stage, setStage] = useState('initial'); // 'initial', 'separating', 'separated'
  const [inputAudioBuffer, setInputAudioBuffer] = useState(null);
  const [outputAudioBuffer, setOutputAudioBuffer] = useState(null);
  const [separatedTracks, setSeparatedTracks] = useState([]);
  const [progress, setProgress] = useState(0);
  const [audioSource, setAudioSource] = useState('mock'); // 'mock' or 'uploaded'
  const [fftData, setFftData] = useState(null); // FFT data from backend
  const [inputFftData, setInputFftData] = useState(null); // Input FFT data
  const [outputFftData, setOutputFftData] = useState(null); // Output FFT data
  const [isLoadingFFT, setIsLoadingFFT] = useState(false); // FFT loading state
  const [isLoadingSeparation, setIsLoadingSeparation] = useState(false); // Separation loading state
  const [isProcessingGain, setIsProcessingGain] = useState(false); // Gain processing indicator
  
  // Synchronized playback state for input and output
  const [playbackState, setPlaybackState] = useState({
    isPlaying: false,
    isPaused: false,
    time: 0,
    speed: 1,
    zoom: 1,
    pan: 0,
  });
  
  const audioContextRef = useRef(null);
  const gainNodesRef = useRef({});
  
  // Determine separation type based on current mode
  const separationType = currentMode === 'music' ? 'music' : 'speech';

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Fetch FFT data from backend for the uploaded file
  useEffect(() => {
    if (uploadedFile && stage === 'initial') {
      const fetchFFT = async () => {
        try {
          setIsLoadingFFT(true);
          console.log('AudioSeparation: Fetching FFT from backend for', uploadedFile.name);
          const { uploadAndProcessFFT } = await import('../services/backendService');
          const result = await uploadAndProcessFFT(uploadedFile, []);
          setFftData(result);
          setInputFftData(result);
          console.log('AudioSeparation: FFT data received');
        } catch (error) {
          console.error('AudioSeparation: Error fetching FFT:', error);
        } finally {
          setIsLoadingFFT(false);
        }
      };
      fetchFFT();
    }
  }, [uploadedFile, stage]);

  // Fetch FFT for output buffer when separated
  useEffect(() => {
    if (outputAudioBuffer && stage === 'separated') {
      const fetchOutputFFT = async () => {
        try {
          setIsLoadingFFT(true);
          // Convert output buffer to WAV and get FFT
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const offlineContext = new OfflineAudioContext(
            outputAudioBuffer.numberOfChannels,
            outputAudioBuffer.length,
            outputAudioBuffer.sampleRate
          );
          
          const source = offlineContext.createBufferSource();
          source.buffer = outputAudioBuffer;
          source.connect(offlineContext.destination);
          source.start();
          
          await offlineContext.startRendering();
          
          // Create a temporary file from output buffer
          const wavBlob = await audioBufferToWav(outputAudioBuffer);
          const wavFile = new File([wavBlob], 'output.wav', { type: 'audio/wav' });
          
          const { uploadAndProcessFFT } = await import('../services/backendService');
          const result = await uploadAndProcessFFT(wavFile, []);
          setOutputFftData(result);
          console.log('AudioSeparation: Output FFT data received');
        } catch (error) {
          console.error('AudioSeparation: Error fetching output FFT:', error);
        } finally {
          setIsLoadingFFT(false);
        }
      };
      fetchOutputFFT();
    }
  }, [outputAudioBuffer, stage]);

  // Helper to convert AudioBuffer to WAV
  const audioBufferToWav = (buffer) => {
    const length = buffer.length * buffer.numberOfChannels * 2;
    const arrayBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(arrayBuffer);
    const channels = [];
    let offset = 0;
    
    // WAV header
    const writeString = (view, offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };
    
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, buffer.numberOfChannels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * buffer.numberOfChannels * 2, true);
    view.setUint16(32, buffer.numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, length, true);
    offset = 44;
    
    // Interleave channels
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

  // Handle uploaded file - use parent's audio buffer if available
  useEffect(() => {
    if (parentInputAudioBuffer) {
      console.log('AudioSeparation: Using parent audio buffer');
      setInputAudioBuffer(parentInputAudioBuffer);
      setAudioSource('uploaded');
      setStage('initial'); // Reset to initial stage if already separated
    } else if (uploadedFile && audioContextRef.current) {
      console.log('AudioSeparation: Loading file', uploadedFile.name);
      const loadFile = async () => {
        try {
          const arrayBuffer = await uploadedFile.arrayBuffer();
          const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
          setInputAudioBuffer(audioBuffer);
          setAudioSource('uploaded');
          setStage('initial'); // Reset to initial stage if already separated
          console.log('AudioSeparation: Audio file loaded successfully:', uploadedFile.name);
        } catch (error) {
          console.error('AudioSeparation: Error loading audio file:', error);
          alert('Failed to load audio file.');
        }
      };
      loadFile();
    } else {
      console.log('AudioSeparation: No uploaded file or audio context not ready');
    }
  }, [uploadedFile, parentInputAudioBuffer]);

  // Auto-update output whenever separated tracks change
  useEffect(() => {
    if (stage === 'separated' && separatedTracks.length > 0 && audioContextRef.current) {
      console.log('AudioSeparation: Recalculating output buffer from', separatedTracks.length, 'tracks');
      
      // Simple mixing: combine all non-muted tracks
      const activeTracks = separatedTracks.filter(t => !t.muted);
      if (activeTracks.length === 0 || !activeTracks[0].audioBuffer) {
        console.warn('AudioSeparation: No active tracks or missing audio buffer');
        return;
      }
      
      const ctx = audioContextRef.current;
      const sampleRate = activeTracks[0].audioBuffer.sampleRate;
      const length = activeTracks[0].audioBuffer.length;
      const channels = activeTracks[0].audioBuffer.numberOfChannels;
      
      console.log('AudioSeparation: Mixing', activeTracks.length, 'active tracks');
      
      // Create new buffer for mixed output
      const mixedBuffer = ctx.createBuffer(channels, length, sampleRate);
      
      for (let ch = 0; ch < channels; ch++) {
        const outputData = mixedBuffer.getChannelData(ch);
        activeTracks.forEach(track => {
          if (track.audioBuffer && !track.muted) {
            const channelData = track.audioBuffer.getChannelData(ch);
            const gain = track.gain || 1.0;
            for (let i = 0; i < length; i++) {
              outputData[i] += channelData[i] * gain;
            }
          }
        });
      }
      
      setOutputAudioBuffer(mixedBuffer);
      console.log('AudioSeparation: Output buffer updated');
    }
  }, [separatedTracks, stage]);

  // Handle separation using backend API
  const handleSeparate = async () => {
    if (!uploadedFile) {
      alert('Please upload an audio file first.');
      return;
    }

    setStage('separating');
    setProgress(0);
    setIsLoadingSeparation(true);

    try {
      let result;
      const sessionId = `${Date.now()}`;
      
      // Progress callback
      const onProgress = (progressData) => {
        console.log('Progress:', progressData);
        setProgress(progressData.progress * 100);
      };
      
      if (separationType === 'music') {
        // Instrument separation
        setProgress(10);
        const gains = {
          drums: 1.0,
          bass: 1.0,
          vocals: 1.0,
          guitar: 1.0,
          piano: 1.0,
          other: 1.0
        };
        
        result = await separateInstruments(uploadedFile, gains, sessionId, onProgress);
        
        // Load audio buffers for each separated track - only if file exists
        const allTracks = [
          { id: 'drums', name: 'Drums', file: result.files?.drums },
          { id: 'bass', name: 'Bass', file: result.files?.bass },
          { id: 'vocals', name: 'Vocals', file: result.files?.vocals },
          { id: 'guitar', name: 'Guitar', file: result.files?.guitar },
          { id: 'piano', name: 'Piano', file: result.files?.piano },
          { id: 'other', name: 'Other', file: result.files?.other }
        ];
        
        const tracks = [];
        for (const track of allTracks) {
          if (track.file) {
            try {
              const audioBuffer = await loadAudioFile(`http://localhost:5001/api/download/${track.file}`);
              tracks.push({ ...track, audioBuffer, originalBuffer: audioBuffer, gain: 1.0, muted: false, solo: false });
            } catch (error) {
              console.warn(`Failed to load ${track.name}:`, error);
            }
          } else {
            console.log(`Skipping ${track.name} - no file from backend (silent track)`);
          }
        }
        
        console.log(`Loaded ${tracks.length} tracks with signal`);
        setSeparatedTracks(tracks);
      } else {
        // Voice separation
        setProgress(10);
        const gains = { 0: 1.0, 1: 1.0, 2: 1.0, 3: 1.0 };
        
        result = await separateVoices(uploadedFile, gains, sessionId, onProgress);
        
        // Load audio buffers for each voice (skip empty files)
        const tracks = await Promise.all(
          (result.files || []).filter(file => file).map(async (file, index) => {
            try {
              const audioBuffer = await loadAudioFile(`http://localhost:5001/api/download/${file}`);
              return {
                id: `voice_${index}`,
                name: `Voice ${index + 1}`,
                audioBuffer,
                originalBuffer: audioBuffer,
                gain: 1.0,
                muted: false,
                solo: false
              };
            } catch (error) {
              console.warn(`Failed to load voice ${index}:`, error);
              return null;
            }
          })
        );
        
        setSeparatedTracks(tracks.filter(t => t !== null));
      }
      
      setProgress(100);
      console.log('Separation complete, tracks loaded');
      setIsLoadingSeparation(false);
      setStage('separated');
    } catch (error) {
      console.error('Separation error:', error);
      alert(`Failed to separate audio: ${error.message}`);
      setStage('initial');
      setProgress(0);
      setIsLoadingSeparation(false);
    }
  };

  // Handle track control changes
  const handleGainChange = (trackId, newGain) => {
    setIsProcessingGain(true);
    
    setSeparatedTracks(prev => 
      prev.map(track => {
        if (track.id === trackId) {
          // Apply gain to the track's audio buffer (like equalizer does)
          const originalBuffer = track.originalBuffer || track.audioBuffer;
          const ctx = audioContextRef.current;
          
          if (ctx && originalBuffer) {
            // Create new buffer with gain applied
            const newBuffer = ctx.createBuffer(
              originalBuffer.numberOfChannels,
              originalBuffer.length,
              originalBuffer.sampleRate
            );
            
            for (let ch = 0; ch < originalBuffer.numberOfChannels; ch++) {
              const inputData = originalBuffer.getChannelData(ch);
              const outputData = newBuffer.getChannelData(ch);
              for (let i = 0; i < inputData.length; i++) {
                outputData[i] = inputData[i] * newGain;
              }
            }
            
            return { ...track, gain: newGain, audioBuffer: newBuffer, originalBuffer };
          }
          return { ...track, gain: newGain };
        }
        return track;
      })
    );

    // Update gain in real-time if playing
    if (gainNodesRef.current[trackId]?.gainNode) {
      gainNodesRef.current[trackId].gainNode.gain.value = newGain;
    }
    
    // Clear processing indicator after a short delay
    setTimeout(() => setIsProcessingGain(false), 500);
    // Output will auto-update via useEffect
  };

  const handleMuteToggle = (trackId) => {
    setSeparatedTracks(prev => 
      prev.map(track => 
        track.id === trackId ? { ...track, muted: !track.muted } : track
      )
    );
    // Output will auto-update via useEffect
  };

  const handleSoloToggle = (trackId) => {
    setSeparatedTracks(prev => 
      prev.map(track => 
        track.id === trackId ? { ...track, solo: !track.solo } : track
      )
    );
    // Output will auto-update via useEffect
  };

  // Render initial stage (before separation)
  if (stage === 'initial') {
    return (
      <div className="audio-separation-container">
        <div className="loaded-section">
          <div className="separation-header">
            <h2>AI Audio Separation - {separationType === 'music' ? 'Music Mode' : 'Speech Mode'}</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              {uploadedFile 
                ? `Loaded: ${uploadedFile.name}` 
                : 'Please upload an audio file using "Upload Audio" button in the top bar.'}
            </p>
          </div>
          
          <div className="initial-playback-compact" style={{ marginBottom: '1.5rem' }}>
            <AudioPlayback 
              label="Input Audio"
              variant="input"
              playbackState={playbackState}
              onPlaybackStateChange={setPlaybackState}
              audioBuffer={inputAudioBuffer}
            />
          </div>

          {isLoadingFFT ? (
            <div className="loading-indicator" style={{ padding: '20px', textAlign: 'center' }}>
              <p>Loading FFT analysis...</p>
            </div>
          ) : (
            <div className="fourier-grid">
              <FourierTransform 
                label="Fourier Transform - Linear Scale"
                scaleType="linear"
                backendFFTData={fftData}
              />
              <FourierTransform 
                label="Fourier Transform - Audiogram Scale"
                scaleType="audiogram"
                backendFFTData={fftData}
              />
            </div>
          )}

          {uploadedFile && !isLoadingFFT && (
            <div className="separation-controls">
              <button 
                onClick={handleSeparate} 
                className="separate-btn"
                disabled={isLoadingSeparation}
              >
                <Scissors size={20} />
                {isLoadingSeparation ? 'Separating...' : `Separate Audio into ${separationType === 'music' ? 'Instruments' : 'Voices'}`}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render separating stage (loading)
  if (stage === 'separating') {
    return (
      <div className="audio-separation-container">
        <div className="loading-section">
          <div className="spinner"></div>
          <h2>Separating Audio...</h2>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <p>{progress}% complete</p>
        </div>
      </div>
    );
  }

  // Render separated stage (after separation)
  return (
    <div className="audio-separation-container separated">
      <div className="separation-header">
        <h2>Separated Tracks - {separationType === 'music' ? 'Music Mode' : 'Speech Mode'}</h2>
        {isProcessingGain && (
          <div style={{ 
            display: 'inline-block', 
            marginLeft: '15px', 
            padding: '5px 10px', 
            background: '#3b82f6', 
            borderRadius: '4px',
            fontSize: '12px',
            color: 'white'
          }}>
            ⚡ Processing gain changes...
          </div>
        )}
      </div>

      {/* Individual Tracks Section - 2 columns grid */}
      <div className="tracks-section">
        <h3>Individual Tracks - Adjust gain for each track</h3>
        <div className="tracks-grid-2col">
          {separatedTracks.map(track => (
            <SeparatedTrackControl
              key={track.id}
              track={track}
              onGainChange={handleGainChange}
              onMuteToggle={handleMuteToggle}
              onSoloToggle={handleSoloToggle}
            />
          ))}
        </div>
      </div>

      {/* Input/Output Comparison - Full Width Playbacks */}
      <div className="io-comparison-section">
        <h3>Input vs Output Comparison (Synchronized Playback)</h3>
        <div className="io-playbacks-full-row">
          <div className="io-playback-half">
            <AudioPlayback 
              label="Input Signal"
              variant="input"
              playbackState={playbackState}
              onPlaybackStateChange={setPlaybackState}
              audioBuffer={inputAudioBuffer}
            />
          </div>
          <div className="io-playback-half">
            <AudioPlayback 
              label="Output Signal"
              variant="output"
              playbackState={playbackState}
              onPlaybackStateChange={setPlaybackState}
              audioBuffer={outputAudioBuffer}
              inputAudioBuffer={inputAudioBuffer}
            />
          </div>
        </div>
      </div>

      {/* FFT Comparison Section */}
      <div className="fft-comparison-section">
        <h3>Fourier Transform Comparison</h3>
        {isLoadingFFT ? (
          <div className="loading-indicator" style={{ padding: '20px', textAlign: 'center' }}>
            <p>Loading FT analysis...</p>
          </div>
        ) : (
          <>
            <div className="fft-row">
              <div className="fft-item">
                <FourierTransform 
                  label="Input FFT - Linear"
                  scaleType="linear"
                  backendFFTData={inputFftData}
                />
              </div>
              <div className="fft-item">
                <FourierTransform 
                  label="Output FFT - Linear"
                  scaleType="linear"
                  backendFFTData={outputFftData}
                />
              </div>
            </div>
            <div className="fft-row">
              <div className="fft-item">
                <FourierTransform 
                  label="Input FFT - Audiogram"
                  scaleType="audiogram"
                  backendFFTData={inputFftData}
                />
              </div>
              <div className="fft-item">
                <FourierTransform 
                  label="Output FFT - Audiogram"
                  scaleType="audiogram"
                  backendFFTData={outputFftData}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Spectrograms - Matching Normal EQ Design */}
      {showSpectrograms && (
        <div className="spectrograms-section">
          <Spectrogram label="Input Spectrogram" audioBuffer={inputAudioBuffer} />
          <Spectrogram label="Output Spectrogram" audioBuffer={outputAudioBuffer} />
        </div>
      )}
    </div>
  );
};
