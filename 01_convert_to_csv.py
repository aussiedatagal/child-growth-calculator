#!/usr/bin/env python3
"""
Convert XLS/XLSX files from raw_data/who and raw_data/cdc to CSV format.
Sources:
- WHO: https://www.who.int/tools/child-growth-standards/standards
- CDC: Centers for Disease Control and Prevention growth charts
"""

import pandas as pd
from pathlib import Path
import sys

def convert_excel_to_csv(excel_path, output_dir=None):
    """
    Convert an Excel file (XLS or XLSX) to CSV format.
    If the file has multiple sheets, each sheet will be saved as a separate CSV.
    
    Args:
        excel_path: Path to the Excel file (XLS or XLSX)
        output_dir: Directory to save CSV files (default: same as Excel file)
    
    Returns:
        List of created CSV file paths
    """
    excel_path = Path(excel_path)
    
    if not excel_path.exists():
        print(f"Error: File not found: {excel_path}")
        return []
    
    if output_dir is None:
        output_dir = excel_path.parent
    else:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
    
    created_files = []
    
    try:
        excel_file = pd.ExcelFile(excel_path)
        
        for sheet_name in excel_file.sheet_names:
            df = pd.read_excel(excel_file, sheet_name=sheet_name)
            
            if len(excel_file.sheet_names) == 1:
                csv_filename = excel_path.stem + '.csv'
            else:
                safe_sheet_name = sheet_name.replace('/', '_').replace('\\', '_')
                csv_filename = f"{excel_path.stem}_{safe_sheet_name}.csv"
            
            csv_path = output_dir / csv_filename
            df.to_csv(csv_path, index=False, encoding='utf-8')
            created_files.append(csv_path)
            print(f"✓ Converted: {excel_path.name} (sheet: {sheet_name}) -> {csv_filename}")
        
        excel_file.close()
        
    except Exception as e:
        print(f"✗ Error converting {excel_path.name}: {e}")
        return []
    
    return created_files

def process_directory(directory, source_name):
    """
    Process all Excel files (XLS and XLSX) in a directory.
    
    Args:
        directory: Path to the directory
        source_name: Name of the data source (for display)
    
    Returns:
        Tuple of (total_converted, total_errors)
    """
    dir_path = Path(directory)
    
    if not dir_path.exists():
        print(f"Warning: Directory not found: {dir_path}")
        return (0, 0)
    
    excel_files = list(dir_path.glob("*.xls")) + list(dir_path.glob("*.xlsx"))
    
    if not excel_files:
        print(f"No Excel files found in {dir_path}")
        return (0, 0)
    
    print(f"\n{source_name} ({dir_path}):")
    print(f"Found {len(excel_files)} Excel file(s) to convert...\n")
    
    total_converted = 0
    total_errors = 0
    
    for excel_file in sorted(excel_files):
        created = convert_excel_to_csv(excel_file)
        if created:
            total_converted += len(created)
        else:
            total_errors += 1
    
    return (total_converted, total_errors)

def main():
    """Main function to convert all Excel files in raw_data/who and raw_data/cdc directories."""
    directories = [
        ("raw_data/who", "WHO Child Growth Standards"),
        ("raw_data/cdc", "CDC Growth Charts")
    ]
    
    grand_total_converted = 0
    grand_total_errors = 0
    
    for directory, source_name in directories:
        converted, errors = process_directory(directory, source_name)
        grand_total_converted += converted
        grand_total_errors += errors
    
    print(f"\n{'='*60}")
    print(f"Conversion complete!")
    print(f"  Total files converted: {grand_total_converted}")
    print(f"  Total errors: {grand_total_errors}")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
