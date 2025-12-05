# Audio Processing & Separation Platform

A full-stack audio processing application featuring AI-powered audio separation, custom DSP equalizer, and real-time audio manipulation capabilities. Built with React (frontend) and Flask (backend) with PyTorch AI models.

## 🎵 Features

### 1. **Instrument Separation**
- Separate audio into 6 stems using **Demucs AI** (htdemucs_6s model)
- Individual control over: drums, bass, vocals, guitar, piano, and other instruments
- Real-time gain adjustment (0-6x) for each instrument
- GPU acceleration support for faster processing
- Full-length and trimmed stem versions

### 2. **Voice Separation**
- Separate multiple human voices from mixed audio
- Uses **Multi-Decoder-DPRNN** model from Asteroid
- Auto-detect number of speakers (typically 2-4 voices)
- Individual gain control per voice
- Re-mixing without re-separation

### 3. **Custom DSP Equalizer**
- FFT-based frequency equalizer with multiple modes:
  - **Generic Mode**: 10-band standard equalizer (31Hz - 16kHz)
  - **Musical Instruments Mode**: Control specific instruments in a mix
  - **Animal Sounds Mode**: Control specific animal vocalizations
  - **Human Voices Mode**: Control different voice types
- STFT (Short-Time Fourier Transform) for high-quality processing
- Custom FFT implementation from scratch (no library dependencies)
- Frequency band visualization and gain adjustments
- Save/load equalizer presets

### 4. **Audio Analysis**
- Real-time spectrogram generation (client-side)
- FFT analysis with magnitude and phase information
- Frequency response visualization
- Input/output comparison spectrograms
- Audiogram scale support for hearing analysis

### 5. **Synthetic Signal Generation**
- Pure tone generation for testing
- Multi-tone signals with customizable frequencies
- Frequency sweeps (linear/logarithmic chirps)
- Mode-specific test signals for equalizer validation

## 🏗️ Project Structure

```
test-front/
├── my-react-app/               # React frontend (Vite + React 18)
│   ├── src/
│   │   ├── components/
│   │   │   ├── AddBandDialog.jsx        # Add custom frequency band dialog
│   │   │   ├── AudioPlayback.jsx        # Waveform visualization & playback
│   │   │   ├── AudioSeparation.jsx      # AI separation interface (music/voices)
│   │   │   ├── EqualizerControls.jsx    # Frequency band gain sliders
│   │   │   ├── EqualizerPanel.jsx       # Main equalizer panel container
│   │   │   ├── ErrorBoundary.jsx        # Error handling wrapper
│   │   │   ├── FourierTransform.jsx     # FFT visualization (linear/log scale)
│   │   │   ├── SeparatedTrackControl.jsx # Individual track controls (AI mode)
│   │   │   ├── Sidebar.jsx              # Mode navigation sidebar
│   │   │   ├── Spectrogram.jsx          # Spectrogram visualization
│   │   │   └── TopBar.jsx               # Top toolbar with upload/settings
│   │   ├── services/
│   │   │   ├── audioService.js          # Client-side audio loading/processing
│   │   │   └── backendService.js        # Backend API communication layer
│   │   ├── Data/                        # Sample audio files
│   │   ├── App.jsx                      # Main app component & state management
│   │   ├── App.css                      # Component styles
│   │   ├── main.jsx                     # React entry point
│   │   └── index.css                    # Global styles
│   ├── public/                          # Static assets
│   ├── index.html                       # HTML template
│   ├── package.json                     # Node dependencies
│   ├── vite.config.js                   # Vite configuration
│   └── eslint.config.js                 # ESLint rules
│
├── asteroid/                   # Asteroid library for voice separation
│   ├── asteroid/
│   │   ├── models/                      # Pre-trained model architectures
│   │   ├── losses/                      # Loss functions
│   │   ├── masknn/                      # Masking networks
│   │   ├── dsp/                         # DSP utilities
│   │   └── engine/                      # Training engine
│   └── egs/wsj0-mix-var/Multi-Decoder-DPRNN/  # Voice separation model
│
├── cache/                      # Cached Demucs model files
├── output/                     # Separated audio output directory
│   ├── run_YYYYMMDD_HHMMSS/            # Timestamped processing sessions
│   │   ├── demucs_output/              # Full-length stems
│   │   ├── trimmed_stems/              # Silence-trimmed stems
│   │   └── response_*.json             # Processing metadata
│   └── voices_*/                        # Voice separation sessions
│
├── custom_dsp.py              # Custom FFT/STFT implementation from scratch
├── equalizer_dsp.py           # Signal equalizer with 4 modes
├── instruments_separation.py  # Demucs htdemucs_6s wrapper (6-stem)
├── voice_separation.py        # Multi-Decoder-DPRNN wrapper
├── task3_backend_server.py    # Flask REST API server (main backend)
├── patch_demucs.py            # Demucs PyTorch 2.x compatibility fix
└── test_backend.py            # Backend endpoint test suite

```

