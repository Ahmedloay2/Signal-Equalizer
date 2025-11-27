from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import os
import sys
import json
import tempfile
import shutil
import time
from pathlib import Path
from werkzeug.utils import secure_filename
from datetime import datetime, timedelta
import threading
import io

import numpy as np
import soundfile as sf

# Import the instrument separator
from instruments_separation import InstrumentSeparator

# Import the voice separator
from voice_separation import VoiceSeparator

from custom_dsp import FFT

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Configuration
UPLOAD_FOLDER = tempfile.mkdtemp(prefix='dsp_task3_uploads_')
OUTPUT_FOLDER = Path('./output').resolve()  # Resolve to absolute path
CACHE_FOLDER = Path('./cache').resolve()  # Resolve to absolute path
ALLOWED_EXTENSIONS = {'mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a', 'wma'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200MB max
app.config['OUTPUT_FOLDER'] = OUTPUT_FOLDER
app.config['CACHE_FOLDER'] = CACHE_FOLDER

OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)
CACHE_FOLDER.mkdir(parents=True, exist_ok=True)

# Session storage for processing status
processing_status = {}
processing_lock = threading.Lock()

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def cleanup_old_files():
    """Clean up files older than 1 hour"""
    try:
        current_time = datetime.now()
        
        # Clean output folder
        for item in OUTPUT_FOLDER.iterdir():
            if item.is_dir():
                # Check modification time
                mtime = datetime.fromtimestamp(item.stat().st_mtime)
                if current_time - mtime > timedelta(hours=1):
                    shutil.rmtree(item)
                    print(f"🗑️  Cleaned up old output: {item.name}")
        
        # Clean cache folder
        for item in CACHE_FOLDER.iterdir():
            if item.is_file():
                mtime = datetime.fromtimestamp(item.stat().st_mtime)
                if current_time - mtime > timedelta(hours=1):
                    item.unlink()
                    print(f"🗑️  Cleaned up old cache: {item.name}")
                    
    except Exception as e:
        print(f"⚠️  Cleanup error: {e}")

# Start cleanup thread
def cleanup_thread():
    while True:
        time.sleep(3600)  # Run every hour
        cleanup_old_files()

threading.Thread(target=cleanup_thread, daemon=True).start()

# ============================================================================
# HEALTH & STATUS ENDPOINTS
# ============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    import torch
    
    return jsonify({
        'status': 'ok',
        'service': 'dsp-task3-backend',
        'version': '2.1',
        'features': [
            'instrument-separation',
            'voice-separation',
            'audio-processing',
            'equalizer',
            'fft-analysis',
            'spectrogram-generation',
            'file-management'
        ],
        'gpu_available': torch.cuda.is_available(),
        'device': 'cuda' if torch.cuda.is_available() else 'cpu'
    })

@app.route('/status/<session_id>', methods=['GET'])
def get_status(session_id):
    """Get processing status for a session"""
    with processing_lock:
        if session_id in processing_status:
            return jsonify(processing_status[session_id])
        return jsonify({'error': 'Session not found'}), 404

# ============================================================================
# INSTRUMENT SEPARATION ENDPOINTS
# ============================================================================

