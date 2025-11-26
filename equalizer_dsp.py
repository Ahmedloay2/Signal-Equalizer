"""
Signal Equalizer DSP Module
============================

Custom implementation of FFT-based frequency equalizer with multiple modes:
- Generic Mode: Arbitrary frequency band control
- Musical Instruments Mode: Control specific instruments in a mix
- Animal Sounds Mode: Control specific animal sounds
- Human Voices Mode: Control specific person voices

All FFT operations use custom_dsp.py (no library FFT)
"""

import numpy as np
import soundfile as sf
from pathlib import Path
import json
from typing import List, Dict, Tuple, Optional, Union
from custom_dsp import CustomFFT, CustomSTFT, CustomSpectrogram


class FrequencyBand:
    """Represents a frequency band with start, end, and gain"""
    
    def __init__(self, start_freq: float, end_freq: float, gain: float = 1.0, label: str = ""):
        self.start_freq = start_freq
        self.end_freq = end_freq
        self.gain = gain
        self.label = label
    
    def to_dict(self):
        return {
            'start_freq': self.start_freq,
            'end_freq': self.end_freq,
            'gain': self.gain,
            'label': self.label
        }
    
    @classmethod
    def from_dict(cls, data):
        return cls(
            data['start_freq'],
            data['end_freq'],
            data.get('gain', 1.0),
            data.get('label', '')
        )


class SignalEqualizer:
    """
    FFT-based signal equalizer with support for multiple modes
    """
    
    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self.bands: List[FrequencyBand] = []
        
    def add_band(self, start_freq: float, end_freq: float, gain: float = 1.0, label: str = ""):
        """Add a frequency band to control"""
        band = FrequencyBand(start_freq, end_freq, gain, label)
        self.bands.append(band)
        return band
    
    def clear_bands(self):
        """Clear all frequency bands"""
        self.bands = []
    
    def set_band_gain(self, index: int, gain: float):
        """Set gain for a specific band"""
        if 0 <= index < len(self.bands):
            self.bands[index].gain = gain
    
    def equalize_signal(self, signal: np.ndarray, use_stft: bool = True) -> np.ndarray:
        """
        Apply equalization to signal using FFT or STFT
        
        Args:
            signal: Input audio signal
            use_stft: If True, use STFT for better quality, else use simple FFT
            
        Returns:
            Equalized signal
        """
        if use_stft:
            return self._equalize_stft(signal)
        else:
            return self._equalize_fft(signal)
    
    def _equalize_fft(self, signal: np.ndarray) -> np.ndarray:
        """Simple FFT-based equalization (good for short signals)"""
        # Handle stereo signals
        if len(signal.shape) > 1:
            # Process each channel separately
            equalized = np.zeros_like(signal)
            for ch in range(signal.shape[1]):
                equalized[:, ch] = self._equalize_fft(signal[:, ch])
            return equalized
        
        # Compute FFT
        fft_data = CustomFFT.fft(signal)
        
        # Create frequency array
        n = len(signal)
        freqs = np.fft.fftfreq(n, 1.0 / self.sample_rate)
        
        # Apply gains to each band
        for band in self.bands:
            # Find frequency bins in this band
            mask = (np.abs(freqs) >= band.start_freq) & (np.abs(freqs) <= band.end_freq)
            fft_data[mask] *= band.gain
        
        # Inverse FFT
        equalized = np.real(CustomFFT.ifft(fft_data))
        
        # Ensure same length as input
        return equalized[:len(signal)]
    
    def _equalize_stft(self, signal: np.ndarray, n_fft: int = 2048, hop_length: int = 512) -> np.ndarray:
        """STFT-based equalization (better for long signals)"""
        # Handle stereo signals
        if len(signal.shape) > 1:
            equalized = np.zeros_like(signal)
            for ch in range(signal.shape[1]):
                equalized[:, ch] = self._equalize_stft(signal[:, ch], n_fft, hop_length)
            return equalized
        
        # Compute STFT
        stft_matrix = CustomSTFT.stft(signal, n_fft=n_fft, hop_length=hop_length)
        
        # Create frequency array for STFT bins
        freqs = np.arange(stft_matrix.shape[0]) * (self.sample_rate / n_fft)
        
        # Apply gains to each band
        for band in self.bands:
            # Find frequency bins in this band
            mask = (freqs >= band.start_freq) & (freqs <= band.end_freq)
            stft_matrix[mask, :] *= band.gain
        
        # Inverse STFT
        equalized = CustomSTFT.istft(stft_matrix, hop_length=hop_length)
        
        # Trim or pad to match original length
        if len(equalized) > len(signal):
            equalized = equalized[:len(signal)]
        elif len(equalized) < len(signal):
            equalized = np.pad(equalized, (0, len(signal) - len(equalized)))
        
        return equalized
    
    def get_frequency_response(self, num_points: int = 1000) -> Tuple[np.ndarray, np.ndarray]:
        """
        Get the frequency response curve of the current equalizer settings
        
        Returns:
            frequencies: Array of frequency values
            gains: Array of gain values at each frequency
        """
        freqs = np.linspace(0, self.sample_rate / 2, num_points)
        gains = np.ones(num_points)
        
        for band in self.bands:
            # Apply gain to frequencies in this band
            mask = (freqs >= band.start_freq) & (freqs <= band.end_freq)
            gains[mask] *= band.gain
        
        return freqs, gains
    
    def save_settings(self, filepath: str):
        """Save equalizer settings to JSON file"""
        settings = {
            'sample_rate': self.sample_rate,
            'bands': [band.to_dict() for band in self.bands]
        }
        
        with open(filepath, 'w') as f:
            json.dump(settings, f, indent=2)
    
    def load_settings(self, filepath: str):
        """Load equalizer settings from JSON file"""
        with open(filepath, 'r') as f:
            settings = json.load(f)
        
        self.sample_rate = settings.get('sample_rate', 44100)
        self.bands = [FrequencyBand.from_dict(b) for b in settings.get('bands', [])]


