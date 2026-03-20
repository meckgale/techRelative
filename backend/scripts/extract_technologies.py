"""
Technology Extraction Pipeline
==============================
Hybrid approach: deterministic PDF parsing + LLM enrichment.

Calibrated for "The History of Science and Technology" by Bryan Bunch
and Alexander Hellemans (PDF edition). Font size thresholds and column
detection logic are specific to this book's layout.

Step 1 (parse):   pymupdf font-based extraction of year, category, raw text, cross-refs
Step 2 (enrich):  LLM extracts tech name, description, region from pre-parsed blocks
Step 3 (relate):  Builds relationship edges from "See also" cross-references
Step 4 (export):  Reshapes enriched data into MongoDB seed format

Usage:
    python extract_technologies.py parse    book.pdf              # Step 1: parse only
    python extract_technologies.py enrich   parsed.json           # Step 2: LLM enrichment
    python extract_technologies.py relate   enriched.json         # Step 3: build edges
    python extract_technologies.py export   with_relations.json   # Step 4: MongoDB format
    python extract_technologies.py full     book.pdf              # All steps
    python extract_technologies.py stats    parsed.json           # Show parsing stats
    python extract_technologies.py inspect  book.pdf --pages 0,5  # Dump raw span data

Options:
    --model MODEL       Ollama model name (default: qwen2.5:14b)
    --out   FILE        Output filename (default: auto-generated)
    --pages PAGES       Comma-separated 0-indexed page numbers (for inspect)
"""

import json
import re
import sys
import argparse
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional


# ── Constants ──────────────────────────────────────────────────────────────

# All 19 categories from the book, mapped to their abbreviation codes
CATEGORIES = {
    "Anthropology":              "ANTH",
    "Archaeology":               "ARCH",
    "Astronomy":                 "AST",
    "Biology":                   "BIO",
    "Chemistry":                 "CHEM",
    "Communication":             "COMM",
    "Computers":                 "COMP",
    "Construction":              "CONS",
    "Earth science":             "EAR",
    "Ecology & the environment": "ECOL",
    "Electronics":               "ELEC",
    "Energy":                    "ENER",
    "Food & agriculture":        "FOOD",
    "Materials":                 "MATR",
    "Mathematics":               "MATH",
    "Medicine & health":         "MED",
    "Physics":                   "PHY",
    "Tools":                     "TOOL",
    "Transportation":            "TRAN",
}

ABBREV_TO_CATEGORY = {v: k for k, v in CATEGORIES.items()}

ERAS = [
    {"name": "Prehistoric",   "start": -3000000, "end": -10000},
    {"name": "Neolithic",     "start": -10000,   "end": -3000},
    {"name": "Ancient",       "start": -3000,    "end": -500},
    {"name": "Classical",     "start": -500,     "end": 500},
    {"name": "Medieval",      "start": 500,      "end": 1400},
    {"name": "Early Modern",  "start": 1400,     "end": 1750},
    {"name": "Industrial",    "start": 1750,     "end": 1900},
    {"name": "Modern",        "start": 1900,     "end": 1970},
    {"name": "Information",   "start": 1970,     "end": 2030},
]

# See also references
SEE_ALSO_RE = re.compile(
    r'See\s+also\s+((?:\d[\d,]*\s*(?:BCE|CE|bce|ce)?\s+[A-Za-z]{2,4}(?:\s*;\s*)?)+)',
    re.IGNORECASE
)
SINGLE_REF_RE = re.compile(
    r'(\d[\d,]*)\s*(?:(BCE|CE|bce|ce)\s+)?([A-Za-z]{2,4})',
    re.IGNORECASE
)


# ── Font size thresholds ─────────────────────────────────────────────────
#
# Determined by inspecting the PDF with the `inspect` command.
# Observed font sizes:
#   12.0       bold=True   → Actual year headers  (e.g. "1789", "1950")
#   11.0       bold=True   → Running page header years (top of page) — skip
#   10.6–13.4  non-bold    → Category prefix chars (N, \x01, \x02) — skip
#   10.0       bold=True   → Page numbers  (e.g. "342") — skip
#   10.0       non-bold    → Chapter overview essay text — skip
#   9.5        bold=True   → Category names (e.g. "Astronomy", "Tools")
#   9.4–9.5    non-bold    → Chronicle body text (the actual entries)
#   9.0        bold=True   → BCE/CE suffix after year header
#   8.2        bold=True   → BCE/CE suffix (running header year markers)
#   7.1        non-bold    → See also abbreviations (e.g. "ENER", "TRAN")
#   7.3–8.9    any         → Sidebar / caption text — skip
#   >15.0      any         → Decorative drop caps — skip

