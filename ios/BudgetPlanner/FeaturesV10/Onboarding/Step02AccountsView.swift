// Phase 24-05: Step02AccountsView — onboarding step 2 «Где лежат деньги?».
//
// Symmetric to web `<Step02Accounts>` (Plan 24-04). Three blocks + chip
// row + sheet:
//   1. Mass italic 32pt headline «Где лежат\nденьги?»
//   2. Eyebrow «ВСЕ КАРТЫ И НАЛИЧНЫЕ» (opacity 0.55)
//   3. List of existing accounts (bank · balance · «· основной» · ★ · ×)
//   4. Chip row: Т-Банк / Сбер / Наличные / + Добавить
//   5. PosterSheet bottom sheet hosting AccountBalanceSheet on chip tap
//
// Predefined chips per CONTEXT D-05:
//   - Т-Банк, kind=card, editable=false
//   - Сбер,   kind=card, editable=false
//   - Наличные, kind=cash, editable=false
//   - + Добавить, kind=card, editable=true (free-text bank name)
//
// Auto-primary on first ADD_ACCOUNT + primary handover on REMOVE come from
// OnboardingFlow (Plan 24-01) — this view only dispatches; no local logic.

import SwiftUI

// MARK: - Sheet mode payload

private struct SheetMode: Equatable {
    var initialBank: String
    var initialKind: OnboardingAccountKind
    var editable: Bool
}

// MARK: - Predefined chip presets

private struct AccountPreset {
    let label: String
    let kind: OnboardingAccountKind
}

private let accountPresets: [AccountPreset] = [
    AccountPreset(label: "Т-Банк", kind: .card),
    AccountPreset(label: "Сбер", kind: .card),
    AccountPreset(label: "Наличные", kind: .cash),
]

// MARK: - View

struct Step02AccountsView: View {
    @Bindable var flow: OnboardingFlow

    @State private var sheetMode: SheetMode? = nil
    @State private var showSheet: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Mass("Где лежат\nденьги?", italic: true, size: 32)

            Eyebrow("ВСЕ КАРТЫ И НАЛИЧНЫЕ", opacity: 0.55)

            accountsList