## 🚀 Getting Started

### Prerequisites

**Python Requirements:**
- Python 3.8+
- PyTorch 2.0+ (with CUDA support for GPU acceleration)
- Flask & Flask-CORS
- numpy, soundfile, torchaudio
- demucs, asteroid, pytorch-lightning

**Node.js Requirements:**
- Node.js 16+
- npm or yarn

### Installation

#### 1. Clone the Repository
```bash
git clone <repository-url>
cd test-front
```

#### 2. Install Python Dependencies
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
pip install flask flask-cors numpy soundfile demucs
pip install asteroid pytorch-lightning

# Optional: Install ffmpeg for audio format support
# Windows: Download from https://ffmpeg.org/download.html
# Linux: sudo apt-get install ffmpeg
# macOS: brew install ffmpeg
```

#### 3. Patch Demucs (PyTorch 2.x Compatibility)
```bash
python patch_demucs.py
```

#### 4. Clone Asteroid Repository (for Voice Separation)
```bash
git clone https://github.com/asteroid-team/asteroid.git
```

#### 5. Install Frontend Dependencies
```bash
cd my-react-app
npm install
```

### Running the Application

#### Start Backend Server (Terminal 1)
```bash
python task3_backend_server.py
```
Backend runs on: `http://localhost:5001`

#### Start Frontend Development Server (Terminal 2)
```bash
cd my-react-app
npm run dev
```
Frontend runs on: `http://localhost:5173`

### Testing Backend APIs
```bash
python test_backend.py
```

## 🎨 Frontend Architecture

### Technology Stack
- **React 18** - Modern UI library with hooks
- **Vite** - Lightning-fast build tool and dev server
- **Web Audio API** - Real-time audio processing and playback
- **Canvas API** - High-performance waveform and FFT visualization
- **Lucide React** - Beautiful icon library

### Key Features
- **Real-time Waveform Visualization** - Synchronized input/output comparison
- **Dual FFT Display** - Linear and logarithmic frequency scales
- **Client-side Spectrograms** - Fast STFT computation in browser
- **Responsive Layout** - Fixed sidebar + top bar + scrollable content
- **State Management** - React hooks (useState, useEffect, useRef)
- **Audio Synchronization** - Coordinated playback across components
- **Error Boundaries** - Graceful error handling
- **Persistent Settings** - LocalStorage for custom bands and preferences

### Component Hierarchy

```
App.jsx
├── Sidebar.jsx (Mode navigation)
├── TopBar.jsx (Upload, settings, spectrograms toggle)
└── Main Content
    ├── Normal Equalizer Mode
    │   ├── AudioPlayback.jsx × 2 (Input/Output)
    │   ├── FourierTransform.jsx × 2 (Linear/Log scale)
    │   ├── Spectrogram.jsx × 2 (If enabled)
    │   └── EqualizerControls.jsx (Frequency bands)
    └── AI Separation Mode
        ├── AudioPlayback.jsx × 2
        ├── FourierTransform.jsx × 2
        ├── Spectrogram.jsx × 2
        └── SeparatedTrackControl.jsx × N (Per track)
```

### Service Layer
- **audioService.js** - AudioBuffer loading, WAV conversion, playback
- **backendService.js** - REST API client with error handling

## 📡 API Endpoints

### Health & Status
- `GET /health` - Health check and service info
- `GET /status/<session_id>` - Get processing status

### Instrument Separation
- `POST /api/separate` - Separate audio into instrument stems (Demucs)
  - **Form data**: 
    - `audio` (file) - Audio file to separate
    - `drums`, `bass`, `vocals`, `guitar`, `piano`, `other` (float) - Gain values (0-6)
    - `session_id` (optional) - Session identifier
  - **Returns**: Separated stem URLs, mixed output, metadata