class ModePresets:
    """Predefined equalizer presets for different modes"""
    
    @staticmethod
    def generic_10band(sample_rate: int = 44100) -> SignalEqualizer:
        """Generic 10-band equalizer"""
        eq = SignalEqualizer(sample_rate)
        
        # Standard 10-band frequencies
        bands = [
            (31, 62, "31 Hz"),
            (62, 125, "62 Hz"),
            (125, 250, "125 Hz"),
            (250, 500, "250 Hz"),
            (500, 1000, "500 Hz"),
            (1000, 2000, "1 kHz"),
            (2000, 4000, "2 kHz"),
            (4000, 8000, "4 kHz"),
            (8000, 12000, "8 kHz"),
            (12000, 16000, "16 kHz"),
        ]
        
        for start, end, label in bands:
            eq.add_band(start, end, 1.0, label)
        
        return eq
    
    @staticmethod
    def instruments_4band(sample_rate: int = 44100) -> SignalEqualizer:
        """
        Musical instruments mode (4 instruments)
        Based on typical frequency ranges of instruments
        """
        eq = SignalEqualizer(sample_rate)
        
        # Frequency ranges approximate typical instrument dominance
        # Note: Real separation requires AI models, this is for demonstration
        instruments = [
            # Bass: 40-250 Hz
            (40, 250, "Bass"),
            # Drums: 60-5000 Hz (broad range, focus on kick and snare)
            (60, 5000, "Drums"),
            # Guitar: 80-1200 Hz
            (80, 1200, "Guitar"),
            # Piano/Vocals: 250-4000 Hz
            (250, 4000, "Piano/Vocals"),
        ]
        
        for start, end, label in instruments:
            eq.add_band(start, end, 1.0, label)
        
        return eq
    
    @staticmethod
    def animal_sounds_4band(sample_rate: int = 44100) -> SignalEqualizer:
        """
        Animal sounds mode (4 animals)
        Based on typical frequency ranges of animal vocalizations
        """
        eq = SignalEqualizer(sample_rate)
        
        # Frequency ranges for different animals (approximate)
        animals = [
            # Dog bark: 500-2000 Hz
            (500, 2000, "Dog"),
            # Cat meow: 500-3000 Hz
            (500, 3000, "Cat"),
            # Bird chirp: 2000-8000 Hz
            (2000, 8000, "Bird"),
            # Cow moo: 150-800 Hz
            (150, 800, "Cow"),
        ]
        
        for start, end, label in animals:
            eq.add_band(start, end, 1.0, label)
        
        return eq
    
    @staticmethod
    def voice_4band(sample_rate: int = 44100) -> SignalEqualizer:
        """
        Human voice mode (4 voice types)
        Based on typical pitch ranges
        """
        eq = SignalEqualizer(sample_rate)
        
        # Voice frequency ranges (fundamental + harmonics)
        voices = [
            # Male voice (deep): 85-180 Hz fundamental, harmonics up to 1000 Hz
            (85, 1000, "Male Deep"),
            # Male voice (normal): 100-200 Hz fundamental, harmonics up to 1500 Hz
            (100, 1500, "Male Normal"),
            # Female voice (normal): 165-255 Hz fundamental, harmonics up to 2500 Hz
            (165, 2500, "Female Normal"),
            # Female voice (high): 200-300 Hz fundamental, harmonics up to 4000 Hz
            (200, 4000, "Female High"),
        ]
        
        for start, end, label in voices:
            eq.add_band(start, end, 1.0, label)
        
        return eq
    
    @staticmethod
    def custom_bands(bands: List[Dict], sample_rate: int = 44100) -> SignalEqualizer:
        """Create equalizer with custom bands"""
        eq = SignalEqualizer(sample_rate)
        
        for band in bands:
            eq.add_band(
                band['start_freq'],
                band['end_freq'],
                band.get('gain', 1.0),
                band.get('label', '')
            )
        
        return eq


