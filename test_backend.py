"""
Test Script for Signal Equalizer Backend
Run this to verify all endpoints are working correctly
"""

import requests
import json
import time

BASE_URL = "http://localhost:5001"

def print_section(title):
    print("\n" + "="*80)
    print(f"  {title}")
    print("="*80 + "\n")

def test_health():
    """Test health endpoint"""
    print_section("Testing Health Endpoint")
    
    try:
        response = requests.get(f"{BASE_URL}/health")
        data = response.json()
        
        print(f"✓ Health check: {data['status']}")
        print(f"  Service: {data['service']}")
        print(f"  Version: {data['version']}")
        print(f"  GPU Available: {data['gpu_available']}")
        print(f"  Features: {len(data['features'])}")
        
        return True
    except Exception as e:
        print(f"✗ Health check failed: {e}")
        return False

def test_equalizer_modes():
    """Test equalizer modes endpoint"""
    print_section("Testing Equalizer Modes")
    
    try:
        response = requests.get(f"{BASE_URL}/api/equalizer/modes")
        data = response.json()
        
        if not data['success']:
            print(f"✗ Failed: {data.get('error')}")
            return False
        
        print(f"✓ Available modes: {len(data['modes'])}")
        for mode, info in data['modes'].items():
            print(f"  - {mode}: {info['name']}")
        
        return True
    except Exception as e:
        print(f"✗ Modes test failed: {e}")
        return False

def test_equalizer_preset():
    """Test equalizer preset endpoint"""
    print_section("Testing Equalizer Presets")
    
    modes = ['generic', 'instruments', 'animals', 'voices']
    
    for mode in modes:
        try:
            response = requests.get(f"{BASE_URL}/api/equalizer/preset/{mode}")
            data = response.json()
            
            if not data['success']:
                print(f"✗ {mode} preset failed: {data.get('error')}")
                continue
            
            print(f"✓ {mode.capitalize()} mode: {len(data['bands'])} bands")
            for band in data['bands'][:2]:  # Show first 2 bands
                print(f"    - {band['label']}: {band['start_freq']}-{band['end_freq']} Hz")
            
        except Exception as e:
            print(f"✗ Preset test ({mode}) failed: {e}")
    
    return True

def test_synthetic_signal():
    """Test synthetic signal generation"""
    print_section("Testing Synthetic Signal Generation")
    
    try:
        payload = {
            "mode": "generic",
            "duration": 2.0,
            "sample_rate": 44100
        }
        
        response = requests.post(
            f"{BASE_URL}/api/synthetic/generate",
            json=payload
        )
        data = response.json()
        
        if not data['success']:
            print(f"✗ Failed: {data.get('error')}")
            return False
        
        print(f"✓ Generated signal: {data['file']}")
        print(f"  Sample rate: {data['sample_rate']} Hz")
        print(f"  Duration: {data['duration']} seconds")
        print(f"  Metadata: {data['metadata']}")
        
        return True
    except Exception as e:
        print(f"✗ Synthetic signal test failed: {e}")
        return False

def test_frequency_response():
    """Test frequency response calculation"""
    print_section("Testing Frequency Response")
    
    try:
        payload = {
            "bands": [
                {"start_freq": 100, "end_freq": 500, "gain": 1.5, "label": "Boost"},
                {"start_freq": 1000, "end_freq": 2000, "gain": 0.5, "label": "Cut"}
            ],
            "sample_rate": 44100,
            "num_points": 100
        }
        
        response = requests.post(
            f"{BASE_URL}/api/equalizer/frequency-response",
            json=payload
        )
        data = response.json()
        
        if not data['success']:
            print(f"✗ Failed: {data.get('error')}")
            return False
        
        print(f"✓ Frequency response calculated")
        print(f"  Points: {len(data['frequencies'])}")
        print(f"  Frequency range: {data['frequencies'][0]:.1f} - {data['frequencies'][-1]:.1f} Hz")
        print(f"  Gain range: {min(data['gains']):.2f} - {max(data['gains']):.2f}")
        
        return True
    except Exception as e:
        print(f"✗ Frequency response test failed: {e}")
        return False

