"""Fetch copyright-permissive philosopher portrait candidates.

The script intentionally prefers Wikimedia Commons / Wikidata metadata and
downloads medium-size thumbnails, not unbounded originals. It writes one
metadata JSON next to each image so every asset can be audited before use.
"""

from __future__ import annotations

import csv
import json
import re
import time
import urllib.parse
import urllib.request
import argparse
from urllib.error import HTTPError
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
ATLAS_PATH = ROOT / "data" / "seed" / "philosopher_atlas_rag.json"
PHOTO_ROOT = ROOT / "photo"
MANIFEST_PATH = PHOTO_ROOT / "_portrait_manifest.csv"
GAP_PATH = PHOTO_ROOT / "_portrait_gaps.csv"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
USER_AGENT = "PhilosophyOS portrait research/0.1 (license-audited educational prototype)"
TARGET_PER_PERSON = 2


ALLOWED_LICENSE_MARKERS = (
    "public domain",
    "cc0",
    "cc by",
    "cc-by",
    "attribution",
)
ILLUSTRATION_MARKERS = (
    "painting",
    "portrait",
    "engraving",
    "drawing",
    "illustration",
    "sketch",
    "woodcut",
    "lithograph",
    "bust",
    "statue",
    "sculpture",
    "manuscript",
    "miniature",
    "mosaic",
    "relief",
)
PHOTO_DEPRIORITY_MARKERS = (
    "conference",
    "lecture",
    "meeting",
    "interview",
    "press",
    "festival",
    "2010",
    "2011",
    "2012",
    "2013",
    "2014",
    "2015",
    "2016",
    "2017",
    "2018",
    "2019",
    "2020",
    "2021",
    "2022",
    "2023",
    "2024",
    "2025",
    "2026",
)
REJECT_LICENSE_MARKERS = (
    "noncommercial",
    "non-commercial",
    "no derivatives",
    "noderivatives",
    "fair use",
    "copyrighted free use",
)
REJECT_TITLE_MARKERS = (
    "cricketer",
    "footballer",
    "rugby",
    "ship",
    "vessel",
    "marine",
    "submarine",
    "church interior",
    "church)",
    "chapel interior",
    "university building",
    "school building",
    "street",
    "road",
)


@dataclass(frozen=True)
class Candidate:
    title: str
    page_url: str
    image_url: str
    mime: str
    license_short: str
    license_url: str
    artist: str
    credit: str
    description: str
    source: str
    width: int
    height: int
    score: int


def api_get(url: str, params: dict[str, Any]) -> dict[str, Any]:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{url}?{query}",
        headers={"User-Agent": USER_AGENT},
    )
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            last_error = error
            if error.code == 429:
                time.sleep(5 + attempt * 5)
            else:
                time.sleep(0.7 + attempt * 0.9)
        except Exception as error:
            last_error = error
            time.sleep(0.7 + attempt * 0.9)
    raise RuntimeError(f"api request failed after retries: {last_error}")