SIZE_TOLERANCE       = 0.3   # tolerance for matching font sizes (±pt)
YEAR_SIZE_MIN        = 11.5  # actual year headers are >= 12.0pt; 11.0pt are running headers
RUNNING_HDR_MIN      = 10.6  # running headers (text or year) start at this size
BCE_SIZE_MAX         = 9.1   # BCE/CE suffix spans are <= this (bold=True)
PAGE_NUM_SIZE        = 10.0  # page numbers are exactly ~10.0 bold=True
CATEGORY_SIZE        = 9.5   # category names
BODY_SIZE_MIN        = 9.0   # minimum size for chronicle body text spans
BODY_SIZE_MAX        = 9.6   # maximum: chronicle body is 9.4–9.5; essays are 10.0+
SIDEBAR_SIZE_MIN     = 7.3   # sidebar text lower bound
SIDEBAR_SIZE_MAX     = 8.9   # sidebar text upper bound
SEE_ALSO_ABBREV_SIZE = 7.2   # see-also abbreviations (7.1 observed)
MAX_ENTRY_LEN        = 800   # cap for entry text length (longer entries are likely sidebar leakage)


# ── Data structures ────────────────────────────────────────────────────────

@dataclass
class ParsedEntry:
    id: str
    year: int
    year_display: str
    era: str
    category: str
    category_abbrev: str
    raw_text: str
    see_also_raw: list = field(default_factory=list)
    see_also_parsed: list = field(default_factory=list)
    name: Optional[str] = None
    description: Optional[str] = None
    region: Optional[str] = None
    person: Optional[str] = None
    tags: list = field(default_factory=list)


class ParserState:
    """Mutable state for the PDF span-by-span parser."""

    def __init__(self):
        self.year: Optional[int] = None
        self.year_display: Optional[str] = None
        self.category: Optional[str] = None
        self.category_abbrev: Optional[str] = None
        self.spans: list[str] = []
        self.see_also_complete: bool = False
        self.entries: list[ParsedEntry] = []
        self._entry_counter: dict[str, int] = {}

    def reset_spans(self):
        self.spans = []
        self.see_also_complete = False

    def reset_category(self):
        self.category = None
        self.category_abbrev = None

    def set_year(self, year: int, year_display: str):
        self.year = year
        self.year_display = year_display

    def set_category(self, category: str):
        self.category = category
        self.category_abbrev = CATEGORIES[category]

    def flush_entry(self):
        """Save current accumulated text as a ParsedEntry and reset."""
        if self.year is None or not self.category or not self.spans:
            self.reset_spans()
            return

        raw = clean_entry_text(" ".join(self.spans))

        if len(raw) < 15:
            self.reset_spans()
            return

        # Cap very long entries (likely sidebar leakage).
        # Try to truncate after the last complete "See also" block,
        # otherwise hard-cut at MAX_ENTRY_LEN.
        if len(raw) > MAX_ENTRY_LEN:
            last_see_also = None
            for m in re.finditer(
                r'See\s+also\s+[\d,]+\s*(?:BCE|CE|bce|ce)?\s+[A-Za-z]{2,4}[^.]*\.',
                raw, re.IGNORECASE
            ):
                if m.end() <= MAX_ENTRY_LEN + 200:
                    last_see_also = m
            raw = raw[:last_see_also.end()].strip() if last_see_also else raw[:MAX_ENTRY_LEN].strip()

        see_also_raw, see_also_parsed = extract_see_also(raw)

        key = f"{self.year}_{self.category_abbrev}"
        self._entry_counter[key] = self._entry_counter.get(key, 0) + 1
        entry_id = (
            f"{self.year_display.replace(' ', '_')}"
            f"_{self.category_abbrev}_{self._entry_counter[key] - 1}"
        )

        self.entries.append(ParsedEntry(
            id=entry_id,
            year=self.year,
            year_display=self.year_display,
            era=year_to_era(self.year),
            category=self.category,
            category_abbrev=self.category_abbrev,
            raw_text=raw,
            see_also_raw=see_also_raw,
            see_also_parsed=see_also_parsed,
        ))
        self.reset_spans()