def test_equalizer_process():
    """Test equalizer processing with synthetic signal"""
    print_section("Testing Equalizer Processing")
    
    try:
        # Prepare form data
        form_data = {
            'mode': 'generic',
            'synthetic': 'true',
            'use_stft': 'true',
            'bands': json.dumps([
                {"start_freq": 100, "end_freq": 500, "gain": 1.5, "label": "Low Boost"},
                {"start_freq": 1000, "end_freq": 4000, "gain": 0.7, "label": "Mid Cut"}
            ])
        }
        
        print("  Sending processing request...")
        response = requests.post(
            f"{BASE_URL}/api/equalizer/process",
            data=form_data,
            timeout=30
        )
        data = response.json()
        
        if not data['success']:
            print(f"✗ Failed: {data.get('error')}")
            return False
        
        print(f"✓ Processing complete!")
        print(f"  Session ID: {data['session_id']}")
        print(f"  Original file: {data['original_file']}")
        print(f"  Equalized file: {data['equalized_file']}")
        print(f"  Sample rate: {data['sample_rate']} Hz")
        print(f"  Bands processed: {len(data['bands'])}")
        
        return True
    except Exception as e:
        print(f"✗ Processing test failed: {e}")
        return False

def test_settings_save_load():
    """Test settings save and load"""
    print_section("Testing Settings Save/Load")
    
    try:
        # Save settings
        save_payload = {
            "bands": [
                {"start_freq": 100, "end_freq": 500, "gain": 1.2, "label": "Bass"},
                {"start_freq": 1000, "end_freq": 4000, "gain": 0.8, "label": "Treble"}
            ],
            "sample_rate": 44100,
            "mode": "generic",
            "name": f"test_preset_{int(time.time())}"
        }
        
        print("  Saving settings...")
        response = requests.post(
            f"{BASE_URL}/api/equalizer/settings/save",
            json=save_payload
        )
        data = response.json()
        
        if not data['success']:
            print(f"✗ Save failed: {data.get('error')}")
            return False
        
        print(f"✓ Settings saved: {data['filepath']}")
        
        # Load settings
        print("  Loading settings...")
        response = requests.get(f"{BASE_URL}/api/equalizer/settings/load/{data['filepath']}")
        data = response.json()
        
        if not data['success']:
            print(f"✗ Load failed: {data.get('error')}")
            return False
        
        print(f"✓ Settings loaded: {len(data['bands'])} bands")
        
        return True
    except Exception as e:
        print(f"✗ Settings save/load test failed: {e}")
        return False

def run_all_tests():
    """Run all tests"""
    print("\n" + "="*80)
    print("  SIGNAL EQUALIZER BACKEND - TEST SUITE")
    print("="*80)
    print(f"\n  Testing backend at: {BASE_URL}")
    print("  Make sure the backend server is running!\n")
    
    tests = [
        ("Health Check", test_health),
        ("Equalizer Modes", test_equalizer_modes),
        ("Equalizer Presets", test_equalizer_preset),
        ("Synthetic Signal", test_synthetic_signal),
        ("Frequency Response", test_frequency_response),
        ("Settings Save/Load", test_settings_save_load),
        ("Equalizer Processing", test_equalizer_process),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"\n✗ Test '{test_name}' crashed: {e}")
            results.append((test_name, False))
    
    # Summary
    print("\n" + "="*80)
    print("  TEST SUMMARY")
    print("="*80 + "\n")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"  {status}: {test_name}")
    
    print(f"\n  Total: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n  🎉 All tests passed! Backend is working correctly.")
    else:
        print(f"\n  ⚠️  {total - passed} test(s) failed. Check the output above.")
    
    print("\n" + "="*80 + "\n")

if __name__ == "__main__":
    run_all_tests()
