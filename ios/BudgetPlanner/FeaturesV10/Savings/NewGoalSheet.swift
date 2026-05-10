// Phase 27-08 Task 2: NewGoalSheet — primary posterSheet for the
// "+ НОВАЯ ЦЕЛЬ" CTA on the Savings (Копилка) screen.
//
// Symmetric to web Plan 27-03 NewGoalSheet. Three labelled inputs:
//   - name (TextField, required, trimmed)
//   - target (digit-only TextField → rubles, multiplied by 100 on save)
//   - due (Toggle + DatePicker; only shown when toggle is ON)
//
// СОХРАНИТЬ button is disabled until SavingsData.isValidGoalDraft
// passes. ОТМЕНА dismisses without saving.
//
// `submitting` flag (driven by parent VM) shows "СОХРАНЯЕМ…" and
// disables the button while the POST /goals is in flight.

import SwiftUI

struct NewGoalSheet: View {
    let onSave: (_ name: String, _ targetCents: Int, _ due: Date?) -> Void
    let onClose: () -> Void
    let submitting: Bool

    @State private var name: String = ""
    @State private var targetRubles: String = ""
    @State private var dueEnabled: Bool = false
    @State private var due: Date = Date().addingTimeInterval(7 * 24 * 60 * 60)

    private var targetCents: Int {
        (Int(targetRubles.filter(\.isNumber)) ?? 0) * 100
    }

    private var isValid: Bool {
        SavingsData.isValidGoalDraft(name: name, targetCents: targetCents)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s14) {
            Eyebrow("НОВАЯ ЦЕЛЬ", opacity: 0.7, color: PosterTokens.Color.ink)
                .padding(.bottom, PosterTokens.Space.s4)

            // Name
            VStack(alignment: .leading, spacing: PosterTokens.Space.s4) {
                Eyebrow("НАЗВАНИЕ", opacity: 0.55, color: PosterTokens.Color.ink)
                TextField("Например — Отпуск", text: $name)
                    .font(.posterMono(size: 18, weight: .semibold))
                    .foregroundColor(PosterTokens.Color.ink)
                    .textFieldStyle(.plain)
                    .padding(.vertical, 8)
                    .overlay(
                        Rectangle()
                            .frame(height: 1)
                            .foregroundColor(PosterTokens.Color.ink.opacity(0.35)),
                        alignment: .bottom
                    )
            }

            // Target
            VStack(alignment: .leading, spacing: PosterTokens.Space.s4) {
                Eyebrow("ЦЕЛЬ ₽", opacity: 0.55, color: PosterTokens.Color.ink)
                TextField("0", text: $targetRubles)
                    .keyboardType(.numberPad)
                    .font(.posterMono(size: 28, weight: .semibold))
                    .foregroundColor(PosterTokens.Color.ink)
                    .textFieldStyle(.plain)
                    .onChange(of: targetRubles) { _, new in
                        let cleaned = new.filter(\.isNumber)
                        if cleaned != new { targetRubles = cleaned }
                    }
                    .padding(.vertical, 8)
                    .overlay(
                        Rectangle()
                            .frame(height: 1)
                            .foregroundColor(PosterTokens.Color.ink.opacity(0.35)),
                        alignment: .bottom
                    )
            }

            // Due
            Toggle(isOn: $dueEnabled) {
                Text("СРОК")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 11))
                    .tracking(2)
                    .foregroundColor(PosterTokens.Color.ink)
            }
            .tint(PosterTokens.Color.ink)
            if dueEnabled {
                DatePicker(
                    "Когда?",
                    selection: $due,
                    in: Date()...,
                    displayedComponents: .date
                )
                .datePickerStyle(.compact)
                .foregroundColor(PosterTokens.Color.ink)
                .tint(PosterTokens.Color.ink)
            }

            // Actions
            HStack(spacing: PosterTokens.Space.s10) {
                Button(action: onClose) {
                    Text("ОТМЕНА")
                        .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                        .kerning(13 * 0.18)
                        .foregroundColor(PosterTokens.Color.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .overlay(
                            Rectangle()
                                .stroke(PosterTokens.Color.ink.opacity(0.45), lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)

                Button(action: {
                    if isValid && !submitting {
                        onSave(name, targetCents, dueEnabled ? due : nil)
                    }
                }) {
                    Text(submitting ? "СОХРАНЯЕМ…" : "СОХРАНИТЬ")
                        .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                        .kerning(13 * 0.18)
                        .foregroundColor(PosterTokens.Color.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(PosterTokens.Color.yellow)
                        .opacity(isValid && !submitting ? 1.0 : 0.45)
                }
                .buttonStyle(.plain)
                .disabled(!isValid || submitting)
            }
            .padding(.top, PosterTokens.Space.s8)
        }
        .padding(PosterTokens.Space.s22)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
