import csv
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

# Match exactly two Unicode letters followed by exactly one digit anywhere in the header.
# Exclude underscore explicitly so the two-character prefix contains only letters.
# Examples:
#  - "[Pu1: ...]" -> group1="Pu", group2="1" (matches)
#  - "C2" -> does NOT match (only one letter)
PREFIX_PATTERN = re.compile(r"([^\d\W_]{2})(\d)", re.UNICODE)
MISC_GROUP = "MISC"

BASE_DIR = Path(__file__).resolve().parents[1]
INPUT_FILE = BASE_DIR / "data.json"
# INPUT_FILE = BASE_DIR / "data2.json"
OUTPUT_DIR = BASE_DIR / "data" / "csv"
TEXT_OUTPUT_DIR = OUTPUT_DIR / "text"


# Map column code -> transform function (receives numeric value, returns transformed value)
# Example: COLUMN_TRANSFORMS = {"DH1": lambda value: 5 - value if value is not None else None}
COLUMN_TRANSFORMS = {
    "BE5": lambda value: 5 - value if value is not None else None,
    "DH4": lambda value: 5 - value if value is not None else None,
    "KT4": lambda value: 5 - value if value is not None else None,
    "PV4": lambda value: 5 - value if value is not None else None,
    "BL5": lambda value: 5 - value if value is not None else None,
    "OR5": lambda value: 5 - value if value is not None else None,
    "YE5": lambda value: 5 - value if value is not None else None,
    "TQ5": lambda value: 5 - value if value is not None else None,
}