### Voice Separation
- `POST /api/separate-voices` - Separate multiple human voices (Multi-Decoder-DPRNN)
  - **Form data**: 
    - `audio` (file) - Audio file to separate
    - `source_0`, `source_1`, `source_N` (float) - Gain per voice (0-2)
    - `session_id` (optional) - Session identifier
  - **Returns**: Voice source URLs, mixed output, number of speakers detected
- `POST /api/voices/adjust-gains` - Re-mix voices with new gains without re-separation
  - **JSON body**: `{ session_dir, gains: { 0: 1.5, 1: 0.8, ... } }`
- `GET /api/voices/info` - Get model information and capabilities
- `GET /api/voices/list/<session_dir>` - List all voice sources in a session

### File Management
- `GET /api/download/<path>` - Download processed files (stems, mixed audio)
- `POST /api/cleanup` - Manually trigger cleanup of old files
- `GET /api/sessions/list` - List all available sessions with metadata
- `DELETE /api/sessions/delete/<session_dir>` - Delete session and all files

### FFT & Equalizer
- `POST /upload_wav_and_fft` - Upload audio and compute FFT with optional equalization
  - **Form data**: 
    - `file` (file) - Audio file
    - `bands` (JSON string) - Frequency bands: `[{low, high, gain}, ...]`
  - **Returns**: 
    - Original FFT (before equalizer)
    - Processed FFT (after equalizer)
    - Input/output spectrograms (pre-computed)
    - Modified audio URL (if gains applied)
    - Applied adjustments summary

## 🎛️ Usage Examples

### Frontend Usage

#### 1. Load and Play Audio
```javascript
import { loadAudioFile } from './services/audioService';

// Load audio from file
const audioBuffer = await loadAudioFile(file);

// Load from URL
const audioBuffer = await loadAudioFile('http://example.com/audio.wav');

// Play using Web Audio API
const audioContext = new AudioContext();
const source = audioContext.createBufferSource();
source.buffer = audioBuffer;
source.connect(audioContext.destination);
source.start(0);
```

#### 2. Apply Equalizer
```javascript
import { updateEqualizerGains } from './services/backendService';

// Define frequency bands with gains
const bands = [
  { low: 0, high: 250, gain: 1.5 },      // Bass boost
  { low: 250, high: 1000, gain: 1.0 },   // Low-mid flat
  { low: 1000, high: 4000, gain: 0.8 },  // Mid cut
  { low: 4000, high: 20000, gain: 1.2 }  // Treble boost
];

// Process audio
const result = await updateEqualizerGains(audioFile, bands);

// Load processed audio
const outputBuffer = await loadAudioFile(result.outputAudioUrl);
```

#### 3. Separate Instruments (AI)
```javascript
import { separateInstruments } from './services/backendService';

const gains = {
  drums: 1.5,   // Boost drums
  bass: 1.0,    // Keep bass
  vocals: 0.5,  // Reduce vocals
  guitar: 1.2,  // Boost guitar
  piano: 1.0,   // Keep piano
  other: 0.8    // Reduce other
};

const result = await separateInstruments(audioFile, gains, sessionId, 
  (progress) => {
    console.log(`Progress: ${progress.progress * 100}%`);
  }
);

// result.files contains URLs for each stem
```

#### 4. Separate Voices (AI)
```javascript
import { separateVoices } from './services/backendService';

const gains = {
  0: 1.5,  // Boost speaker 1
  1: 1.0,  // Keep speaker 2
  2: 0.5   // Reduce speaker 3
};

const result = await separateVoices(audioFile, gains, sessionId);

// result.files contains URLs for each voice
```

### Backend API Usage

#### 1. Instrument Separation via API
```bash
curl -X POST http://localhost:5001/api/separate \
  -F "audio=@song.mp3" \
  -F "drums=1.5" \
  -F "vocals=0.5" \
  -F "bass=1.0" \
  -F "guitar=1.2" \
  -F "piano=1.0" \
  -F "other=0.8"
```

#### 2. Voice Separation via API
```bash
curl -X POST http://localhost:5001/api/separate-voices \
  -F "audio=@conversation.wav" \
  -F "source_0=1.5" \
  -F "source_1=1.0"
```