def download(url: str, target: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                target.write_bytes(response.read())
            return
        except Exception as error:
            last_error = error
            time.sleep(0.7 + attempt * 0.9)
    raise RuntimeError(f"download failed after retries: {last_error}")


def clean_filename(value: str, limit: int = 90) -> str:
    value = re.sub(r"[\\/:*?\"<>|]+", "_", value)
    value = re.sub(r"\s+", "_", value).strip("._ ")
    return value[:limit] or "portrait"


def clean_dirname(value: str) -> str:
    return re.sub(r"[\\/:*?\"<>|]+", "_", value).strip() or "unknown"


def ext_from_mime(mime: str, title: str) -> str:
    suffix = Path(title).suffix.lower().strip(".")
    if suffix in {"jpg", "jpeg", "png", "webp"}:
        return "jpg" if suffix == "jpeg" else suffix
    if mime == "image/png":
        return "png"
    if mime == "image/webp":
        return "webp"
    return "jpg"


def metadata_value(extmetadata: dict[str, Any], key: str) -> str:
    value = extmetadata.get(key, {})
    if isinstance(value, dict):
        raw = value.get("value", "")
    else:
        raw = value
    return re.sub(r"<[^>]+>", "", str(raw or "")).strip()


def license_allowed(license_short: str, usage_terms: str, license_url: str) -> bool:
    text = f"{license_short} {usage_terms} {license_url}".casefold()
    if any(marker in text for marker in REJECT_LICENSE_MARKERS):
        return False
    return any(marker in text for marker in ALLOWED_LICENSE_MARKERS)


def score_candidate(candidate: Candidate, record: dict[str, Any]) -> int:
    haystack = f"{candidate.title} {candidate.description}".casefold()
    english = str(record["name_original"]).casefold()
    name_parts = [part for part in re.split(r"[\s,.-]+", english) if len(part) > 2]
    score = 0
    if english in haystack:
        score += 8
    for part in name_parts:
        if part in haystack:
            score += 2
    for marker in ILLUSTRATION_MARKERS:
        if marker in haystack:
            score += 2
    for marker in PHOTO_DEPRIORITY_MARKERS:
        if marker in haystack:
            score -= 2
    if "photo" in haystack or "photograph" in haystack:
        score -= 1
    if candidate.license_short.casefold() in {"public domain", "cc0"}:
        score += 3
    if candidate.width >= 450 and candidate.height >= 450:
        score += 1
    return score


def build_candidate(page: dict[str, Any], record: dict[str, Any], source: str) -> Candidate | None:
    imageinfo = (page.get("imageinfo") or [{}])[0]
    mime = str(imageinfo.get("mime", ""))
    if mime not in {"image/jpeg", "image/png", "image/webp"}:
        return None
    extmetadata = imageinfo.get("extmetadata") or {}
    license_short = metadata_value(extmetadata, "LicenseShortName")
    usage_terms = metadata_value(extmetadata, "UsageTerms")
    license_url = metadata_value(extmetadata, "LicenseUrl")
    if not license_allowed(license_short, usage_terms, license_url):
        return None
    image_url = str(imageinfo.get("thumburl") or imageinfo.get("url") or "")
    if not image_url:
        return None
    title = str(page.get("title", ""))
    title_check = title.casefold()
    if any(marker in title_check for marker in REJECT_TITLE_MARKERS):
        return None
    candidate = Candidate(
        title=title,
        page_url=str(imageinfo.get("descriptionurl") or ""),
        image_url=image_url,
        mime=mime,
        license_short=license_short or usage_terms,
        license_url=license_url,
        artist=metadata_value(extmetadata, "Artist"),
        credit=metadata_value(extmetadata, "Credit"),
        description=metadata_value(extmetadata, "ImageDescription"),
        source=source,
        width=int(imageinfo.get("thumbwidth") or imageinfo.get("width") or 0),
        height=int(imageinfo.get("thumbheight") or imageinfo.get("height") or 0),
        score=0,
    )
    return candidate.__class__(
        **{**candidate.__dict__, "score": score_candidate(candidate, record)}
    )


def commons_files_for_titles(titles: list[str], record: dict[str, Any], source: str) -> list[Candidate]:
    if not titles:
        return []
    pages: list[dict[str, Any]] = []
    for start in range(0, len(titles), 40):
        data = api_get(
            COMMONS_API,
            {
                "action": "query",
                "format": "json",
                "prop": "imageinfo",
                "titles": "|".join(titles[start : start + 40]),
                "iiprop": "url|mime|size|extmetadata",
                "iiurlwidth": 1000,
            },
        )
        pages.extend((data.get("query") or {}).get("pages", {}).values())
        time.sleep(0.1)
    return [
        candidate
        for page in pages
        if (candidate := build_candidate(page, record, source)) is not None
    ]


def commons_search(record: dict[str, Any]) -> list[Candidate]:
    terms = [
        f"{record['name_original']} painting",
        f"{record['name_original']} engraving",
        f"{record['name_original']} drawing",
        f"{record['name_original']} illustration",
        f"{record['name_original']} portrait",
        f"{record['name_original']} bust",
        f"{record['name_original']} statue",
        f"{record['name_original']} sculpture",
        str(record["name_original"]),
    ]
    titles: list[str] = []
    seen: set[str] = set()
    for term in terms:
        data = api_get(
            COMMONS_API,
            {
                "action": "query",
                "format": "json",
                "generator": "search",
                "gsrnamespace": 6,
                "gsrlimit": 12,
                "gsrsearch": term,
                "prop": "imageinfo",
                "iiprop": "url|mime|size|extmetadata",
                "iiurlwidth": 1000,
            },
        )
        for page in (data.get("query") or {}).get("pages", {}).values():
            title = str(page.get("title", ""))
            if title and title not in seen:
                seen.add(title)
                titles.append(title)
        time.sleep(0.1)
    return commons_files_for_titles(titles, record, "commons-search")


def wikidata_images(record: dict[str, Any]) -> list[Candidate]:
    search = api_get(
        WIKIDATA_API,
        {
            "action": "wbsearchentities",
            "format": "json",
            "language": "en",
            "search": record["name_original"],
            "limit": 3,
        },
    )
    qids = [item["id"] for item in search.get("search", []) if item.get("id")]
    if not qids:
        return []
    entities = api_get(
        WIKIDATA_API,
        {
            "action": "wbgetentities",
            "format": "json",
            "ids": "|".join(qids),
            "props": "claims|sitelinks",
        },
    )
    titles: list[str] = []
    category_titles: list[str] = []
    for entity in entities.get("entities", {}).values():
        claims = entity.get("claims", {})
        for claim in claims.get("P18", [])[:3]:
            value = (
                claim.get("mainsnak", {})
                .get("datavalue", {})
                .get("value")
            )
            if value:
                titles.append(f"File:{value}")
        commons_title = (
            entity.get("sitelinks", {})
            .get("commonswiki", {})
            .get("title")
        )
        if commons_title and str(commons_title).startswith("Category:"):
            category_titles.append(str(commons_title))
    candidates = commons_files_for_titles(titles, record, "wikidata-p18")
    for category in category_titles[:2]:
        data = api_get(
            COMMONS_API,
            {
                "action": "query",
                "format": "json",
                "generator": "categorymembers",
                "gcmtitle": category,
                "gcmtype": "file",
                "gcmlimit": 20,
                "prop": "imageinfo",
                "iiprop": "url|mime|size|extmetadata",
                "iiurlwidth": 1000,
            },
        )
        for page in (data.get("query") or {}).get("pages", {}).values():
            candidate = build_candidate(page, record, f"wikidata-commons-category:{category}")
            if candidate is not None:
                candidates.append(candidate)
        time.sleep(0.1)
    return candidates


def collect_candidates(record: dict[str, Any], target: int = TARGET_PER_PERSON) -> list[Candidate]:
    candidates: list[Candidate] = []
    try:
        candidates.extend(wikidata_images(record))
    except Exception as error:
        print(f"  warning: wikidata_images failed for {record['name_original']}: {error}")
    if len(candidates) < target:
        try:
            candidates.extend(commons_search(record))
        except Exception as error:
            print(f"  warning: commons_search failed for {record['name_original']}: {error}")
    best_by_title: dict[str, Candidate] = {}
    for candidate in candidates:
        existing = best_by_title.get(candidate.title)
        if existing is None or candidate.score > existing.score:
            best_by_title[candidate.title] = candidate
    return sorted(best_by_title.values(), key=lambda item: (-item.score, item.title))


def write_metadata(path: Path, candidate: Candidate, record: dict[str, Any]) -> None:
    payload = {
        "philosopher": {
            "id": record["id"],
            "name_zh": record["name_zh"],
            "name_original": record["name_original"],
            "era": record.get("era"),
            "period": record.get("period"),
        },
        "asset": {
            "title": candidate.title,
            "source": candidate.source,
            "page_url": candidate.page_url,
            "image_url": candidate.image_url,
            "mime": candidate.mime,
            "width": candidate.width,
            "height": candidate.height,
            "score": candidate.score,
        },
        "rights": {
            "license_short": candidate.license_short,
            "license_url": candidate.license_url,
            "artist": candidate.artist,
            "credit": candidate.credit,
            "description": candidate.description,
            "commercial_review": "candidate_allowed_by_metadata_needs_human_audit",
        },
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=0, help="Maximum records to process; 0 means all.")
    parser.add_argument("--offset", type=int, default=0, help="Number of records to skip before processing.")
    parser.add_argument("--target", type=int, default=TARGET_PER_PERSON, help="Images required per person.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    records = json.loads(ATLAS_PATH.read_text(encoding="utf-8"))
    if args.offset:
        records = records[args.offset :]
    if args.limit:
        records = records[: args.limit]
    PHOTO_ROOT.mkdir(parents=True, exist_ok=True)
    manifest_rows: list[dict[str, Any]] = []
    gap_rows: list[dict[str, Any]] = []

    for index, record in enumerate(records, start=1):
        name_zh = str(record["name_zh"])
        target_dir = PHOTO_ROOT / clean_dirname(name_zh)
        target_dir.mkdir(parents=True, exist_ok=True)
        existing_images = [
            path for path in target_dir.iterdir()
            if path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
        ]
        existing_titles: set[str] = set()
        for metadata_path in target_dir.glob("*.metadata.json"):
            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            title = (metadata.get("asset") or {}).get("title")
            if title:
                existing_titles.add(str(title))
        if len(existing_images) >= args.target:
            manifest_rows.append(
                {
                    "id": record["id"],
                    "name_zh": name_zh,
                    "name_original": record["name_original"],
                    "downloaded": len(existing_images),
                    "status": "already_has_assets",
                    "notes": "",
                }
            )
            continue

        print(f"[{index}/{len(records)}] searching {name_zh} / {record['name_original']}")
        try:
            candidates = collect_candidates(record, args.target)
        except Exception as error:
            manifest_rows.append(
                {
                    "id": record["id"],
                    "name_zh": name_zh,
                    "name_original": record["name_original"],
                    "downloaded": len(existing_images),
                    "status": "partial" if existing_images else "error",
                    "notes": f"search_error: {error}",
                }
            )
            gap_rows.append(
                {
                    "id": record["id"],
                    "name_zh": name_zh,
                    "name_original": record["name_original"],
                    "found": 0,
                    "needed": args.target,
                    "reason": f"search_error: {error}",
                }
            )
            continue

        downloaded = len(existing_images)
        used_titles = {path.stem for path in existing_images}
        for candidate in candidates:
            if downloaded >= args.target:
                break
            if candidate.title in existing_titles:
                continue
            extension = ext_from_mime(candidate.mime, candidate.title)
            title_stem = Path(candidate.title.replace("File:", "")).stem
            stem = f"{downloaded + 1:02d}_{clean_filename(title_stem)}"
            if stem in used_titles:
                continue
            image_path = target_dir / f"{stem}.{extension}"
            metadata_path = target_dir / f"{stem}.metadata.json"
            try:
                download(candidate.image_url, image_path)
                write_metadata(metadata_path, candidate, record)
            except Exception as error:
                print(f"  failed {candidate.title}: {error}")
                continue
            downloaded += 1
            used_titles.add(stem)
            existing_titles.add(candidate.title)
            print(f"  saved {image_path.name} ({candidate.license_short})")

        manifest_rows.append(
            {
                "id": record["id"],
                "name_zh": name_zh,
                "name_original": record["name_original"],
                "downloaded": downloaded,
                "status": "ok" if downloaded >= args.target else "partial",
                "notes": "",
            }
        )
        if downloaded < args.target:
            gap_rows.append(
                {
                    "id": record["id"],
                    "name_zh": name_zh,
                    "name_original": record["name_original"],
                    "found": downloaded,
                    "needed": args.target,
                    "reason": "not_enough_license_allowed_candidates",
                }
            )

    with MANIFEST_PATH.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=["id", "name_zh", "name_original", "downloaded", "status", "notes"],
        )
        writer.writeheader()
        writer.writerows(manifest_rows)

    with GAP_PATH.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=["id", "name_zh", "name_original", "found", "needed", "reason"],
        )
        writer.writeheader()
        writer.writerows(gap_rows)

    ok_count = sum(1 for row in manifest_rows if row["status"] in {"ok", "already_has_assets"})
    print(f"done: {ok_count}/{len(manifest_rows)} people have at least {args.target} images")
    print(f"manifest: {MANIFEST_PATH}")
    print(f"gaps: {GAP_PATH}")


if __name__ == "__main__":
    main()