def normalize_value(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def slugify(text):
    if not text:
        return "COLUMN"
    normalized = unicodedata.normalize("NFD", text)
    without_marks = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", without_marks).strip("_")
    return cleaned.upper() or "COLUMN"


def load_rows():
    with INPUT_FILE.open("r", encoding="utf-8") as fh:
        payload = json.load(fh)
    raw_rows = payload.get("rows", [])
    filtered = []
    for candidate in raw_rows:
        if not isinstance(candidate, dict):
            continue
        cells = [cell for cell in candidate.values() if isinstance(cell, dict)]
        if any(cell.get("header") or cell.get("value") is not None for cell in cells):
            filtered.append(candidate)
    return filtered


def extract_cell_value(row, column):
    cell = row.get(column)
    if isinstance(cell, dict):
        return normalize_value(cell.get("value"))
    return ""


def extract_records_metadata(rows):
    metadata = []
    for idx, row in enumerate(rows, start=1):
        record_id = extract_cell_value(row, "A") or str(idx)
        metadata.append(
            {
                "id": record_id,
                "gender": extract_cell_value(row, "C"),
                "grade": extract_cell_value(row, "D"),
                "school": extract_cell_value(row, "E"),
            }
        )
    return metadata


def collect_groups(rows):
    groups = defaultdict(lambda: defaultdict(dict))
    headers = defaultdict(dict)
    for idx, row in enumerate(rows, start=1):
        for cell in row.values():
            if not isinstance(cell, dict):
                continue
            header = str(cell.get("header", "")).strip()
            if not header:
                continue
            value = normalize_value(cell.get("value"))
            match = PREFIX_PATTERN.search(header)
            if match:
                prefix = match.group(1).upper()
                column_code = f"{prefix}{match.group(2)}"
            else:
                prefix = MISC_GROUP
                column_code = slugify(header)
            headers[prefix][column_code] = header
            groups[prefix][idx][column_code] = value
    return groups, headers


def sort_columns(prefix, columns):
    if prefix == MISC_GROUP:
        return sorted(columns)
    sortable = []
    for column in columns:
        match = PREFIX_PATTERN.search(column)
        order = int(match.group(2)) if match else float("inf")
        sortable.append((order, column))
    sortable.sort()
    return [column for _, column in sortable]


def parse_numeric(value):
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return float(text)
        except ValueError:
            return None
    return None


def apply_transform(column, numeric_value):
    transform = COLUMN_TRANSFORMS.get(column)
    if transform is None:
        return numeric_value
    try:
        return transform(numeric_value)
    except Exception:
        return numeric_value


def format_output(value):
    if value is None or value == "":
        return ""
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return f"{value:.6g}"
    if isinstance(value, int):
        return str(value)
    return str(value)


def prepare_cell(column, raw_value):
    if raw_value in (None, ""):
        return "", None
    numeric_value = parse_numeric(raw_value)
    transformed_numeric = apply_transform(column, numeric_value) if numeric_value is not None else numeric_value
    display_value = transformed_numeric if transformed_numeric is not None else raw_value
    numeric_for_stats = transformed_numeric if isinstance(transformed_numeric, (int, float)) else parse_numeric(display_value)
    return format_output(display_value), numeric_for_stats


def determine_level(average_value):
    if average_value is None:
        return ""
    if average_value >= 4:
        return "Cao"
    if average_value >= 2:
        return "Trung bình"
    return "Thấp"


def write_group_csv(prefix, id_map, columns, records):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    file_path = OUTPUT_DIR / f"{prefix.lower()}.csv"
    transform_columns = set(COLUMN_TRANSFORMS.keys())
    output_column_sequence = []
    for column in columns:
        if column in transform_columns:
            output_column_sequence.append((f"{column}_raw", column, "raw"))
        output_column_sequence.append((column, column, "value"))
    with file_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "id",
                "gender",
                "grade",
                "school",
                *[entry[0] for entry in output_column_sequence],
                "sum",
                "average",
                "level",
            ]
        )
        for row_index, record in enumerate(records, start=1):
            row_data = id_map.get(row_index, {})
            processed_values = []
            per_column_cache = {}
            row_sum_value = 0.0
            row_numeric_count = 0
            for column in columns:
                raw_value = row_data.get(column, "")
                display_value, numeric_value = prepare_cell(column, raw_value)
                per_column_cache[column] = {
                    "raw": format_output(raw_value),
                    "display": display_value,
                    "numeric": numeric_value,
                }
                if numeric_value is not None:
                    row_sum_value += numeric_value
                    row_numeric_count += 1
            for _, base_column, kind in output_column_sequence:
                cached = per_column_cache.get(base_column, {"raw": "", "display": ""})
                if kind == "raw":
                    processed_values.append(cached.get("raw", ""))
                else:
                    processed_values.append(cached.get("display", ""))
            if row_numeric_count > 0:
                row_average_value = row_sum_value / row_numeric_count
                processed_values.append(format_output(row_sum_value))
                processed_values.append(format_output(row_average_value))
                processed_values.append(determine_level(row_average_value))
            else:
                processed_values.append("")
                processed_values.append("")
                processed_values.append("")
            writer.writerow(
                [
                    record["id"],
                    record["gender"],
                    record["grade"],
                    record["school"],
                    *processed_values,
                ]
            )

    # Write text-mapped CSV variant
    TEXT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    text_file_path = TEXT_OUTPUT_DIR / f"{prefix.lower()}_text.csv"
    with text_file_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "id",
                "gender",
                "grade",
                "school",
                *[
                    entry_name
                    for entry_name, _, entry_type in output_column_sequence
                    if entry_type != "raw"
                ],
                "level",
            ]
        )

        def map_value(value):
            mapping = {
                "1": "Rất không đồng ý",
                "2": "Không đồng ý",
                "3": "Phân vân / Bình thường",
                "4": "Đồng ý",
                "5": "Rất đồng ý",
            }
            return mapping.get(value, value)

        for row_index, record in enumerate(records, start=1):
            row_data = id_map.get(row_index, {})
            processed_values = []
            per_column_cache = {}
            row_sum_value = 0.0
            row_numeric_count = 0
            for column in columns:
                raw_value = row_data.get(column, "")
                display_value, numeric_value = prepare_cell(column, raw_value)
                per_column_cache[column] = {
                    "raw": raw_value,
                    "display": display_value,
                    "numeric": numeric_value,
                }
                if numeric_value is not None:
                    row_sum_value += numeric_value
                    row_numeric_count += 1
            for entry_name, base_column, entry_type in output_column_sequence:
                if entry_type == "raw":
                    continue
                cached = per_column_cache.get(base_column, {"raw": "", "display": ""})
                origin_value = cached.get("raw", "")
                formatted = format_output(origin_value)
                processed_values.append(map_value(formatted))
            if row_numeric_count > 0:
                row_average_value = row_sum_value / row_numeric_count
                processed_values.append(determine_level(row_average_value))
            else:
                processed_values.append("")
            writer.writerow(
                [
                    record["id"],
                    record["gender"],
                    record["grade"],
                    record["school"],
                    *processed_values,
                ]
            )


def write_metadata(headers):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    metadata_path = OUTPUT_DIR / "_column_labels.json"
    metadata = {prefix: dict(sorted(columns.items())) for prefix, columns in headers.items()}
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_records_metadata(records):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    file_path = OUTPUT_DIR / "_records_metadata.csv"
    with file_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["id", "gender", "grade", "school"])
        for record in records:
            writer.writerow([record["id"], record["gender"], record["grade"], record["school"]])


def main():
    rows = load_rows()
    records = extract_records_metadata(rows)
    groups, headers = collect_groups(rows)
    total_rows = len(rows)
    for prefix, id_map in groups.items():
        columns = sort_columns(prefix, headers[prefix].keys())
        for row_id in range(1, total_rows + 1):
            id_map.setdefault(row_id, {})
        if columns:
            write_group_csv(prefix, id_map, columns, records)
    write_metadata(headers)
    write_records_metadata(records)


if __name__ == "__main__":
    main()
