#!/usr/bin/env python3
"""
Patch Demucs to fix PyTorch 2.x tensor aliasing bug
"""
import os
import sys
import shutil
from pathlib import Path

def patch_demucs():
    """Patch the installed Demucs package"""
    try:
        import demucs
        demucs_path = Path(demucs.__file__).parent
        print(f"📂 Demucs installation found: {demucs_path}")
        
        # Patch separate.py
        separate_py = demucs_path / "separate.py"
        if not separate_py.exists():
            print(f"❌ Error: {separate_py} not found")
            return False
        
        print(f"📄 Reading {separate_py}")
        with open(separate_py, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Backup original file
        backup_file = separate_py.with_suffix('.py.backup')
        if not backup_file.exists():
            print(f"💾 Creating backup: {backup_file}")
            shutil.copy2(separate_py, backup_file)
        
        # Check if already patched
        if 'wav = wav.clone()' in content:
            print("✅ Demucs is already patched!")
            return True
        
        # Find and replace the problematic line
        # Line 171: wav -= ref.mean()
        original_line = '        wav -= ref.mean()'
        patched_lines = '''        wav = wav.clone()  # Fix PyTorch 2.x tensor aliasing
        wav -= ref.mean()'''
        
        if original_line in content:
            print(f"🔧 Patching line 171...")
            content = content.replace(original_line, patched_lines)
            
            # Write patched content
            with open(separate_py, 'w', encoding='utf-8') as f:
                f.write(content)
            
            print("✅ Successfully patched demucs/separate.py!")
            print(f"   Added: wav = wav.clone() before wav -= ref.mean()")
            return True
        else:
            print(f"⚠️  Warning: Could not find exact line to patch")
            print(f"   Searching for alternative patterns...")
            
            # Try alternative pattern
            if 'wav -= ref.mean()' in content:
                # Replace all occurrences
                content = content.replace('wav -= ref.mean()', 'wav = wav.clone(); wav -= ref.mean()')
                with open(separate_py, 'w', encoding='utf-8') as f:
                    f.write(content)
                print("✅ Applied alternative patch!")
                return True
            
            print("❌ Could not patch - manual intervention required")
            return False
            
    except ImportError:
        print("❌ Demucs is not installed")
        return False
    except Exception as e:
        print(f"❌ Error during patching: {e}")
        import traceback
        traceback.print_exc()
        return False

def check_ffmpeg():
    """Check if ffmpeg is available"""
    print("\n🔍 Checking for ffmpeg...")
    ffmpeg_path = shutil.which('ffmpeg')
    if ffmpeg_path:
        print(f"✅ ffmpeg found: {ffmpeg_path}")
        return True
    else:
        print("⚠️  ffmpeg not found in PATH")
        print("   Demucs may fail to load certain audio formats")
        print("   Install ffmpeg: https://ffmpeg.org/download.html")
        return False

def test_patch():
    """Test if the patch works"""
    print("\n🧪 Testing patched Demucs...")
    try:
        # Try importing and checking the code
        import demucs
        separate_py = Path(demucs.__file__).parent / "separate.py"
        
        with open(separate_py, 'r', encoding='utf-8') as f:
            content = f.read()
        
        if 'wav = wav.clone()' in content and 'wav -= ref.mean()' in content:
            print("✅ Patch verified - code contains the fix")
            return True
        else:
            print("❌ Patch verification failed")
            return False
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

if __name__ == '__main__':
    print("="*70)
    print("🔧 DEMUCS PATCHER FOR PYTORCH 2.X")
    print("="*70)
    
    # Patch Demucs
    success = patch_demucs()
    
    # Check ffmpeg
    check_ffmpeg()
    
    # Test patch
    if success:
        test_patch()
    
    print("\n" + "="*70)
    if success:
        print("✅ PATCHING COMPLETE!")
        print("   Restart your backend server for changes to take effect")
    else:
        print("❌ PATCHING FAILED")
        print("   Manual intervention may be required")
    print("="*70)
    
    sys.exit(0 if success else 1)
