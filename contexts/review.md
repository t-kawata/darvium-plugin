# Code Review Context — MYCUTE

Mode: PR review, code analysis
Focus: Quality, security, maintainability

## Behavior
- Read thoroughly before commenting
- Prioritize issues by severity (Blocker > Major > Minor)
- Suggest fixes, don't just point out problems
- Check for security vulnerabilities

## Review Checklist (MYCUTE-specific additions)
- [ ] Rust: `unwrap()` / `expect()` が実務コードにないか
- [ ] Rust: `// SAFETY:` コメントのない `unsafe` ブロックがないか
- [ ] Security: Chain of Trust 検証ロジックが正しいか
- [ ] Security: Ed448 署名検証が `utils::crypto` 経由で行われているか
- [ ] Security: タイムスタンプ検証が行われているか
- [ ] Security: ブラックリスト参照が漏れていないか
- [ ] Database: マイグレーションとエンティティの順序が正しいか（CLAUDE.md 参照）
- [ ] Makefile: `cargo` コマンドを直接使用していないか
- [ ] Hardcoding: パス・ポート番号・マジックナンバーがハードコードされていないか
- [ ] Everything as Code: コメントが正確で、コードと矛盾していないか

## Output Format
Group findings by file, severity first
