#!/usr/bin/env python3
"""
Process growth reference data from rcpch/growth-references repository.
Converts Excel files to CSV, standardizes headers, and creates consistent data structure.
"""

import os
import pandas as pd
import json
from pathlib import Path
import re

# Create output directory
OUTPUT_DIR = Path("raw_data")
OUTPUT_DIR.mkdir(exist_ok=True)

# Metadata about processed files
metadata = {
    "sources": [],
    "files": []
}

def standardize_column_name(col):
    """Standardize column names to a consistent format."""
    col = str(col).strip()
    
    # Common mappings
    mappings = {
        'week/month': 'age_weeks',
        'years': 'age_years',
        'age': 'age_years',
        '(years)': 'age_years',
        'week': 'age_weeks',
        'month': 'age_months',
        'skeletal age': 'skeletal_age',
        'ht. (inches)': 'height_inches',
        'mature height': 'mature_height_pct',
        'chart': 'reference',
    }
    
    col_lower = col.lower()
    for key, value in mappings.items():
        if key in col_lower:
            return value
    
    # Clean up common patterns
    col = re.sub(r'[^a-zA-Z0-9_]', '_', col)
    col = re.sub(r'_+', '_', col)
    col = col.strip('_')
    
    return col.lower()

def process_lms_data(df, source_name, measurement_type, gender=None, age_range=None):
    """Process LMS (Lambda-Mu-Sigma) data into standardized format."""
    # Find age column
    age_cols = [col for col in df.columns if 'age' in str(col).lower() or 'week' in str(col).lower() or 'month' in str(col).lower()]
    if not age_cols:
        return None
    
    age_col = age_cols[0]
    
    # Find L, M, S columns for the measurement
    result_rows = []
    
    for idx, row in df.iterrows():
        if pd.isna(row[age_col]):
            continue
            
        result_row = {
            'source': source_name,
            'measurement': measurement_type,
            'age_years': None,
            'age_weeks': None,
            'age_months': None,
        }
        
        if gender:
            result_row['gender'] = gender
        if age_range:
            result_row['age_range'] = age_range
        
        # Extract age
        age_val = row[age_col]
        if isinstance(age_val, (int, float)):
            if age_val < 2:
                result_row['age_years'] = age_val
                result_row['age_weeks'] = age_val * 52.1775
                result_row['age_months'] = age_val * 12
            elif age_val < 52:
                result_row['age_weeks'] = age_val
                result_row['age_years'] = age_val / 52.1775
                result_row['age_months'] = age_val / 4.348
            else:
                result_row['age_months'] = age_val
                result_row['age_years'] = age_val / 12
                result_row['age_weeks'] = age_val * 4.348
        
        # Find L, M, S values
        for col in df.columns:
            col_lower = str(col).lower()
            if measurement_type.lower() in col_lower or 'lms' in col_lower:
                if col_lower.endswith('l') or '_l' in col_lower:
                    result_row['L'] = row[col] if not pd.isna(row[col]) else None
                elif col_lower.endswith('m') or '_m' in col_lower:
                    result_row['M'] = row[col] if not pd.isna(row[col]) else None
                elif col_lower.endswith('s') or '_s' in col_lower:
                    result_row['S'] = row[col] if not pd.isna(row[col]) else None
        
        # Also check for gender-specific columns
        if gender:
            gender_prefix = 'male' if gender == 'male' else 'female'
            for col in df.columns:
                col_lower = str(col).lower()
                if gender_prefix in col_lower:
                    if 'l' in col_lower and ('height' in col_lower or 'weight' in col_lower or 'bmi' in col_lower or 'hc' in col_lower):
                        parts = col_lower.split('_')
                        if 'l' in parts[-1] or col_lower.endswith('l'):
                            result_row['L'] = row[col] if not pd.isna(row[col]) else result_row.get('L')
                        elif 'm' in parts[-1] or col_lower.endswith('m'):
                            result_row['M'] = row[col] if not pd.isna(row[col]) else result_row.get('M')
                        elif 's' in parts[-1] or col_lower.endswith('s'):
                            result_row['S'] = row[col] if not pd.isna(row[col]) else result_row.get('S')
        
        if result_row.get('M') is not None:
            result_rows.append(result_row)
    
    return pd.DataFrame(result_rows) if result_rows else None