# ── Helper functions ───────────────────────────────────────────────────────

def parse_year(year_num: int, suffix: str) -> int:
    """Convert year number + BCE/CE suffix to signed integer."""
    return -year_num if suffix.upper() == "BCE" else year_num


def year_to_display(year: int) -> str:
    if year < 0:
        return f"{-year:,} BCE"
    return f"{year:,} CE"


def year_to_era(year: int) -> str:
    for era in ERAS:
        if era["start"] <= year < era["end"]:
            return era["name"]
    return "Unknown"


def clean_entry_text(text: str) -> str:
    """Rejoin hyphenated line breaks and normalize whitespace."""
    text = text.replace('\ufb01', 'fi').replace('\ufb02', 'fl')
    text = text.replace('\ufb00', 'ff').replace('\ufb03', 'ffi').replace('\ufb04', 'ffl')
    text = re.sub(r'-\s+', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def extract_see_also(text: str) -> tuple[list[str], list[dict]]:
    raw_refs = []
    parsed_refs = []
    for match in SEE_ALSO_RE.finditer(text):
        ref_block = match.group(1)
        for ref in SINGLE_REF_RE.finditer(ref_block):
            year_num = int(ref.group(1).replace(',', ''))
            bce_ce = ref.group(2).upper() if ref.group(2) else "CE"
            abbrev = ref.group(3).upper()
            if abbrev not in ABBREV_TO_CATEGORY:
                continue
            year_signed = -year_num if bce_ce == "BCE" else year_num
            raw_refs.append(f"{ref.group(1)} {bce_ce} {abbrev}")
            parsed_refs.append({
                "year": year_signed,
                "year_display": f"{ref.group(1)} {bce_ce}",
                "abbrev": abbrev,
                "category": ABBREV_TO_CATEGORY.get(abbrev, "Unknown"),
            })
    return raw_refs, parsed_refs


# ── Span classification ────────────────────────────────────────────────────

def span_is_year_header(size: float, bold: bool, text: str) -> bool:
    """Year headers: large bold numbers like '1789', '1950', '2,500,000'."""
    if size < YEAR_SIZE_MIN or not bold:
        return False
    core = re.sub(r'[,\s–\-]+', '', text)
    return bool(re.match(r'^\d+$', core))


def span_is_bce_ce(size: float, bold: bool, text: str) -> bool:
    """BCE/CE suffix that follows a year header span."""
    return (size <= BCE_SIZE_MAX and bold and
            bool(re.match(r'^(?:BCE|CE)$', text.strip(), re.IGNORECASE)))


def span_is_page_number(size: float, bold: bool, text: str) -> bool:
    """Page numbers: exactly ~10.0pt bold, 2-3 digit number."""
    return (abs(size - PAGE_NUM_SIZE) < SIZE_TOLERANCE and bold and
            bool(re.match(r'^\d{2,3}$', text.strip())))


def span_is_running_header(size: float, bold: bool, text: str) -> bool:
    """Running page/chapter headers to skip.

    Two forms observed:
      1. Text headers: "The Information Age: 1973 through 2003" (11.0pt+ bold, has letters)
      2. Year markers: "1644", "1939" (11.0pt bold, pure digits — distinct from
         actual year headers which are 12.0pt bold)
    """
    if not bold or size < RUNNING_HDR_MIN:
        return False
    stripped = text.strip()
    if len(stripped) > 5 and not re.match(r'^[\d,\s–\-]+$', stripped):
        return True
    if size < YEAR_SIZE_MIN and re.match(r'^[\d,\s–\-]+$', stripped):
        return True
    return False


def span_is_category(size: float, bold: bool, text: str) -> bool:
    """Category names: 9.5pt bold, must be a known category."""
    return (abs(size - CATEGORY_SIZE) < SIZE_TOLERANCE and bold and
            text.strip() in CATEGORIES)


def span_is_sidebar(size: float) -> bool:
    """Sidebar and caption text to skip."""
    return SIDEBAR_SIZE_MIN <= size <= SIDEBAR_SIZE_MAX or size > 15.0


def span_is_body(size: float, bold: bool, text: str) -> bool:
    """Regular chronicle body text and See also abbreviations.

    Chronicle entries use 9.4–9.5pt body text.
    Chapter overview essays use 10.0pt — excluded by BODY_SIZE_MAX.
    """
    if span_is_sidebar(size):
        return False
    if size <= SEE_ALSO_ABBREV_SIZE:
        return True
    if BODY_SIZE_MIN <= size <= BODY_SIZE_MAX:
        if span_is_category(size, bold, text):
            return False
        return True
    return False


# ── Column-aware reading order ────────────────────────────────────────────

def _column_sorted_blocks(page):
    """Return text blocks sorted by column (left->right), then top->bottom
    within each column.

    Key insight: sidebars at various x-positions create false column
    boundaries.  We detect columns using ONLY blocks that contain
    chronicle body-sized text (9.0–9.6pt), then assign ALL blocks
    (including sidebars, headers, etc.) to the nearest detected column.
    """

    raw_blocks = page.get_text("dict", sort=False)["blocks"]
    text_blocks = []
    body_x_starts = []

    for block in raw_blocks:
        if block["type"] != 0:
            continue
        x0, y0, x1, y1 = block["bbox"]
        text_blocks.append((x0, y0, block))

        has_body = any(
            BODY_SIZE_MIN <= round(span["size"], 1) <= BODY_SIZE_MAX
            for line in block["lines"]
            for span in line["spans"]
            if span["text"].strip()
        )
        if has_body:
            body_x_starts.append(round(x0, 0))

    if not text_blocks:
        return []

    page_width = page.rect.width

    if body_x_starts:
        x_starts = sorted(set(body_x_starts))
    else:
        x_starts = sorted(set(round(b[0], 0) for b in text_blocks))

    # A gap of >5% page width (~30pt on a standard page) signals a column break
    gap_threshold = page_width * 0.05
    col_boundaries = [0.0]
    for i in range(1, len(x_starts)):
        if x_starts[i] - x_starts[i - 1] > gap_threshold:
            col_boundaries.append((x_starts[i - 1] + x_starts[i]) / 2)
    col_boundaries.append(page_width + 100)

    # Fallback: if >4 columns detected (unusual layout), use simple top-to-bottom order
    if len(col_boundaries) - 1 > 4:
        text_blocks.sort(key=lambda b: (b[1], b[0]))
        return [b[2] for b in text_blocks]

    def _col_index(x0):
        for c in range(len(col_boundaries) - 1):
            if col_boundaries[c] <= x0 < col_boundaries[c + 1]:
                return c
        return len(col_boundaries) - 2

    text_blocks.sort(key=lambda b: (_col_index(b[0]), b[1], b[0]))
    return [b[2] for b in text_blocks]


# ── Step 1: Parse (pymupdf) ────────────────────────────────────────────────

def parse_book(filepath: str) -> dict:
    """Parse the book PDF into structured entries using font metadata."""
    try:
        import fitz
    except ImportError:
        print("Error: 'pymupdf' not installed. Run: pip install pymupdf")
        sys.exit(1)

    doc = fitz.open(filepath)
    state = ParserState()

    for page_num in range(len(doc)):
        page = doc[page_num]
        ordered_blocks = _column_sorted_blocks(page)

        page_spans = []
        for block in ordered_blocks:
            for line in block["lines"]:
                for span in line["spans"]:
                    text = span["text"]
                    if not text.strip():
                        continue
                    size = round(span["size"], 1)
                    bold = bool(span["flags"] & 2 ** 4)
                    page_spans.append((size, bold, text))

        i = 0
        while i < len(page_spans):
            size, bold, text = page_spans[i]
            stripped = text.strip()

            # ── Year header ──
            if span_is_year_header(size, bold, stripped):
                state.flush_entry()
                state.reset_category()

                raw_year = re.sub(r'[,\s]', '', stripped)
                first_num = re.match(r'\d+', raw_year)
                if not first_num:
                    i += 1
                    continue
                year_num = int(first_num.group())

                # Look ahead for BCE/CE suffix
                era_suffix = "CE"
                for lookahead in (1, 2):
                    if i + lookahead < len(page_spans):
                        ns, nb, nt = page_spans[i + lookahead]
                        if span_is_bce_ce(ns, nb, nt.strip()):
                            era_suffix = nt.strip().upper()
                            i += lookahead
                            break

                # Years > 2100 without a suffix are BCE (no future entries in the book)
                if era_suffix == "CE" and year_num > 2100:
                    era_suffix = "BCE"

                year = parse_year(year_num, era_suffix)
                if year_num >= 10000:
                    display = f"{year_num:,} {era_suffix}"
                else:
                    display = f"{year_num} {era_suffix}"
                state.set_year(year, display)
                i += 1
                continue

            # ── Page number — skip ──
            if span_is_page_number(size, bold, stripped):
                i += 1
                continue

            # ── Running page header — skip ──
            if span_is_running_header(size, bold, stripped):
                if i + 1 < len(page_spans):
                    ns, nb, nt = page_spans[i + 1]
                    if span_is_bce_ce(ns, nb, nt.strip()):
                        i += 1
                i += 1
                continue

            # ── Category name ──
            if span_is_category(size, bold, stripped):
                state.flush_entry()
                state.set_category(stripped)
                i += 1
                continue

            # ── Sidebar / decorative — skip ──
            if span_is_sidebar(size):
                i += 1
                continue

            # ── Body text ──
            if span_is_body(size, bold, stripped) and state.year and state.category:
                # Skip category prefix symbols (1-2 char decorative spans)
                if len(stripped) <= 2:
                    if not stripped[0].isalnum():
                        i += 1
                        continue
                    if bold and abs(size - CATEGORY_SIZE) < SIZE_TOLERANCE:
                        i += 1
                        continue
                    if i + 1 < len(page_spans):
                        ns, nb, nt = page_spans[i + 1]
                        if span_is_category(ns, nb, nt.strip()):
                            i += 1
                            continue

                # New body text after a completed "See also" block means a new entry
                # under the same year+category
                if state.spans and state.see_also_complete:
                    state.flush_entry()

                state.spans.append(stripped)

                # Track "See also" block completion (period after last abbreviation)
                joined = " ".join(state.spans)
                if SEE_ALSO_RE.search(joined) and stripped == '.':
                    state.see_also_complete = True

            i += 1

    state.flush_entry()
    doc.close()

    entries = [asdict(e) for e in state.entries]
    return {
        "entries": entries,
        "stats": {
            "total_entries": len(entries),
            "year_range": {
                "earliest": min(e.year for e in state.entries) if state.entries else None,
                "latest":   max(e.year for e in state.entries) if state.entries else None,
            },
            "categories": dict(sorted(
                {c: sum(1 for e in state.entries if e.category == c)
                 for c in set(e.category for e in state.entries)}.items(),
                key=lambda x: -x[1]
            )),
            "eras": dict(sorted(
                {n: sum(1 for e in state.entries if e.era == n)
                 for n in set(e.era for e in state.entries)}.items(),
                key=lambda x: -x[1]
            )),
        },
    }


# ── Step 2: LLM Enrichment ────────────────────────────────────────────────

CATEGORY_LIST = ", ".join(sorted(CATEGORIES.keys()))

SYSTEM_PROMPT = f"""You are a technology history data extractor. You receive a pre-parsed text block from a history of science/technology book. The year, era, and category have already been determined.

Your job is to extract ONLY what is explicitly stated in the text. Return valid JSON only — no markdown, no explanation, no preamble.

If the text block contains MULTIPLE distinct technologies/inventions, return them all in the array.

For each technology found, extract:
- "name": A short, clear name (2-5 words). Examples: "Aeolipile", "Paper Making", "Armillary Sphere"
- "description": One sentence summarizing what it is/does, from the text only
- "region": Where this was developed or took place. Use specific country or city if mentioned (e.g. "France", "London, England", "Kenya"), otherwise use broader region (e.g. "East Africa", "Mesopotamia"). Use null if no location is mentioned.
- "person": The inventor/scientist name if mentioned, otherwise null
- "tags": Other categories this technology also relates to. Valid categories: [{CATEGORY_LIST}]. Only include categories clearly relevant beyond the primary one. Return as array.

Respond ONLY with this JSON structure:
{{"items": [{{"name": "...", "description": "...", "region": null, "person": null, "tags": []}}]}}

If you cannot extract a clear technology from the text, return: {{"items": []}}"""


def enrich_with_llm(parsed_data: dict, model: str = "qwen2.5:14b") -> dict:
    """Use local LLM to extract tech names and descriptions from parsed entries."""
    try:
        import ollama
    except ImportError:
        print("Error: 'ollama' package not installed. Run: pip install ollama")
        sys.exit(1)

    entries = parsed_data["entries"]
    enriched = []
    failed = []

    # Resume support: pick up where we left off if interrupted
    progress_file = Path(__file__).parent / "enrich_progress.json"
    completed_ids = set()
    if progress_file.exists():
        with open(progress_file) as f:
            progress = json.load(f)
            enriched = progress.get("enriched", [])
            completed_ids = {e["id"] for e in enriched}
        print(f"Resuming: {len(completed_ids)} entries already done")

    print(f"\nEnriching {len(entries)} entries with model '{model}'...")
    print(f"{'─' * 60}")

    for i, entry in enumerate(entries):
        if entry["id"] in completed_ids:
            continue

        year_display = entry["year_display"]
        category = entry["category"]
        raw = entry["raw_text"]

        if len(raw) < 20:
            print(f"  [{i+1}/{len(entries)}] SKIP (too short): {year_display} {category}")
            continue

        prompt = (
            f"Year: {year_display}\n"
            f"Category: {category}\n\n"
            f"Text:\n{raw}"
        )

        try:
            response = ollama.chat(
                model=model,
                options={
                    "temperature": 0.2,
                    "num_predict": 1024,
                },
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": prompt},
                ],
            )

            content = response["message"]["content"]
            content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
            content = re.sub(r'```json\s*|```', '', content).strip()

            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                items = result.get("items", [])

                if items:
                    first = items[0]
                    enriched_entry = {
                        **entry,
                        "name":        first.get("name"),
                        "description": first.get("description"),
                        "region":      first.get("region"),
                        "person":      first.get("person"),
                        "tags":        first.get("tags", []),
                    }
                    enriched.append(enriched_entry)

                    for k, extra in enumerate(items[1:], 1):
                        enriched.append({
                            **entry,
                            "id":          f"{entry['id']}_sub{k}",
                            "name":        extra.get("name"),
                            "description": extra.get("description"),
                            "region":      extra.get("region"),
                            "person":      extra.get("person"),
                            "tags":        extra.get("tags", []),
                        })

                    names = [item.get("name", "?") for item in items]
                    print(f"  [{i+1}/{len(entries)}] ✓ {year_display} {category}: {', '.join(names)}")
                else:
                    # Keep entry with original fields so it isn't silently lost
                    enriched.append(entry)
                    print(f"  [{i+1}/{len(entries)}] ○ {year_display} {category}: no tech found")
            else:
                failed.append({"entry": entry, "response": content})
                print(f"  [{i+1}/{len(entries)}] ✗ {year_display} {category}: no JSON in response")

        except json.JSONDecodeError as e:
            failed.append({"entry": entry, "error": str(e)})
            print(f"  [{i+1}/{len(entries)}] ✗ {year_display} {category}: JSON parse error")
        except Exception as e:
            failed.append({"entry": entry, "error": str(e)})
            print(f"  [{i+1}/{len(entries)}] ✗ {year_display} {category}: {e}")

        # Save progress after each entry for resume support
        with open(progress_file, 'w') as f:
            json.dump({"enriched": enriched, "failed": failed}, f, ensure_ascii=False)

    parsed_data["entries"] = enriched
    parsed_data["enrichment_stats"] = {
        "model":    model,
        "enriched": len(enriched),
        "failed":   len(failed),
    }
    if failed:
        parsed_data["failed_entries"] = failed

    if progress_file.exists():
        progress_file.unlink()

    print(f"\n{'─' * 60}")
    print(f"Enriched: {len(enriched)} | Failed: {len(failed)}")

    return parsed_data


