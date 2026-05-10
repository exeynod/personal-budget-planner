// Phase 27-11 Task 2: SettingsV10ViewModel — owns the optimistic
// PATCH-on-change state for SettingsV10View.
//
// Symmetric to web Plan 27-06 SettingsMount.tsx:
//   - Parallel fetch of /settings + /me on first appear (the AI cap
//     read-only display lives on /me, not /settings — see SUMMARY
//     27-06 «AI cap field not on SettingsRead» note).
//   - Optimistic update for each of the 3 mutable fields:
//     cycleStartDay (Stepper 1..28), notifyDaysBefore (Stepper 0..30),
//     enableAiCategorization (Toggle). On error, revert + surface the
//     previous value so the Stepper/Toggle reflects the rollback.
//   - AI spend cap (aiSpendingCapCents) — read-only; no mutation here.
//
// Stepper bounds enforced both client-side AND server-side (Pydantic
// validators in app/api/schemas/settings.py) — T-27-11-02 mitigation.

import Foundation
import Observation

@MainActor
@Observable
final class SettingsV10ViewModel {
    enum LoadStatus: Equatable {
        case idle
        case loading
        case ready
        case error(String)
    }

    // MARK: - Public state (read by View)

    private(set) var status: LoadStatus = .idle

    /// Mutable settings — bound directly to UI controls.
    var cycleStartDay: Int = 1
    var notifyDaysBefore: Int = 0
    var enableAiCategorization: Bool = true

    /// Read-only AI spend cap (USD-cents) — sourced from /me.
    private(set) var aiSpendingCapCents: Int = 0
    private(set) var aiSpendCents: Int = 0

    /// Surfaces a one-shot error message after a failed PATCH (cleared
    /// when the user mutates again).
    private(set) var saveError: String?

    // MARK: - Private state

    private var inFlightLoad: Bool = false

    /// Track the last server-confirmed snapshot for rollback on PATCH error.
    private var lastSnapshotCycleStartDay: Int = 1
    private var lastSnapshotNotifyDaysBefore: Int = 0
    private var lastSnapshotEnableAiCategorization: Bool = true

    // MARK: - Bounds (mirror server Pydantic validators)

    static let cycleMin = 1
    static let cycleMax = 28
    static let notifyMin = 0
    static let notifyMax = 30

    // MARK: - Loading

    func load() async {
        if inFlightLoad { return }
        inFlightLoad = true
        defer { inFlightLoad = false }
        status = .loading
        do {
            // Parallel fetch — SettingsAPI.get() + MeV10API.shared.fetchMeV10().
            async let settingsCall: SettingsDTO = SettingsAPI.get()
            async let meCall: MeV10Response = MeV10API.shared.fetchMeV10()
            let settings = try await settingsCall
            let me = try await meCall

            cycleStartDay = settings.cycleStartDay
            notifyDaysBefore = settings.notifyDaysBefore
            enableAiCategorization = settings.enableAiCategorization
            aiSpendingCapCents = me.aiSpendingCapCents
            aiSpendCents = me.aiSpendCents

            lastSnapshotCycleStartDay = settings.cycleStartDay
            lastSnapshotNotifyDaysBefore = settings.notifyDaysBefore
            lastSnapshotEnableAiCategorization = settings.enableAiCategorization

            status = .ready
        } catch {
            status = .error("Не удалось загрузить настройки")
        }
    }

    // MARK: - Mutations (optimistic + rollback)

    func changeCycleStartDay(_ newValue: Int) async {
        let clamped = max(Self.cycleMin, min(Self.cycleMax, newValue))
        let prev = lastSnapshotCycleStartDay
        cycleStartDay = clamped
        saveError = nil
        do {
            let updated = try await SettingsAPI.update(
                SettingsUpdateRequest(
                    cycleStartDay: clamped,
                    notifyDaysBefore: nil,
                    enableAiCategorization: nil
                )
            )
            lastSnapshotCycleStartDay = updated.cycleStartDay
            cycleStartDay = updated.cycleStartDay
        } catch {
            cycleStartDay = prev
            saveError = "Не удалось сохранить день цикла"
        }
    }

    func changeNotifyDaysBefore(_ newValue: Int) async {
        let clamped = max(Self.notifyMin, min(Self.notifyMax, newValue))
        let prev = lastSnapshotNotifyDaysBefore
        notifyDaysBefore = clamped
        saveError = nil
        do {
            let updated = try await SettingsAPI.update(
                SettingsUpdateRequest(
                    cycleStartDay: nil,
                    notifyDaysBefore: clamped,
                    enableAiCategorization: nil
                )
            )
            lastSnapshotNotifyDaysBefore = updated.notifyDaysBefore
            notifyDaysBefore = updated.notifyDaysBefore
        } catch {
            notifyDaysBefore = prev
            saveError = "Не удалось сохранить напоминания"
        }
    }

    func toggleEnableAiCategorization(_ newValue: Bool) async {
        let prev = lastSnapshotEnableAiCategorization
        enableAiCategorization = newValue
        saveError = nil
        do {
            let updated = try await SettingsAPI.update(
                SettingsUpdateRequest(
                    cycleStartDay: nil,
                    notifyDaysBefore: nil,
                    enableAiCategorization: newValue
                )
            )
            lastSnapshotEnableAiCategorization = updated.enableAiCategorization
            enableAiCategorization = updated.enableAiCategorization
        } catch {
            enableAiCategorization = prev
            saveError = "Не удалось переключить AI-категоризацию"
        }
    }
}