def process_excel_file(file_path, source_name):
    """Process a single Excel file."""
    print(f"Processing: {file_path}")
    
    try:
        # Read Excel file
        excel_file = pd.ExcelFile(file_path)
        
        results = []
        
        for sheet_name in excel_file.sheet_names:
            try:
                df = pd.read_excel(file_path, sheet_name=sheet_name)
                
                # Skip empty sheets
                if df.empty:
                    continue
                
                # Determine measurement type from filename or sheet name
                filename = Path(file_path).stem.lower()
                measurement_type = None
                gender = None
                age_range = None
                
                if 'height' in filename or 'ht' in filename or 'len' in filename:
                    measurement_type = 'height'
                elif 'weight' in filename or 'wt' in filename:
                    measurement_type = 'weight'
                elif 'bmi' in filename:
                    measurement_type = 'bmi'
                elif 'hc' in filename or 'head' in filename or 'ofc' in filename:
                    measurement_type = 'head_circumference'
                
                if 'boy' in filename or 'male' in filename:
                    gender = 'male'
                elif 'girl' in filename or 'female' in filename:
                    gender = 'female'
                
                if '0-36' in filename or '0_36' in filename:
                    age_range = '0-36_months'
                elif '2-20' in filename or '2_20' in filename:
                    age_range = '2-20_years'
                
                # Standardize column names
                df.columns = [standardize_column_name(col) for col in df.columns]
                
                # Try to process as LMS data
                processed = process_lms_data(df, source_name, measurement_type or 'unknown', gender, age_range)
                
                if processed is not None and not processed.empty:
                    results.append(processed)
                else:
                    # Save raw CSV if we can't process it
                    output_name = f"{source_name}_{Path(file_path).stem}_{sheet_name}.csv"
                    output_path = OUTPUT_DIR / output_name
                    df.to_csv(output_path, index=False)
                    metadata["files"].append({
                        "source": source_name,
                        "original": str(file_path),
                        "output": str(output_path),
                        "type": "raw_csv",
                        "measurement": measurement_type,
                        "gender": gender,
                        "age_range": age_range
                    })
                    
            except Exception as e:
                print(f"  Error processing sheet {sheet_name}: {e}")
                continue
        
        # Combine results if any
        if results:
            combined = pd.concat(results, ignore_index=True)
            output_name = f"{source_name}_{Path(file_path).stem}_processed.csv"
            output_path = OUTPUT_DIR / output_name
            combined.to_csv(output_path, index=False)
            metadata["files"].append({
                "source": source_name,
                "original": str(file_path),
                "output": str(output_path),
                "type": "processed_lms",
                "rows": len(combined)
            })
            return True
        
    except Exception as e:
        print(f"  Error processing file {file_path}: {e}")
        return False
    
    return False

def process_csv_file(file_path, source_name):
    """Process a CSV file that's already in CSV format."""
    print(f"Processing CSV: {file_path}")
    
    try:
        df = pd.read_csv(file_path, encoding='utf-8', low_memory=False)
        
        # Standardize column names
        df.columns = [standardize_column_name(col) for col in df.columns]
        
        # Determine characteristics from filename
        filename = Path(file_path).stem.lower()
        measurement_type = None
        gender = None
        
        if 'height' in filename or 'ht' in filename or 'len' in filename:
            measurement_type = 'height'
        elif 'weight' in filename or 'wt' in filename:
            measurement_type = 'weight'
        elif 'bmi' in filename:
            measurement_type = 'bmi'
        elif 'hc' in filename or 'head' in filename or 'ofc' in filename:
            measurement_type = 'head_circumference'
        
        # Create descriptive output name
        output_name = f"{source_name}_{Path(file_path).name}"
        output_path = OUTPUT_DIR / output_name
        df.to_csv(output_path, index=False)
        
        metadata["files"].append({
            "source": source_name,
            "original": str(file_path),
            "output": str(output_path),
            "type": "csv",
            "measurement": measurement_type,
            "rows": len(df)
        })
        
        return True
        
    except Exception as e:
        print(f"  Error processing CSV {file_path}: {e}")
        return False

def process_directory(directory, source_name):
    """Process all files in a directory."""
    dir_path = Path(directory)
    
    if not dir_path.exists():
        print(f"Directory not found: {directory}")
        return
    
    metadata["sources"].append({
        "name": source_name,
        "directory": str(directory)
    })
    
    # Process Excel files
    for excel_file in dir_path.rglob("*.xls*"):
        process_excel_file(excel_file, source_name)
    
    # Process CSV files
    for csv_file in dir_path.rglob("*.csv"):
        process_csv_file(csv_file, source_name)

def main():
    """Main processing function."""
    repo_dir = Path("temp_repo")
    
    if not repo_dir.exists():
        print("Repository directory not found. Please clone the repository first.")
        return
    
    # Process each data source
    sources = {
        "cdc2000": repo_dir / "cdc2000",
        "who2006": repo_dir / "who2006",
        "uk_who": repo_dir / "uk-who",
        "uk90": repo_dir / "uk90",
        "trisomy21_aap": repo_dir / "trisomy21" / "AAP",
        "trisomy21_uk": repo_dir / "trisomy21" / "UKReference",
        "turner": repo_dir / "turner",
        "bayley_pinneau": repo_dir / "bayley-pinneau",
        "spirometry": repo_dir / "spirometry"
    }
    
    for source_name, source_path in sources.items():
        if source_path.exists():
            print(f"\n{'='*60}")
            print(f"Processing {source_name}")
            print(f"{'='*60}")
            process_directory(source_path, source_name)
    
    # Save metadata
    metadata_path = OUTPUT_DIR / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"\n{'='*60}")
    print(f"Processing complete!")
    print(f"Output directory: {OUTPUT_DIR}")
    print(f"Metadata saved to: {metadata_path}")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()

