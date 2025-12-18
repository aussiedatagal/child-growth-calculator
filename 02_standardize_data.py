#!/usr/bin/env python3
"""
Standardize and combine growth chart data from WHO and CDC sources.
- Combines age ranges for same measurement types
- Splits CDC files by gender
- Standardizes column names (Month instead of Week/Agemos)
- Converts weeks to months for WHO files
- Outputs to public/ directory
"""

import pandas as pd
from pathlib import Path
import re
from collections import defaultdict

OUTPUT_DIR = Path("public")
OUTPUT_DIR.mkdir(exist_ok=True)

WHO_MEASUREMENT_MAP = {
    'bmi': 'bmifa',
    'lhfa': 'lhfa',
    'wfa': 'wfa',
    'hcfa': 'hcfa',
    'acfa': 'acfa',
    'ssfa': 'ssfa',
    'tsfa': 'tsfa',
    'wfl': 'wfl',
    'wfh': 'wfh',
}

CDC_MEASUREMENT_MAP = {
    'wtageinf': 'wfa',
    'wtage': 'wfa',
    'lenageinf': 'lhfa',
    'statage': 'hfa',
    'hcageinf': 'hcfa',
    'wtleninf': 'wfl',
    'wtstat': 'wfh',
    'bmiage': 'bmifa',
}

def weeks_to_months(weeks):
    """Convert weeks to months (approximately 4.33 weeks per month)."""
    return weeks / 4.33

def process_who_file(file_path):
    """
    Process a WHO file and return standardized dataframe.
    Returns: (measurement_type, gender, df) or None if can't process
    """
    filename = file_path.stem.lower()
    
    # Extract measurement type
    measurement = None
    for pattern, meas_type in WHO_MEASUREMENT_MAP.items():
        if pattern in filename:
            measurement = meas_type
            break
    
    if not measurement:
        return None
    
    # Extract gender
    gender = None
    if 'boys' in filename or 'male' in filename:
        gender = 'boys'
    elif 'girls' in filename or 'female' in filename:
        gender = 'girls'
    
    if not gender:
        return None
    
    # Read the file
    try:
        df = pd.read_csv(file_path)
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return None
    
    # Handle weight-for-length/height files (use Length/Height as x-axis)
    if measurement in ['wfl', 'wfh']:
        # Standardize column name
        if 'Length' in df.columns:
            df = df.rename(columns={'Length': 'Length'})
            x_col = 'Length'
        elif 'Height' in df.columns:
            df = df.rename(columns={'Height': 'Height'})
            x_col = 'Height'
        else:
            print(f"Warning: No Length or Height column in {file_path}")
            return None
        # Ensure x-axis column is first
        cols = [x_col] + [c for c in df.columns if c != x_col]
        df = df[cols]
    else:
        # Handle age-based files
        # Check if we have Week or Month column
        if 'Week' in df.columns:
            # Convert weeks to months
            df = df.copy()
            df['Month'] = weeks_to_months(df['Week'])
            df = df.drop('Week', axis=1)
        elif 'Month' not in df.columns:
            print(f"Warning: No Month or Week column in {file_path}")
            return None
        
        # Ensure Month is first column
        cols = ['Month'] + [c for c in df.columns if c != 'Month']
        df = df[cols]
    
    return (measurement, gender, df)

