#!/usr/bin/env python3
"""
Generate canonical car catalog with stable IDs from car_catalog_models_he_en.json

Input: app/src/main/res/raw/car_catalog_models_he_en.json
Outputs:
  - app/src/main/res/raw/car_catalog/brands_only.v1.json
  - app/src/main/res/raw/car_catalog/brand_manifest.v1.json
  - app/src/main/res/raw/car_catalog/brands/<brandId>.models.v1.json
"""

import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

# Unicode normalization for ASCII conversion
try:
    import unicodedata
    HAS_UNICODEDATA = True
except ImportError:
    HAS_UNICODEDATA = False


def slug(text: str) -> str:
    """
    Create a URL-safe slug from text.
    - Lower case
    - ASCII normalize (remove accents)
    - Replace non-alnum with -
    - Collapse multiple - into one
    - Trim - from start/end
    """
    # Convert to lowercase
    text = text.lower().strip()
    
    # ASCII normalize (remove accents/diacritics)
    if HAS_UNICODEDATA:
        text = unicodedata.normalize('NFKD', text)
        text = text.encode('ascii', 'ignore').decode('ascii')
    
    # Replace non-alphanumeric with dash
    text = re.sub(r'[^a-z0-9]+', '-', text)
    
    # Collapse multiple dashes
    text = re.sub(r'-+', '-', text)
    
    # Trim dashes from start/end
    text = text.strip('-')
    
    return text or 'unknown'


def generate_brand_id(brand_en: str) -> str:
    """Generate stable brandId from brandEn."""
    return slug(brand_en)


def generate_model_id(brand_id: str, model_en: str) -> str:
    """Generate stable modelId from brandId and modelEn."""
    model_slug = slug(model_en)
    return f"{brand_id}:{model_slug}"


def ensure_unique_model_ids(models: List[Dict]) -> List[Dict]:
    """Ensure model IDs are unique within a brand, adding suffixes if needed."""
    seen = {}
    result = []
    
    for model in models:
        model_id = model['modelId']
        original_id = model_id
        
        # If duplicate, add numeric suffix
        if model_id in seen:
            counter = seen[model_id] + 1
            model_id = f"{original_id}-{counter}"
            while model_id in seen:
                counter += 1
                model_id = f"{original_id}-{counter}"
            seen[original_id] = counter
        else:
            seen[original_id] = 0
        
        seen[model_id] = seen.get(model_id, 0)
        model['modelId'] = model_id
        result.append(model)
    
    return result


def main():
    # Paths
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent
    
    input_file = repo_root / "app" / "src" / "main" / "res" / "raw" / "car_catalog_models_he_en.json"
    output_base = repo_root / "app" / "src" / "main" / "res" / "raw" / "car_catalog"
    brands_dir = output_base / "brands"
    
    # Ensure output directories exist
    output_base.mkdir(parents=True, exist_ok=True)
    brands_dir.mkdir(parents=True, exist_ok=True)
    
    # Read input
    print(f"Reading {input_file}...")
    with open(input_file, 'r', encoding='utf-8') as f:
        catalog = json.load(f)
    
    # Process brands
    brands_list = []
    brand_manifest = []
    generated_at = datetime.now().strftime("%Y-%m-%d")
    
    for brand_data in catalog:
        brand_en = brand_data['brandEn']
        brand_he = brand_data['brandHe']
        brand_id = generate_brand_id(brand_en)
        
        # Process models
        models = []
        for model_data in brand_data.get('models', []):
            model_en = model_data['modelEn']
            model_he = model_data['modelHe']
            model_id = generate_model_id(brand_id, model_en)
            
            models.append({
                'modelId': model_id,
                'modelEn': model_en,
                'modelHe': model_he
            })
        
        # Ensure unique model IDs
        models = ensure_unique_model_ids(models)
        
        # Add to brands list
        brands_list.append({
            'brandId': brand_id,
            'brandEn': brand_en,
            'brandHe': brand_he
        })
        
        # Add to manifest
        models_file = f"car_catalog/brands/{brand_id}.models.v1.json"
        brand_manifest.append({
            'brandId': brand_id,
            'brandEn': brand_en,
            'brandHe': brand_he,
            'modelsCount': len(models),
            'modelsRef': models_file
        })
        
        # Write individual brand models file
        brand_models_file = brands_dir / f"{brand_id}.models.v1.json"
        brand_models_data = {
            'version': 1,
            'brandId': brand_id,
            'brandEn': brand_en,
            'brandHe': brand_he,
            'generatedAt': generated_at,
            'models': models
        }
        
        with open(brand_models_file, 'w', encoding='utf-8') as f:
            json.dump(brand_models_data, f, ensure_ascii=False, indent=2)
        
        print(f"  Generated {brand_id}: {len(models)} models")
    
    # Write brands_only.v1.json
    brands_only_file = output_base / "brands_only.v1.json"
    brands_only_data = {
        'version': 1,
        'generatedAt': generated_at,
        'brands': brands_list
    }
    
    with open(brands_only_file, 'w', encoding='utf-8') as f:
        json.dump(brands_only_data, f, ensure_ascii=False, indent=2)
    
    print(f"Written {brands_only_file}")
    
    # Write brand_manifest.v1.json
    manifest_file = output_base / "brand_manifest.v1.json"
    manifest_data = {
        'version': 1,
        'generatedAt': generated_at,
        'brands': brand_manifest
    }
    
    with open(manifest_file, 'w', encoding='utf-8') as f:
        json.dump(manifest_data, f, ensure_ascii=False, indent=2)
    
    print(f"Written {manifest_file}")
    print(f"\nGenerated {len(brands_list)} brands with catalog structure.")
    
    # Copy to web/public/car_catalog/
    web_public_dir = repo_root / "web" / "public" / "car_catalog"
    web_public_dir.mkdir(parents=True, exist_ok=True)
    web_brands_dir = web_public_dir / "brands"
    web_brands_dir.mkdir(parents=True, exist_ok=True)
    
    # Copy brands_only
    import shutil
    shutil.copy2(brands_only_file, web_public_dir / "brands_only.v1.json")
    
    # Copy manifest
    shutil.copy2(manifest_file, web_public_dir / "brand_manifest.v1.json")
    
    # Copy all brand model files
    for brand_file in brands_dir.glob("*.models.v1.json"):
        shutil.copy2(brand_file, web_brands_dir / brand_file.name)
    
    print(f"Copied to {web_public_dir}")
    print("Done!")


if __name__ == '__main__':
    main()

