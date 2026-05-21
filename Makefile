# MYCUTE Claude Code Config — Makefile
# 時系列コメント付きで push まで完了

.PHONY: push

push:
	@git add -A
	@git commit -m "$$(date '+%Y-%m-%d %H:%M:%S')" || true
	@git push origin master
