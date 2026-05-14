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

4. **Derived stats** (optional): pass `--prev-input` with the previous year's
   Excel (or historical data file) to embed global/regional/income ranks and
   year-over-year score changes in each country record. These fields power
   the stats card in the UI.

Run:
    python3 scripts/parse-roli-data.py

    # With year-over-year stats:
    python3 scripts/parse-roli-data.py \\
        --prev-input path/to/FINAL_2024_historical_data.xlsx

    # Augment an already-parsed JSON without re-parsing the source Excel:
    python3 scripts/parse-roli-data.py \\
        --base-json public/data/roli.json \\
        --prev-input path/to/FINAL_2024_historical_data.xlsx

Requirements:
    pip install pandas openpyxl
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
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


def compute_derived_stats(
    countries: list[dict],
    countries_prev: list[dict] | None = None,
) -> None:
    """
    Annotate each country record in-place with ranking and year-over-year stats.

    Added fields:
        globalRank, globalTotal         — rank among all countries by overall score
        regionalRank, regionalTotal     — rank within the same region
        incomeRank, incomeTotal         — rank within the same income group
        globalRankChange                — prev_rank - cur_rank (positive = moved up)
        scoreChange                     — cur_overall - prev_overall
        pctChange                       — % change (2 decimal places)

    Countries with no match in the previous year get None for the change fields.
    """
    # Sort by overall descending (None treated as 0 for ranking)
    sorted_cur = sorted(countries, key=lambda c: c.get("overall") or 0, reverse=True)
    global_total = len(sorted_cur)

    global_rank_cur: dict[str, int] = {}
    for rank, c in enumerate(sorted_cur, 1):
        global_rank_cur[c["code"]] = rank

    # Regional ranks (preserve the same sort order within each region)
    by_region: dict[str, list[dict]] = defaultdict(list)
    for c in sorted_cur:
        by_region[c.get("region") or ""].append(c)

    regional_rank: dict[str, int] = {}
    regional_total: dict[str, int] = {}
    for region_list in by_region.values():
        n = len(region_list)
        for rank, c in enumerate(region_list, 1):
            regional_rank[c["code"]] = rank
            regional_total[c["code"]] = n

    # Income ranks
    by_income: dict[str, list[dict]] = defaultdict(list)
    for c in sorted_cur:
        by_income[c.get("income") or ""].append(c)

    income_rank: dict[str, int] = {}
    income_total: dict[str, int] = {}
    for income_list in by_income.values():
        n = len(income_list)
        for rank, c in enumerate(income_list, 1):
            income_rank[c["code"]] = rank
            income_total[c["code"]] = n

    # Previous year lookup
    prev_by_code: dict[str, dict] = {}
    if countries_prev:
        sorted_prev = sorted(
            countries_prev, key=lambda c: c.get("overall") or 0, reverse=True
        )
        for rank, c in enumerate(sorted_prev, 1):
            prev_by_code[c["code"]] = {
                "rank": rank,
                "overall": c.get("overall"),
            }

    # Annotate
    for c in countries:
        code = c["code"]
        c["globalRank"] = global_rank_cur.get(code)
        c["globalTotal"] = global_total
        c["regionalRank"] = regional_rank.get(code)
        c["regionalTotal"] = regional_total.get(code)
        c["incomeRank"] = income_rank.get(code)
        c["incomeTotal"] = income_total.get(code)

        prev = prev_by_code.get(code)
        if prev is not None:
            cur_r = global_rank_cur.get(code, 0)
            c["globalRankChange"] = prev["rank"] - cur_r  # positive = improved
            cur_s = c.get("overall")
            prev_s = prev["overall"]
            if cur_s is not None and prev_s is not None and prev_s != 0:
                c["scoreChange"] = round(cur_s - prev_s, 4)
                c["pctChange"] = round((cur_s - prev_s) / prev_s * 100, 2)
            else:
                c["scoreChange"] = None
                c["pctChange"] = None
        else:
            c["globalRankChange"] = None
            c["scoreChange"] = None
            c["pctChange"] = None


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
    parser.add_argument(
        "--base-json",
        type=Path,
        default=None,
        help=(
            "Load current-year data from an existing roli.json instead of parsing "
            "an Excel file. Useful when augmenting an already-parsed file with "
            "derived stats via --prev-input."
        ),
    )
    parser.add_argument(
        "--prev-input",
        type=Path,
        default=None,
        help=(
            "Excel file for the previous year (e.g. the WJP historical data file). "
            "Used to compute year-over-year rank changes and score deltas. "
            "The script picks the latest score sheet it finds in this file."
        ),
    )
    args = parser.parse_args()

    # ── Current year data ────────────────────────────────────────────────────
    if args.base_json:
        # Skip Excel parsing; load from existing JSON.
        if not args.base_json.exists():
            sys.stderr.write(f"--base-json file not found: {args.base_json}\n")
            return 1
        payload = json.loads(args.base_json.read_text(encoding="utf-8"))
        countries = payload["countries"]
        year = payload["year"]
        sheet_name = payload.get("sourceSheet", "")
        input_path = args.base_json
        print(f"Base JSON: {args.base_json} (year {year}, {len(countries)} countries)")
    else:
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

        countries, _ = parse_sheet(input_path, sheet_name)
        print(f"Countries: {len(countries)}")

    # ── Previous year data (optional) ────────────────────────────────────────
    countries_prev: list[dict] | None = None
    if args.prev_input:
        if not args.prev_input.exists():
            sys.stderr.write(f"--prev-input file not found: {args.prev_input}\n")
            return 1
        try:
            prev_sheet, prev_year = detect_latest_year_sheet(args.prev_input)
            countries_prev, _ = parse_sheet(args.prev_input, prev_sheet)
            print(
                f"Previous year: {prev_sheet!r} ({prev_year}), "
                f"{len(countries_prev)} countries"
            )
        except Exception as exc:
            sys.stderr.write(f"Warning: could not parse previous year data: {exc}\n")

    # ── Derived stats ─────────────────────────────────────────────────────────
    compute_derived_stats(countries, countries_prev)
    has_prev = countries_prev is not None
    print(f"Derived stats computed (year-over-year: {'yes' if has_prev else 'no'})")

    # ── Serialize ─────────────────────────────────────────────────────────────
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
