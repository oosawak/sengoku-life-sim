---
id: daily-retainer-dispute
category: household
cooldown_months: 48
age_min: 15
choices:
  - text: 双方から話を聞き、落としどころを探す
    check:
      stat: 政治
      difficulty: 62
      success:
        result: 面目を保つ形で和解し、家中の空気が和らいだ。
        effect: { 政治: 1, 評判: 2 }
      failure:
        result: 片方の言い分を退けたため、わだかまりが残った。
        effect: { 評判: -2 }
  - text: 年長者に裁きを任せる
    result: 古参の判断で争いは収まった。あなたは別の務めに戻った。
    effect: { 魅力: 1 }
---
二人の家臣が境目の田をめぐって言い争っている。放っておけば、周囲の者まで二派に割れそうだ。
