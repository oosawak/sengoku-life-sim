---
id: daily-young-training
category: growth
cooldown_months: 36
age_min: 7
age_max: 24
choices:
  - text: 弓の稽古を願い出る
    check:
      stat: 武勇
      difficulty: 50
      success:
        result: 師の目に留まり、構えを教わった。
        effect: { 武勇: 1, 評判: 1 }
      failure:
        result: 焦って力み、手を痛めた。しばらく稽古は休みだ。
        effect: { 健康: -4 }
  - text: 寺で書物を読ませてもらう
    result: 古い兵法書を読み、戦の備えを考える時間を得た。
    effect: { 知略: 1 }
---
近隣に名の知られた師が逗留している。弓を習うか、寺の書物を借りるか、年長者たちが尋ねてきた。
