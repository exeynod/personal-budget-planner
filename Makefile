.PHONY: tokens tokens-check

tokens:
	npm run gen:tokens

tokens-check:
	@npm run gen:tokens >/dev/null
	@git diff --exit-code design/ frontend/src/stylesV10/tokens.css ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift \
	  || (echo "ERROR: generated tokens drifted from source. Run 'make tokens' and commit."; exit 1)