# ── Step 3: Build Relationships ────────────────────────────────────────────

def build_relations(enriched_data: dict) -> dict:
    """Build relationship edges from See also cross-references."""
    entries = enriched_data["entries"]

    lookup = {}
    for entry in entries:
        key = (entry["year"], entry["category_abbrev"])
        if entry.get("name"):
            lookup.setdefault(key, []).append(entry["name"])

    relations = []
    unresolved = []

    for entry in entries:
        if not entry.get("name"):
            continue
        for ref in entry.get("see_also_parsed", []):
            ref_key = (ref["year"], ref["abbrev"])
            targets = lookup.get(ref_key, [])
            if targets:
                for target in targets:
                    if target != entry["name"]:
                        relations.append({
                            "from":      entry["name"],
                            "to":        target,
                            "type":      "related_to",
                            "from_year": entry["year"],
                            "to_year":   ref["year"],
                        })
            else:
                unresolved.append({
                    "from":        entry["name"],
                    "to_ref":      f"{ref['year_display']} {ref['abbrev']}",
                    "to_year":     ref["year"],
                    "to_category": ref.get("category", "Unknown"),
                })

    # Deduplicate (treat A->B and B->A as the same edge)
    seen = set()
    unique_relations = []
    for r in relations:
        key         = (r["from"], r["to"])
        reverse_key = (r["to"],   r["from"])
        if key not in seen and reverse_key not in seen:
            seen.add(key)
            unique_relations.append(r)

    enriched_data["relations"]       = unique_relations
    enriched_data["unresolved_refs"] = unresolved
    enriched_data["relation_stats"]  = {
        "total_relations": len(unique_relations),
        "unresolved_refs": len(unresolved),
    }

    print(f"\nRelations built: {len(unique_relations)}")
    print(f"Unresolved refs (outside dataset): {len(unresolved)}")

    return enriched_data


