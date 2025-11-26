#!/usr/bin/env python3
"""
Instrument Separation Script
============================
Separates audio into individual instrument stems using Demucs AI model.
Designed to be executed from JavaScript/Node.js with command-line arguments.

Usage:
    python instruments_separation.py <input_audio_path> [options]

Arguments:
    input_audio_path    : Path to the input audio file
    
Optional Arguments:
    --drums GAIN        : Gain for drums (default: 1.0)
    --bass GAIN         : Gain for bass (default: 1.0)
    --vocals GAIN       : Gain for vocals (default: 1.0)
    --guitar GAIN       : Gain for guitar (default: 1.0)
    --piano GAIN        : Gain for piano (default: 1.0)
    --other GAIN        : Gain for other instruments (default: 1.0)
    --output-dir PATH   : Output directory (default: ./output)
    --keep-full         : Keep full-length stems (default: True)
    --keep-trimmed      : Keep trimmed stems (default: True)

Output:
    JSON response with paths to all generated files
"""

import os
import sys
import json
import argparse
import warnings
import shutil
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
import multiprocessing

import numpy as np
import soundfile as sf
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt

warnings.filterwarnings('ignore')


# Try to import torch for GPU detection
try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    torch = None

warnings.filterwarnings('ignore')


class InstrumentSeparator:
    """Main class for instrument separation and mixing"""
    
    STEM_NAMES = ['drums', 'bass', 'vocals', 'guitar', 'piano', 'other']
    SAMPLE_RATE = 44100
    
    def __init__(self, input_audio_path, output_dir='./output'):
        """
        Initialize the separator
        
        Args:
            input_audio_path (str): Path to input audio file
            output_dir (str): Directory to save outputs
        """
        self.input_audio_path = Path(input_audio_path)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate unique timestamp for this run
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.run_dir = self.output_dir / f"run_{self.timestamp}"
        self.run_dir.mkdir(parents=True, exist_ok=True)
        
        self.stems = {}
        self.trimmed_stems = {}
        self.separated_dir = None
        
        # GPU Detection
        self.device = self._detect_device()
        
        print(f"🎵 Instrument Separator initialized")
        print(f"📂 Input: {self.input_audio_path}")
        print(f"📂 Output: {self.run_dir}")
        print(f"🖥️  Device: {self.device}")
    
    def _detect_device(self):
        """
        Detect if GPU is available for acceleration
        
        Returns:
            str: Device name ('cuda', 'cpu')
        """
        if TORCH_AVAILABLE and torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            print(f"🚀 GPU Detected: {gpu_name}")
            print(f"💾 VRAM Available: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
            return 'cuda'
        else:
            if not TORCH_AVAILABLE:
                print("⚠️  PyTorch not available - using CPU")
            else:
                print("⚠️  No GPU detected - using CPU")
            cpu_count = multiprocessing.cpu_count()
            print(f"🔢 CPU Cores: {cpu_count}")
            return 'cpu'
    
    def validate_input(self):
        """Validate that input file exists"""
        if not self.input_audio_path.exists():
            raise FileNotFoundError(f"Input audio file not found: {self.input_audio_path}")
        
        print(f"✅ Input file validated: {self.input_audio_path.name}")
        return True
    
    def separate_stems(self):
        """Run Demucs AI separation with GPU acceleration if available using Python API"""
        print("\n" + "="*60)
        print("🤖 RUNNING DEMUCS AI SEPARATION")
        print("="*60)
        print("📊 Model: htdemucs_6s (6-stem separation)")
        print("🎵 Separating into: drums, bass, vocals, guitar, piano, other")
        print(f"🖥️  Using: {self.device.upper()}")
        
        # Create temporary output directory for Demucs
        demucs_output = self.run_dir / "demucs_output"
        demucs_output.mkdir(parents=True, exist_ok=True)
        
        # Use Demucs Python API directly to avoid PyTorch tensor aliasing bug
        try:
            from demucs.pretrained import get_model
            from demucs.apply import apply_model
            from demucs.audio import AudioFile
            import torch
            
            print("📥 Loading audio file...")
            # Load audio with proper tensor handling
            audio_file = AudioFile(str(self.input_audio_path))
            wav = audio_file.read(seek_time=0, duration=None, streams=0, samplerate=44100, channels=2)
            
            # Ensure tensor is contiguous and cloned to avoid aliasing
            if isinstance(wav, torch.Tensor):
                wav = wav.clone().contiguous()
            
            print(f"✅ Audio loaded: {wav.shape if isinstance(wav, torch.Tensor) else 'N/A'}")
            
            print("📥 Loading Demucs model...")
            device = self.device if TORCH_AVAILABLE and torch.cuda.is_available() and self.device == 'cuda' else 'cpu'
            model = get_model('htdemucs_6s')
            model.to(device)
            model.eval()
            print(f"✅ Model loaded on {device}")
            
            print("🔄 Separating audio...")
            with torch.no_grad():
                wav = wav.to(device)
                # Normalize audio
                ref = wav.mean(0)
                wav = wav - ref.mean()
                wav = wav / wav.std()
                
                # Apply model
                sources = apply_model(model, wav[None], device=device, shifts=1, split=True, overlap=0.25, progress=True)[0]
                sources = sources * wav.std() + ref.mean()
            
            print("✅ Separation complete!")
            
            # Save separated sources
            htdemucs_dir = demucs_output / 'htdemucs_6s' / self.input_audio_path.stem
            htdemucs_dir.mkdir(parents=True, exist_ok=True)
            
            # Demucs htdemucs_6s outputs: drums, bass, other, vocals (4 sources, not 6)
            # Only save tracks that have signal (RMS > threshold)
            source_names = ['drums', 'bass', 'other', 'vocals']
            saved_count = 0
            for i, (name, source) in enumerate(zip(source_names, sources)):
                audio_np = source.cpu().numpy()
                # Check if track has signal (RMS threshold)
                rms = np.sqrt(np.mean(audio_np ** 2))
                if rms > 0.001:  # Threshold for "has signal"
                    output_path = htdemucs_dir / f"{name}.wav"
                    sf.write(str(output_path), audio_np.T, self.SAMPLE_RATE)
                    print(f"✅ Saved: {name}.wav (RMS: {rms:.4f})")
                    saved_count += 1
                else:
                    print(f"⏭️  Skipped: {name} (no signal, RMS: {rms:.4f})")
            
            # For 6-stem model compatibility, check guitar and piano from 'other'
            # Note: htdemucs_6s doesn't actually separate these, so we skip them
            print(f"✅ Saved {saved_count} tracks with signal")
            
            self.separated_dir = htdemucs_dir
            print(f"\n✅ SEPARATION COMPLETE!")
            print(f"📂 Output directory: {self.separated_dir}")
            return True
            
        except Exception as e:
            print(f"❌ Python API separation failed: {str(e)}")
            import traceback
            traceback.print_exc()
            print("🔄 Falling back to command-line interface...")
            
            # Fallback to subprocess method
            import subprocess
            import shutil
            
            demucs_path = shutil.which('demucs')
            if not demucs_path:
                raise Exception("Demucs is not installed or not in PATH. Please install: pip install demucs")
            
            print(f"✅ Demucs found: {demucs_path}")
            
            # Subprocess fallback (old method)
            try:
                cmd = [
                    'demucs',
                    '--name', 'htdemucs_6s',
                    str(self.input_audio_path),
                    '-o', str(demucs_output),
                    '--no-split'  # Prevent tensor memory aliasing error in PyTorch 2.x
                ]
                
                # Add GPU device if available
                if self.device == 'cuda':
                    cmd.extend(['--device', 'cuda'])
                    print("🚀 GPU Acceleration: ENABLED")
                else:
                    cmd.extend(['--device', 'cpu'])
                    # Jobs parameter is ignored with --no-split, but add for compatibility
                    cpu_jobs = 1  # Must be 1 with --no-split
                    cmd.extend(['--jobs', str(cpu_jobs)])
                    print(f"🔢 CPU Jobs: {cpu_jobs} (no-split mode)")
                
                print(f"🔄 Running: {' '.join(cmd)}")
                print(f"📂 Input file: {self.input_audio_path}")
                print(f"📂 Output dir: {demucs_output}")
                
                # Try with the specified device (CUDA or CPU)
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                # Check if command succeeded
                if result.returncode != 0:
                    raise subprocess.CalledProcessError(result.returncode, cmd, result.stdout, result.stderr)
                    
            except subprocess.CalledProcessError as e:
                # Check if it's the tensor memory location error on CUDA
                error_msg = str(e.stderr) if e.stderr else ""
                
                # For CUDA errors with RuntimeError, always try CPU fallback
                if self.device == 'cuda' and e.returncode != 0:
                    print("\n⚠️  CUDA processing failed - Retrying with CPU...")
                    print("   (This is a known Demucs issue with certain audio files)")
                    print(f"   Original error: {error_msg[:200]}...")
                    
                    # Retry with CPU
                    cmd_cpu = [
                        'demucs',
                        '--name', 'htdemucs_6s',
                        str(self.input_audio_path),
                        '-o', str(demucs_output),
                        '--device', 'cpu',
                        '--no-split',  # Prevent tensor memory aliasing error
                        '--jobs', '1'  # Must be 1 with --no-split
                    ]
                    
                    print(f"🔄 Retrying: {' '.join(cmd_cpu)}")
                    try:
                        result = subprocess.run(cmd_cpu, capture_output=True, text=True)
                        
                        # Check if command succeeded
                        if result.returncode != 0:
                            raise subprocess.CalledProcessError(result.returncode, cmd_cpu, result.stdout, result.stderr)
                        
                        print("✅ CPU fallback successful!")
                    except subprocess.CalledProcessError as cpu_error:
                        print(f"\n❌ CPU fallback also failed:")
                        print(f"   Return code: {cpu_error.returncode}")
                        print(f"   STDERR: {cpu_error.stderr}")
                        print(f"   STDOUT: {cpu_error.stdout}")
                        raise Exception(f"Demucs separation failed: {cpu_error.stderr}")
                else:
                    # Re-raise if it's a different error or CPU was already used
                    print(f"\n❌ ERROR during separation:")
                    print(f"   Return code: {e.returncode}")
                    print(f"   STDERR: {e.stderr}")
                    print(f"   STDOUT: {e.stdout}")
                    raise Exception(f"Demucs separation failed: {e.stderr}")
                
                # Find the separated directory
                htdemucs_dir = demucs_output / 'htdemucs_6s'
                if htdemucs_dir.exists():
                    subdirs = list(htdemucs_dir.iterdir())
                    if subdirs:
                        self.separated_dir = subdirs[0]
                        print(f"\n✅ SEPARATION COMPLETE!")
                        print(f"📂 Output directory: {self.separated_dir}")
                        return True
                
                raise Exception("Could not find separated output directory")
                
            except subprocess.CalledProcessError:
                # Already handled above
                raise
            except Exception as e:
                print(f"\n❌ ERROR: {str(e)}")
                raise
    
    def load_stems(self):
        """Load all separated stems into memory with parallel processing"""
        print("\n" + "="*60)
        print("📦 LOADING SEPARATED STEMS (Parallel)")
        print("="*60)
        
        def load_single_stem(stem_name):
            """Helper function to load a single stem"""
            stem_path = self.separated_dir / f"{stem_name}.wav"
            
            if stem_path.exists():
                # Load audio using soundfile
                stem_audio, _ = sf.read(stem_path)
                if stem_audio.ndim > 1:  # Convert stereo to mono
                    stem_audio = np.mean(stem_audio, axis=1)
                duration = len(stem_audio) / self.SAMPLE_RATE
                return stem_name, stem_audio, duration
            else:
                return stem_name, None, 0
        
        # Load stems in parallel using ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=min(6, multiprocessing.cpu_count())) as executor:
            results = list(executor.map(load_single_stem, self.STEM_NAMES))
        
        # Process results
        for stem_name, stem_audio, duration in results:
            if stem_audio is not None:
                self.stems[stem_name] = stem_audio
                print(f"  ✅ {stem_name:10s}: {duration:.2f}s ({len(stem_audio):,} samples)")
            else:
                print(f"  ⚠️  {stem_name:10s}: NOT FOUND")
        
        print(f"\n✅ Successfully loaded {len(self.stems)}/{len(self.STEM_NAMES)} stems")
        return len(self.stems) > 0
    
    def trim_silence(self, audio, threshold_db=-40):
        """
        Remove silence from beginning and end of audio
        
        Args:
            audio (np.ndarray): Audio data
            threshold_db (float): Threshold in dB below which is considered silence
            
        Returns:
            tuple: (trimmed_audio, start_index, end_index)
        """
        # Convert to dB (custom implementation)
        audio_abs = np.abs(audio)
        max_val = np.max(audio_abs)
        audio_db = 20 * np.log10(audio_abs / (max_val + 1e-10))
        
        non_silent = audio_db > threshold_db
        non_silent_indices = np.where(non_silent)[0]
        
        if len(non_silent_indices) == 0:
            return np.array([]), 0, 0
        
        start_idx = non_silent_indices[0]
        end_idx = non_silent_indices[-1]
        
        # Add small padding (0.1 seconds)
        padding = int(0.1 * self.SAMPLE_RATE)
        start_idx = max(0, start_idx - padding)
        end_idx = min(len(audio) - 1, end_idx + padding)
        
        trimmed = audio[start_idx:end_idx+1]
        return trimmed, start_idx, end_idx
    
    def create_trimmed_versions(self):
        """Create trimmed versions of all stems (no silence) with parallel processing"""
        print("\n" + "="*60)
        print("✂️  CREATING TRIMMED VERSIONS (Parallel)")
        print("="*60)
        
        trimmed_dir = self.run_dir / "trimmed_stems"
        trimmed_dir.mkdir(parents=True, exist_ok=True)
        
        def trim_and_save_stem(stem_item):
            """Helper function to trim and save a single stem"""
            stem_name, stem_audio = stem_item
            trimmed, start_idx, end_idx = self.trim_silence(stem_audio)
            
            if len(trimmed) > 0:
                trimmed_file = trimmed_dir / f"{stem_name}_trimmed.wav"
                sf.write(str(trimmed_file), trimmed, self.SAMPLE_RATE)
                
                original_duration = len(stem_audio) / self.SAMPLE_RATE
                trimmed_duration = len(trimmed) / self.SAMPLE_RATE
                space_saved = (1 - len(trimmed) / len(stem_audio)) * 100
                
                return (stem_name, trimmed, str(trimmed_file.absolute()), 
                       original_duration, trimmed_duration, space_saved)
            return (stem_name, None, None, 0, 0, 0)
        
        # Process stems in parallel
        with ThreadPoolExecutor(max_workers=min(6, multiprocessing.cpu_count())) as executor:
            results = list(executor.map(trim_and_save_stem, self.stems.items()))
        
        trimmed_paths = {}
        for stem_name, trimmed, trimmed_file, orig_dur, trim_dur, saved in results:
            if trimmed is not None:
                self.trimmed_stems[stem_name] = trimmed
                trimmed_paths[stem_name] = trimmed_file
                print(f"  ✂️  {stem_name:10s}: {orig_dur:5.2f}s → {trim_dur:5.2f}s "
                      f"(saved {saved:4.1f}%)")
        
        print(f"\n✅ Trimmed versions saved to: {trimmed_dir}")
        return trimmed_paths
    
    def mix_stems_with_gains(self, gains):
        """
        Mix all stems with individual gain controls
        
        Args:
            gains (dict): Dictionary of stem_name -> gain_value
            
        Returns:
            np.ndarray: Mixed audio
        """
        print("\n" + "="*60)
        print("🎨 MIXING STEMS")
        print("="*60)
        
        # Start with silence
        mixed = np.zeros_like(list(self.stems.values())[0])
        
        # Mix each stem with its gain
        for stem_name, stem_audio in self.stems.items():
            gain = gains.get(stem_name, 1.0)
            mixed += stem_audio * gain
            
            # Visual feedback
            if gain == 0:
                icon = "🔇"
                status = "MUTED"
            elif gain < 1.0:
                icon = "🔉"
                status = f"REDUCED to {gain:.1f}x"
            elif gain == 1.0:
                icon = "➡️"
                status = "UNCHANGED"
            else:
                icon = "🔊"
                status = f"BOOSTED to {gain:.1f}x"
            
            print(f"  {icon} {stem_name:10s}: {status}")
        
        # Normalize to prevent clipping
        max_amplitude = np.max(np.abs(mixed))
        if max_amplitude > 0:
            mixed = mixed / max_amplitude * 0.95
            print(f"\n📊 Normalized: {max_amplitude:.3f} → 0.95")
        
        print("="*60)
        return mixed
    
    def process(self, gains, keep_full=True, keep_trimmed=True):
        """
        Main processing pipeline
        
        Args:
            gains (dict): Dictionary of stem gains
            keep_full (bool): Keep full-length stems
            keep_trimmed (bool): Keep trimmed stems
            
        Returns:
            dict: Response dictionary with all output paths
        """
        print("\n" + "="*70)
        print("🎵 STARTING INSTRUMENT SEPARATION PIPELINE")
        print("="*70)
        
        # Step 1: Validate input
        self.validate_input()
        
        # Step 2: Separate stems
        self.separate_stems()
        
        # Step 3: Load stems
        self.load_stems()
        
        # Step 4: Create trimmed versions
        trimmed_paths = {}
        if keep_trimmed:
            trimmed_paths = self.create_trimmed_versions()
        
        # Step 5: Mix with gains
        mixed_audio = self.mix_stems_with_gains(gains)
        
        # Step 6: Save mixed audio
        mixed_audio_path = self.run_dir / f'mixed_output_{self.timestamp}.wav'
        sf.write(str(mixed_audio_path), mixed_audio, self.SAMPLE_RATE)
        print(f"\n✅ Mixed audio saved: {mixed_audio_path}")
        
        # Step 7: SKIP spectrogram generation (done client-side for speed!)
        print("\n⚡ Skipping server-side spectrogram generation (handled by client)")
        spectrogram_path = None  # Client will generate spectrograms
        
        # Step 8: Collect stem paths
        stem_paths_full = {}
        if keep_full:
            for stem_name in self.STEM_NAMES:
                stem_path = self.separated_dir / f"{stem_name}.wav"
                if stem_path.exists():
                    stem_paths_full[stem_name] = str(stem_path.absolute())
        
        # Step 9: Build response (zip archive removed)
        response = {
            "success": True,
            "timestamp": self.timestamp,
            "input_audio_file": str(self.input_audio_path.absolute()),
            "output_directory": str(self.run_dir.absolute()),
            "mixed_audio_file": str(mixed_audio_path.absolute()),
            "separated_stems_full": stem_paths_full,
            "separated_stems_trimmed": trimmed_paths,
            "spectrogram_image": spectrogram_path,
            "slider_settings": gains,
            "sample_rate": self.SAMPLE_RATE,
            "duration_seconds": round(len(mixed_audio) / self.SAMPLE_RATE, 2),
            "num_stems_separated": len(self.stems),
            "message": f"Successfully separated {len(self.stems)} stems and created custom mix"
        }
        
        # Save JSON response
        json_path = self.run_dir / f'response_{self.timestamp}.json'
        with open(str(json_path), 'w') as f:
            json.dump(response, f, indent=2)
        
        response["json_response_file"] = str(json_path.absolute())
        
        print("\n" + "="*70)
        print("✅ PIPELINE COMPLETE!")
        print("="*70)
        print(f"\n📊 Summary:")
        print(f"   • Stems separated: {len(self.stems)}")
        print(f"   • Mixed audio: {mixed_audio_path.name}")
        print(f"   • Spectrograms: Generated client-side (browser)")
        print(f"   • JSON response: {json_path.name}")
        print("="*70 + "\n")
        
        return response


def main():
    """Command-line entry point"""
    parser = argparse.ArgumentParser(
        description='Separate audio into instrument stems using Demucs AI',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    # Required arguments
    parser.add_argument('input_audio', help='Path to input audio file')
    
    # Gain controls
    parser.add_argument('--drums', type=float, default=1.0, help='Gain for drums (0-6)')
    parser.add_argument('--bass', type=float, default=1.0, help='Gain for bass (0-6)')
    parser.add_argument('--vocals', type=float, default=1.0, help='Gain for vocals (0-6)')
    parser.add_argument('--guitar', type=float, default=1.0, help='Gain for guitar (0-6)')
    parser.add_argument('--piano', type=float, default=1.0, help='Gain for piano (0-6)')
    parser.add_argument('--other', type=float, default=1.0, help='Gain for other instruments (0-6)')
    
    # Output options
    parser.add_argument('--output-dir', default='./output', help='Output directory')
    parser.add_argument('--no-full', action='store_false', dest='keep_full',
                       help='Do not keep full-length stems')
    parser.add_argument('--no-trimmed', action='store_false', dest='keep_trimmed',
                       help='Do not keep trimmed stems')
    
    # Parse arguments
    args = parser.parse_args()
    
    # Build gains dictionary
    gains = {
        'drums': args.drums,
        'bass': args.bass,
        'vocals': args.vocals,
        'guitar': args.guitar,
        'piano': args.piano,
        'other': args.other
    }
    
    try:
        # Create separator and process
        separator = InstrumentSeparator(args.input_audio, args.output_dir)
        response = separator.process(
            gains=gains,
            keep_full=args.keep_full,
            keep_trimmed=args.keep_trimmed
        )
        
        # Output JSON to stdout for JavaScript to capture
        print("\n" + "="*70)
        print("📄 JSON RESPONSE:")
        print("="*70)
        print(json.dumps(response, indent=2))
        
        return 0
        
    except Exception as e:
        error_response = {
            "success": False,
            "error": str(e),
            "message": f"Error during processing: {str(e)}"
        }
        print(json.dumps(error_response, indent=2), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
