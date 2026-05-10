// Phase 27-09 Task 2: NewAccountSheet — bottom-sheet form for creating an
// account. Symmetric to web Plan 27-04 NewAccountSheet.
//
// Composition (paper bg via PosterSheet wrapper):
//   - Eyebrow «НОВЫЙ СЧЁТ».
//   - Mass italic «Добавить.» 28pt.
//   - bank TextField (40 chars max).
//   - 3-chip kind selector — карта / наличные / накопит.
//   - mask TextField (digits-only, max 4) — visible only when kind == .card.
//   - balance TextField (digits-only rubles → cents on save).
//   - primary Toggle «Сделать основным».
//   - HStack(ОТМЕНА | СОХРАНИТЬ) — disabled if !isValidNewAccountDraft.
//
// Threat-model:
//   - T-27-09-01: balance digits-only → integer ≥0; UI gate ensures balance ≥ 0.
//   - T-27-09-02: mask sanitised onChange to digits + first 4 chars.

import SwiftUI

struct NewAccountSheet: View {
    var submitting: Bool
    var onSave: (_ bank: String, _ kind: AccountKind, _ mask: String?, _ balanceCents: Int, _ primary: Bool) -> Void
    var onCancel: () -> Void

    @State private var bank: String = ""
    @State private var kind: AccountKind = .card
    @State private var mask: String = ""
    @State private var balanceRubles: String = ""
    @State private var primary: Bool = false

    private var balanceCents: Int {
        let digits = balanceRubles.filter(\.isNumber)
        return (Int(digits) ?? 0) * 100
    }

    private var isValid: Bool {
        AccountsData.isValidNewAccountDraft(bank: bank, balanceCents: balanceCents)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s14) {
            Eyebrow("НОВЫЙ СЧЁТ", opacity: 0.7, color: PosterTokens.Color.ink)
            Mass("Добавить.", italic: true, size: 32)
                .foregroundColor(PosterTokens.Color.ink)
                .padding(.bottom, PosterTokens.Space.s8)

            field("БАНК") {
                TextField("Тинькофф", text: $bank)
                    .textInputAutocapitalization(.words)
                    .font(.posterMono(size: 14, weight: .semibold))
                    .foregroundColor(PosterTokens.Color.ink)
                    .padding(.vertical, 8)
            }

            field("ТИП") {
                HStack(spacing: 6) {
                    chip(label: "КАРТА", isActive: kind == .card) { kind = .card }
                    chip(label: "НАЛИЧНЫЕ", isActive: kind == .cash) { kind = .cash }
                    chip(label: "НАКОПИТ.", isActive: kind == .savings) { kind = .savings }
                    Spacer()
                }
            }

            if kind == .card {
                field("ПОСЛ. 4 ЦИФРЫ") {
                    TextField("1234", text: Binding(
                        get: { mask },
                        set: { newVal in
                            // T-27-09-02: digits only + max 4.
                            let digits = newVal.filter(\.isNumber)
                            mask = String(digits.prefix(4))
                        }
                    ))
                    .keyboardType(.numberPad)
                    .font(.posterMono(size: 14, weight: .semibold))
                    .foregroundColor(PosterTokens.Color.ink)
                    .padding(.vertical, 8)
                }
            }

            field("БАЛАНС, ₽") {
                TextField("0", text: Binding(
                    get: { balanceRubles },
                    set: { newVal in
                        balanceRubles = newVal.filter(\.isNumber)
                    }
                ))
                .keyboardType(.numberPad)
                .font(.posterMono(size: 14, weight: .semibold))
                .foregroundColor(PosterTokens.Color.ink)
                .padding(.vertical, 8)
            }

            Toggle(isOn: $primary) {
                Text("СДЕЛАТЬ ОСНОВНЫМ")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 11))
                    .tracking(2)
                    .foregroundColor(PosterTokens.Color.ink)
            }
            .tint(PosterTokens.Color.yellow)

            HStack(spacing: 10) {
                PosterButton("ОТМЕНА", variant: .ghost) {
                    onCancel()
                }
                PosterButton(
                    submitting ? "СОХРАНЕНИЕ…" : "СОХРАНИТЬ",
                    variant: .primary,
                    disabled: !isValid || submitting
                ) {
                    let normalisedMask = (kind == .card && !mask.isEmpty) ? mask : nil
                    onSave(bank, kind, normalisedMask, balanceCents, primary)
                }
            }
            .padding(.top, PosterTokens.Space.s8)
        }
        .padding(.horizontal, PosterTokens.Space.s22)
        .padding(.top, PosterTokens.Space.s24)
        .padding(.bottom, PosterTokens.Space.s40)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Helpers

    @ViewBuilder
    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Eyebrow(label, opacity: 0.6, color: PosterTokens.Color.ink)
            content()
            Rectangle()
                .fill(PosterTokens.Color.ink.opacity(0.18))
                .frame(height: 1)
        }
    }

    @ViewBuilder
    private func chip(label: String, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.custom(PosterTokens.Font.archivoBlack, size: 11))
                .tracking(1.4)
                .padding(.vertical, 8)
                .padding(.horizontal, 11)
                .foregroundColor(isActive ? PosterTokens.Color.paper : PosterTokens.Color.ink)
                .background(isActive ? PosterTokens.Color.ink : Color.clear)
                .overlay(
                    Rectangle().stroke(
                        isActive ? .clear : PosterTokens.Color.ink.opacity(0.35),
                        lineWidth: 1
                    )
                )
        }
        .buttonStyle(.plain)
    }
}
