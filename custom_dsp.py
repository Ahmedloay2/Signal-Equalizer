import numpy as np
from typing import Tuple, Union

class FFT:
    def __init__(self):
        """Initialize FFT with twiddle factor cache"""
        self._twiddle_cache = {}
    
    def _get_twiddle_factors(self, n: int) -> Tuple[np.ndarray, np.ndarray]:
        """
        Get or create twiddle factors for a given FFT size
        Twiddle factors are pre-computed e^(-2πi*k/N) values
        
        Args:
            n: FFT size
            
        Returns:
            Tuple of (cos_table, sin_table)
        """
        if n in self._twiddle_cache:
            return self._twiddle_cache[n]
        
        cos_table = np.zeros(n // 2, dtype=np.float32)
        sin_table = np.zeros(n // 2, dtype=np.float32)
        
        for i in range(n // 2):
            angle = -2 * np.pi * i / n
            cos_table[i] = np.cos(angle)
            sin_table[i] = np.sin(angle)
        
        self._twiddle_cache[n] = (cos_table, sin_table)
        return cos_table, sin_table
    
    def _bit_reversal_permutation(self, real: np.ndarray, imag: np.ndarray) -> None:
        """
        Bit-reversal permutation
        Rearranges array elements according to bit-reversed indices
        
        Args:
            real: Real part array (modified in-place)
            imag: Imaginary part array (modified in-place)
        """
        n = len(real)
        num_bits = int(np.log2(n))
        
        for i in range(n):
            # Compute bit-reversed index
            j = 0
            for bit in range(num_bits):
                j = (j << 1) | ((i >> bit) & 1)
            
            # Swap if i < j (to avoid double-swapping)
            if i < j:
                # Swap real parts
                real[i], real[j] = real[j], real[i]
                
                # Swap imaginary parts
                imag[i], imag[j] = imag[j], imag[i]
    
    def _fft_in_place(self, real: np.ndarray, imag: np.ndarray, inverse: bool = False) -> None:
        """
        In-place iterative Cooley-Tukey FFT
        
        Args:
            real: Real part of input signal (modified in-place)
            imag: Imaginary part of input signal (modified in-place)
            inverse: If True, compute IFFT instead of FFT
        """
        n = len(real)
        
        # Bit-reversal permutation
        self._bit_reversal_permutation(real, imag)
        
        # Get twiddle factors
        cos_table, sin_table = self._get_twiddle_factors(n)
        
        # Iterative FFT (Cooley-Tukey decimation-in-time)
        size = 2
        while size <= n:
            half_size = size // 2
            table_step = n // size
            
            for i in range(0, n, size):
                for j in range(half_size):
                    k = j * table_step
                    twiddle_cos = cos_table[k]
                    twiddle_sin = -sin_table[k] if inverse else sin_table[k]
                    
                    even_index = i + j
                    odd_index = i + j + half_size
                    
                    odd_real = real[odd_index]
                    odd_imag = imag[odd_index]
                    
                    # Complex multiplication: twiddle * odd
                    temp_real = twiddle_cos * odd_real - twiddle_sin * odd_imag
                    temp_imag = twiddle_cos * odd_imag + twiddle_sin * odd_real
                    
                    # Butterfly operation
                    real[odd_index] = real[even_index] - temp_real
                    imag[odd_index] = imag[even_index] - temp_imag
                    real[even_index] = real[even_index] + temp_real
                    imag[even_index] = imag[even_index] + temp_imag
            
            size *= 2
        
        # Scale for IFFT
        if inverse:
            real /= n
            imag /= n
    
    def fft(self, signal: Union[np.ndarray, list]) -> Tuple[np.ndarray, np.ndarray]:
        """
        Forward FFT - Optimized API
        
        Args:
            signal: Input signal (1D array or list)
            
        Returns:
            Tuple of (real, imag) frequency domain representation
        """
        # Convert to numpy array if needed
        if not isinstance(signal, np.ndarray):
            signal = np.array(signal, dtype=np.float32)
        elif signal.dtype != np.float32:
            signal = signal.astype(np.float32)
        
        n = len(signal)
        
        # Ensure power of 2
        fft_size = 2 ** int(np.ceil(np.log2(n)))
        
        # Allocate arrays
        real = np.zeros(fft_size, dtype=np.float32)
        imag = np.zeros(fft_size, dtype=np.float32)
        
        # Copy input signal (auto-pads with zeros if needed)
        real[:n] = signal
        
        # Perform FFT
        self._fft_in_place(real, imag, False)
        
        return real, imag
    
    def ifft(self, real: np.ndarray, imag: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        Inverse FFT - Optimized API
        
        Args:
            real: Real part of frequency domain
            imag: Imaginary part of frequency domain
            
        Returns:
            Tuple of (real, imag) time domain signal
        """
        # Create copies (IFFT modifies in-place)
        real_copy = real.copy()
        imag_copy = imag.copy()
        
        # Perform IFFT
        self._fft_in_place(real_copy, imag_copy, True)
        
        return real_copy, imag_copy
    
    def get_magnitude_spectrum(self, real: np.ndarray, imag: np.ndarray) -> np.ndarray:
        """
        Get magnitude spectrum from FFT output
        
        Args:
            real: Real part of FFT
            imag: Imaginary part of FFT
            
        Returns:
            Magnitude spectrum (only positive frequencies)
        """
        n = len(real)
        half_n = n // 2
        
        magnitudes = np.sqrt(real[:half_n]**2 + imag[:half_n]**2)
        
        return magnitudes
    
    def get_power_spectrum(self, real: np.ndarray, imag: np.ndarray) -> np.ndarray:
        """
        Get power spectrum from FFT output
        
        Args:
            real: Real part of FFT
            imag: Imaginary part of FFT
            
        Returns:
            Power spectrum (only positive frequencies)
        """
        magnitudes = self.get_magnitude_spectrum(real, imag)
        return magnitudes ** 2
    
    @staticmethod
    def get_frequency_bins(fft_size: int, sample_rate: float) -> np.ndarray:
        """
        Get frequency bins for FFT output
        
        Args:
            fft_size: FFT size
            sample_rate: Sample rate in Hz
            
        Returns:
            Array of frequency values
        """
        half_size = fft_size // 2
        bins = np.arange(half_size, dtype=np.float32) * sample_rate / fft_size
        
        return bins
    
    @staticmethod
    def apply_window(signal: Union[np.ndarray, list], 
                    window_type: str = 'hamming') -> np.ndarray:
        """
        Apply window function to signal
        
        Args:
            signal: Input signal
            window_type: Window type ('hamming', 'hann', 'blackman')
            
        Returns:
            Windowed signal
        """
        if not isinstance(signal, np.ndarray):
            signal = np.array(signal, dtype=np.float32)
        elif signal.dtype != np.float32:
            signal = signal.astype(np.float32)
        
        n = len(signal)
        
        if window_type == 'hamming':
            window = 0.54 - 0.46 * np.cos(2 * np.pi * np.arange(n) / (n - 1))
        elif window_type == 'hann':
            window = 0.5 * (1 - np.cos(2 * np.pi * np.arange(n) / (n - 1)))
        elif window_type == 'blackman':
            i = np.arange(n)
            window = (0.42 - 0.5 * np.cos(2 * np.pi * i / (n - 1)) +
                     0.08 * np.cos(4 * np.pi * i / (n - 1)))
        else:
            window = np.ones(n, dtype=np.float32)
        
        return signal * window
    
    @staticmethod
    def freq_to_audiogram_scale(freq: float) -> float:
        """
        Convert frequency to Audiogram scale (logarithmic scale)
        
        Args:
            freq: Frequency in Hz
            
        Returns:
            Audiogram scale value
        """
        return 1000 * np.log10(freq / 1000 + 1)
    
    @staticmethod
    def audiogram_scale_to_freq(audiogram: float) -> float:
        """
        Convert Audiogram scale to frequency
        
        Args:
            audiogram: Audiogram scale value
            
        Returns:
            Frequency in Hz
        """
        return 1000 * (10 ** (audiogram / 1000) - 1)


# Create a global FFT instance for reuse
_fft_instance = FFT()


class STFT:
    """
    Short-Time Fourier Transform implementation
    """
    
    @staticmethod
    def stft(x, n_fft=2048, hop_length=None, window='hann'):
        """
        Compute Short-Time Fourier Transform
        
        Args:
            x: Input signal
            n_fft: FFT size
            hop_length: Number of samples between frames
            window: Window function ('hann', 'hamming', 'blackman', None)
            
        Returns:
            Complex STFT matrix (freq_bins x time_frames)
        """
        if hop_length is None:
            hop_length = n_fft // 4
        
        x = np.asarray(x)
        n_samples = len(x)
        
        # Create window function
        if window == 'hann':
            win = 0.5 * (1 - np.cos(2 * np.pi * np.arange(n_fft) / (n_fft - 1)))
        elif window == 'hamming':
            win = 0.54 - 0.46 * np.cos(2 * np.pi * np.arange(n_fft) / (n_fft - 1))
        elif window == 'blackman':
            n = np.arange(n_fft)
            win = 0.42 - 0.5 * np.cos(2 * np.pi * n / (n_fft - 1)) + 0.08 * np.cos(4 * np.pi * n / (n_fft - 1))
        else:
            win = np.ones(n_fft)
        
        # Calculate number of frames
        n_frames = 1 + (n_samples - n_fft) // hop_length
        
        # Allocate output matrix
        n_freq_bins = n_fft // 2 + 1
        stft_matrix = np.zeros((n_freq_bins, n_frames), dtype=complex)
        
        # Compute STFT
        for frame_idx in range(n_frames):
            start = frame_idx * hop_length
            end = start + n_fft
            
            if end > n_samples:
                # Pad last frame if needed
                frame = np.pad(x[start:], (0, end - n_samples), mode='constant')
            else:
                frame = x[start:end]
            
            # Apply window
            windowed_frame = frame * win
            
            # Compute FFT of windowed frame using optimized FFT
            real, imag = _fft_instance.fft(windowed_frame)
            # Convert to complex and take only positive frequencies (rfft equivalent)
            fft_frame = real[:n_freq_bins] + 1j * imag[:n_freq_bins]
            stft_matrix[:, frame_idx] = fft_frame
        
        return stft_matrix
    
    @staticmethod
    def istft(stft_matrix, hop_length=None, window='hann'):
        """
        Inverse Short-Time Fourier Transform
        
        Args:
            stft_matrix: STFT matrix (freq_bins x time_frames)
            hop_length: Number of samples between frames
            window: Window function used in STFT
            
        Returns:
            Time-domain signal
        """
        n_freq_bins, n_frames = stft_matrix.shape
        n_fft = (n_freq_bins - 1) * 2
        
        if hop_length is None:
            hop_length = n_fft // 4
        
        # Create window
        if window == 'hann':
            win = 0.5 * (1 - np.cos(2 * np.pi * np.arange(n_fft) / (n_fft - 1)))
        elif window == 'hamming':
            win = 0.54 - 0.46 * np.cos(2 * np.pi * np.arange(n_fft) / (n_fft - 1))
        elif window == 'blackman':
            n = np.arange(n_fft)
            win = 0.42 - 0.5 * np.cos(2 * np.pi * n / (n_fft - 1)) + 0.08 * np.cos(4 * np.pi * n / (n_fft - 1))
        else:
            win = np.ones(n_fft)
        
        # Allocate output signal
        n_samples = n_fft + (n_frames - 1) * hop_length
        y = np.zeros(n_samples)
        window_sum = np.zeros(n_samples)
        
        # Overlap-add reconstruction
        for frame_idx in range(n_frames):
            start = frame_idx * hop_length
            
            # Reconstruct full FFT (mirror for negative frequencies)
            full_fft = np.concatenate([
                stft_matrix[:, frame_idx],
                np.conj(stft_matrix[-2:0:-1, frame_idx])
            ])
            
            # Inverse FFT using optimized FFT
            real_part = np.real(full_fft).astype(np.float32)
            imag_part = np.imag(full_fft).astype(np.float32)
            frame_real, frame_imag = _fft_instance.ifft(real_part, imag_part)
            frame = frame_real[:n_fft]
            
            # Apply window and add to output
            y[start:start + n_fft] += frame * win
            window_sum[start:start + n_fft] += win ** 2
        
        # Normalize by window overlap
        nonzero = window_sum > 1e-10
        y[nonzero] /= window_sum[nonzero]
        
        return y


class CustomSpectrogram:
    """
    Custom Spectrogram implementation
    """
    
    @staticmethod
    def compute_spectrogram(x, sample_rate, n_fft=2048, hop_length=None, 
                          window='hann', scale='magnitude'):
        """
        Compute spectrogram from audio signal
        
        Args:
            x: Input signal
            sample_rate: Sampling rate
            n_fft: FFT size
            hop_length: Hop length
            window: Window function
            scale: 'magnitude', 'power', or 'db'
            
        Returns:
            spectrogram: 2D array (freq_bins x time_frames)
            frequencies: Frequency values for each bin
            times: Time values for each frame
        """
        if hop_length is None:
            hop_length = n_fft // 4
        
        # Compute STFT
        stft_matrix = STFT.stft(x, n_fft=n_fft, hop_length=hop_length, window=window)
        
        # Compute magnitude
        magnitude = np.abs(stft_matrix)
        
        # Apply scaling
        if scale == 'power':
            spectrogram = magnitude ** 2
        elif scale == 'db':
            # Convert to dB (avoid log(0))
            magnitude = np.maximum(magnitude, 1e-10)
            max_val = np.max(magnitude)
            spectrogram = 20 * np.log10(magnitude / max_val)
        else:  # magnitude
            spectrogram = magnitude
        
        # Generate frequency and time axes
        frequencies = np.arange(n_fft // 2 + 1) * (sample_rate / n_fft)
        n_frames = stft_matrix.shape[1]
        times = np.arange(n_frames) * (hop_length / sample_rate)
        
        return spectrogram, frequencies, times
    
    @staticmethod
    def mel_filterbank(n_fft, n_mels, sample_rate, fmin=0, fmax=None):
        """
        Create mel-scale filterbank
        
        Args:
            n_fft: FFT size
            n_mels: Number of mel bands
            sample_rate: Sampling rate
            fmin: Minimum frequency
            fmax: Maximum frequency
            
        Returns:
            Mel filterbank matrix
        """
        if fmax is None:
            fmax = sample_rate / 2
        
        # Mel scale conversion functions
        def hz_to_mel(f):
            return 2595 * np.log10(1 + f / 700)
        
        def mel_to_hz(m):
            return 700 * (10 ** (m / 2595) - 1)
        
        # Create mel-spaced frequencies
        mel_min = hz_to_mel(fmin)
        mel_max = hz_to_mel(fmax)
        mel_points = np.linspace(mel_min, mel_max, n_mels + 2)
        hz_points = mel_to_hz(mel_points)
        
        # Convert to FFT bin numbers
        bin_points = np.floor((n_fft + 1) * hz_points / sample_rate).astype(int)
        
        # Create filterbank
        n_freq_bins = n_fft // 2 + 1
        filterbank = np.zeros((n_mels, n_freq_bins))
        
        for m in range(1, n_mels + 1):
            f_left = bin_points[m - 1]
            f_center = bin_points[m]
            f_right = bin_points[m + 1]
            
            # Triangular filter
            for k in range(f_left, f_center):
                filterbank[m - 1, k] = (k - f_left) / (f_center - f_left)
            for k in range(f_center, f_right):
                filterbank[m - 1, k] = (f_right - k) / (f_right - f_center)
        
        return filterbank
    
    @staticmethod
    def mel_spectrogram(x, sample_rate, n_fft=2048, hop_length=None, 
                       n_mels=128, fmin=0, fmax=None):
        """
        Compute mel-scaled spectrogram
        
        Args:
            x: Input signal
            sample_rate: Sampling rate
            n_fft: FFT size
            hop_length: Hop length
            n_mels: Number of mel bands
            fmin: Minimum frequency
            fmax: Maximum frequency
            
        Returns:
            mel_spectrogram: 2D array (mel_bins x time_frames)
            frequencies: Mel frequency values
            times: Time values
        """
        # Compute power spectrogram
        spectrogram, frequencies, times = CustomSpectrogram.compute_spectrogram(
            x, sample_rate, n_fft, hop_length, scale='power'
        )
        
        # Create mel filterbank
        mel_filters = CustomSpectrogram.mel_filterbank(
            n_fft, n_mels, sample_rate, fmin, fmax
        )
        
        # Apply mel filterbank
        mel_spec = np.dot(mel_filters, spectrogram)
        
        # Convert to dB
        mel_spec = np.maximum(mel_spec, 1e-10)
        mel_spec_db = 10 * np.log10(mel_spec / np.max(mel_spec))
        
        return mel_spec_db, times