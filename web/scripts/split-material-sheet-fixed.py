#!/usr/bin/env python3
"""
Split Material Sheet into Individual PNG Files

Splits a large sheet image into 12 PNG files (6 materials × 2 sizes each).
Grid layout: 6 rows × 3 columns
- Rows (top→bottom): BRONZE, COPPER, GOLD, PLATINUM, DIAMOND, TITANIUM
- Columns: LEFT=DESKTOP, MIDDLE=ignore, RIGHT=MOBILE

Fixed crop percentages:
- Desktop: x0=0.020, x1=0.615
- Mobile:  x0=0.805, x1=0.980
- Row height: 1/6
- Row i: y0 = i*rowH + 0.020, y1 = (i+1)*rowH - 0.020

Usage: python scripts/split-material-sheet-fixed.py assets-src/promo/_sheet/materials-sheet.png
"""

import sys
import os
from pathlib import Path
from PIL import Image

# Material names in order (top to bottom)
MATERIALS = ['bronze', 'copper', 'gold', 'platinum', 'diamond', 'titanium']

# Crop percentages
DESKTOP_X0 = 0.020
DESKTOP_X1 = 0.615
MOBILE_X0 = 0.805
MOBILE_X1 = 0.980
ROW_MARGIN = 0.020  # Top and bottom margin per row
ROW_COUNT = 6
ROW_HEIGHT = 1.0 / ROW_COUNT


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/split-material-sheet-fixed.py <input-sheet.png>")
        sys.exit(1)
    
    input_path = Path(sys.argv[1])
    
    # Resolve relative to script directory's parent (web/)
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    
    if not input_path.is_absolute():
        input_path = project_root / input_path
    
    if not input_path.exists():
        print(f"[ERROR] Input file not found: {input_path}")
        sys.exit(1)
    
    print(f"[INFO] Loading sheet: {input_path}")
    
    # Load image
    try:
        img = Image.open(input_path)
        img_width, img_height = img.size
    except Exception as e:
        print(f"[ERROR] Error loading image: {e}")
        sys.exit(1)
    
    print(f"\n[INFO] Image dimensions: {img_width} x {img_height} pixels")
    print(f"       Row height: {img_height / ROW_COUNT:.1f} pixels")
    
    # Calculate crop boxes
    crop_boxes = []
    
    for i, material in enumerate(MATERIALS):
        # Calculate row boundaries
        row_y0_percent = i * ROW_HEIGHT + ROW_MARGIN
        row_y1_percent = (i + 1) * ROW_HEIGHT - ROW_MARGIN
        
        # Convert to pixels
        desktop_x0 = int(img_width * DESKTOP_X0)
        desktop_x1 = int(img_width * DESKTOP_X1)
        mobile_x0 = int(img_width * MOBILE_X0)
        mobile_x1 = int(img_width * MOBILE_X1)
        row_y0 = int(img_height * row_y0_percent)
        row_y1 = int(img_height * row_y1_percent)
        
        # Desktop crop box: (left, top, right, bottom)
        desktop_box = (desktop_x0, row_y0, desktop_x1, row_y1)
        
        # Mobile crop box
        mobile_box = (mobile_x0, row_y0, mobile_x1, row_y1)
        
        crop_boxes.append({
            'material': material,
            'desktop': desktop_box,
            'mobile': mobile_box
        })
        
        print(f"\n[Material] {material.upper()}:")
        print(f"  Desktop: ({desktop_x0}, {row_y0}) -> ({desktop_x1}, {row_y1}) "
              f"[{desktop_x1 - desktop_x0} x {row_y1 - row_y0}]")
        print(f"  Mobile:  ({mobile_x0}, {row_y0}) -> ({mobile_x1}, {row_y1}) "
              f"[{mobile_x1 - mobile_x0} x {row_y1 - row_y0}]")
    
    # Create output directories and save crops
    print(f"\n[INFO] Saving cropped images...")
    
    success_count = 0
    error_count = 0
    
    for crop_info in crop_boxes:
        material = crop_info['material']
        output_dir = project_root / 'assets-src' / 'promo' / material
        
        # Ensure output directory exists
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Crop and save desktop
        try:
            desktop_crop = img.crop(crop_info['desktop'])
            desktop_path = output_dir / 'bg-desktop.png'
            desktop_crop.save(desktop_path, 'PNG')
            print(f"  [OK] {material}/bg-desktop.png ({desktop_crop.size[0]} x {desktop_crop.size[1]})")
            success_count += 1
        except Exception as e:
            print(f"  [ERROR] Error saving {material}/bg-desktop.png: {e}")
            error_count += 1
        
        # Crop and save mobile
        try:
            mobile_crop = img.crop(crop_info['mobile'])
            mobile_path = output_dir / 'bg-mobile.png'
            mobile_crop.save(mobile_path, 'PNG')
            print(f"  [OK] {material}/bg-mobile.png ({mobile_crop.size[0]} x {mobile_crop.size[1]})")
            success_count += 1
        except Exception as e:
            print(f"  [ERROR] Error saving {material}/bg-mobile.png: {e}")
            error_count += 1
    
    print(f"\n{'='*50}")
    print(f"[SUCCESS] Successfully saved: {success_count} files")
    if error_count > 0:
        print(f"[ERROR] Errors: {error_count} files")
    print(f"{'='*50}")
    
    if error_count > 0:
        sys.exit(1)


if __name__ == '__main__':
    main()
