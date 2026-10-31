#!/usr/bin/env python3
"""人物・イベントの Markdown (frontmatter) を data.json へ変換する。
frontmatter は YAML として読み込む（PyYAML が必要）。
使い方: python3 scripts/build.py
出力: data.json (プロジェクトルート)
検証:
  - 人物: 必須項目、born < died、能力値 1-100、id 重複
  - イベント: 必須項目 (id/year/who/title/choices)、choices は各2件以上で text/result を持つ、
    who が実在の人物 id か common であること、year がその人物の生没年の範囲内であること
    （没年と同年のイベントは、没月より前なら起こり得るため警告に留める場合がある）
"""
import json
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("PyYAML が必要です: pip install pyyaml")
    sys.exit(2)

ROOT = Path(__file__).resolve().parent.parent
PEOPLE_DIR = ROOT / "content" / "people"
EVENTS_DIR = ROOT / "content" / "events"
OUT = ROOT / "data.json"

PEOPLE_REQUIRED = ["id", "name", "yomi", "house", "kuni", "born", "died", "rank", "stats", "shukugan", "intro", "events"]
EVENT_REQUIRED = ["id", "year", "who", "title", "choices"]
STAT_KEYS = ["武勇", "知略", "政治", "魅力", "家柄"]


def parse_file(path: Path):
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        raise ValueError(f"{path.name}: frontmatter がありません")
    _, fm, body = text.split("---", 2)
    data = yaml.safe_load(fm) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{path.name}: frontmatter が辞書ではありません")
    data["body"] = body.strip()
    data["_file"] = path.name
    return data


def main():
    errors = []
    warnings = []
    people = []
    seen_ids = set()
    for path in sorted(PEOPLE_DIR.glob("*.md")):
        try:
            person = parse_file(path)
        except Exception as e:
            errors.append(str(e))
            continue
        for key in PEOPLE_REQUIRED:
            if key not in person:
                errors.append(f"{path.name}: 人物の必須項目 {key} がありません")
        if person.get("id") in seen_ids:
            errors.append(f"{path.name}: 人物 id が重複しています: {person.get('id')}")
        seen_ids.add(person.get("id"))
        if isinstance(person.get("born"), int) and isinstance(person.get("died"), int):
            if not person["born"] < person["died"]:
                errors.append(f"{path.name}: born < died になっていません")
            person["lifespan"] = person["died"] - person["born"]
        stats = person.get("stats", {})
        if isinstance(stats, dict):
            for key in STAT_KEYS:
                v = stats.get(key)
                if not isinstance(v, int) or not (1 <= v <= 100):
                    errors.append(f"{path.name}: 能力値 {key} が 1-100 ではありません: {v}")
        people.append(person)

    people_by_id = {p["id"]: p for p in people if "id" in p}

    events = []
    seen_event_ids = set()
    if EVENTS_DIR.exists():
        for path in sorted(EVENTS_DIR.glob("*.md")):
            try:
                event = parse_file(path)
            except Exception as e:
                errors.append(str(e))
                continue
            for key in EVENT_REQUIRED:
                if key not in event:
                    errors.append(f"{path.name}: イベントの必須項目 {key} がありません")
            if event.get("id") in seen_event_ids:
                errors.append(f"{path.name}: イベント id が重複しています: {event.get('id')}")
            seen_event_ids.add(event.get("id"))
            choices = event.get("choices")
            if isinstance(choices, list):
                if len(choices) < 2:
                    errors.append(f"{path.name}: choices は2件以上必要です")
                for i, c in enumerate(choices):
                    if not isinstance(c, dict) or "text" not in c or "result" not in c:
                        errors.append(f"{path.name}: choices[{i}] に text/result がありません")
            who = event.get("who")
            year = event.get("year")
            if who and who != "common":
                person = people_by_id.get(who)
                if person is None:
                    errors.append(f"{path.name}: who の人物が存在しません: {who}")
                elif isinstance(year, int) and isinstance(person.get("born"), int):
                    if not (person["born"] <= year <= person["died"]):
                        errors.append(
                            f"{path.name}: year {year} が {person['name']} の生没年 "
                            f"{person['born']}-{person['died']} の範囲外です"
                        )
                    if year == person["died"]:
                        warnings.append(f"{path.name}: {person['name']} の没年と同年のイベントです（月日の確認を推奨）")
                    # 年齢を付与
                    event["age"] = year - person["born"]
            events.append(event)

    events.sort(key=lambda e: (e.get("year", 0), e.get("month", 0), e.get("id", "")))

    known_event_ids = {e.get("id") for e in events}
    planned = []
    for person in people:
        for eid in person.get("events", []):
            if eid not in known_event_ids:
                planned.append(eid)

    # 人物が参照していない専用イベントがあれば警告（common は除く）
    referenced = {eid for p in people for eid in p.get("events", [])}
    for event in events:
        if event.get("who") != "common" and event.get("id") not in referenced:
            warnings.append(f"{event['_file']}: 人物側の events に登録されていません")

    for w in warnings:
        print(f"警告: {w}")
    if errors:
        print("検証エラー:")
        for e in errors:
            print(f"  - {e}")
        return 1

    out = {
        "version": "0.1-prototype",
        "people": people,
        "events": events,
        "planned_event_ids": planned,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: 人物 {len(people)}人 / イベント {len(events)}件 / 未作成の専用イベント {len(planned)}件 -> {OUT}")
    for p in people:
        own = [e for e in events if e.get("who") == p["id"]]
        print(f"  - {p['name']} ({p['born']}-{p['died']}) 専用イベント {len(own)}件作成済み")
    common = [e for e in events if e.get("who") == "common"]
    for e in common:
        print(f"  - 共通イベント: {e['title']} ({e['year']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