            chipsRow
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .posterSheet(isPresented: $showSheet) {
            sheetContent
        }
    }

    // MARK: - Accounts list

    @ViewBuilder
    private var accountsList: some View {
        if !flow.accounts.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(flow.accounts.indices, id: \.self) { idx in
                    accountRow(index: idx)
                    if idx < flow.accounts.count - 1 {
                        Rectangle()
                            .fill(PosterTokens.Color.paper.opacity(0.25))
                            .frame(height: 1)
                    }
                }
            }
            .padding(.top, 6)
        }
    }

    private func accountRow(index: Int) -> some View {
        let acc = flow.accounts[index]
        return HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(acc.bank)
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                    .kerning(13 * 0.04)
                    .foregroundColor(PosterTokens.Color.paper)
                HStack(spacing: 4) {
                    Text("\(RubleFormatter.format(cents: acc.balanceCents)) ₽")
                        .font(.custom(PosterTokens.Font.jetBrainsMono, size: 11))
                        .foregroundColor(PosterTokens.Color.paper)
                        .opacity(0.6)
                    if acc.primary {
                        Text("· основной")
                            .font(.custom(PosterTokens.Font.jetBrainsMono, size: 11))
                            .foregroundColor(PosterTokens.Color.paper)
                            .opacity(0.6)
                    }
                }
            }
            Spacer(minLength: 0)
            starButton(index: index, primary: acc.primary)
            removeButton(index: index)
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    private func starButton(index: Int, primary: Bool) -> some View {
        Button(action: { flow.setPrimary(at: index) }) {
            Text("★")
                .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                .foregroundColor(primary
                                 ? PosterTokens.Color.coral
                                 : PosterTokens.Color.paper)
                .frame(width: 28, height: 28)
                .background(primary
                            ? PosterTokens.Color.paper
                            : Color.clear)
                .overlay(
                    Rectangle()
                        .stroke(primary ? .clear
                                : PosterTokens.Color.paper.opacity(0.45),
                                lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(primary ? "основной счёт" : "сделать основным")
    }

    private func removeButton(index: Int) -> some View {
        Button(action: { flow.removeAccount(at: index) }) {
            Text("×")
                .font(.custom(PosterTokens.Font.jetBrainsMono, size: 16)
                    .weight(.semibold))
                .foregroundColor(PosterTokens.Color.paper)
                .opacity(0.5)
                .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("удалить счёт")
    }

    // MARK: - Chip row

    private var chipsRow: some View {
        // Wrapping HStack: 4 chips fit on iPhone widths; if ever too wide,
        // wrap into a 2nd row by relying on FlowLayout in iOS 16+. For now
        // a single HStack with 8pt spacing matches the prototype on
        // iPhone 15+ widths.
        HStack(spacing: 8) {
            ForEach(accountPresets, id: \.label) { preset in
                Chip(preset.label) {
                    sheetMode = SheetMode(
                        initialBank: preset.label,
                        initialKind: preset.kind,
                        editable: false,
                    )
                    showSheet = true
                }
            }
            addChip
            Spacer(minLength: 0)
        }
        .padding(.top, 6)
    }

    private var addChip: some View {
        Button(action: {
            sheetMode = SheetMode(
                initialBank: "",
                initialKind: .card,
                editable: true,
            )
            showSheet = true
        }) {
            Text("+ ДОБАВИТЬ")
                .font(.custom(PosterTokens.Font.archivoBlack, size: 11))
                .tracking(1.4)
                .padding(.vertical, 8)
                .padding(.horizontal, 11)
                .foregroundColor(PosterTokens.Color.paper)
                .background(Color.clear)
                .overlay(
                    Rectangle()
                        .strokeBorder(
                            style: StrokeStyle(lineWidth: 1, dash: [3, 3])
                        )
                        .foregroundColor(PosterTokens.Color.paper.opacity(0.45))
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("добавить счёт")
    }

    // MARK: - Sheet content

    @ViewBuilder
    private var sheetContent: some View {
        if let mode = sheetMode {
            AccountBalanceSheet(
                initialBank: mode.initialBank,
                initialKind: mode.initialKind,
                editable: mode.editable,
                onSave: { acc in
                    flow.addAccount(
                        bank: acc.bank,
                        kind: acc.kind,
                        balanceCents: acc.balanceCents,
                        mask: acc.mask,
                    )
                    showSheet = false
                    sheetMode = nil
                },
                onCancel: {
                    showSheet = false
                    sheetMode = nil
                },
            )
        }
    }
}

// MARK: - Preview

#Preview("Step02AccountsView · empty") {
    let flow = OnboardingFlow()
    return OnboardingChrome(
        step: 2,
        label: "ШАГ 02 / 04 · СЧЕТА",
        onBack: { flow.back() },
        onNext: { flow.next() },
        nextDisabled: flow.accounts.isEmpty,
        hint: "нужен минимум один счёт"
    ) {
        Step02AccountsView(flow: flow)
    }
}

#Preview("Step02AccountsView · with rows") {
    let flow = OnboardingFlow()
    flow.addAccount(bank: "Т-БАНК", kind: .card, balanceCents: 5_000_000)
    flow.addAccount(bank: "СБЕР", kind: .card, balanceCents: 1_200_000)
    return OnboardingChrome(
        step: 2,
        label: "ШАГ 02 / 04 · СЧЕТА",
        onBack: { flow.back() },
        onNext: { flow.next() },
        nextDisabled: flow.accounts.isEmpty,
        hint: "2 счёта · 62\u{202F}000 ₽"
    ) {
        Step02AccountsView(flow: flow)
    }
}
