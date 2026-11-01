---
id: daily-traveling-doctor
basis: fiction
category: health
cooldown_months: 48
age_min: 0
choices:
  - text: 薬師を呼び、診立てを受ける
    result: 薬師の手当てで養生の仕方が分かった。身体も少し楽になった。
    effect: { 所持金: -0.5, 健康: 8 }
  - text: 薬代を惜しみ、家で静養する
    check:
      stat: 知略
      difficulty: 55
      success:
        result: 数日休むと熱は引いた。家の者がそばについてくれた。
        effect: { 健康: 3, 評判: 1 }
      failure:
        result: 熱が長引き、稽古も政務も休むことになった。
        effect: { 健康: -8 }
---
旅の薬師が近くの宿に滞在している。家の者が咳をしており、診てもらうなら今のうちだという。
