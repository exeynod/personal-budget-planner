// Phase 24-01: @Observable state machine for V10 onboarding (iOS side).
//
// Mirror of the web reducer at
// `frontend/src/screensV10/Onboarding/onboardingReducer.ts`. The
// behaviour matrix (auto-primary on first ADD_ACCOUNT, auto-allocation
// on setIncome when categoryPlans empty, NEXT/BACK bounds 1..5,
// whitelist-guarded setPlan) is identical so both platforms produce the
// same wire body for POST /onboarding/complete.
//
// Persistence: every mutation calls `persist()` which encodes to JSON
// (snake_case CodingKeys) and writes to UserDefaults under the key
// "onboarding.v10.draft". `init(defaults:)` accepts an injectable
// UserDefaults instance for test isolation.

import Foundation
import Observation

@MainActor
@Observable
final class OnboardingFlow {
    // MARK: - Public state

    private(set) var step: Int
    private(set) var incomeCents: Int
    private(set) var accounts: [OnboardingAccount]
    private(set) var categoryPlans: [String: Int]
    private(set) var goal: OnboardingGoal?
    private(set) var savingsConfig: OnboardingSavingsConfig?

    // MARK: - Persistence

    static let draftKey = "onboarding.v10.draft"
    static let minStep = 1
    static let maxStep = 5

    private let defaults: UserDefaults

    /// Designated init. `defaults` is injectable for test isolation;
    /// production callers use `.standard`.
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults

        if let restored = Self.loadDraft(from: defaults) {
            self.step = restored.step
            self.incomeCents = restored.incomeCents
            self.accounts = restored.accounts
            self.categoryPlans = restored.categoryPlans
            self.goal = restored.goal
            self.savingsConfig = restored.savingsConfig
        } else {
            let initial = OnboardingDraft.initial
            self.step = initial.step
            self.incomeCents = initial.incomeCents
            self.accounts = initial.accounts
            self.categoryPlans = initial.categoryPlans
            self.goal = initial.goal
            self.savingsConfig = initial.savingsConfig
        }
    }

    // MARK: - Mutations

    /// SET_INCOME — clamp <0 to 0; auto-allocate plan when empty.
    /// Mirror of web reducer `SET_INCOME`.
    func setIncome(_ cents: Int) {
        let clamped = max(0, cents)
        incomeCents = clamped
        if categoryPlans.isEmpty {
            categoryPlans = DefaultCategories.defaultPlan(fromIncomeCents: clamped)
        }
        persist()
    }

    /// ADD_ACCOUNT — first added auto-promotes to primary; subsequent
    /// stay primary=false unless `setPrimary(at:)` flips them.
    func addAccount(
        bank: String,
        kind: OnboardingAccountKind,
        balanceCents: Int,
        mask: String? = nil,
    ) {
        let isFirst = accounts.isEmpty
        let acct = OnboardingAccount(
            bank: bank,
            mask: mask,
            kind: kind,
            balanceCents: balanceCents,
            primary: isFirst,
        )
        accounts.append(acct)
        persist()
    }

    /// REMOVE_ACCOUNT — promotes the new accounts[0] when primary
    /// removed (so the single-primary invariant holds).
    func removeAccount(at index: Int) {
        guard accounts.indices.contains(index) else { return }
        let wasPrimary = accounts[index].primary
        accounts.remove(at: index)
        if wasPrimary, let first = accounts.first, !accounts.contains(where: { $0.primary }) {
            var promoted = first
            promoted.primary = true
            accounts[0] = promoted
        }
        persist()
    }

    /// SET_PRIMARY — flip primary on `index`, clear all others.
    func setPrimary(at index: Int) {
        guard accounts.indices.contains(index) else { return }
        for i in accounts.indices {
            accounts[i].primary = (i == index)
        }
        persist()
    }

    /// SET_PLAN — clamp negative cents to 0; ignore unknown codes.
    func setPlan(code: String, cents: Int) {
        guard DefaultCategories.codes.contains(code) else { return }
        categoryPlans[code] = max(0, cents)
        persist()
    }

    func setGoal(_ goal: OnboardingGoal) {
        self.goal = goal
        persist()
    }

    func skipGoal() {
        goal = nil
        persist()
    }

    func setSavingsConfig(_ cfg: OnboardingSavingsConfig) {
        savingsConfig = cfg
        persist()
    }

    func next() {
        step = min(Self.maxStep, step + 1)
        persist()
    }

    func back() {
        step = max(Self.minStep, step - 1)
        persist()
    }

    func reset() {
        let initial = OnboardingDraft.initial
        step = initial.step
        incomeCents = initial.incomeCents
        accounts = initial.accounts
        categoryPlans = initial.categoryPlans
        goal = initial.goal
        savingsConfig = initial.savingsConfig
        persist()
    }

    /// Wipe persisted draft from UserDefaults. Called on submit success
    /// or 409 (already onboarded). Does NOT touch in-memory state.
    func clearDraft() {
        defaults.removeObject(forKey: Self.draftKey)
    }

    // MARK: - Snapshots

    /// Snapshot of current in-memory state as a Codable draft. Used by
    /// persist() and exposed for tests that want to compare round-trips.
    func toDraft() -> OnboardingDraft {
        OnboardingDraft(
            step: step,
            incomeCents: incomeCents,
            accounts: accounts,
            categoryPlans: categoryPlans,
            goal: goal,
            savingsConfig: savingsConfig,
        )
    }

    // MARK: - Persistence helpers

    private static func makeEncoder() -> JSONEncoder {
        let enc = JSONEncoder()
        // Explicit CodingKeys on draft types already snake_case the
        // wire format; keep keyEncodingStrategy at .useDefaultKeys so
        // CodingKeys are honoured verbatim.
        enc.outputFormatting = [.sortedKeys]
        return enc
    }

    private static func makeDecoder() -> JSONDecoder {
        JSONDecoder()
    }

    private func persist() {
        let draft = toDraft()
        do {
            let data = try Self.makeEncoder().encode(draft)
            defaults.set(data, forKey: Self.draftKey)
        } catch {
            // Fail silently — UI must keep working even if persist breaks.
            #if DEBUG
            print("[onboarding] persist failed: \(error)")
            #endif
        }
    }

    /// Load + sanitise (clamps step ∈ 1..5; reject entirely otherwise).
    static func loadDraft(from defaults: UserDefaults) -> OnboardingDraft? {
        guard let data = defaults.data(forKey: draftKey) else { return nil }
        do {
            let draft = try makeDecoder().decode(OnboardingDraft.self, from: data)
            // T-24-01-01: reject step out of range (matches web sanitiser).
            guard draft.step >= minStep, draft.step <= maxStep else { return nil }
            // Drop unknown category codes defensively (whitelist).
            let cleaned = draft.categoryPlans.filter { DefaultCategories.codes.contains($0.key) }
            var out = draft
            out.categoryPlans = cleaned
            return out
        } catch {
            // T-24-01-04: malformed JSON / shape mismatch → wipe + null.
            defaults.removeObject(forKey: draftKey)
            return nil
        }
    }
}
