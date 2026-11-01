---
id: daily-harvest-shortfall
basis: fiction
category: economy
cooldown_months: 72
age_min: 12
choices:
  - text: 蔵を開き、足りない米を村へ貸し出す
    result: 冬を越す米は行き渡った。返済は急がせず、村との縁をつないだ。
    effect: { 所持金: -1, 評判: 4 }
  - text: 年貢を軽くし、来年の作付けを支える
    check:
      stat: 政治
      difficulty: 65
      success:
        result: 村の負担を抑えながら、来年の田植えの約束を取り付けた。
        effect: { 評判: 2, 政治: 1 }
      failure:
        result: 取り決めが行き届かず、蔵の米も思ったほど戻らなかった。
        effect: { 所持金: -0.5 }
  - text: 蔵の米を守り、村には自力でしのいでもらう
    result: 蓄えは守ったが、困窮した村人の心は離れた。
    effect: { 評判: -4 }
---
冷夏で実りが少なく、村の名主が年貢の相談に来た。蔵を開けば蓄えが減り、断れば村の暮らしが苦しくなる。
