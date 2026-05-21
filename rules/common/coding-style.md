# Coding Style

## Immutability (CRITICAL)

ALWAYS create new objects, NEVER mutate existing ones:

```
// Pseudocode
WRONG:  modify(original, field, value) → changes original in-place
CORRECT: update(original, field, value) → returns new copy with change
```

Rationale: Immutable data prevents hidden side effects, makes debugging easier, and enables safe concurrency.

## Core Principles

### Readability as Translatability（可読性とは翻訳可能性である）

**ソースコードは「実行可能な散文」であり、自然言語に完全に翻訳可能であることを可読性の第一基準とする。**

関数/クラス/構造体への分割は、単に「2回以上同じ処理をするから」（DRY）のみで判断してはならない。コード自体が言葉として語るようにするために、処理のまとまりを「文」や「段落」として抽出する必要がある。一つの関数が複数の責務を持ち、日本語の複文のように読める（「〜して、〜して、〜する」）なら、それは分割のシグナルである。

- 関数呼び出しの並びが、そのまま処理手順の日本語訳になるように構成する
- 変数名・関数名はドメインの概念を正確に名詞/動詞で表現する
- 値のハードコードや汎用的すぎる変数名（`data`, `info`, `tmp`）は翻訳可能性を損なうため禁止
- 詳細な理由（なぜそうするのか）はコメントで日本語補完する（コードは「何を」、コメントは「なぜ」）

既存コードで翻訳可能性を満たしていない部分を見つけたら、Boy Scout Rule に従い積極的に関数/構造体への抽出リファクタリングを行う。

### KISS (Keep It Simple)

- Prefer the simplest solution that actually works
- Avoid premature optimization
- Optimize for clarity over cleverness

### DRY (Don't Repeat Yourself)

- Extract repeated logic into shared functions or utilities
- Avoid copy-paste implementation drift
- Introduce abstractions when repetition is real, not speculative

### YAGNI (You Aren't Gonna Need It)

- Do not build features or abstractions before they are needed
- Avoid speculative generality
- Start simple, then refactor when the pressure is real

## File Organization

MANY SMALL FILES > FEW LARGE FILES:
- High cohesion, low coupling
- 200-400 lines typical, 800 max
- Extract utilities from large modules
- Organize by feature/domain, not by type

## Error Handling

ALWAYS handle errors comprehensively:
- Handle errors explicitly at every level
- Provide user-friendly error messages in UI-facing code
- Log detailed error context on the server side
- Never silently swallow errors

## Input Validation

ALWAYS validate at system boundaries:
- Validate all user input before processing
- Use schema-based validation where available
- Fail fast with clear error messages
- Never trust external data (API responses, user input, file content)

## Naming Conventions

- Variables and functions: `camelCase` with descriptive names
- Booleans: prefer `is`, `has`, `should`, or `can` prefixes
- Interfaces, types, and components: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Custom hooks: `camelCase` with a `use` prefix

## Code Smells to Avoid

### Deep Nesting

Prefer early returns over nested conditionals once the logic starts stacking.

### Magic Numbers

Use named constants for meaningful thresholds, delays, and limits.

### Long Functions

Split large functions into focused pieces with clear responsibilities.

## Code Quality Checklist

Before marking work complete:
- [ ] Code is readable and well-named
- [ ] Functions are small (<50 lines)
- [ ] Files are focused (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Proper error handling
- [ ] No hardcoded values (use constants or config)
- [ ] No mutation (immutable patterns used)
