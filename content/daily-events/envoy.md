---
id: daily-envoy
category: relationships
cooldown_months: 60
age_min: 15
choices:
  - text: 客を丁重にもてなし、主君の言葉を預かる
    check:
      stat: 魅力
      difficulty: 60
      success:
        result: 客は心を開き、主君への返書にあなたの働きを添えた。
        effect: { 魅力: 1, 評判: 2 }
      failure:
        result: 話題の選び方を誤り、相手は早々に席を立った。
        effect: { 評判: -1 }
  - text: 用件だけを確かめ、すぐ返書を届ける
    result: 飾り気はないが、返答は滞りなく届いた。
    effect: { 政治: 1 }
---
遠方からの使者が城に着いた。道中の疲れが見えるが、主君への急ぎの用件があるという。