@app.route('/api/separate', methods=['POST'])
def separate_instruments():
    """
    Separate audio into 6 stems using Demucs AI
    
    Form data:
        - audio: audio file
        - drums, bass, vocals, guitar, piano, other: gain values (0.0-2.0)
        - session_id: optional session identifier
    """

    session_id = request.form.get('session_id', str(int(time.time())))
    
    try:
        # Update status
        with processing_lock:
            processing_status[session_id] = {
                'stage': 'uploading',
                'progress': 0.05,
                'message': 'Uploading file...',
                'type': 'instrument_separation'
            }
        
        # Validate file
        if 'audio' not in request.files:
            return jsonify({'success': False, 'error': 'No audio file provided'}), 400
        
        file = request.files['audio']
        
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'success': False, 'error': 'Invalid file type'}), 400
        
        # Save uploaded file
        filename = secure_filename(file.filename)
        timestamp = int(time.time())
        upload_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{timestamp}_{filename}")
        file.save(upload_path)
        
        print(f"✅ File uploaded: {upload_path}")
        
        with processing_lock:
            processing_status[session_id] = {
                'stage': 'uploaded',
                'progress': 0.1,
                'message': 'File uploaded successfully',
                'type': 'instrument_separation'
            }
        
        # Parse gains
        gains = {
            'drums': float(request.form.get('drums', 1.0)),
            'bass': float(request.form.get('bass', 1.0)),
            'vocals': float(request.form.get('vocals', 1.0)),
            'guitar': float(request.form.get('guitar', 1.0)),
            'piano': float(request.form.get('piano', 1.0)),
            'other': float(request.form.get('other', 1.0))
        }
        
        print(f"🎚️ Gains: {gains}")
        
        # Create separator
        separator = InstrumentSeparator(upload_path, str(OUTPUT_FOLDER))
        
        # Update status callback
        def update_progress(stage, progress, message):
            with processing_lock:
                processing_status[session_id] = {
                    'stage': stage,
                    'progress': progress,
                    'message': message,
                    'type': 'instrument_separation'
                }
        
        # Process
        with processing_lock:
            processing_status[session_id] = {
                'stage': 'separating',
                'progress': 0.15,
                'message': 'Starting AI separation...',
                'type': 'instrument_separation'
            }
        
        result = separator.process(
            gains=gains,
            keep_full=True,
            keep_trimmed=True
        )
        
        # Clean up uploaded file
        os.remove(upload_path)
        
        with processing_lock:
            processing_status[session_id] = {
                'stage': 'complete',
                'progress': 1.0,
                'message': 'Processing complete!',
                'type': 'instrument_separation'
            }
        
        print(f"✅ Separation complete!")
        
        # Convert absolute paths to relative paths for download endpoint
        # Only include files that actually exist (signal detection)
        files = {}
        if 'separated_stems_full' in result:
            # Resolve OUTPUT_FOLDER to absolute path
            output_folder_abs = OUTPUT_FOLDER.resolve()
            for stem_name, abs_path in result['separated_stems_full'].items():
                # Check if file actually exists (signal detection may have skipped it)
                abs_path_obj = Path(abs_path)
                if abs_path_obj.exists():
                    # Convert absolute path to relative path from OUTPUT_FOLDER
                    rel_path = abs_path_obj.relative_to(output_folder_abs)
                    files[stem_name] = str(rel_path).replace('\\', '/')
                else:
                    print(f"⏭️  Skipping {stem_name} - file doesn't exist (no signal)")
        
        result['session_id'] = session_id
        result['files'] = files  # Add 'files' key for frontend compatibility
        return jsonify(result)
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        
        with processing_lock:
            processing_status[session_id] = {
                'stage': 'error',
                'progress': 0,
                'message': str(e),
                'type': 'instrument_separation'
            }
        
        return jsonify({'success': False, 'error': str(e)}), 500

# ============================================================================
# VOICE SEPARATION ENDPOINTS
# ============================================================================

