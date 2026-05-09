SCHEME       := BudgetPlanner
PROJECT      := BudgetPlanner.xcodeproj
SIM          := iPhone 17 Pro
DESTINATION  := platform=iOS Simulator,name=$(SIM)
BUNDLE_ID    := com.exeynod.BudgetPlanner

.PHONY: help generate build run install boot launch logs format format-check clean sf

help:
	@echo "iOS targets:"
	@echo "  make generate     — xcodegen generate"
	@echo "  make build        — build for $(SIM) (xcbeautify)"
	@echo "  make boot         — boot $(SIM) simulator"
	@echo "  make install      — build + install on booted simulator"
	@echo "  make launch       — launch $(BUNDLE_ID) on booted simulator"
	@echo "  make run          — generate + build + boot + install + launch (full cycle)"
	@echo "  make logs         — stream simulator logs filtered by bundle id"
	@echo "  make format       — swift-format in-place on BudgetPlanner/"
	@echo "  make format-check — swift-format lint mode (CI-friendly, non-zero on diff)"
	@echo "  make clean        — remove DerivedData + xcodeproj"
	@echo "  make sf Q=cart    — search SF Symbols by name/tag (iOS 17.0+ only)"

generate:
	xcodegen generate

build:
	@set -o pipefail; xcodebuild \
		-project $(PROJECT) \
		-scheme $(SCHEME) \
		-destination '$(DESTINATION)' \
		-configuration Debug \
		CODE_SIGNING_ALLOWED=NO \
		build | xcbeautify

boot:
	@xcrun simctl boot "$(SIM)" 2>/dev/null || true
	@open -a Simulator

install: build
	@APP_PATH=$$(xcodebuild -project $(PROJECT) -scheme $(SCHEME) -showBuildSettings -configuration Debug 2>/dev/null | awk -F' = ' '/ BUILT_PRODUCTS_DIR / {print $$2}' | head -1); \
	xcrun simctl install booted "$$APP_PATH/$(SCHEME).app"

launch:
	xcrun simctl launch booted $(BUNDLE_ID)

run: generate boot install launch

logs:
	xcrun simctl spawn booted log stream --predicate 'subsystem == "$(BUNDLE_ID)" OR processImagePath CONTAINS "$(SCHEME)"' --level debug

format:
	swift-format format --in-place --recursive --configuration .swift-format BudgetPlanner BudgetPlannerTests

format-check:
	swift-format lint --strict --recursive --configuration .swift-format BudgetPlanner BudgetPlannerTests

clean:
	rm -rf $(PROJECT)
	rm -rf ~/Library/Developer/Xcode/DerivedData/BudgetPlanner-*

sf:
	@./scripts/sf-find $(Q) $(if $(LIMIT),--limit $(LIMIT),)