#### 3. Frequency Equalization via API
```bash
curl -X POST http://localhost:5001/upload_wav_and_fft \
  -F "file=@audio.wav" \
  -F 'bands=[{"low":100,"high":500,"gain":1.5},{"low":1000,"high":4000,"gain":0.7}]'
```

#### 4. Download Processed File
```bash
curl -O http://localhost:5001/api/download/run_20231205_123456/drums.wav
```

### Python Direct Usage

#### Custom FFT Processing
```python
from custom_dsp import FFT, STFT, CustomSpectrogram
import numpy as np

# Initialize FFT
fft = FFT()

# Generate test signal
signal = np.sin(2 * np.pi * 440 * np.linspace(0, 1, 44100))  # 440 Hz tone

# Compute FFT
real, imag = fft.fft(signal)

# Get magnitude spectrum
magnitude = fft.get_magnitude_spectrum(real, imag)

# Apply STFT for time-frequency analysis
stft_matrix = STFT.stft(signal, n_fft=2048, hop_length=512)

# Compute spectrogram
spectrogram, freqs, times = CustomSpectrogram.compute_spectrogram(
    signal, 44100, n_fft=2048, scale='db'
)
```

#### Instrument Separation
```python
from instruments_separation import InstrumentSeparator

# Create separator
separator = InstrumentSeparator('audio.mp3', './output')

# Define gains
gains = {
    'drums': 1.5,
    'bass': 1.0,
    'vocals': 0.5,
    'guitar': 1.2,
    'piano': 1.0,
    'other': 0.8
}

# Process
result = separator.process(gains=gains, keep_full=True, keep_trimmed=True)

print(f"Separated {result['num_stems_separated']} stems")
print(f"Mixed audio: {result['mixed_audio_file']}")
```

#### Voice Separation
```python
from voice_separation import VoiceSeparator

# Create separator
separator = VoiceSeparator('conversation.wav', './output')

# Define gains
gains = {0: 1.5, 1: 1.0, 2: 0.8}

# Process with progress callback
def progress_callback(stage, progress, message):
    print(f"{stage}: {progress*100:.0f}% - {message}")

result = separator.process(gains=gains, progress_callback=progress_callback)

print(f"Separated {result['num_sources']} voices")
```

## 🔬 Technical Details

### Custom DSP Implementation (`custom_dsp.py`)

#### FFT Class
- **Algorithm**: Cooley-Tukey decimation-in-time with bit-reversal permutation
- **Twiddle Factors**: Pre-computed and cached for performance
- **In-Place**: Memory-efficient iterative approach
- **Normalization**: Proper 1/N scaling for inverse FFT
- **Features**:
  - Forward/Inverse FFT
  - Magnitude and power spectrum
  - Frequency bin calculation
  - Window functions (Hamming, Hann, Blackman)
  - Audiogram scale conversion

#### STFT Class
- **Window Functions**: Hann, Hamming, Blackman, or rectangular
- **Overlap-Add**: Proper reconstruction for ISTFT
- **Normalization**: Window sum compensation for perfect reconstruction
- **Frame-based**: Configurable FFT size and hop length

#### CustomSpectrogram Class
- **Spectrogram Types**: Magnitude, power, or dB scale
- **Mel-Filterbank**: Triangular filters on mel scale
- **Mel Spectrogram**: Perceptually-relevant frequency representation
- **Frequency/Time Axes**: Accurate labeling for visualization

### AI Models

#### Demucs (htdemucs_6s)
- **Purpose**: Music source separation
- **Architecture**: Hybrid Transformer + Demucs U-Net
- **Outputs**: 6 stems (drums, bass, vocals, guitar, piano, other)
- **Training**: Pre-trained on MUSDB18-HQ
- **Sample Rate**: 44.1kHz (auto-resampling)
- **Context**: 7.8 seconds processing window
- **Parameters**: ~83M
- **Device**: Auto-detect CUDA/CPU with fallback
- **Signal Detection**: RMS threshold to skip silent stems

#### Multi-Decoder-DPRNN
- **Purpose**: Voice/speech source separation
- **Architecture**: Dual-path RNN with multiple decoder heads
- **Model ID**: `JunzheJosephZhu/MultiDecoderDPRNN` (HuggingFace)
- **Supports**: 2-4+ simultaneous speakers
- **Training**: Pre-trained on WSJ0-mix variable sources
- **Sample Rate**: 8kHz (upsamples/downsamples automatically)
- **Chunk Size**: 4 seconds with overlap
- **Parameters**: ~2.6M (efficient)
- **Device**: CUDA preferred, CPU fallback

