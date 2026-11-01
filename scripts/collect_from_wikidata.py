#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Wikidata 収集プロトタイプ v0.1

種リスト（人物・城館の名前）から Wikidata を検索し、
QID・生没年・緯度経度・日本語 Wikipedia の記事名を集めて
Markdown レポートを生成する。

方針:
- 取りに行くのは「事実の骨格」だけ（名前・生没年・座標・出典リンク）。
  Wikipedia の文章は取り込まない。文章は本作で自前に書く。
- 検索の第1候補を機械的に採用するため、誤同定がありうる。
  レポートは「下書きの材料」であり、正本データではない。
  人の確認を通してから取り込むこと。

使い方:
  python3 scripts/collect_from_wikidata.py
  -> docs/collection-prototype-v0.1.md を生成
"""

import json
import time
import urllib.parse
import urllib.request
from datetime import date

API = "https://www.wikidata.org/w/api.php"
UA = {"User-Agent": "OuIsshourokuCollector/0.1 (prototype; contact: repo oosawak/sengoku-life-sim)"}

PEOPLE_SEED = [
    "伊達政宗", "伊達成実", "天童頼澄", "最上義光", "直江兼続",
    "片倉景綱", "片倉喜多", "鬼庭良直", "鬼庭綱元", "虎哉宗乙",
    "伊達稙宗", "伊達晴宗", "伊達輝宗", "留守政景", "伊達秀宗",
    "蘆名盛氏", "蘆名盛隆", "大内定綱", "相馬義胤", "佐竹義宣",
    "上杉景勝", "愛姫", "義姫", "最上義守", "天童頼貞",
    "蒲生氏郷", "二階堂盛義", "岩城貞隆", "田村清顕", "石川昭光",
]

CASTLE_SEED = [
    "米沢城", "山形城", "天童城", "若林城", "仙台城",
    "岩出山城", "白石城", "長谷堂城", "上山城", "寒河江城",
    "二本松城", "会津若松城", "福島城", "桑折西山城", "梁川城",
]


def api(params):
    params = dict(params, format="json")
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def search_first(name):
    d = api({"action": "wbsearchentities", "search": name, "language": "ja", "limit": 1})
    hits = d.get("search", [])
    return hits[0]["id"] if hits else None


def get_entity(qid):
    d = api({"action": "wbgetentities", "ids": qid, "props": "claims|sitelinks|labels", "languages": "ja"})
    return d["entities"][qid]


def year_of(claim_list):
    """P569/P570 の最初の値から年を取り出す（精度は年単位に丸める）。"""
    if not claim_list:
        return ""
    v = claim_list[0].get("mainsnak", {}).get("datavalue", {}).get("value", {})
    t = v.get("time", "")
    if not t:
        return ""
    # 形式: +1567-09-05T00:00:00Z / -0500-... など
    sign = -1 if t.startswith("-") else 1
    y = int(t.lstrip("+-")[:4]) * sign
    return str(y)


def coords_of(claim_list):
    if not claim_list:
        return ""
    v = claim_list[0].get("mainsnak", {}).get("datavalue", {}).get("value", {})
    if "latitude" in v:
        return f'{v["latitude"]:.5f}, {v["longitude"]:.5f}'
    return ""


def collect(names, kind):
    rows = []
    for name in names:
        qid = search_first(name)
        row = {"name": name, "qid": qid or "", "born": "", "died": "", "coords": "", "jawiki": "", "label": ""}
        if qid:
            e = get_entity(qid)
            claims = e.get("claims", {})
            row["born"] = year_of(claims.get("P569"))
            row["died"] = year_of(claims.get("P570"))
            row["coords"] = coords_of(claims.get("P625"))
            row["jawiki"] = e.get("sitelinks", {}).get("jawiki", {}).get("title", "")
            row["label"] = e.get("labels", {}).get("ja", {}).get("value", "")
        rows.append(row)
        time.sleep(0.2)
    return rows


def main():
    today = date.today().isoformat()
    people = collect(PEOPLE_SEED, "person")
    castles = collect(CASTLE_SEED, "castle")

    p_hit = sum(1 for r in people if r["qid"])
    p_both = sum(1 for r in people if r["born"] and r["died"])
    c_hit = sum(1 for r in castles if r["qid"])
    c_coord = sum(1 for r in castles if r["coords"])

    out = []
    out.append("# Wikidata収集プロトタイプ v0.1 結果")
    out.append("")
    out.append(f"生成: {today}（scripts/collect_from_wikidata.py）")
    out.append("")
    out.append("種リストの名前で Wikidata を検索し、第1候補から QID・生没年・緯度経度・日本語Wikipedia記事名を集めた結果。")
    out.append("**これは下書きの材料であり、正本データではない。** 検索の第1候補を機械採用しているため誤同定がありうる。取り込み時は人の確認を通すこと。文章は取り込んでいない（事実の骨格のみ）。")
    out.append("")
    out.append(f"- 人物: {len(people)}件中 {p_hit}件に項目あり、生没年が両方そろうのは {p_both}件")
    out.append(f"- 城館: {len(castles)}件中 {c_hit}件に項目あり、緯度経度つきは {c_coord}件")
    out.append("")
    out.append("## 人物")
    out.append("")
    out.append("| 名前 | QID | 生年 | 没年 | 日本語Wikipedia |")
    out.append("|---|---|---|---|---|")
    for r in people:
        wiki = f'[{r["jawiki"]}](https://ja.wikipedia.org/wiki/{urllib.parse.quote(r["jawiki"].replace(" ", "_"))})' if r["jawiki"] else "（記事なし）"
        out.append(f'| {r["name"]} | {r["qid"] or "—"} | {r["born"] or "—"} | {r["died"] or "—"} | {wiki} |')
    out.append("")
    out.append("## 城館")
    out.append("")
    out.append("| 名前 | QID | 緯度経度 | 日本語Wikipedia |")
    out.append("|---|---|---|---|")
    for r in castles:
        wiki = f'[{r["jawiki"]}](https://ja.wikipedia.org/wiki/{urllib.parse.quote(r["jawiki"].replace(" ", "_"))})' if r["jawiki"] else "（記事なし）"
        out.append(f'| {r["name"]} | {r["qid"] or "—"} | {r["coords"] or "—"} | {wiki} |')
    out.append("")
    out.append("## 読み取りメモ（生成時に自動でなく、確認して書く欄）")
    out.append("")
    out.append("- 没年が空の人物は、史実側で没年が不確かな例と対応していることが多い（例: 天童頼澄）。空欄は「不明」として正本でも注記つきで扱う。")
    out.append("- 緯度経度が取れた城館は、城館データ（戦国ガイドサイト側の正本）の座標の初期値として使える。")
    out.append("- QID は外部IDとして保持すると、人物・城館・出来事の同定と相互参照が安定する。")

    path = "docs/collection-prototype-v0.1.md"
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print(f"wrote {path}: people {p_hit}/{len(people)} (both years {p_both}), castles {c_hit}/{len(castles)} (coords {c_coord})")


if __name__ == "__main__":
    main()
