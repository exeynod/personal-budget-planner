// Phase 30-03 (DEBT-03): AccountPickerSheet — posterSheet account
// chooser for the iOS AddSheet, replacing the prior `.confirmationDialog`
// list (which collapsed to a vendor system sheet and broke the poster
// design surface).
//
// Symmetric to web Plan 30 AccountPicker (web ships a poster-style list
// for the same DEBT-03 ticket). The sheet renders a column of rows —
// each shows the bank/mask label, the kind plate (KARTA / NALICHKA /
// KOPILKA), and the right-aligned balance in rubles. Tapping a row
// updates the parent's `selection` and dismisses the sheet via
// `isPresented = false`.
//
// Visual DS:
//   - paper background (inherited from `.posterSheet` modifier, which sets
//     the sheet body bg via PosterTokens.Color.paper).
//   - Eyebrow «ВЫБРАТЬ СЧЁТ» at the top, ink color + opacity 0.6.
//   - Rows separated by a 1pt ink-opacity-0.12 hairline.
//   - Selected row gets a left-side 3pt yellow stripe.
//   - Tap target is the entire row (Rectangle contentShape).
//
// Lifecycle: parent (`AddSheetView`) owns `selection: Binding<Int?>` and
// `isPresented: Binding<Bool>`. When the user taps a row, both bindings
// update in one synchronous body invocation. The sheet does not load any
// data — accounts are injected from the parent VM that already fetched
// them at AddSheet mount time.

import SwiftUI

struct AccountPickerSheet: View {
    @Binding var selection: Int?
    @Binding var isPresented: Bool
    let accounts: [AccountDTO]

    var body: some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s14) {
            Eyebrow(
                "ВЫБРАТЬ СЧЁТ",
                opacity: 0.6,
                color: PosterTokens.Color.ink
            )

            if accounts.isEmpty {
                emptyState
            } else {
                VStack(spacing: 0) {
                    ForEach(accounts) { acc in
                        Button(action: { pick(acc.id) }) {
                            row(for: acc)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(label(for: acc))
                        .accessibilityAddTraits(
                            selection == acc.id
                                ? [.isSelected, .isButton]
                                : [.isButton]
                        )
                    }
                }
            }
        }
        .padding(.horizontal, PosterTokens.Space.s22)
        .padding(.vertical, PosterTokens.Space.s28)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Row

    @ViewBuilder
    private func row(for acc: AccountDTO) -> some View {
        let isSelected = (selection == acc.id)
        HStack(alignment: .center, spacing: 12) {
            // Left selection stripe (3pt yellow). Always rendered so the
            // baseline horizontal alignment doesn't jump when selection
            // toggles between rows.
            Rectangle()
                .fill(isSelected
                      ? PosterTokens.Color.yellow
                      : Color.clear)
                .frame(width: 3, height: 32)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(label(for: acc))
                        .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                        .tracking(13 * 0.12)
                        .foregroundColor(PosterTokens.Color.ink)
                    if acc.primary {
                        Text("ОСНОВНОЙ")
                            .font(.custom(PosterTokens.Font.archivoBlack, size: 9))
                            .tracking(9 * 0.14)
                            .padding(.vertical, 1)
                            .padding(.horizontal, 5)
                            .background(PosterTokens.Color.yellow)
                            .foregroundColor(PosterTokens.Color.ink)
                    }
                }
                Text(kindBadge(acc.kind))
                    .font(.posterMono(size: 11))
                    .tracking(0.06 * 11)
                    .foregroundColor(PosterTokens.Color.ink.opacity(0.55))
            }

            Spacer(minLength: 6)

            Text("\(RubleFormatter.format(cents: acc.balanceCents)) ₽")
                .font(.posterMono(size: 13, weight: .semibold))
                .foregroundColor(PosterTokens.Color.ink)
        }
        .padding(.vertical, 12)
        .padding(.trailing, 4)
        .contentShape(Rectangle())
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(PosterTokens.Color.ink.opacity(0.12)),
            alignment: .bottom
        )
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Нет счетов —")
                .font(.custom(PosterTokens.Font.ptSerifItalic, size: 22))
                .foregroundColor(PosterTokens.Color.ink)
            Text("добавьте счёт в Управлении")
                .font(.posterMono(size: 11))
                .foregroundColor(PosterTokens.Color.ink.opacity(0.6))
        }
        .padding(.vertical, 14)
    }

    // MARK: - Formatting helpers

    /// «BANK ·· MASK» — mirrors the inline label rendered in AddSheetView's
    /// account row. Kept in-file rather than DRY'd into a shared formatter
    /// because the picker may grow extra columns (last-used hint, etc.)
    /// independently of the row label.
    private func label(for acc: AccountDTO) -> String {
        let mask = acc.mask.map { " ·· \($0)" } ?? ""
        return acc.bank + mask
    }

    /// Russian-uppercase kind badge — matches the chip labels used in
    /// onboarding step 02 (Card → КАРТА, Cash → НАЛИЧНЫЕ, Savings → КОПИЛКА).
    private func kindBadge(_ k: AccountKind) -> String {
        switch k {
        case .card:    return "КАРТА"
        case .cash:    return "НАЛИЧНЫЕ"
        case .savings: return "КОПИЛКА"
        }
    }

    // MARK: - Actions

    private func pick(_ id: Int) {
        selection = id
        isPresented = false
    }
}

// MARK: - Preview

#Preview("AccountPickerSheet") {
    struct Wrapper: View {
        @State var selection: Int? = 1
        @State var isPresented: Bool = true
        var body: some View {
            ZStack {
                PosterTokens.Color.coral.ignoresSafeArea()
                Color.clear
                    .posterSheet(isPresented: $isPresented) {
                        AccountPickerSheet(
                            selection: $selection,
                            isPresented: $isPresented,
                            accounts: [
                                AccountDTO(
                                    id: 1,
                                    bank: "T-БАНК",
                                    mask: "1234",
                                    kind: .card,
                                    balanceCents: 1_250_000,
                                    primary: true,
                                    createdAt: nil
                                ),
                                AccountDTO(
                                    id: 2,
                                    bank: "Наличные",
                                    mask: nil,
                                    kind: .cash,
                                    balanceCents: 35_000,
                                    primary: false,
                                    createdAt: nil
                                ),
                                AccountDTO(
                                    id: 3,
                                    bank: "Копилка",
                                    mask: nil,
                                    kind: .savings,
                                    balanceCents: 580_000,
                                    primary: false,
                                    createdAt: nil
                                ),
                            ]
                        )
                    }
            }
        }
    }
    return Wrapper()
}
