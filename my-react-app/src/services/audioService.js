/**
 * Audio Service
 * Handles client-side audio loading and processing
 */

/**
 * Load audio file and decode to AudioBuffer
 * @param {File|string} source - File object or URL string
 * @returns {Promise<AudioBuffer>} Decoded audio buffer
 */
export const loadAudioFile = async (source) => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    let arrayBuffer;
    
    if (typeof source === 'string') {
      // It's a URL
      console.log('Loading audio from URL:', source);
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status}`);
      }
      arrayBuffer = await response.arrayBuffer();
    } else if (source instanceof File || source instanceof Blob) {
      // It's a File or Blob
      console.log('Loading audio from file:', source.name || 'blob');
      arrayBuffer = await source.arrayBuffer();
    } else {
      throw new Error('Invalid audio source type');
    }
    
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log(`Audio loaded: ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.sampleRate}Hz, ${audioBuffer.numberOfChannels} channels`);
    
    return audioBuffer;
  } catch (error) {
    console.error('Error loading audio file:', error);
    throw new Error(`Failed to load audio: ${error.message}`);
  }
};

/**
 * Convert AudioBuffer to WAV file format
 * @param {AudioBuffer} audioBuffer - Audio buffer to convert
 * @returns {Blob} WAV file as Blob
 */
export const audioBufferToWav = (audioBuffer) => {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const data = [];
  for (let i = 0; i < numChannels; i++) {
    data.push(audioBuffer.getChannelData(i));
  }
  
  const dataLength = audioBuffer.length * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  
  // Write WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);
  
  // Write audio data
  const volume = 0.8;
  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, data[channel][i])) * volume;
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return new Blob([buffer], { type: 'audio/wav' });
};

/**
 * Play audio buffer using Web Audio API
 * @param {AudioBuffer} audioBuffer - Audio buffer to play
 * @param {AudioContext} audioContext - Audio context
 * @returns {AudioBufferSourceNode} Source node for playback control
 */
export const playAudioBuffer = (audioBuffer, audioContext) => {
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start(0);
  return source;
};