# ── Step 4: Export for MongoDB ─────────────────────────────────────────────

def export_for_mongo(data: dict, output_path: str):
    """Reshape enriched data into the format expected by the seed script."""
    techs = []
    for entry in data["entries"]:
        if not entry.get("name"):
            continue
        techs.append({
            "name":         entry["name"],
            "year":         entry["year"],
            "year_display": entry["year_display"],
            "era":          entry["era"],
            "category":     entry["category"],
            "tags":         entry.get("tags", []),
            "description":  entry.get("description", ""),
            "region":       entry.get("region", ""),
            "person":       entry.get("person"),
            "see_also":     entry.get("see_also_raw", []),
        })

    mongo_data = {
        "technologies": techs,
        "relations":    data.get("relations", []),
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(mongo_data, f, indent=2, ensure_ascii=False)

    print(f"\nMongoDB seed data exported: {output_path}")
    print(f"  Technologies: {len(techs)}")
    print(f"  Relations:    {len(mongo_data['relations'])}")


# ── Diagnostics ───────────────────────────────────────────────────────────

def page_inspect(filepath: str, pages: list[int]):
    """Dump raw span data from specific pages for debugging font thresholds
    and column detection.  Pages are 0-indexed."""
    try:
        import fitz
    except ImportError:
        print("Error: 'pymupdf' not installed. Run: pip install pymupdf")
        sys.exit(1)

    doc = fitz.open(filepath)
    total_pages = len(doc)

    for page_num in pages:
        if page_num < 0 or page_num >= total_pages:
            print(f"\n⚠  Page {page_num} out of range (0–{total_pages - 1})")
            continue

        page = doc[page_num]
        ordered_blocks = _column_sorted_blocks(page)

        print(f"\n{'═' * 70}")
        print(f"PAGE {page_num}  (column-sorted, {len(ordered_blocks)} text blocks)")
        print(f"{'═' * 70}")

        for bi, block in enumerate(ordered_blocks):
            x0, y0, x1, y1 = block["bbox"]
            print(f"\n  Block {bi}  bbox=({x0:.0f}, {y0:.0f}, {x1:.0f}, {y1:.0f})")
            for line in block["lines"]:
                for span in line["spans"]:
                    text = span["text"]
                    if not text.strip():
                        continue
                    size = round(span["size"], 1)
                    bold = bool(span["flags"] & 2 ** 4)
                    italic = bool(span["flags"] & 2 ** 1)
                    flags_str = ("B" if bold else ".") + ("I" if italic else ".")

                    stripped = text.strip()
                    label = "?"
                    if span_is_year_header(size, bold, stripped):
                        label = "YEAR"
                    elif span_is_page_number(size, bold, stripped):
                        label = "PAGE#"
                    elif span_is_running_header(size, bold, stripped):
                        label = "HEADER"
                    elif span_is_bce_ce(size, bold, stripped):
                        label = "BCE/CE"
                    elif span_is_category(size, bold, stripped):
                        label = "CATEGORY"
                    elif span_is_sidebar(size):
                        label = "SIDEBAR"
                    elif span_is_body(size, bold, stripped):
                        label = "BODY"
                    else:
                        label = "SKIP"

                    preview = stripped[:60] + ("…" if len(stripped) > 60 else "")
                    print(f"    {size:5.1f}pt {flags_str}  [{label:>8s}]  {preview!r}")

    doc.close()


# ── CLI ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Extract technology data from 'History of Science and Technology'",
    )
    parser.add_argument("command",
                        choices=["parse", "enrich", "relate", "full", "stats", "export", "inspect"],
                        help="Pipeline step to run (inspect: dump raw span data for given pages)")
    parser.add_argument("input",  help="Input file path (.pdf for parse/full/inspect, .json for others)")
    parser.add_argument("--model", default="qwen2.5:14b", help="Ollama model (default: qwen2.5:14b)")
    parser.add_argument("--out",   default=None,          help="Output file path")
    parser.add_argument("--pages", default=None,          help="Comma-separated 0-indexed page numbers (for inspect)")

    args = parser.parse_args()

    if args.command == "parse":
        print(f"Parsing PDF: {args.input}")
        result = parse_book(args.input)
        out = args.out or "parsed.json"
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"\nParsed {result['stats']['total_entries']} entries")
        print(f"Output: {out}")
        print(f"\nCategory breakdown:")
        for cat, count in result['stats']['categories'].items():
            print(f"  {cat}: {count}")
        print(f"\nEra breakdown:")
        for era, count in result['stats']['eras'].items():
            print(f"  {era}: {count}")

    elif args.command == "enrich":
        print(f"Loading: {args.input}")
        with open(args.input, 'r') as f:
            data = json.load(f)
        result = enrich_with_llm(data, model=args.model)
        out = args.out or "enriched.json"
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"Output: {out}")

    elif args.command == "relate":
        print(f"Loading: {args.input}")
        with open(args.input, 'r') as f:
            data = json.load(f)
        result = build_relations(data)
        out = args.out or "with_relations.json"
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"Output: {out}")

    elif args.command == "export":
        print(f"Loading: {args.input}")
        with open(args.input, 'r') as f:
            data = json.load(f)
        out = args.out or "seed_data.json"
        export_for_mongo(data, out)

    elif args.command == "full":
        print(f"═══ Full pipeline: {args.input} ═══\n")

        out = args.out or "seed_data.json"
        out_dir = Path(out).parent

        print("── Step 1: Parse ──")
        parsed = parse_book(args.input)
        with open(out_dir / "parsed.json", 'w', encoding='utf-8') as f:
            json.dump(parsed, f, indent=2, ensure_ascii=False)
        print(f"Parsed: {parsed['stats']['total_entries']} entries\n")

        print("── Step 2: Enrich ──")
        enriched = enrich_with_llm(parsed, model=args.model)
        with open(out_dir / "enriched.json", 'w', encoding='utf-8') as f:
            json.dump(enriched, f, indent=2, ensure_ascii=False)

        print("\n── Step 3: Relations ──")
        final = build_relations(enriched)
        with open(out_dir / "with_relations.json", 'w', encoding='utf-8') as f:
            json.dump(final, f, indent=2, ensure_ascii=False)

        print("\n── Step 4: Export ──")
        export_for_mongo(final, out)

    elif args.command == "stats":
        with open(args.input, 'r') as f:
            data = json.load(f)
        stats = data.get("stats", {})
        print(f"Entries: {stats.get('total_entries', len(data.get('entries', [])))}")
        if "categories" in stats:
            print(f"\nCategories:")
            for c, count in stats["categories"].items():
                print(f"  {c}: {count}")
        if "eras" in stats:
            print(f"\nEras:")
            for e, c in stats["eras"].items():
                print(f"  {e}: {c}")
        if "enrichment_stats" in data:
            es = data["enrichment_stats"]
            print(f"\nEnrichment ({es.get('model', '?')}):")
            print(f"  Enriched: {es.get('enriched', 0)}")
            print(f"  Failed:   {es.get('failed', 0)}")
        if "relation_stats" in data:
            rs = data["relation_stats"]
            print(f"\nRelations:       {rs.get('total_relations', 0)}")
            print(f"Unresolved refs: {rs.get('unresolved_refs', 0)}")

    elif args.command == "inspect":
        if not args.pages:
            print("Usage: python extract_technologies.py inspect book.pdf --pages 0,1,2")
            print("  Dumps raw span data with font sizes, bold/italic flags,")
            print("  and classification labels for the given pages (0-indexed).")
            sys.exit(1)
        page_list = [int(p.strip()) for p in args.pages.split(",")]
        page_inspect(args.input, page_list)


if __name__ == "__main__":
    main()