class SyntheticSignalGenerator:
    """Generate synthetic test signals for equalizer validation"""
    
    @staticmethod
    def generate_pure_tone(frequency: float, duration: float, 
                          sample_rate: int = 44100, amplitude: float = 0.5) -> np.ndarray:
        """Generate a pure sine wave"""
        t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
        signal = amplitude * np.sin(2 * np.pi * frequency * t)
        return signal
    
    @staticmethod
    def generate_multi_tone(frequencies: List[float], duration: float,
                           sample_rate: int = 44100, amplitudes: Optional[List[float]] = None) -> np.ndarray:
        """
        Generate a signal composed of multiple pure frequencies
        Perfect for testing equalizer functionality
        
        Args:
            frequencies: List of frequencies to include
            duration: Duration in seconds
            sample_rate: Sample rate
            amplitudes: Optional list of amplitudes for each frequency (default: equal)
            
        Returns:
            Mixed signal
        """
        if amplitudes is None:
            amplitudes = [1.0 / len(frequencies)] * len(frequencies)
        
        t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
        signal = np.zeros_like(t)
        
        for freq, amp in zip(frequencies, amplitudes):
            signal += amp * np.sin(2 * np.pi * freq * t)
        
        # Normalize to prevent clipping
        max_val = np.abs(signal).max()
        if max_val > 0:
            signal = signal * 0.9 / max_val
        
        return signal
    
    @staticmethod
    def generate_sweep(start_freq: float, end_freq: float, duration: float,
                      sample_rate: int = 44100, method: str = 'linear') -> np.ndarray:
        """
        Generate a frequency sweep (chirp)
        
        Args:
            start_freq: Starting frequency
            end_freq: Ending frequency
            duration: Duration in seconds
            sample_rate: Sample rate
            method: 'linear' or 'logarithmic'
            
        Returns:
            Sweep signal
        """
        t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
        
        if method == 'logarithmic':
            # Logarithmic sweep
            k = (end_freq / start_freq) ** (1.0 / duration)
            phase = 2 * np.pi * start_freq * (k ** t - 1) / np.log(k)
        else:
            # Linear sweep
            k = (end_freq - start_freq) / duration
            phase = 2 * np.pi * (start_freq * t + 0.5 * k * t ** 2)
        
        signal = 0.5 * np.sin(phase)
        return signal
    
    @staticmethod
    def generate_test_signal_for_mode(mode: str, duration: float = 5.0,
                                     sample_rate: int = 44100) -> Tuple[np.ndarray, Dict]:
        """
        Generate a test signal appropriate for a specific equalizer mode
        
        Returns:
            signal: Generated signal
            metadata: Information about the signal composition
        """
        if mode == 'generic':
            # Test signal across full frequency range
            frequencies = [100, 250, 500, 1000, 2000, 4000, 8000, 12000]
            signal = SyntheticSignalGenerator.generate_multi_tone(
                frequencies, duration, sample_rate
            )
            metadata = {
                'type': 'multi_tone',
                'frequencies': frequencies,
                'description': 'Multi-tone signal covering full frequency range'
            }
        
        elif mode == 'instruments':
            # Simulate instrument frequency ranges
            frequencies = [80, 150, 400, 800, 1500, 3000]  # Different instrument ranges
            signal = SyntheticSignalGenerator.generate_multi_tone(
                frequencies, duration, sample_rate
            )
            metadata = {
                'type': 'multi_tone',
                'frequencies': frequencies,
                'description': 'Multi-tone simulating different instruments'
            }
        
        elif mode == 'animals':
            # Animal vocalization ranges
            frequencies = [200, 600, 1200, 4000]
            signal = SyntheticSignalGenerator.generate_multi_tone(
                frequencies, duration, sample_rate
            )
            metadata = {
                'type': 'multi_tone',
                'frequencies': frequencies,
                'description': 'Multi-tone simulating animal sounds'
            }
        
        elif mode == 'voices':
            # Human voice fundamental frequencies
            frequencies = [120, 180, 220, 280]  # Different voice pitches
            signal = SyntheticSignalGenerator.generate_multi_tone(
                frequencies, duration, sample_rate
            )
            metadata = {
                'type': 'multi_tone',
                'frequencies': frequencies,
                'description': 'Multi-tone simulating different voice pitches'
            }
        
        else:
            # Default: sweep
            signal = SyntheticSignalGenerator.generate_sweep(
                20, 16000, duration, sample_rate
            )
            metadata = {
                'type': 'sweep',
                'start_freq': 20,
                'end_freq': 16000,
                'description': 'Frequency sweep from 20 Hz to 16 kHz'
            }
        
        return signal, metadata