### Frontend Performance

#### Web Audio API
- **AudioContext**: Single shared context per app
- **AudioBuffer**: Direct PCM sample manipulation
- **Real-time Processing**: GainNode, AnalyserNode for live effects
- **Decoding**: Native browser decoder for all formats

#### Canvas Optimization
- **RequestAnimationFrame**: Smooth 60fps animations
- **Double Buffering**: Prevent tearing during playback
- **Downsampling**: 2000-sample waveform for visualization
- **Clipping**: Only redraw visible regions

#### State Management
- **React Hooks**: Functional components with useState/useEffect
- **Refs**: Direct DOM/Audio API access without re-renders
- **Debouncing**: 2-second delay for API calls during slider changes
- **LocalStorage**: Persistent custom band settings

### Backend Performance

#### Parallelization
- **ThreadPoolExecutor**: Parallel stem loading (6 workers)
- **ProcessPoolExecutor**: Future support for multi-process
- **Concurrent Futures**: Non-blocking I/O operations

#### Caching
- **Model Cache**: Downloaded models stored in `./cache`
- **Twiddle Factors**: Cached in FFT instance
- **Session Storage**: 1-hour retention with auto-cleanup

#### Memory Optimization
- **Signal Detection**: Skip processing silent tracks (RMS < 0.001)
- **Trimming**: Remove silence for smaller files (10% headroom)
- **Normalization**: Scale to 0.95 max to prevent clipping
- **Streaming**: Future chunked processing support

#### Error Handling
- **Graceful Fallback**: CUDA → CPU automatic retry
- **Tensor Aliasing Fix**: PyTorch 2.x compatibility patch
- **Session Tracking**: Unique timestamps for isolation
- **Progress Callbacks**: Real-time status updates

## 🎨 User Interface Features

- **Dark Theme**: Professional audio engineering aesthetic with color-coded signals (green=input, purple=output)
- **Real-time Visualization**: Synchronized waveforms, FFT plots (linear/log), and spectrograms
- **Equalizer Modes**: Generic, Music, Animal, and Human voice presets
- **AI Separation Controls**: Individual track gain, mute/solo, and live mixing
- **Playback**: Synchronized input/output playback with speed control
- **Settings**: Save/load custom equalizer configurations

## 📊 File Formats Supported

**Input Formats:**
- WAV (.wav) - Uncompressed PCM
- MP3 (.mp3) - MPEG Audio Layer 3
- FLAC (.flac) - Free Lossless Audio Codec
- OGG (.ogg) - Ogg Vorbis
- AAC (.aac) - Advanced Audio Coding
- M4A (.m4a) - MPEG-4 Audio
- WMA (.wma) - Windows Media Audio

**Output Format:**
- WAV (PCM_16, 44.1kHz, mono/stereo)

**Specifications:**
- **Max File Size**: 200MB
- **Max Duration**: Unlimited (memory permitting)
- **Sample Rates**: Auto-resampling to 44.1kHz
- **Channels**: Mono/stereo (converted to mono for processing)

## 📝 Development

### Run Backend Tests
```bash
python test_backend.py
```

### Build Frontend for Production
```bash
cd my-react-app
npm run build
```

### Lint Frontend Code
```bash
cd my-react-app
npm run lint
```

## 📄 License

This project uses the following open-source libraries:
- **Demucs**: MIT License
- **Asteroid**: MIT License
- **PyTorch**: BSD License
- **React**: MIT License
- **Flask**: BSD License

## 🙏 Acknowledgments

### Core Technologies
- **Demucs** by Facebook Research (Meta AI) - State-of-the-art music source separation
- **Asteroid** by Manuel Pariente et al. - Audio source separation on steroids
- **Multi-Decoder-DPRNN** by JunzheJosephZhu - Efficient voice separation model
- **PyTorch** by Meta - Deep learning framework
- **React** by Meta - UI library
- **Vite** by Evan You - Next-generation frontend tooling
- **Flask** by Armin Ronacher - Microframework for Python

### Research Papers
- **Demucs**: "Hybrid Spectrogram and Waveform Source Separation" (Défossez et al., 2021)
- **DPRNN**: "Dual-Path RNN: Efficient Long Sequence Modeling" (Luo et al., 2020)
