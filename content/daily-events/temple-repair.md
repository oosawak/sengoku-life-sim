---
id: daily-temple-repair
category: community
cooldown_months: 60
age_min: 10
choices:
  - text: 蓄えから材木代を出し、寺の修繕を助ける
    result: 屋根が直り、村人たちは雨の日も集まれるようになった。
    effect: { 所持金: -0.8, 評判: 3, 魅力: 1 }
  - text: 村人に材木を集めてもらい、手間を分け合う
    check:
      stat: 魅力
      difficulty: 58
      success:
        result: 村人が自ら手を挙げ、力を合わせて修繕した。
        effect: { 評判: 2, 魅力: 1 }
      failure:
        result: 集まりは悪く、修繕は次の季節まで持ち越しになった。
        effect: { 評判: -1 }
---
雨漏りのする寺から、屋根を直すための助けを求められた。金を出すか、人手を集めるか。
