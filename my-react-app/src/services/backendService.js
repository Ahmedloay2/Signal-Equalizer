const API_BASE_URL = 'http://localhost:5001';

/**
 * Helper function to handle API errors
 */
const handleApiError = (error, context) => {
  console.error(`API Error (${context}):`, error);
  throw new Error(error.message || `Error in ${context}`);
};

// ============================================================================
// HEALTH & STATUS
// ============================================================================

/**
 * Check if the backend server is healthy and get system information
 * @returns {Promise<Object>} Health check response
 */
export const checkHealth = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    handleApiError(error, 'Health Check');
  }
};

/**
 * Get processing status for a session
 * @param {string} sessionId - Session ID to check
 * @returns {Promise<Object>} Status information
 */
export const getStatus = async (sessionId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/status/${sessionId}`);
    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    handleApiError(error, 'Status Check');
  }
};

// ============================================================================
// FFT & EQUALIZER
// ============================================================================

/**
 * Upload WAV file and apply FFT with optional frequency adjustments
 * This is the main equalizer function that processes audio through the backend
 * 
 * @param {File} audioFile - Audio file to process
 * @param {Array} bands - Band adjustments as [{low, high, gain}] array
 * @returns {Promise<Object>} FFT results, processed audio URL, and metadata
 */
export const uploadAndProcessFFT = async (audioFile, bands = []) => {
  try {
    const formData = new FormData();
    formData.append('file', audioFile);
    
    // Add bands as JSON string if provided
    if (bands && bands.length > 0) {
      formData.append('bands', JSON.stringify(bands));
    }
    
    const response = await fetch(`${API_BASE_URL}/upload_wav_and_fft`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `FFT processing failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Construct full download URL for modified wav
    if (result.modified_wav) {
      result.outputAudioUrl = `${API_BASE_URL}/api/download/${result.modified_wav}`;
    }
    
    return {
      success: true,
      // Original FFT (before processing)
      originalFftReal: result.original_fft_real,
      originalFftImag: result.original_fft_imag,
      // Processed FFT (after equalizer)
      fftReal: result.fft_real,
      fftImag: result.fft_imag,
      sampleRate: result.sample_rate,
      fftSize: result.fft_size,
      hasModifications: result.has_modifications,
      appliedAdjustments: result.applied_adjustments || [],
      outputAudioUrl: result.outputAudioUrl,
      modifiedWav: result.modified_wav,
      // Spectrogram data (generated together with FFT to avoid processing twice)
      inputSpectrogram: result.input_spectrogram,
      outputSpectrogram: result.output_spectrogram,
      spectrogramFrequencies: result.spectrogram_frequencies,
      spectrogramTimes: result.spectrogram_times,
      spectrogramNumFrames: result.spectrogram_num_frames,
      spectrogramNumFreqBins: result.spectrogram_num_freq_bins
    };
  } catch (error) {
    handleApiError(error, 'FFT Processing');
  }
};

/**
 * Update equalizer settings and reprocess audio
 * Used when user changes gain values in the equalizer panel
 * 
 * @param {File} audioFile - Original audio file
 * @param {Array} bands - Array of band objects with frequency ranges and gains
 * @returns {Promise<Object>} Processing result with new output audio URL
 */
export const updateEqualizerGains = async (audioFile, bands) => {
  try {
    // Convert bands to backend format: [{low, high, gain}]
    const backendBands = bands.map(band => {
      // Use explicit undefined/null checks to preserve 0 values
      const low = band.low !== undefined ? parseFloat(band.low) : 
                  (band.startFreq !== undefined ? parseFloat(band.startFreq) : 
                  (band.start_freq !== undefined ? parseFloat(band.start_freq) : 0));
      const high = band.high !== undefined ? parseFloat(band.high) : 
                   (band.endFreq !== undefined ? parseFloat(band.endFreq) : 
                   (band.end_freq !== undefined ? parseFloat(band.end_freq) : 20000));
      const gain = band.gain !== undefined ? parseFloat(band.gain) : 1.0;
      
      return { low, high, gain };
    });
    
    // Check which bands have modifications (for logging only)
    const modifiedBands = backendBands.filter(band => Math.abs(band.gain - 1.0) > 0.001);
    
    console.log('Updating equalizer with bands:', backendBands);
    console.log('Bands with actual modifications (gain != 1.0):', modifiedBands);
    console.log('Total bands:', backendBands.length, 'Modified:', modifiedBands.length);
    
    // Always send all bands to backend (it will handle the processing)
    return await uploadAndProcessFFT(audioFile, backendBands);
  } catch (error) {
    handleApiError(error, 'Equalizer Update');
  }
};

