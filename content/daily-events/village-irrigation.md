---
id: daily-village-irrigation
basis: fiction
category: village
cooldown_months: 60
age_min: 12
choices:
  - text: 村人と相談し、用水路の普請を進める
    check:
      stat: 政治
      difficulty: 55
      success:
        result: 話し合いがまとまり、田に水が行き渡った。村人はあなたを頼りにしている。
        effect: { 政治: 1, 評判: 2 }
      failure:
        result: 負担の分け方で揉め、普請は遅れた。費用もかさんだ。
        effect: { 評判: -2, 所持金: -0.5 }
  - text: まずは小さな水路だけ直し、残りは来年に回す
    result: 大きな成果はないが、無理のない範囲で田を守った。
    effect: { 所持金: -0.2, 評判: 1 }
---
日照りが続き、村から用水路を直してほしいと願いが届いた。費用を持つか、村人の手を借りるか。
