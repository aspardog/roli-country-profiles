#!/usr/bin/env python3
"""
parse-roli-data.py

Convert the raw WJP Rule of Law Index Excel into the JSON shape consumed by
the dashboard. Auto-detects the latest year present in the file.

How it adapts to new releases:

1. **Input file**: discovered via glob `data/*wjp*rule*of*law*.xlsx`. If WJP
   changes the filename next year, the script still finds it.

2. **Latest year**: scans the sheet names for the pattern
   `WJP ROL Index <YYYY> Scores` (or `<YYYY>-<YYYY>` for hybrid years),
   picks the highest year for the current release, and uses the second-highest
   year from the same workbook for year-over-year comparisons when available.

3. **Row layout**: scans the first column of the selected sheet to discover
   where each indicator lives ("Country", "Region", "Factor N:", "N.M ..."
   patterns). The script does *not* rely on hardcoded row indices, so
   small layout changes (extra blank rows, reordering) don't break it.

4. **Derived stats**: embeds global/regional/income ranks and, when a
   previous-year sheet can be found, year-over-year score changes in each
   country record. Pass `--prev-input` only when you need to override the
   default previous-year detection.

5. **Historical prototype data**: embeds one overall/factor observation per
   edition from 2015 onward, historical global/regional averages, and current
   global/regional/income ranks for each of the eight factors. Combined
   2017-2018 data remains a single edition labeled `2017-18`.

Run:
    python3 scripts/parse-roli-data.py

    # With an explicit previous-year override:
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
    r"WJP\s*ROL\s*Index\s*(\d{4})(?:\s*-\s*(\d{4}))?\s*Scores",
    re.IGNORECASE,
)

FACTOR_PATTERN = re.compile(r"^\s*Factor\s+(\d+)\s*[:.]", re.IGNORECASE)
# Subfactor labels look like "1.1 Government powers..." or "7.6. Civil justice..."
SUBFACTOR_PATTERN = re.compile(r"^\s*(\d+)\.(\d+)\.?\s+\S")

HISTORICAL_START_YEAR = 2015
HISTORICAL_METRIC_KEYS = ("overall",) + tuple(f"f{i}" for i in range(1, 9))
FACTOR_KEYS = tuple(f"f{i}" for i in range(1, 9))


def is_metric_key(key: str) -> bool:
    """Return True for score fields that should participate in averages."""
    return key == "overall" or re.fullmatch(r"(?:f|sf)\d+", key) is not None


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


def list_year_sheets(xlsx_path: Path) -> list[tuple[str, int]]:
    """Return all score sheets as ``(name, final_year)``, newest-first."""
    xl = pd.ExcelFile(xlsx_path)
    candidates: list[tuple[str, int]] = []
    for sheet in xl.sheet_names:
        m = SHEET_YEAR_PATTERN.search(sheet)
        if m:
            # A combined release such as 2017-2018 is one edition whose
            # numeric year is its final year (2018), not two observations.
            candidates.append((sheet, int(m.group(2) or m.group(1))))
    if not candidates:
        raise ValueError(
            f"No 'WJP ROL Index <YYYY> Scores' sheet found in {xlsx_path}. "
            f"Available sheets: {xl.sheet_names}"
        )
    candidates.sort(key=lambda x: x[1], reverse=True)
    return candidates


def edition_label(sheet_name: str) -> str:
    """Build the compact display label used by historical charts."""
    match = SHEET_YEAR_PATTERN.search(sheet_name)
    if not match:
        raise ValueError(f"Could not determine edition label from {sheet_name!r}")
    start_year = int(match.group(1))
    end_year = int(match.group(2) or start_year)
    if start_year == end_year:
        return str(start_year)
    return f"{start_year}-{str(end_year)[-2:]}"


def detect_latest_year_sheet(xlsx_path: Path) -> tuple[str, int]:
    """Find the sheet for the most recent ROLI release."""
    return list_year_sheets(xlsx_path)[0]


def detect_previous_year_sheet(
    xlsx_path: Path, current_year: int
) -> tuple[str, int] | None:
    """Find the most recent score sheet strictly older than the current year."""
    for sheet, year in list_year_sheets(xlsx_path):
        if year < current_year:
            return sheet, year
    return None


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
    preserve_changes: bool = False,
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

    Countries with no match in the previous year get None for the change fields,
    unless ``preserve_changes`` is used while augmenting an existing JSON.
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
        elif not preserve_changes:
            c["globalRankChange"] = None
            c["scoreChange"] = None
            c["pctChange"] = None


def compute_average_profile(countries: list[dict]) -> dict | None:
    """Average overall/factor/subfactor metrics across a country list."""
    if not countries:
        return None

    metric_keys = sorted({k for c in countries for k in c.keys() if is_metric_key(k)})
    profile: dict[str, float | None] = {}

    for key in metric_keys:
        values = [
            c[key]
            for c in countries
            if key in c and c[key] is not None and isinstance(c[key], (int, float))
        ]
        profile[key] = round(sum(values) / len(values), 4) if values else None

    return profile


def compute_aggregate_profiles(countries: list[dict]) -> dict:
    """Build global and regional average profiles for dashboard use."""
    by_region: dict[str, list[dict]] = defaultdict(list)
    for country in countries:
        region = country.get("region")
        if region:
            by_region[region].append(country)

    regional = {
        region: compute_average_profile(region_countries)
        for region, region_countries in sorted(by_region.items())
    }

    return {
        "global": compute_average_profile(countries),
        "regional": regional,
    }


def historical_metric_profile(countries: list[dict]) -> dict[str, float | None]:
    """Average only the overall and eight factor scores for one edition."""
    profile: dict[str, float | None] = {}
    for key in HISTORICAL_METRIC_KEYS:
        values = [
            country.get(key)
            for country in countries
            if isinstance(country.get(key), (int, float))
            and not isinstance(country.get(key), bool)
        ]
        profile[key] = round(sum(values) / len(values), 4) if values else None
    return profile


def parse_historical_editions(
    xlsx_path: Path,
    through_year: int,
) -> list[dict]:
    """Parse score-sheet editions from 2015 through ``through_year``."""
    editions: list[dict] = []
    for sheet_name, year in reversed(list_year_sheets(xlsx_path)):
        if year < HISTORICAL_START_YEAR or year > through_year:
            continue
        records, _ = parse_sheet(xlsx_path, sheet_name)
        editions.append(
            {
                "year": year,
                "label": edition_label(sheet_name),
                "countries": records,
            }
        )
    return editions


def attach_historical_data(
    countries: list[dict],
    editions: list[dict],
) -> list[dict]:
    """Attach country histories and return matching global/regional averages."""
    history_by_code: dict[str, list[dict]] = defaultdict(list)
    historical_averages: list[dict] = []

    for edition in editions:
        edition_countries = edition["countries"]
        year = edition["year"]
        label = edition["label"]

        by_region: dict[str, list[dict]] = defaultdict(list)
        for country in edition_countries:
            region = country.get("region")
            if region:
                by_region[region].append(country)

            code = country.get("code")
            if not code:
                continue
            history_by_code[code].append(
                {
                    "year": year,
                    "label": label,
                    **{key: country.get(key) for key in HISTORICAL_METRIC_KEYS},
                }
            )

        historical_averages.append(
            {
                "year": year,
                "label": label,
                "global": historical_metric_profile(edition_countries),
                "regional": {
                    region: historical_metric_profile(region_countries)
                    for region, region_countries in sorted(by_region.items())
                },
            }
        )

    for country in countries:
        country["history"] = history_by_code.get(country.get("code"), [])

    return historical_averages


def compute_factor_ranks(countries: list[dict]) -> None:
    """Attach current global, regional, and income ranks for factors 1–8."""
    for country in countries:
        country["factorRanks"] = {}

    for factor in FACTOR_KEYS:
        ranked_global = sorted(
            (
                country
                for country in countries
                if isinstance(country.get(factor), (int, float))
                and not isinstance(country.get(factor), bool)
            ),
            key=lambda country: country[factor],
            reverse=True,
        )
        global_ranks = {
            country["code"]: rank for rank, country in enumerate(ranked_global, 1)
        }

        regional_groups: dict[str, list[dict]] = defaultdict(list)
        income_groups: dict[str, list[dict]] = defaultdict(list)
        for country in ranked_global:
            regional_groups[country.get("region") or ""].append(country)
            income_groups[country.get("income") or ""].append(country)

        regional_ranks: dict[str, int] = {}
        regional_totals: dict[str, int] = {}
        for region, region_countries in regional_groups.items():
            total = len(region_countries)
            regional_totals[region] = total
            for rank, country in enumerate(region_countries, 1):
                regional_ranks[country["code"]] = rank

        income_ranks: dict[str, int] = {}
        income_totals: dict[str, int] = {}
        for income, income_countries in income_groups.items():
            total = len(income_countries)
            income_totals[income] = total
            for rank, country in enumerate(income_countries, 1):
                income_ranks[country["code"]] = rank

        for country in countries:
            code = country.get("code")
            region = country.get("region") or ""
            income = country.get("income") or ""
            country["factorRanks"][factor] = {
                "globalRank": global_ranks.get(code),
                "globalTotal": len(ranked_global),
                "regionalRank": regional_ranks.get(code),
                "regionalTotal": regional_totals.get(region, 0),
                "incomeRank": income_ranks.get(code),
                "incomeTotal": income_totals.get(income, 0),
            }


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
    base_payload: dict | None = None

    # ── Current year data ────────────────────────────────────────────────────
    if args.base_json:
        # Skip Excel parsing; load from existing JSON.
        if not args.base_json.exists():
            sys.stderr.write(f"--base-json file not found: {args.base_json}\n")
            return 1
        base_payload = json.loads(args.base_json.read_text(encoding="utf-8"))
        countries = base_payload["countries"]
        year = int(base_payload["year"])
        sheet_name = base_payload.get("sourceSheet", "")
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

    # The current release may come from --base-json, but historical charts still
    # need a score-sheet workbook. Prefer an explicit --input, then the workbook
    # in --data-dir, and finally --prev-input as a best-effort fallback.
    history_input_path: Path | None
    if args.base_json:
        if args.input:
            history_input_path = args.input
        else:
            try:
                history_input_path = find_input_file(args.data_dir)
            except FileNotFoundError:
                history_input_path = args.prev_input
    else:
        history_input_path = input_path

    # ── Previous year data (automatic when available) ───────────────────────
    countries_prev: list[dict] | None = None
    previous_year: int | None = (
        base_payload.get("previousYear") if base_payload is not None else None
    )
    if args.prev_input:
        if not args.prev_input.exists():
            sys.stderr.write(f"--prev-input file not found: {args.prev_input}\n")
            return 1
        try:
            prev_sheet, prev_year = detect_latest_year_sheet(args.prev_input)
            countries_prev, _ = parse_sheet(args.prev_input, prev_sheet)
            previous_year = prev_year
            print(
                f"Previous year: {prev_sheet!r} ({prev_year}), "
                f"{len(countries_prev)} countries"
            )
        except Exception as exc:
            sys.stderr.write(f"Warning: could not parse previous year data: {exc}\n")
    elif history_input_path is not None:
        try:
            prev_sheet_info = detect_previous_year_sheet(history_input_path, year)
            if prev_sheet_info is not None:
                prev_sheet, prev_year = prev_sheet_info
                countries_prev, _ = parse_sheet(history_input_path, prev_sheet)
                previous_year = prev_year
                print(
                    f"Previous year: {prev_sheet!r} ({prev_year}), "
                    f"{len(countries_prev)} countries"
                )
            else:
                print("Previous year: none found in the current workbook")
        except Exception as exc:
            sys.stderr.write(
                "Warning: could not auto-detect previous year data: "
                f"{exc}\n"
            )

    # ── Derived stats ─────────────────────────────────────────────────────────
    aggregates = compute_aggregate_profiles(countries)
    compute_derived_stats(
        countries,
        countries_prev,
        preserve_changes=bool(args.base_json and countries_prev is None),
    )
    compute_factor_ranks(countries)

    historical_averages = (
        base_payload.get("historicalAverages", [])
        if base_payload is not None
        else []
    )
    if history_input_path is not None:
        try:
            editions = parse_historical_editions(history_input_path, year)
            historical_averages = attach_historical_data(countries, editions)
            print(
                f"Historical editions: {len(editions)} "
                f"({editions[0]['label'] if editions else 'none'}–"
                f"{editions[-1]['label'] if editions else 'none'})"
            )
        except Exception as exc:
            sys.stderr.write(f"Warning: could not parse historical data: {exc}\n")
            for country in countries:
                country.setdefault("history", [])
    else:
        for country in countries:
            country.setdefault("history", [])

    has_prev = countries_prev is not None
    print(f"Derived stats computed (year-over-year: {'yes' if has_prev else 'no'})")

    # ── Serialize ─────────────────────────────────────────────────────────────
    payload = {
        "year": year,
        "previousYear": previous_year,
        "sourceSheet": sheet_name,
        "sourceFile": (
            base_payload.get("sourceFile", input_path.name)
            if base_payload is not None
            else input_path.name
        ),
        "averages": aggregates,
        "historicalAverages": historical_averages,
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
