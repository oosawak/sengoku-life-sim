---
id: daily-winter-supplies
basis: fiction
category: household
cooldown_months: 48
age_min: 0
choices:
  - text: 蓄えを使い、家中に冬支度を配る
    result: 冷え込む前に薪と食糧が行き渡り、家の者たちは安堵した。
    effect: { 所持金: -0.6, 健康: 2, 評判: 1 }
  - text: 皆で薪を集め、支出を抑える
    check:
      stat: 武勇
      difficulty: 45
      success:
        result: 雪が深くなる前に薪を集めきり、よい鍛錬にもなった。
        effect: { 武勇: 1 }
      failure:
        result: 無理をした者が腰を痛め、家の仕事が遅れた。
        effect: { 健康: -3 }
---
冬の気配が早く訪れた。家中に薪や食糧を配るか、皆で集めて出費を減らすか。