/**
 * Get equalizer preset configurations
 * Note: This is a client-side function as the backend doesn't provide presets
 * 
 * @param {string} presetName - Name of the preset
 * @returns {Array} Band configurations
 */
export const getEqualizerPreset = (presetName) => {
  const presets = {
    flat: [
      { low: 0, high: 5000, gain: 1.0 },
      { low: 5000, high: 10000, gain: 1.0 },
      { low: 10000, high: 15000, gain: 1.0 },
      { low: 15000, high: 20000, gain: 1.0 }
    ],
    bass_boost: [
      { low: 0, high: 250, gain: 1.5 },
      { low: 250, high: 1000, gain: 1.2 },
      { low: 1000, high: 5000, gain: 1.0 },
      { low: 5000, high: 20000, gain: 0.9 }
    ],
    treble_boost: [
      { low: 0, high: 1000, gain: 0.9 },
      { low: 1000, high: 5000, gain: 1.0 },
      { low: 5000, high: 10000, gain: 1.2 },
      { low: 10000, high: 20000, gain: 1.5 }
    ],
    vocal_enhance: [
      { low: 0, high: 300, gain: 0.8 },
      { low: 300, high: 3500, gain: 1.3 },
      { low: 3500, high: 8000, gain: 1.1 },
      { low: 8000, high: 20000, gain: 0.9 }
    ]
  };
  
  return presets[presetName] || presets.flat;
};

// ============================================================================
// INSTRUMENT SEPARATION
// ============================================================================

/**
 * Separate audio into instrumental stems (drums, bass, vocals, guitar, piano, other)
 * 
 * @param {File} audioFile - Audio file to separate
 * @param {Object} gains - Gain values for each instrument
 * @param {string} sessionId - Optional session ID
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Separation results
 */
