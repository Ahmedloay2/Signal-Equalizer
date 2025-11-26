import React, { useState, useRef, useEffect } from 'react';
import { Scissors } from 'lucide-react';
import { separateInstruments, separateVoices } from '../services/backendService';
import { loadAudioFile } from '../services/audioService';
import { SeparatedTrackControl } from './SeparatedTrackControl';
import { FourierTransform } from './FourierTransform';
import { Spectrogram } from './Spectrogram';
import { AudioPlayback } from './AudioPlayback';

export const AudioSeparation = ({ uploadedFile, currentMode, showSpectrograms }) => {
  const [stage, setStage] = useState('initial'); // 'initial', 'separating', 'separated'
  const [inputAudioBuffer, setInputAudioBuffer] = useState(null);
  const [outputAudioBuffer, setOutputAudioBuffer] = useState(null);
  const [separatedTracks, setSeparatedTracks] = useState([]);
  const [progress, setProgress] = useState(0);
  const [audioSource, setAudioSource] = useState('mock'); // 'mock' or 'uploaded'
  
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

  // Handle uploaded file
  useEffect(() => {
    if (uploadedFile && audioContextRef.current) {
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
  }, [uploadedFile]);

  // Auto-update output whenever separated tracks change
  useEffect(() => {
    if (stage === 'separated' && separatedTracks.length > 0 && audioContextRef.current) {
      // Simple mixing: combine all non-muted tracks
      const activeTracks = separatedTracks.filter(t => !t.muted);
      if (activeTracks.length === 0 || !activeTracks[0].audioBuffer) return;
      
      const ctx = audioContextRef.current;
      const sampleRate = activeTracks[0].audioBuffer.sampleRate;
      const length = activeTracks[0].audioBuffer.length;
      const channels = activeTracks[0].audioBuffer.numberOfChannels;
      
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
        
        // Load audio buffers for each separated track
        const tracks = await Promise.all([
          { id: 'drums', name: 'Drums', file: result.files?.drums },
          { id: 'bass', name: 'Bass', file: result.files?.bass },
          { id: 'vocals', name: 'Vocals', file: result.files?.vocals },
          { id: 'guitar', name: 'Guitar', file: result.files?.guitar },
          { id: 'piano', name: 'Piano', file: result.files?.piano },
          { id: 'other', name: 'Other', file: result.files?.other }
        ].map(async (track) => {
          if (track.file) {
            const audioBuffer = await loadAudioFile(`http://localhost:5001/api/download/${track.file}`);
            return { ...track, audioBuffer, gain: 1.0, muted: false, solo: false };
          }
          return { ...track, audioBuffer: inputAudioBuffer, gain: 1.0, muted: false, solo: false };
        }));
        
        setSeparatedTracks(tracks);
      } else {
        // Voice separation
        setProgress(10);
        const gains = { 0: 1.0, 1: 1.0, 2: 1.0, 3: 1.0 };
        
        result = await separateVoices(uploadedFile, gains, sessionId, onProgress);
        
        // Load audio buffers for each voice
        const tracks = await Promise.all(
          (result.files || []).map(async (file, index) => {
            const audioBuffer = await loadAudioFile(`http://localhost:5001/api/download/${file}`);
            return {
              id: `voice_${index}`,
              name: `Voice ${index + 1}`,
              audioBuffer,
              gain: 1.0,
              muted: false,
              solo: false
            };
          })
        );
        
        setSeparatedTracks(tracks);
      }
      
      setProgress(100);
      setStage('separated');
      console.log('Separation complete!');
    } catch (error) {
      console.error('Separation error:', error);
      alert(`Failed to separate audio: ${error.message}`);
      setStage('initial');
      setProgress(0);
    }
  };

  // Handle track control changes
  const handleGainChange = (trackId, newGain) => {
    setSeparatedTracks(prev => 
      prev.map(track => 
        track.id === trackId ? { ...track, gain: newGain } : track
      )
    );

    // Update gain in real-time if playing
    if (gainNodesRef.current[trackId]?.gainNode) {
      gainNodesRef.current[trackId].gainNode.gain.value = newGain;
    }
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
            />
          </div>

          <div className="fourier-grid">
            <FourierTransform 
              label="Fourier Transform - Linear Scale"
              scaleType="linear"
              audioBuffer={inputAudioBuffer}
            />
            <FourierTransform 
              label="Fourier Transform - Audiogram Scale"
              scaleType="audiogram"
              audioBuffer={inputAudioBuffer}
            />
          </div>

          {uploadedFile && (
            <div className="separation-controls">
              <button 
                onClick={handleSeparate} 
                className="separate-btn"
              >
                <Scissors size={20} />
                Separate Audio into {separationType === 'music' ? 'Instruments' : 'Voices'}
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
              playbackState={playbackState}
              onPlaybackStateChange={setPlaybackState}
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
            />
          </div>
          <div className="io-playback-half">
            <AudioPlayback 
              label="Output Signal"
              variant="output"
              playbackState={playbackState}
              onPlaybackStateChange={setPlaybackState}
            />
          </div>
        </div>
      </div>

      {/* FFT Comparison Section */}
      <div className="fft-comparison-section">
        <h3>Fourier Transform Comparison</h3>
        <div className="fft-row">
          <div className="fft-item">
            <FourierTransform 
              label="FFT - Linear"
              scaleType="linear"
              audioBuffer={inputAudioBuffer}
              compareBuffer={outputAudioBuffer}
              comparison={true}
            />
          </div>
          <div className="fft-item">
            <FourierTransform 
              label="FFT - Audiogram"
              scaleType="audiogram"
              audioBuffer={inputAudioBuffer}
              compareBuffer={outputAudioBuffer}
              comparison={true}
            />
          </div>
        </div>
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
