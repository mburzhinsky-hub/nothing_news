#!/usr/bin/env python3
import datetime as dt
import email.utils
import html
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES_PATH = ROOT / "config" / "sources.json"
OUTPUT_PATHS = [
    ROOT / "data" / "news.json",
    ROOT / "public" / "data" / "news.json"
]
MAX_PER_SOURCE = 35
MAX_ITEMS = 120

UA = "NothingNews/0.2 (+https://github.com/mburzhinsky-hub/nothing_news)"

def clean_text(value):
    value = value or ""
    value = re.sub(r"<[^>]*>", " ", value)
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()

def local_name(tag):
    return tag.split("}", 1)[-1].lower()

def child_text(node, names):
    wanted = set(names)
    for child in list(node):
        if local_name(child.tag) in wanted:
            return clean_text("".join(child.itertext()))
    return ""

def child_attr(node, names, attr):
    wanted = set(names)
    for child in list(node):
        if local_name(child.tag) in wanted and child.attrib.get(attr):
            return child.attrib.get(attr)
    return None

def parse_date(value):
    if not value:
        return dt.datetime.now(dt.timezone.utc)
    try:
        parsed = email.utils.parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.astimezone(dt.timezone.utc)
    except Exception:
        pass
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.astimezone(dt.timezone.utc)
    except Exception:
        return dt.datetime.now(dt.timezone.utc)

def classify(text, fallback="Мир"):
    value = text.lower()
    rules = [
        ("Технологии", ["ии", " ai ", "openai", "apple", "google", "microsoft", "технолог", "нейросет", "робот", "чип", "стартап", "смартфон"]),
        ("Бизнес", ["банк", "рынок", "акци", "эконом", "бизнес", "нефт", "рубл", "доллар", "инфляц", "компани"]),
        ("Наука", ["наука", "исследован", "космос", "nasa", "spacex", "учен", "лаборатор"]),
        ("Культура", ["кино", "музык", "культур", "фильм", "сериал", "игр", "театр", "книга"]),
        ("Здоровье", ["здоров", "медицин", "врач", "болезн", "лекарств"]),
        ("Спорт", ["спорт", "футбол", "хоккей", "теннис", "formula", "олимп"])
    ]
    for category, words in rules:
        if any(word in value for word in words):
            return category
    return fallback

def normalize_key(title):
    value = title.lower()
    value = re.sub(r"[^a-zа-яё0-9]+", " ", value, flags=re.I)
    value = re.sub(r"\b(новости|news|сегодня|today)\b", "", value, flags=re.I)
    return re.sub(r"\s+", " ", value).strip()[:110]

def fetch_xml(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/atom+xml, text/xml, */*"})
    with urllib.request.urlopen(req, timeout=15) as response:
        return response.read()

def parse_feed(source):
    raw = fetch_xml(source["url"])
    root = ET.fromstring(raw)

    entries = []
    for node in root.iter():
        if local_name(node.tag) in {"item", "entry"}:
            entries.append(node)

    result = []
    for index, node in enumerate(entries[:MAX_PER_SOURCE]):
        title = child_text(node, {"title"}) or "Без заголовка"
        summary = child_text(node, {"description", "summary", "content", "encoded"})
        link = child_text(node, {"link"})
        if not link:
            for child in list(node):
                if local_name(child.tag) == "link":
                    href = child.attrib.get("href")
                    if href:
                        link = href
                        break

        guid = child_text(node, {"guid", "id"}) or link or title
        date_raw = child_text(node, {"pubdate", "published", "updated", "date"})
        published = parse_date(date_raw)

        enclosure = child_attr(node, {"enclosure"}, "url")
        media = None
        for child in list(node):
            lname = local_name(child.tag)
            if lname in {"content", "thumbnail"} and child.attrib.get("url"):
                media = child.attrib.get("url")
                break

        categories = []
        for child in list(node):
            if local_name(child.tag) == "category":
                term = child.attrib.get("term")
                text = clean_text(term or "".join(child.itertext()))
                if text:
                    categories.append(text)

        category_hint = " ".join(categories) + " " + source.get("category", "Мир")
        category = classify(title + " " + summary + " " + category_hint, source.get("category", "Мир"))

        result.append({
            "id": re.sub(r"[^a-zA-Z0-9_-]", "", guid.encode("utf-8").hex())[:28],
            "title": title,
            "summary": summary[:420],
            "source": source["name"],
            "url": link or source["url"],
            "publishedAt": published.isoformat().replace("+00:00", "Z"),
            "category": category,
            "image": enclosure or media,
            "_sort": published.timestamp()
        })

    return result

def main():
    sources = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))
    errors = []
    collected = []

    for source in sources:
        try:
            items = parse_feed(source)
            collected.extend(items)
            print(f"[ok] {source['name']}: {len(items)}")
        except Exception as exc:
            errors.append({"source": source["name"], "error": str(exc)[:180]})
            print(f"[error] {source['name']}: {exc}")

    deduped = {}
    for item in collected:
        key = normalize_key(item["title"])
        if not key:
            continue
        previous = deduped.get(key)
        if previous is None or item["_sort"] > previous["_sort"]:
            deduped[key] = item

    items = sorted(deduped.values(), key=lambda item: item["_sort"], reverse=True)[:MAX_ITEMS]
    for item in items:
        item.pop("_sort", None)

    payload = {
        "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "items": items,
        "total": len(items),
        "sources": [source["name"] for source in sources],
        "errors": errors
    }

    encoded = json.dumps(payload, ensure_ascii=False, indent=2)
    for output_path in OUTPUT_PATHS:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(encoded, encoding="utf-8")
        print(f"[done] wrote {len(items)} stories to {output_path}")

if __name__ == "__main__":
    main()