@app.route('/api/separate-voices', methods=['POST'])
def separate_voices():
    """
    Separate audio into individual human voice sources using Multi-Decoder-DPRNN
    
    Form data:
        - audio: audio file
        - source_0, source_1, ...: gain values (0.0-2.0) for each voice
        - session_id: optional session identifier
        - num_sources: expected number of sources (optional, auto-detected)
    
    Returns:
        JSON with separated voice files and metadata
    """
    
    session_id = request.form.get('session_id', str(int(time.time())))
    
    try:
        # Update status
        with processing_lock:
            processing_status[session_id] = {
                'stage': 'uploading',
                'progress': 0.05,
                'message': 'Uploading file...',
                'type': 'voice_separation'
            }
        
        # Validate file
        if 'audio' not in request.files:
            return jsonify({'success': False, 'error': 'No audio file provided'}), 400
        
        file = request.files['audio']
        
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'success': False, 'error': 'Invalid file type'}), 400
        
        # Save uploaded file
        filename = secure_filename(file.filename)
        timestamp = int(time.time())
        upload_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{timestamp}_{filename}")
        file.save(upload_path)
        
        print(f"✅ File uploaded: {upload_path}")
        
        with processing_lock:
            processing_status[session_id] = {
                'stage': 'uploaded',
                'progress': 0.1,
                'message': 'File uploaded successfully',
                'type': 'voice_separation'
            }
        
        # Parse gains for sources (if provided)
        gains = {}
        for key in request.form.keys():
            if key.startswith('source_'):
                try:
                    source_idx = int(key.split('_')[1])
                    gain_value = float(request.form.get(key, 1.0))
                    gains[source_idx] = gain_value
                except (ValueError, IndexError):
                    pass
        
        print(f"🎚️ Voice gains: {gains if gains else 'Using defaults'}")
        
        # Create separator
        separator = VoiceSeparator(upload_path, str(OUTPUT_FOLDER))
        
        # Update status callback
        def update_progress(stage, progress, message):
            with processing_lock:
                processing_status[session_id] = {
                    'stage': stage,
                    'progress': progress,
                    'message': message,
                    'type': 'voice_separation'
                }
        
        # Process
        with processing_lock:
            processing_status[session_id] = {
                'stage': 'separating',
                'progress': 0.15,
                'message': 'Starting AI voice separation...',
                'type': 'voice_separation'
            }
        
        result = separator.process(
            gains=gains if gains else None,
            progress_callback=update_progress
        )
        
        # Clean up uploaded file
        os.remove(upload_path)
        
        with processing_lock:
            processing_status[session_id] = {
                'stage': 'complete',
                'progress': 1.0,
                'message': 'Voice separation complete!',
                'type': 'voice_separation'
            }
        
        print(f"✅ Voice separation complete!")
        
        # Convert absolute paths to relative paths for download endpoint
        # Only include files that actually exist (signal detection)
        files = []
        if 'separated_sources' in result:
            # Resolve OUTPUT_FOLDER to absolute path
            output_folder_abs = OUTPUT_FOLDER.resolve()
            for abs_path in result['separated_sources']:
                # Check if file actually exists (signal detection may have skipped it)
                abs_path_obj = Path(abs_path)
                if abs_path_obj.exists():
                    # Convert absolute path to relative path from OUTPUT_FOLDER
                    rel_path = abs_path_obj.relative_to(output_folder_abs)
                    files.append(str(rel_path).replace('\\', '/'))
                else:
                    print(f"⏭️  Skipping voice - file doesn't exist (no signal)")
        
        result['session_id'] = session_id
        result['files'] = files  # Add 'files' key for frontend compatibility
        print(f"📤 Returning {len(files)} voice files to frontend")
        return jsonify(result)
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        
        with processing_lock:
            processing_status[session_id] = {
                'stage': 'error',
                'progress': 0,
                'message': str(e),
                'type': 'voice_separation'
            }
        
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/voices/adjust-gains', methods=['POST'])
def adjust_voice_gains():
    """
    Re-mix separated voices with new gain settings without re-separating
    
    JSON body:
        {
            "session_dir": "voices_1234567890",
            "gains": {
                "0": 1.5,
                "1": 0.8,
                "2": 1.0
            }
        }
    
    Returns:
        JSON with new mixed file path
    """
    
    try:
        data = request.get_json()
        
        if not data or 'session_dir' not in data:
            return jsonify({'success': False, 'error': 'session_dir required'}), 400
        
        session_dir = OUTPUT_FOLDER / data['session_dir']
        
        if not session_dir.exists():
            return jsonify({'success': False, 'error': 'Session not found'}), 404
        
        gains = data.get('gains', {})
        
        # Convert string keys to integers
        gains = {int(k): float(v) for k, v in gains.items()}
        
        print(f"🎚️ Adjusting voice gains: {gains}")
        
        # Load all source files
        sources = []
        source_files = sorted(session_dir.glob('voice_*.wav'))
        
        if not source_files:
            return jsonify({'success': False, 'error': 'No voice sources found'}), 404
        
        # Load sources
        for i, source_file in enumerate(source_files):
            audio, sr = sf.read(str(source_file))
            sources.append(audio)
        
        sample_rate = sr
        
        # Mix with new gains
        mixed_audio = np.zeros_like(sources[0])
        
        for i, source in enumerate(sources):
            gain = gains.get(i, 1.0)
            mixed_audio += source * gain
        
        # Normalize to prevent clipping
        max_val = np.abs(mixed_audio).max()
        if max_val > 0.99:
            mixed_audio = mixed_audio * (0.99 / max_val)
        
        # Save new mix
        mixed_path = session_dir / "mixed_adjusted.wav"
        sf.write(
            str(mixed_path),
            mixed_audio,
            sample_rate,
            subtype='PCM_16'
        )
        
        print(f"✅ Saved adjusted mix: {mixed_path}")
        
        return jsonify({
            'success': True,
            'mixed_file': f"{data['session_dir']}/mixed_adjusted.wav",
            'gains': gains
        })
        
    except Exception as e:
        print(f"❌ Error adjusting gains: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/voices/info', methods=['GET'])
def get_voice_info():
    """
    Get information about available voice separation models and capabilities
    
    Returns:
        JSON with model information
    """
    
    try:
        import torch
        
        return jsonify({
            'success': True,
            'model': 'Multi-Decoder-DPRNN',
            'model_id': 'JunzheJosephZhu/MultiDecoderDPRNN',
            'description': 'AI-powered voice separation for multi-speaker audio',
            'capabilities': [
                'Separate multiple human voices from mixed audio',
                'Auto-detect number of speakers',
                'Individual gain control per voice',
                'Re-mixing without re-separation'
            ],
            'supported_formats': list(ALLOWED_EXTENSIONS),
            'cuda_available': torch.cuda.is_available(),
            'device': 'cuda' if torch.cuda.is_available() else 'cpu',
            'max_file_size': '200MB',
            'typical_sources': '2-4 voices',
            'processing_time': 'Varies by audio length (typically 30s-5min)'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/voices/list/<path:session_dir>', methods=['GET'])
def list_voice_sources(session_dir):
    """
    List all voice sources in a session directory
    
    Returns:
        JSON with list of voice files and metadata
    """
    
    try:
        session_path = OUTPUT_FOLDER / session_dir
        
        if not session_path.exists():
            return jsonify({'success': False, 'error': 'Session not found'}), 404
        
        sources = []
        
        # Find all voice files
        for voice_file in sorted(session_path.glob('voice_*.wav')):
            # Get audio info
            info = sf.info(str(voice_file))
            
            sources.append({
                'name': voice_file.stem,
                'file': f"{session_dir}/{voice_file.name}",
                'duration': info.duration,
                'sample_rate': info.samplerate,
                'channels': info.channels
            })
        
        # Check for mixed files
        mixed_files = []
        for mixed_file in session_path.glob('mixed*.wav'):
            info = sf.info(str(mixed_file))
            mixed_files.append({
                'name': mixed_file.stem,
                'file': f"{session_dir}/{mixed_file.name}",
                'duration': info.duration,
                'sample_rate': info.samplerate,
                'channels': info.channels
            })
        
        return jsonify({
            'success': True,
            'session_dir': session_dir,
            'num_sources': len(sources),
            'sources': sources,
            'mixed_files': mixed_files
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ============================================================================
# FILE MANAGEMENT ENDPOINTS
# ============================================================================

@app.route('/api/download/<path:filename>', methods=['GET'])
def download_file(filename):
    """Download a file from the output directory"""
    try:
        file_path = OUTPUT_FOLDER / filename
        if file_path.exists():
            return send_file(str(file_path), as_attachment=True)
        else:
            return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/cleanup', methods=['POST'])
def manual_cleanup():
    """Manually trigger cleanup of old files"""
    try:
        cleanup_old_files()
        return jsonify({
            'success': True,
            'message': 'Cleanup completed'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/sessions/list', methods=['GET'])
def list_sessions():
    """List all available session directories"""
    try:
        sessions = []
        
        for item in OUTPUT_FOLDER.iterdir():
            if item.is_dir():
                mtime = datetime.fromtimestamp(item.stat().st_mtime)
                
                # Determine session type
                session_type = 'unknown'
                if item.name.startswith('voices_'):
                    session_type = 'voice_separation'
                elif item.name.startswith('instruments_') or any(item.glob('*drums*.wav')):
                    session_type = 'instrument_separation'
                
                sessions.append({
                    'name': item.name,
                    'type': session_type,
                    'created': mtime.isoformat(),
                    'files': len(list(item.glob('*.wav')))
                })
        
        # Sort by creation time (newest first)
        sessions.sort(key=lambda x: x['created'], reverse=True)
        
        return jsonify({
            'success': True,
            'sessions': sessions,
            'total': len(sessions)
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/sessions/delete/<path:session_dir>', methods=['DELETE'])
def delete_session(session_dir):
    """Delete a session directory and all its files"""
    try:
        session_path = OUTPUT_FOLDER / session_dir
        
        if not session_path.exists():
            return jsonify({'success': False, 'error': 'Session not found'}), 404
        
        # Remove directory and all contents
        shutil.rmtree(session_path)
        
        print(f"🗑️  Deleted session: {session_dir}")
        
        return jsonify({
            'success': True,
            'message': f'Session {session_dir} deleted'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

#===================================================================
# Fast fourier transform
#===================================
@app.route('/upload_wav_and_fft', methods=['POST'])
def upload_wav_and_fft():
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file:
        temp_file_path = None
        try:
            # Read file data into memory first
            file_data = file.read()
            
            # Debug file information
            print(f"\n=== AUDIO FILE DEBUG ===")
            print(f"Filename: {file.filename}")
            print(f"Content type: {file.content_type}")
            print(f"File size: {len(file_data)} bytes")
            print(f"First 16 bytes (hex): {file_data[:16].hex()}")
            print(f"First 4 bytes (ASCII): {file_data[:4]}")
            
            # Try multiple methods to read the audio file
            data = None
            samplerate = None
            
            # Method 1: Try soundfile with BytesIO
            try:
                data, samplerate = sf.read(io.BytesIO(file_data))
                print(f"✅ Successfully read audio using soundfile (BytesIO)")
            except Exception as e1:
                print(f"⚠️  Soundfile BytesIO failed: {str(e1)}")
                
                # Method 2: Try saving to temp file and reading
                try:
                    temp_file_path = os.path.join(tempfile.gettempdir(), f"upload_{int(time.time())}_{secure_filename(file.filename)}")
                    with open(temp_file_path, 'wb') as f:
                        f.write(file_data)
                    
                    data, samplerate = sf.read(temp_file_path)
                    print(f"✅ Successfully read audio using soundfile (temp file)")
                    
                    # Clean up temp file immediately
                    try:
                        os.remove(temp_file_path)
                        temp_file_path = None
                    except:
                        pass
                        
                except Exception as e2:
                    print(f"⚠️  Soundfile temp file failed: {str(e2)}")
                    
                    # Method 3: Try scipy wavfile as last resort
                    try:
                        from scipy.io import wavfile
                        samplerate, data = wavfile.read(io.BytesIO(file_data))
                        print(f"✅ Successfully read audio using scipy wavfile")
                    except Exception as e3:
                        print(f"❌ All methods failed:")
                        print(f"   - Soundfile BytesIO: {str(e1)}")
                        print(f"   - Soundfile temp file: {str(e2)}")
                        print(f"   - Scipy wavfile: {str(e3)}")
                        print(f"File header (first 16 bytes): {file_data[:16].hex()}")
                        
                        # Check if it's actually a WAV file
                        if file_data[:4] != b'RIFF':
                            raise Exception(f"File is not a valid WAV file. Header starts with '{file_data[:4]}' instead of 'RIFF'. The file may be in a different format or corrupted.")
                        else:
                            raise Exception(f"Could not read WAV file. All reading methods failed. The file format may be unsupported or the file may be corrupted. Please try converting the file using a different audio tool.")
            
            if data is None or samplerate is None:
                raise Exception("Failed to read audio data")

            # If stereo, take only one channel (average the channels)
            if data.ndim > 1:
                data = np.mean(data, axis=1)

            # Ensure data is float32 as expected by FFT class
            if data.dtype != np.float32:
                data = data.astype(np.float32)

            _fft_instance = FFT()
            real_fft, imag_fft = _fft_instance.fft(data)

            # Reconstruct complex spectrum
            real_fft = np.asarray(real_fft, dtype=np.float32)
            imag_fft = np.asarray(imag_fft, dtype=np.float32)
            complex_fft = real_fft + 1j * imag_fft
            
            # Store original FFT for comparison (before any modifications)
            original_real_fft = real_fft.copy()
            original_imag_fft = imag_fft.copy()

            # Parse frequency adjustments (supports JSON body or form fields 'adjustments' or 'bands')
            adjustments = None
            bands = None
            try:
                j = request.get_json(silent=True) or {}
            except Exception:
                j = {}

            # Support either top-level 'bands' (list) or 'adjustments' (dict)
            if isinstance(j, dict):
                if 'bands' in j:
                    bands = j.get('bands')
                if 'adjustments' in j:
                    adjustments = j.get('adjustments')

            # Fallback to form fields
            if adjustments is None and bands is None:
                adjustments_field = request.form.get('adjustments')
                bands_field = request.form.get('bands')
                if bands_field:
                    try:
                        bands = json.loads(bands_field)
                    except Exception:
                        bands = None
                elif adjustments_field:
                    try:
                        adjustments = json.loads(adjustments_field)
                    except Exception:
                        adjustments = None

            applied = []
            N = len(complex_fft)
            
            print(f"\n=== GAIN APPLICATION DEBUG ===")
            print(f"FFT size N: {N}")
            print(f"Sample rate: {samplerate}")
            print(f"Nyquist frequency: {samplerate/2} Hz")
            print(f"Number of bands received: {len(bands) if bands else 0}")
            if bands:
                print(f"Bands summary: {[(b.get('low', 0), b.get('high', 0), b.get('gain', 1.0)) for b in bands]}")
            print(f"Adjustments received: {adjustments}")

            # Handle single-frequency adjustments given as a dict {"440": 0.5, ...}
            if adjustments and isinstance(adjustments, dict):
                for freq_str, gain_val in adjustments.items():
                    try:
                        freq = float(freq_str)
                        gain = float(gain_val)
                    except Exception:
                        continue

                    k = int(round(freq * N / float(samplerate)))
                    if k < 0 or k >= N:
                        continue

                    mirror = (-k) % N
                    complex_fft[k] *= gain
                    if mirror != k:
                        complex_fft[mirror] *= gain

                    applied.append({'type': 'freq', 'frequency_hz': freq, 'bin': k, 'gain': gain})

            # Handle bands: list of {"low": <Hz>, "high": <Hz>, "gain": <value>}
            if bands and isinstance(bands, (list, tuple)):
                print(f"Applying {len(bands)} frequency bands...")
                for idx, band in enumerate(bands):
                    if not isinstance(band, dict):
                        continue
                    try:
                        low = float(band.get('low', band.get('f0', 0.0)))
                        high = float(band.get('high', band.get('f1', low)))
                        gain = float(band.get('gain', band.get('g', 1.0)))
                        print(f"  Band {idx+1} raw data: low={band.get('low')}, high={band.get('high')}, gain={band.get('gain')} (parsed: {low:.0f}-{high:.0f}Hz, gain={gain:.3f})")
                    except Exception as e:
                        print(f"  Band {idx+1} PARSE ERROR: {e}")
                        continue

                    if low > high:
                        low, high = high, low

                    # Correct bin calculation: frequency_resolution = samplerate / N
                    # bin_index = frequency / frequency_resolution = frequency * N / samplerate
                    # For real FFT, we only have N//2 + 1 bins representing [0, Nyquist]
                    k_low = int(np.round(low * N / float(samplerate)))
                    k_high = int(np.round(high * N / float(samplerate)))

                    # Clamp to valid range for real FFT (only positive frequencies)
                    k_low = max(0, min(k_low, N // 2))
                    k_high = max(0, min(k_high, N // 2))

                    if k_low > k_high:
                        continue

                    # Apply gain across the band
                    # For complex FFT from real signal, spectrum is symmetric
                    # We need to apply to both positive and negative frequencies
                    bins_affected = k_high - k_low + 1
                    for k in range(k_low, k_high + 1):
                        complex_fft[k] *= gain
                        # Apply to negative frequency (mirror)
                        if k > 0 and k < N // 2:
                            complex_fft[N - k] *= gain

                    print(f"  Band {idx+1}: {low:.0f}-{high:.0f}Hz (bins {k_low}-{k_high}, {bins_affected} bins) gain={gain:.2f}")
                    applied.append({'type': 'band', 'low_hz': low, 'high_hz': high, 'bins': [k_low, k_high], 'gain': gain})

            # Prepare outputs
            modified_real = np.real(complex_fft)
            modified_imag = np.imag(complex_fft)

            # Only create WAV file if gains were actually applied
            return_wav = bool(bands or adjustments)

            # Generate input spectrogram (from original signal)
            input_spectrogram_data = None
            output_spectrogram_data = None
            frequencies = None
            times = None
            
            def generate_spectrogram_numpy(signal_data):
                """Generate spectrogram using pure NumPy STFT"""
                window_size = 2048
                hop_size = 512
                
                # Create Hamming window
                hamming_window = 0.54 - 0.46 * np.cos(2 * np.pi * np.arange(window_size) / (window_size - 1))
                
                # Calculate number of frames
                num_frames = (len(signal_data) - window_size) // hop_size + 1
                freq_bins = window_size // 2 + 1
                
                # Initialize STFT matrix
                stft_matrix = np.zeros((freq_bins, num_frames), dtype=np.complex128)
                
                # Compute STFT
                for i in range(num_frames):
                    start = i * hop_size
                    end = start + window_size
                    if end > len(signal_data):
                        break
                    
                    # Apply window and compute FFT
                    windowed = signal_data[start:end] * hamming_window
                    fft_result = np.fft.rfft(windowed)
                    stft_matrix[:, i] = fft_result
                
                # Convert to magnitude (dB scale)
                magnitude = np.abs(stft_matrix)
                magnitude_db = 20 * np.log10(magnitude + 1e-10)
                
                # Transpose to get [time, frequency] shape
                return magnitude_db.T.tolist()
            
            print("Starting spectrogram generation...")
            try:
                # Generate input spectrogram from ORIGINAL data
                print(f"Generating input spectrogram for {len(data)} samples...")
                input_spectrogram_data = generate_spectrogram_numpy(data)
                print(f"Input spectrogram generated: {len(input_spectrogram_data)} frames")
                
                # Generate output spectrogram from MODIFIED FFT signal
                # Use IFFT to get time-domain signal from modified complex_fft
                print("Generating output spectrogram from modified signal...")
                modified_signal = np.fft.ifft(complex_fft).real.astype(np.float32)
                # Trim to original length
                modified_signal = modified_signal[:len(data)]
                output_spectrogram_data = generate_spectrogram_numpy(modified_signal)
                
                if bands or adjustments:
                    print(f"Generated spectrograms: input and output (modifications applied)")
                else:
                    print(f"Generated spectrograms: input and output (no modifications, both show original signal)")
                
                # Generate frequency and time axes
                window_size = 2048
                hop_size = 512
                num_frames = (len(data) - window_size) // hop_size + 1
                frequencies = np.fft.rfftfreq(window_size, 1.0 / samplerate)
                times = np.arange(num_frames) * hop_size / samplerate
                
                print(f"Spectrogram dimensions: {len(times)} frames, {len(frequencies)} freq bins")
                print(f"Spectrogram data types: input={type(input_spectrogram_data)}, output={type(output_spectrogram_data)}")
            except Exception as spec_error:
                import traceback
                print(f"ERROR: Spectrogram generation failed!")
                print(f"Error: {spec_error}")
                print(f"Traceback: {traceback.format_exc()}")
                # Set to None so we can continue
                input_spectrogram_data = None
                output_spectrogram_data = None
                frequencies = None
                times = None

            response = {
                "status": "success",
                # Original FFT (before equalizer)
                "original_fft_real": original_real_fft.tolist(),
                "original_fft_imag": original_imag_fft.tolist(),
                # Processed FFT (after equalizer)
                "fft_real": modified_real.tolist(),
                "fft_imag": modified_imag.tolist(),
                "sample_rate": samplerate,
                "fft_size": N,
                "applied_adjustments": applied,
                "has_modifications": bool(bands or adjustments),
                "input_spectrogram": input_spectrogram_data,
                "output_spectrogram": output_spectrogram_data,
                "spectrogram_frequencies": frequencies.tolist() if frequencies is not None else None,
                "spectrogram_times": times.tolist() if times is not None else None,
                "spectrogram_num_frames": len(times) if times is not None else 0,
                "spectrogram_num_freq_bins": len(frequencies) if frequencies is not None else 0
            }
            
            if return_wav:
                try:
                    # Inverse transform to time domain
                    time_signal = np.fft.ifft(complex_fft).real
                    
                    # Trim to original length to avoid duration mismatch
                    time_signal = time_signal[:len(data)]

                    # Normalize based on original signal's peak to maintain relative scale
                    original_max = np.abs(data).max()
                    modified_max = np.abs(time_signal).max()
                    if modified_max > 0 and original_max > 0:
                        # Scale to match original dynamic range
                        scale = (original_max * 0.99) / modified_max
                        time_signal = (time_signal * scale).astype(np.float32)
                    else:
                        time_signal = time_signal.astype(np.float32)

                    ts = int(time.time())
                    out_name = f"modified_{ts}.wav"
                    out_path = OUTPUT_FOLDER / out_name
                    # Use soundfile to write the WAV with original sample rate
                    sf.write(str(out_path), time_signal, samplerate, subtype='PCM_16')

                    response['modified_wav'] = f"{out_name}"
                    response['modified_wav_path'] = str(out_path)
                except Exception as e:
                    response['modified_wav_error'] = str(e)
                    print(f"ERROR saving WAV: {e}")

            return jsonify(response)

        except Exception as e:
            # Clean up temp file if it exists
            if temp_file_path and os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                except:
                    pass
            return jsonify({"error": f"Processing failed: {str(e)}"}), 500

    return jsonify({"error": "An unexpected error occurred"}), 500

# ============================================================================
# MAIN
# ============================================================================

def main():
    """Start the server"""
    print("=" * 80)
    print("🎵 DSP TASK 3 - COMPREHENSIVE BACKEND SERVER")
    print("=" * 80)
    print()
    print("📡 Server URL: http://localhost:5001")
    print("🔗 Frontend should connect to this URL")
    print()
    print("✨ Available Features:")
    print("   • Instrument Separation (AI-powered, 6 stems)")
    print("   • Voice Separation (AI-powered, multi-speaker)")
    print("   • Audio Processing & Filtering")
    print("   • Parametric Equalizer")
    print("   • Audio Mixing")
    print("   • File Management")
    print("   • Format Conversion")
    print()
    print("⚠️  Requirements:")
    print("   • Virtual environment must be activated")
    print("   • Run: instrument_separation\\Scripts\\activate")
    print("   • Dependencies: torch, torchaudio, asteroid, demucs")
    print()
    print("🔧 Endpoints:")
    print()
    print("   HEALTH & STATUS:")
    print("   GET  /health - Health check")
    print("   GET  /status/<session_id> - Get processing status")
    print()
    print("   INSTRUMENT SEPARATION:")
    print("   POST /api/separate - Separate instruments (6 stems)")
    print()
    print("   VOICE SEPARATION:")
    print("   POST /api/separate-voices - Separate voices (multi-speaker)")
    print("   POST /api/voices/adjust-gains - Adjust voice gains")
    print("   GET  /api/voices/info - Get voice model info")
    print("   GET  /api/voices/list/<session_dir> - List voice sources")
    print()
    print("   FILE MANAGEMENT:")
    print("   GET  /api/download/<file> - Download file")
    print("   POST /api/cleanup - Manual cleanup")
    print("   GET  /api/sessions/list - List all sessions")
    print("   DEL  /api/sessions/delete/<session_dir> - Delete session")
    print()
    print("=" * 80)
    print()
    
    # Check GPU availability
    try:
        import torch
        if torch.cuda.is_available():
            print(f"✅ GPU ENABLED: {torch.cuda.get_device_name(0)}")
            print(f"   VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")
        else:
            print("⚠️  GPU NOT AVAILABLE - Using CPU (slower processing)")
    except:
        pass
    
    print()
    print("🚀 Starting server...")
    print()
    
    # Run the server
    app.run(host='localhost', port=5001, debug=False, threaded=True)

if __name__ == '__main__':
    # Check dependencies
    try:
        import flask
        import flask_cors
        import soundfile
        import torch
        import torchaudio
    except ImportError as e:
        print(f"❌ Error: Missing dependency - {e}")
        print("📦 Install with:")
        print("   pip install flask flask-cors soundfile torch torchaudio asteroid pytorch-lightning")
        sys.exit(1)
    
    main()
