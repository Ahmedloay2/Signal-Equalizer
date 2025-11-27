"""
Voice Separation Module using Multi-Decoder-DPRNN
Separates audio into multiple human voice sources
"""

import torch
import torchaudio
import numpy as np
import soundfile as sf
from pathlib import Path
import sys
import os
from typing import Dict, List, Optional, Callable
import warnings

warnings.filterwarnings('ignore')

# Add asteroid paths
ASTEROID_ROOT = Path(__file__).parent / 'asteroid'
ASTEROID_MODEL_PATH = ASTEROID_ROOT / 'egs' / 'wsj0-mix-var' / 'Multi-Decoder-DPRNN'

class VoiceSeparator:
    """
    Separates mixed audio into individual human voice sources using Multi-Decoder-DPRNN
    """
    
    def __init__(self, audio_path: str, output_dir: str):
        """
        Initialize the voice separator
        
        Args:
            audio_path: Path to input audio file
            output_dir: Directory to save separated voices
        """
        self.audio_path = Path(audio_path)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        self.model = None
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.sample_rate = None
        self.mixture = None
        
        print(f"🎤 Voice Separator initialized")
        print(f"📁 Input: {self.audio_path}")
        print(f"📂 Output: {self.output_dir}")
        print(f"💻 Device: {self.device}")
    
    def load_model(self, progress_callback: Optional[Callable] = None):
        """Load the Multi-Decoder-DPRNN model"""
        try:
            if progress_callback:
                progress_callback('loading_model', 0.1, 'Loading voice separation model...')
            
            print("📥 Loading Multi-Decoder-DPRNN model...")
            
            # Setup torch serialization for safe loading
            import torch.serialization
            try:
                from pytorch_lightning.callbacks import ModelCheckpoint, EarlyStopping
                torch.serialization.add_safe_globals([ModelCheckpoint, EarlyStopping])
                print("✅ PyTorch Lightning callbacks registered for safe loading")
            except Exception as e:
                print(f"⚠️  Warning setting up torch serialization: {e}")
            
            # Method 1: Try loading from local cloned asteroid repository
            if ASTEROID_MODEL_PATH.exists():
                print(f"🔍 Found local asteroid model at: {ASTEROID_MODEL_PATH}")
                
                # Add both the root asteroid and model path to sys.path
                if str(ASTEROID_ROOT) not in sys.path:
                    sys.path.insert(0, str(ASTEROID_ROOT))
                    print(f"✅ Added asteroid root to path: {ASTEROID_ROOT}")
                    
                if str(ASTEROID_MODEL_PATH) not in sys.path:
                    sys.path.insert(0, str(ASTEROID_MODEL_PATH))
                    print(f"✅ Added model path to path: {ASTEROID_MODEL_PATH}")
                
                try:
                    # Import the model from local repository
                    from model import MultiDecoderDPRNN
                    
                    if progress_callback:
                        progress_callback('loading_model', 0.3, 'Downloading pretrained weights from HuggingFace...')
                    
                    # Load pretrained weights from HuggingFace
                    print("📥 Downloading pretrained weights from HuggingFace Hub...")
                    print("    Model: JunzheJosephZhu/MultiDecoderDPRNN")
                    
                    self.model = MultiDecoderDPRNN.from_pretrained(
                        "JunzheJosephZhu/MultiDecoderDPRNN"
                    )
                    
                    print("✅ Model loaded successfully from local asteroid repository")
                    
                except Exception as e:
                    print(f"❌ Failed to load model: {e}")
                    import traceback
                    traceback.print_exc()
                    raise Exception(
                        f"Failed to load MultiDecoderDPRNN model.\n"
                        f"Error: {e}\n"
                        f"Make sure:\n"
                        f"1. Internet connection is available to download weights\n"
                        f"2. PyTorch and asteroid are properly installed\n"
                        f"3. HuggingFace model 'JunzheJosephZhu/MultiDecoderDPRNN' is accessible"
                    )
            else:
                raise Exception(
                    f"❌ Local asteroid repository not found at: {ASTEROID_MODEL_PATH}\n"
                    f"Expected path: {ASTEROID_ROOT}\n"
                    f"Please ensure the asteroid repository is cloned to the project root."
                )
            
            # Set to eval mode and move to device
            self.model = self.model.eval()
            self.model = self.model.to(self.device)
            
            if progress_callback:
                progress_callback('model_loaded', 0.4, 'Model loaded successfully')
            
            print(f"✅ Model ready on {self.device}")
            
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            import traceback
            traceback.print_exc()
            raise
    
    def load_audio(self, progress_callback: Optional[Callable] = None):
        """Load and prepare audio for separation"""
        try:
            if progress_callback:
                progress_callback('loading_audio', 0.45, 'Loading audio file...')
            
            print(f"📂 Loading audio: {self.audio_path}")
            
            # Load audio
            self.mixture, self.sample_rate = torchaudio.load(str(self.audio_path))
            
            print(f"   Shape: {self.mixture.shape}")
            print(f"   Sample rate: {self.sample_rate}Hz")
            
            # Convert stereo to mono if needed (take mean of channels)
            if self.mixture.shape[0] > 1:
                print(f"   Converting stereo to mono...")
                self.mixture = self.mixture.mean(dim=0, keepdim=True)
            
            # Move to device
            self.mixture = self.mixture.to(self.device)
            
            duration = self.mixture.shape[1] / self.sample_rate
            
            if progress_callback:
                progress_callback('audio_loaded', 0.5, f'Audio loaded: {duration:.1f}s')
            
            print(f"✅ Audio loaded: {self.mixture.shape}, {self.sample_rate}Hz, {duration:.1f}s")
            
        except Exception as e:
            print(f"❌ Error loading audio: {e}")
            import traceback
            traceback.print_exc()
            raise
    
    def separate(self, progress_callback: Optional[Callable] = None) -> torch.Tensor:
        """
        Separate voices from the mixture
        
        Returns:
            Tensor of separated voice sources [num_sources, channels, samples]
        """
        try:
            if progress_callback:
                progress_callback('separating', 0.6, 'Separating voices (this may take a while)...')
            
            print(f"🔄 Starting voice separation...")
            print(f"   Input shape: {self.mixture.shape}")
            
            with torch.no_grad():
                sources_est = self.model.separate(self.mixture).cpu()
            
            print(f"   Output shape: {sources_est.shape}")
            print(f"   Number of sources: {len(sources_est)}")
            
            if progress_callback:
                progress_callback('separated', 0.8, f'Separated into {len(sources_est)} voices')
            
            print(f"✅ Separated into {len(sources_est)} voice sources")
            
            return sources_est
            
        except Exception as e:
            print(f"❌ Error during separation: {e}")
            import traceback
            traceback.print_exc()
            raise
    
    def save_sources(
        self, 
        sources: torch.Tensor, 
        gains: Optional[Dict[int, float]] = None,
        progress_callback: Optional[Callable] = None
    ) -> Dict[str, any]:
        """
        Save separated sources to files
        
        Args:
            sources: Separated voice sources
            gains: Optional gain adjustments per source {source_index: gain}
            progress_callback: Optional callback for progress updates
            
        Returns:
            Dictionary with file paths and metadata
        """
        try:
            if progress_callback:
                progress_callback('saving', 0.85, 'Saving separated voices...')
            
            if gains is None:
                gains = {}
            
            # Create output subdirectory with timestamp
            import time
            timestamp = int(time.time())
            session_dir = self.output_dir / f"voices_{timestamp}"
            session_dir.mkdir(parents=True, exist_ok=True)
            
            print(f"💾 Saving to: {session_dir}")
            
            results = {
                'success': True,
                'session_dir': str(session_dir.relative_to(self.output_dir)),
                'sources': [],
                'num_sources': len(sources),
                'sample_rate': self.sample_rate
            }
            
            # Save individual sources (only those with signal)
            for i, source in enumerate(sources):
                source_name = f"voice_{i+1}"
                
                # Apply gain if specified
                gain = gains.get(i, 1.0)
                source_audio = source.numpy() * gain
                
                # Check if source has signal (RMS threshold)
                rms = np.sqrt(np.mean(source_audio ** 2))
                if rms < 0.001:  # Threshold for "has signal"
                    print(f"   ⏭️  Skipped: {source_name} (no signal, RMS: {rms:.4f})")
                    continue
                
                output_path = session_dir / f"{source_name}.wav"
                
                # Ensure correct shape for soundfile (samples, channels)
                if source_audio.ndim == 1:
                    source_audio = source_audio.reshape(-1, 1)
                elif source_audio.ndim == 2 and source_audio.shape[0] < source_audio.shape[1]:
                    # If shape is (channels, samples), transpose to (samples, channels)
                    source_audio = source_audio.T
                
                # Clip to prevent distortion
                source_audio = np.clip(source_audio, -1.0, 1.0)
                
                # Save
                sf.write(
                    str(output_path),
                    source_audio,
                    self.sample_rate,
                    subtype='PCM_16'
                )
                
                file_size = output_path.stat().st_size / (1024 * 1024)  # MB
                
                results['sources'].append({
                    'index': i,
                    'name': source_name,
                    'file': f"voices_{timestamp}/{source_name}.wav",
                    'gain': gain,
                    'size_mb': round(file_size, 2)
                })
                
                print(f"   ✅ Saved: {source_name}.wav (gain: {gain:.2f}, RMS: {rms:.4f}, size: {file_size:.2f}MB)")
            
            # Save mixture with gains applied
            if len(sources) > 0:
                print(f"🎛️  Creating mixed output...")
                mixed_audio = np.zeros_like(sources[0].numpy())
                
                for i, source in enumerate(sources):
                    gain = gains.get(i, 1.0)
                    mixed_audio += source.numpy() * gain
                
                # Normalize to prevent clipping
                max_val = np.abs(mixed_audio).max()
                if max_val > 0.99:
                    mixed_audio = mixed_audio * (0.99 / max_val)
                    print(f"   Normalized by {0.99/max_val:.3f} to prevent clipping")
                
                # Ensure correct shape
                if mixed_audio.ndim == 1:
                    mixed_audio = mixed_audio.reshape(-1, 1)
                elif mixed_audio.ndim == 2 and mixed_audio.shape[0] < mixed_audio.shape[1]:
                    mixed_audio = mixed_audio.T
                
                mixed_path = session_dir / "mixed.wav"
                sf.write(
                    str(mixed_path),
                    mixed_audio,
                    self.sample_rate,
                    subtype='PCM_16'
                )
                
                mixed_size = mixed_path.stat().st_size / (1024 * 1024)
                results['mixed_file'] = f"voices_{timestamp}/mixed.wav"
                results['mixed_size_mb'] = round(mixed_size, 2)
                
                print(f"   ✓ mixed.wav (size: {mixed_size:.2f}MB)")
            
            # Add separated_sources list with absolute paths for backend compatibility
            results['separated_sources'] = []
            for source_info in results['sources']:
                abs_path = session_dir / f"{source_info['name']}.wav"
                results['separated_sources'].append(str(abs_path.absolute()))
            
            if progress_callback:
                progress_callback('complete', 1.0, 'Voice separation complete!')
            
            print(f"✅ Saved {len(results['sources'])} voices with signal to {session_dir}")
            
            return results
            
        except Exception as e:
            print(f"❌ Error saving sources: {e}")
            import traceback
            traceback.print_exc()
            raise
    
    def process(
        self,
        gains: Optional[Dict[int, float]] = None,
        progress_callback: Optional[Callable] = None
    ) -> Dict[str, any]:
        """
        Complete processing pipeline
        
        Args:
            gains: Optional gain adjustments per source
            progress_callback: Optional callback for progress updates
            
        Returns:
            Dictionary with results and file paths
        """
        try:
            print("\n" + "="*60)
            print("🎤 VOICE SEPARATION PIPELINE")
            print("="*60)
            
            # Load model
            print("\n📦 Step 1: Loading Model")
            self.load_model(progress_callback)
            
            # Load audio
            print("\n📂 Step 2: Loading Audio")
            self.load_audio(progress_callback)
            
            # Separate
            print("\n🔄 Step 3: Separating Voices")
            sources = self.separate(progress_callback)
            
            # Save
            print("\n💾 Step 4: Saving Results")
            results = self.save_sources(sources, gains, progress_callback)
            
            print("\n" + "="*60)
            print("✅ VOICE SEPARATION COMPLETE")
            print("="*60)
            print(f"Session: {results['session_dir']}")
            print(f"Voices: {results['num_sources']}")
            print(f"Sample Rate: {results['sample_rate']}Hz")
            print("="*60 + "\n")
            
            return results
            
        except Exception as e:
            print(f"\n❌ Processing error: {e}")
            import traceback
            traceback.print_exc()
            raise


