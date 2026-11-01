---
id: daily-merchant-proposal
basis: fiction
category: economy
cooldown_months: 60
age_min: 15
choices:
  - text: 商人に蔵の米を預け、相場を見て売る
    check:
      stat: 知略
      difficulty: 60
      success:
        result: 相場の上がり目を読み、蔵に余裕を作れた。
        effect: { 所持金: 1.2, 知略: 1 }
      failure:
        result: 相場が崩れ、運び賃だけが残った。
        effect: { 所持金: -0.6 }
  - text: 取引を断り、米を蔵に残す
    result: 利は得なかったが、冬に備える米は確保できた。
    effect: { 評判: 1 }
---
城下の商人が米の買い付けを申し出た。今売れば金になるが、冬の蓄えは少なくなる。