export const separateInstruments = async (audioFile, gains = {}, sessionId = null, onProgress = null) => {
  try {
    const formData = new FormData();
    formData.append('audio', audioFile);
    
    // Add gain values
    const defaultGains = {
      drums: 1.0,
      bass: 1.0,
      vocals: 1.0,
      guitar: 1.0,
      piano: 1.0,
      other: 1.0
    };
    
    const finalGains = { ...defaultGains, ...gains };
    
    Object.entries(finalGains).forEach(([instrument, gain]) => {
      formData.append(instrument, gain.toString());
    });
    
    if (sessionId) {
      formData.append('session_id', sessionId);
    }
    
    const response = await fetch(`${API_BASE_URL}/api/separate`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Separation failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Poll for status if we have a session ID
    if (result.session_id && onProgress) {
      await pollStatus(result.session_id, onProgress);
    }
    
    return result;
  } catch (error) {
    handleApiError(error, 'Instrument Separation');
  }
};

// ============================================================================
// VOICE SEPARATION
// ============================================================================

/**
 * Separate audio into individual voice sources
 * 
 * @param {File} audioFile - Audio file to separate
 * @param {Object} gains - Gain values for each voice source
 * @param {string} sessionId - Optional session ID
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Separation results
 */
export const separateVoices = async (audioFile, gains = {}, sessionId = null, onProgress = null) => {
  try {
    const formData = new FormData();
    formData.append('audio', audioFile);
    
    // Add gain values for voice sources
    Object.entries(gains).forEach(([sourceKey, gain]) => {
      formData.append(sourceKey, gain.toString());
    });
    
    if (sessionId) {
      formData.append('session_id', sessionId);
    }
    
    const response = await fetch(`${API_BASE_URL}/api/separate-voices`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Voice separation failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Poll for status if we have a session ID
    if (result.session_id && onProgress) {
      await pollStatus(result.session_id, onProgress);
    }
    
    return result;
  } catch (error) {
    handleApiError(error, 'Voice Separation');
  }
};

/**
 * Adjust voice gains without re-separating
 * 
 * @param {string} sessionDir - Session directory name
 * @param {Object} gains - New gain values as {sourceIndex: gain}
 * @returns {Promise<Object>} Adjusted mix result
 */
export const adjustVoiceGains = async (sessionDir, gains) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/voices/adjust-gains`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session_dir: sessionDir,
        gains: gains
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Gain adjustment failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Add full download URL
    if (result.mixed_file) {
      result.downloadUrl = `${API_BASE_URL}/api/download/${result.mixed_file}`;
    }
    
    return result;
  } catch (error) {
    handleApiError(error, 'Voice Gain Adjustment');
  }
};

/**
 * Get voice separation model information
 * 
 * @returns {Promise<Object>} Model information
 */
export const getVoiceInfo = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/voices/info`);
    
    if (!response.ok) {
      throw new Error(`Failed to get voice info: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    handleApiError(error, 'Voice Info');
  }
};

/**
 * List voice sources in a session
 * 
 * @param {string} sessionDir - Session directory name
 * @returns {Promise<Object>} List of voice sources
 */
export const listVoiceSources = async (sessionDir) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/voices/list/${sessionDir}`);
    
    if (!response.ok) {
      throw new Error(`Failed to list voices: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    handleApiError(error, 'List Voice Sources');
  }
};

// ============================================================================
// FILE MANAGEMENT
// ============================================================================

/**
 * Get download URL for a file
 * 
 * @param {string} filename - Relative filename (e.g., "session_123/output.wav")
 * @returns {string} Full download URL
 */
export const getDownloadUrl = (filename) => {
  return `${API_BASE_URL}/api/download/${filename}`;
};

/**
 * Download a file
 * 
 * @param {string} filename - Relative filename
 * @returns {Promise<Blob>} File blob
 */
export const downloadFile = async (filename) => {
  try {
    const response = await fetch(getDownloadUrl(filename));
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }
    
    return await response.blob();
  } catch (error) {
    handleApiError(error, 'File Download');
  }
};

/**
 * Trigger manual cleanup of old files
 * 
 * @returns {Promise<Object>} Cleanup result
 */
export const manualCleanup = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/cleanup`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error(`Cleanup failed: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    handleApiError(error, 'Manual Cleanup');
  }
};

/**
 * List all available sessions
 * 
 * @returns {Promise<Object>} List of sessions
 */
export const listSessions = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sessions/list`);
    
    if (!response.ok) {
      throw new Error(`Failed to list sessions: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    handleApiError(error, 'List Sessions');
  }
};

/**
 * Delete a session and all its files
 * 
 * @param {string} sessionDir - Session directory name to delete
 * @returns {Promise<Object>} Deletion result
 */
export const deleteSession = async (sessionDir) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sessions/delete/${sessionDir}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`Failed to delete session: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    handleApiError(error, 'Delete Session');
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Poll processing status until completion
 * 
 * @param {string} sessionId - Session ID to poll
 * @param {Function} onProgress - Progress callback
 * @param {number} interval - Polling interval in ms
 * @returns {Promise<Object>} Final status
 */
export const pollStatus = async (sessionId, onProgress, interval = 1000) => {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getStatus(sessionId);
        
        if (onProgress) {
          onProgress(status);
        }
        
        if (status.stage === 'complete') {
          resolve(status);
        } else if (status.stage === 'error') {
          reject(new Error(status.message || 'Processing failed'));
        } else {
          setTimeout(poll, interval);
        }
      } catch (error) {
        reject(error);
      }
    };
    
    poll();
  });
};

/**
 * Check if backend is available
 * 
 * @returns {Promise<boolean>} True if backend is reachable
 */
export const isBackendAvailable = async () => {
  try {
    const health = await checkHealth();
    return health.status === 'ok';
  } catch (error) {
    return false;
  }
};

export default {
  // Health & Status
  checkHealth,
  getStatus,
  pollStatus,
  isBackendAvailable,
  
  // FFT & Equalizer
  uploadAndProcessFFT,
  updateEqualizerGains,
  getEqualizerPreset,
  
  // Instrument Separation
  separateInstruments,
  
  // Voice Separation
  separateVoices,
  adjustVoiceGains,
  getVoiceInfo,
  listVoiceSources,
  
  // File Management
  getDownloadUrl,
  downloadFile,
  manualCleanup,
  listSessions,
  deleteSession
};
