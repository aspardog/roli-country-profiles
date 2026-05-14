#!/usr/bin/env python3
"""
parse-roli-data.py

Convert the raw WJP Rule of Law Index Excel into the JSON shape consumed by
the dashboard. Auto-detects the latest year present in the file.

How it adapts to new releases:

1. **Input file**: discovered via glob `data/*wjp*rule*of*law*.xlsx`. If WJP
   changes the filename next year, the script still finds it.

2. **Latest year**: scans the sheet names for the pattern
   `WJP ROL Index <YYYY> Scores` (or `<YYYY>-<YYYY>` for hybrid years) and
   picks the highest year. So next year's release will be picked up
   automatically.

3. **Row layout**: scans the first column of the selected sheet to discover
   where each indicator lives ("Country", "Region", "Factor N:", "N.M ..."
   patterns). The script does *not* rely on hardcoded row indices, so
   small layout changes (extra blank rows, reordering) don't break it.

Run:
    python3 scripts/parse-roli-data.py

Requirements:
    pip install pandas openpyxl
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    sys.stderr.write("pandas is required. Install with: pip install pandas openpyxl\n")
    sys.exit(1)


STRING_KEYS = {"country", "code", "region", "income"}

SHEET_YEAR_PATTERN = re.compile(
    r"WJP\s*ROL\s*Index\s*(\d{4})(?:\s*-\s*\d{4})?\s*Scores",
    re.IGNORECASE,
)

FACTOR_PATTERN = re.compile(r"^\s*Factor\s+(\d+)\s*[:.]", re.IGNORECASE)
# Subfactor labels look like "1.1 Government powers..." or "7.6. Civil justice..."
SUBFACTOR_PATTERN = re.compile(r"^\s*(\d+)\.(\d+)\.?\s+\S")


def find_input_file(data_dir: Path) -> Path:
    """Locate the WJP source Excel file inside the data directory."""
    patterns = [
        "*wjp*rule*of*law*.xlsx",
        "*WJP*Rule*of*Law*.xlsx",
        "*ROLI*.xlsx",
        "*.xlsx",
    ]
    for pat in patterns:
        matches = sorted(data_dir.glob(pat))
        if matches:
            # Prefer the most recently modified file when multiple exist.
            return max(matches, key=lambda p: p.stat().st_mtime)
    raise FileNotFoundError(f"No .xlsx file found in {data_dir}")


def detect_latest_year_sheet(xlsx_path: Path) -> tuple[str, int]:
    """Find the sheet for the most recent ROLI release."""
    xl = pd.ExcelFile(xlsx_path)
    candidates: list[tuple[str, int]] = []
    for sheet in xl.sheet_names:
        m = SHEET_YEAR_PATTERN.search(sheet)
        if m:
            candidates.append((sheet, int(m.group(1))))
    if not candidates:
        raise ValueError(
            f"No 'WJP ROL Index <YYYY> Scores' sheet found in {xlsx_path}. "
            f"Available sheets: {xl.sheet_names}"
        )
    candidates.sort(key=lambda x: x[1], reverse=True)
    return candidates[0]


def detect_row_map(df: pd.DataFrame) -> dict[str, int]:
    """
    Build a row-index map by scanning the first column.

    The structure we care about:
        country, code, region, income, overall  -- metadata
        f1..fN                                  -- factor rows
        sfNM                                    -- subfactor rows (e.g. sf11, sf12)

    We don't hardcode positions; we identify them by content.
    """
    first_col = df.iloc[:, 0]
    row_map: dict[str, int] = {}

    for i, raw in enumerate(first_col):
        if not isinstance(raw, str):
            continue
        s = raw.strip()
        s_lower = s.lower()

        # Metadata rows
        if s_lower == "country":
            row_map.setdefault("country", i)
            continue
        if s_lower == "country code":
            row_map.setdefault("code", i)
            continue
        if s_lower == "region":
            row_map.setdefault("region", i)
            continue
        if s_lower.startswith("income"):
            row_map.setdefault("income", i)
            continue
        if "overall score" in s_lower:
            row_map.setdefault("overall", i)
            continue

        # Factor rows: "Factor 1: Constraints on Government Powers"
        m = FACTOR_PATTERN.match(s)
        if m:
            row_map[f"f{m.group(1)}"] = i
            continue

        # Subfactor rows: "1.1 ..." / "7.6. ..."
        m = SUBFACTOR_PATTERN.match(s)
        if m:
            row_map[f"sf{m.group(1)}{m.group(2)}"] = i
            continue

    required = {"country", "code", "region", "overall"}
    missing = required - row_map.keys()
    if missing:
        raise ValueError(f"Could not locate required rows: {sorted(missing)}")

    return row_map


def parse_sheet(xlsx_path: Path, sheet_name: str) -> tuple[list[dict], dict[str, int]]:
    """Parse a single ROLI year sheet into country records."""
    df = pd.read_excel(xlsx_path, sheet_name=sheet_name, header=None)
    row_map = detect_row_map(df)

    records: list[dict] = []
    n_cols = df.shape[1]
    for col in range(1, n_cols):
        country_name = df.iloc[row_map["country"], col]
        if pd.isna(country_name) or not isinstance(country_name, str):
            continue
        record: dict = {}
        for key, row in row_map.items():
            val = df.iloc[row, col]
            if pd.isna(val):
                record[key] = None
            elif key in STRING_KEYS:
                record[key] = str(val).strip()
            else:
                try:
                    # WJP publishes to 4 decimals; everything beyond is noise.
                    record[key] = round(float(val), 4)
                except (ValueError, TypeError):
                    record[key] = None
        records.append(record)
    return records, row_map


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(
        description="Parse the latest WJP ROLI Excel into JSON.",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=repo_root / "data",
        help="Directory containing the source Excel file.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=None,
        help="Specific Excel file to parse (overrides --data-dir auto-discovery).",
    )
    args = parser.parse_args()

    try:
        input_path = args.input if args.input else find_input_file(args.data_dir)
    except FileNotFoundError as e:
        sys.stderr.write(f"{e}\n")
        return 1

    print(f"Input: {input_path}")

    try:
        sheet_name, year = detect_latest_year_sheet(input_path)
    except ValueError as e:
        sys.stderr.write(f"{e}\n")
        return 1

    print(f"Latest sheet: {sheet_name!r} (year {year})")

    countries, row_map = parse_sheet(input_path, sheet_name)
    print(f"Indicators found: {len(row_map)}  Countries: {len(countries)}")

    payload = {
        "year": year,
        "sourceSheet": sheet_name,
        "sourceFile": input_path.name,
        "countries": countries,
    }
    serialized = json.dumps(payload, ensure_ascii=False, indent=2)

    # Two outputs:
    #   - data/roli.json: canonical version-controlled artifact
    #   - public/data/roli.json: served by Vite at runtime
    outputs = [
        repo_root / "data" / "roli.json",
        repo_root / "public" / "data" / "roli.json",
    ]
    for out in outputs:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(serialized, encoding="utf-8")
        print(f"Wrote {out} ({out.stat().st_size:,} bytes)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
