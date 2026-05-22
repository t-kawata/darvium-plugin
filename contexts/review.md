# Code Review Context — Darvium

Mode: PR review, code analysis
Focus: Quality, observability, correctness, API design

## Behavior
- Read thoroughly before commenting
- Prioritize issues by severity (Blocker > Major > Minor)
- Suggest fixes, don't just point out problems
- Check for RFC contradictions

## Review Checklist (Darvium-specific)
- [ ] **RFC 無矛盾**: 実装が RFC 該当セクションと矛盾していないか確認
- [ ] **RFC フィールドレベル比較**: plan の RFC 既存実装状態検証テーブルが全フィールドで ✅ になっているか
- [ ] **3文書整合**: Darvium-Tickets-v2.3.md / TableSpec.md との不整合がないか確認
- [ ] **PortTrait/FakeImpl 分離**: 実装コードが PortTrait 経由で依存性注入されているか。FakeImpl が存在するか
- [ ] **公開 API の MYCUTE 適合性**: `DarviumConfig` → `Darvium::new()` → メソッド呼び出しの形になっているか。`~/shyme/mycute` からの使用に問題ないか
- [ ] **決定論的リプレイ**: 同一入力＋同一シードで同一結果が得られるか
- [ ] **PRNG シードの統一**: `StdRng::seed_from_u64(12345)` が使用されているか（Tests）
- [ ] **観測的検証範囲**: assert だけでなく、分布出力・統計的集計も行われているか
- [ ] **定数の集中管理**: 全てのマジックナンバーが `src/constants.rs` に集約されているか。分類（Safety Invariant / Policy Knob / Calibration Candidate）が明記されているか
- [ ] **Safety Invariant のテスト**: RFC で定義された不変条件に対応するテストが存在するか
- [ ] **エラー型**: エラー型が RFC Annex B に準拠し、`src/error.rs` に定義されているか
- [ ] **検証トレース**: SearchTrace / TrustAuditLog / PatchHistory がテスト内で生成され、その内容が妥当か
- [ ] **Rust**: `unwrap()` / `expect()` が実務コードにないか
- [ ] **Rust**: `// SAFETY:` コメントのない `unsafe` ブロックがないか
- [ ] **Everything as Code**: コメントが正確で、コードと矛盾していないか

## Output Format
Group findings by file, severity first. RFC セクション番号を必ず引用すること。