def process_cdc_file(file_path):
    """
    Process a CDC file and return standardized dataframes split by gender.
    Returns: list of (measurement_type, gender, df) tuples
    """
    filename = file_path.stem.lower()
    
    # Extract measurement type
    measurement = None
    for pattern, meas_type in CDC_MEASUREMENT_MAP.items():
        if pattern in filename:
            measurement = meas_type
            break
    
    if not measurement:
        return []
    
    # Read the file
    try:
        df = pd.read_csv(file_path)
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return []
    
    # Handle weight-for-length/height files (use Length/Height/Stature as x-axis)
    if measurement in ['wfl', 'wfh']:
        if 'Sex' not in df.columns:
            print(f"Warning: Missing Sex column in {file_path}")
            return []
        
        # Standardize x-axis column name
        x_col = None
        if 'Length' in df.columns:
            x_col = 'Length'
        elif 'Height' in df.columns:
            x_col = 'Height'
        elif 'Stature' in df.columns:
            x_col = 'Stature'
        else:
            print(f"Warning: No Length, Height, or Stature column in {file_path}")
            return []
        
        # Split by gender
        results = []
        for sex_code, gender in [(1, 'boys'), (2, 'girls')]:
            gender_df = df[df['Sex'] == sex_code].copy()
            if len(gender_df) > 0:
                # Remove Sex column
                gender_df = gender_df.drop('Sex', axis=1)
                # Ensure x-axis column is first
                cols = [x_col] + [c for c in gender_df.columns if c != x_col]
                gender_df = gender_df[cols]
                results.append((measurement, gender, gender_df))
        
        return results
    
    # Handle age-based files
    # Check for required columns
    if 'Sex' not in df.columns or 'Agemos' not in df.columns:
        print(f"Warning: Missing Sex or Agemos column in {file_path}")
        return []
    
    # Rename Agemos to Month
    df = df.rename(columns={'Agemos': 'Month'})
    
    # Split by gender
    results = []
    for sex_code, gender in [(1, 'boys'), (2, 'girls')]:
        gender_df = df[df['Sex'] == sex_code].copy()
        if len(gender_df) > 0:
            # Remove Sex column
            gender_df = gender_df.drop('Sex', axis=1)
            # Ensure Month is first column
            cols = ['Month'] + [c for c in gender_df.columns if c != 'Month']
            gender_df = gender_df[cols]
            results.append((measurement, gender, gender_df))
    
    return results

def combine_dataframes(dfs, x_col='Month'):
    """Combine multiple dataframes, handling overlapping x-axis values."""
    if not dfs:
        return None
    
    # Sort by x-axis column
    combined = pd.concat(dfs, ignore_index=True)
    combined = combined.sort_values(x_col)
    
    # Remove duplicates, keeping the last occurrence (prefer later ranges)
    combined = combined.drop_duplicates(subset=[x_col], keep='last')
    
    return combined

def main():
    """Main processing function."""
    who_dir = Path("raw_data/who")
    cdc_dir = Path("raw_data/cdc")
    
    # Dictionary to store dataframes: {(measurement, gender): [df1, df2, ...]}
    who_data = defaultdict(list)
    cdc_data = defaultdict(list)
    
    print("Processing WHO files...")
    who_files = sorted(who_dir.glob("*.csv"))
    for file_path in who_files:
        result = process_who_file(file_path)
        if result:
            measurement, gender, df = result
            who_data[(measurement, gender)].append(df)
            print(f"  Processed: {file_path.name} -> {measurement}_{gender}")
    
    print("\nProcessing CDC files...")
    cdc_files = sorted(cdc_dir.glob("*.csv"))
    for file_path in cdc_files:
        results = process_cdc_file(file_path)
        for measurement, gender, df in results:
            cdc_data[(measurement, gender)].append(df)
            print(f"  Processed: {file_path.name} -> {measurement}_{gender}")
    
    # Combine and save all data (save both WHO and CDC with source suffix for alphabetical grouping)
    print("\nCombining and saving standardized data...")
    
    # Process and save WHO data
    print("\nSaving WHO data...")
    for (measurement, gender), dfs in who_data.items():
        # Determine x-axis column
        if dfs and len(dfs) > 0:
            first_col = dfs[0].columns[0]
            x_col = first_col if first_col in ['Month', 'Length', 'Height', 'Stature'] else 'Month'
        else:
            x_col = 'Month'
        
        combined = combine_dataframes(dfs, x_col=x_col)
        if combined is not None:
            output_path = OUTPUT_DIR / f"{measurement}_{gender}_who.csv"
            combined.to_csv(output_path, index=False)
            print(f"  Saved: {output_path} ({len(combined)} rows, x-axis: {x_col})")
    
    # Process and save CDC data
    print("\nSaving CDC data...")
    for (measurement, gender), dfs in cdc_data.items():
        # Determine x-axis column
        if dfs and len(dfs) > 0:
            first_col = dfs[0].columns[0]
            x_col = first_col if first_col in ['Month', 'Length', 'Height', 'Stature'] else 'Month'
        else:
            x_col = 'Month'
        
        combined = combine_dataframes(dfs, x_col=x_col)
        if combined is not None:
            output_path = OUTPUT_DIR / f"{measurement}_{gender}_cdc.csv"
            combined.to_csv(output_path, index=False)
            print(f"  Saved: {output_path} ({len(combined)} rows, x-axis: {x_col})")
    
    print(f"\n{'='*60}")
    print("Standardization complete!")
    print(f"Output directory: {OUTPUT_DIR}")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