def test_voice_separation():
    """Test the voice separator with a sample file"""
    import tempfile
    import urllib.request
    
    print("\n" + "="*60)
    print("🧪 VOICE SEPARATOR TEST")
    print("="*60 + "\n")
    
    try:
        # Download test file
        print("📥 Downloading test file...")
        test_url = "https://josephzhu.com/Multi-Decoder-DPRNN/examples/4_mixture.wav"
        
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            urllib.request.urlretrieve(test_url, tmp.name)
            test_file = tmp.name
        
        print(f"✅ Downloaded to: {test_file}\n")
        
        # Create separator
        output_dir = "./test_voice_output"
        separator = VoiceSeparator(test_file, output_dir)
        
        # Process
        results = separator.process()
        
        print("\n" + "="*60)
        print("✅ TEST COMPLETE!")
        print("="*60)
        print(f"\n📂 Output directory: {results['session_dir']}")
        print(f"🎤 Number of voices: {results['num_sources']}")
        print(f"📊 Sample rate: {results['sample_rate']}Hz")
        print(f"\n📋 Separated voices:")
        for source in results['sources']:
            print(f"   • {source['name']}: {source['file']} ({source['size_mb']}MB)")
        print(f"\n🎵 Mixed file: {results['mixed_file']} ({results['mixed_size_mb']}MB)")
        print("\n" + "="*60 + "\n")
        
        # Cleanup
        os.unlink(test_file)
        
        return results
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == '__main__':
    print("""
    ╔══════════════════════════════════════════════════════════╗
    ║         VOICE SEPARATION MODULE - TEST MODE              ║
    ╚══════════════════════════════════════════════════════════╝
    
    This module separates mixed audio into individual voices
    using the Multi-Decoder-DPRNN model.
    
    Requirements:
    - torch, torchaudio
    - asteroid, pytorch-lightning
    - soundfile, numpy
    - asteroid repository cloned in ./asteroid/
    
    """)
    
    test_voice_separation()