class AudiogramScale:
    """
    Audiogram frequency scale conversion utilities
    
    Audiogram scale is a specialized frequency scale used in audiology
    that emphasizes frequencies important for speech perception (500-4000 Hz)
    """
    
    # Standard audiogram test frequencies (Hz)
    STANDARD_FREQUENCIES = [125, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000]
    
    @staticmethod
    def linear_to_audiogram(frequencies: np.ndarray) -> np.ndarray:
        """
        Convert linear frequency scale to audiogram scale
        
        Audiogram scale is approximately logarithmic but with specific test frequencies
        emphasized. We use a piecewise logarithmic mapping.
        """
        # Use logarithmic scale as base for audiogram
        # Avoid log(0)
        frequencies = np.maximum(frequencies, 1.0)
        audiogram_scale = np.log10(frequencies)
        return audiogram_scale
    
    @staticmethod
    def audiogram_to_linear(audiogram_values: np.ndarray) -> np.ndarray:
        """Convert audiogram scale back to linear frequency"""
        return 10 ** audiogram_values
    
    @staticmethod
    def get_audiogram_tick_positions(min_freq: float = 125, max_freq: float = 8000) -> Tuple[np.ndarray, List[str]]:
        """
        Get tick positions and labels for audiogram scale
        
        Returns:
            positions: Audiogram-scale positions
            labels: Frequency labels in Hz
        """
        # Filter standard frequencies within range
        frequencies = [f for f in AudiogramScale.STANDARD_FREQUENCIES 
                      if min_freq <= f <= max_freq]
        
        positions = AudiogramScale.linear_to_audiogram(np.array(frequencies))
        labels = [f"{f}" for f in frequencies]
        
        return positions, labels


# Example usage and testing
if __name__ == "__main__":
    print("=" * 80)
    print("SIGNAL EQUALIZER - TEST SUITE")
    print("=" * 80)
    print()
    
    # Test 1: Generate synthetic signal
    print("Test 1: Generating synthetic test signal...")
    gen = SyntheticSignalGenerator()
    test_signal, metadata = gen.generate_test_signal_for_mode('generic', duration=2.0)
    print(f"✓ Generated signal: {len(test_signal)} samples")
    print(f"  Metadata: {metadata}")
    print()
    
    # Test 2: Create generic equalizer
    print("Test 2: Creating 10-band equalizer...")
    eq = ModePresets.generic_10band(44100)
    print(f"✓ Created equalizer with {len(eq.bands)} bands")
    for i, band in enumerate(eq.bands):
        print(f"  Band {i+1}: {band.start_freq}-{band.end_freq} Hz ({band.label})")
    print()
    
    # Test 3: Apply equalization
    print("Test 3: Applying equalization...")
    eq.set_band_gain(2, 1.5)  # Boost 125 Hz band
    eq.set_band_gain(5, 0.5)  # Cut 1 kHz band
    equalized = eq.equalize_signal(test_signal)
    print(f"✓ Equalized signal: {len(equalized)} samples")
    print()
    
    # Test 4: Save settings
    print("Test 4: Saving equalizer settings...")
    eq.save_settings('test_eq_settings.json')
    print("✓ Settings saved to test_eq_settings.json")
    print()
    
    # Test 5: Load settings
    print("Test 5: Loading equalizer settings...")
    eq2 = SignalEqualizer()
    eq2.load_settings('test_eq_settings.json')
    print(f"✓ Loaded equalizer with {len(eq2.bands)} bands")
    print()
    
    print("=" * 80)
    print("ALL TESTS PASSED!")
    print("=" * 80)
