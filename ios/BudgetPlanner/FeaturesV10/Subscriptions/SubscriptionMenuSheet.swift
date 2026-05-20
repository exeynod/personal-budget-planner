// Phase 26-07 Task 3: SubscriptionMenuSheet — primary menu posterSheet for
// the iOS Subscriptions screen with nested day / price editor sheets and a
// destructive «ОТМЕНИТЬ ПОДПИСКУ» CTA.
//
// Symmetric to web Plan 26-06 SubscriptionMenuSheet.
//
// Composition:
//   - Title row: subscription name UPPERCASE in Archivo Black 16pt.
//   - 3 ghost buttons:
//       «ПАУЗА» / «ВКЛЮЧИТЬ» (toggles is_active via parent VM)
//       «СМЕНИТЬ ДЕНЬ»  → opens nested day editor (Stepper 1...28)
//       «ИЗМЕНИТЬ ЦЕНУ» → opens nested price editor (numeric TextField)
//   - Destructive CTA «ОТМЕНИТЬ ПОДПИСКУ» (red bg, paper text) — fires
//     onRequestDelete; the parent screen surfaces a .confirmationDialog
//     for the actual destruction (T-26-07-01 two-step gate).
//
// Nested posterSheet pattern: the .posterSheet ViewModifier is attached to the
// inner VStack so the day/price editors stack on top of the parent sheet via
// SwiftUI's natural view-hierarchy z-ordering. If a future polish pass finds
// gesture conflicts, switching to a single-sheet `editorMode` enum (the
// alternative pattern web Plan 26-06 documents) is a drop-in replacement.

import SwiftUI

struct SubscriptionMenuSheet: View {
    let sub: SubscriptionV10DTO
    let onTogglePause: () -> Void
    let onChangeDay: (Int) -> Void
    let onChangePrice: (Int) -> Void
    let onRequestDelete: () -> Void

    @State private var dayEditorOpen = false
    @State private var priceEditorOpen = false
    @State private var dayValue: Int = 1
    @State private var priceRubles: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s14) {
            // Title row with subscription name + cadence caption.
            VStack(alignment: .leading, spacing: 2) {
                Text(sub.name.uppercased())
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 16))
                    .foregroundColor(PosterTokens.Color.ink)
                Text(SubscriptionsDomain.cadenceRuV10(sub))
                    .font(.posterMono(size: 11))
                    .foregroundColor(PosterTokens.Color.ink.opacity(0.6))
            }
            .padding(.bottom, PosterTokens.Space.s4)

            // ПАУЗА / ВКЛЮЧИТЬ — verb describes what the tap will do.
            ghostButton(label: sub.isActive ? "ПАУЗА" : "ВКЛЮЧИТЬ", action: onTogglePause)

            // СМЕНИТЬ ДЕНЬ — opens nested day editor.
            ghostButton(label: "СМЕНИТЬ ДЕНЬ") {
                dayValue = sub.dayOfMonth ?? 1
                dayEditorOpen = true
            }

            // ИЗМЕНИТЬ ЦЕНУ — opens nested price editor.
            ghostButton(label: "ИЗМЕНИТЬ ЦЕНУ") {
                priceRubles = String(sub.amountCents / 100)
                priceEditorOpen = true
            }

            // Destructive CTA — fires onRequestDelete; parent screen owns
            // the .confirmationDialog (T-26-07-01 two-step gate).
            Button(action: onRequestDelete) {
                Text("ОТМЕНИТЬ ПОДПИСКУ")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                    .kerning(13 * 0.18)
                    .foregroundColor(PosterTokens.Color.paper)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(PosterTokens.Color.red)
            }
            .buttonStyle(.plain)
            .padding(.top, PosterTokens.Space.s8)
        }
        .padding(PosterTokens.Space.s22)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Nested editors — see file-header note re posterSheet stacking.
        .posterSheet(isPresented: $dayEditorOpen) {
            dayEditor
        }
        .posterSheet(isPresented: $priceEditorOpen) {
            priceEditor
        }
    }

    // MARK: - Editors

    private var dayEditor: some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s14) {
            Eyebrow("СМЕНИТЬ ДЕНЬ", opacity: 0.7, color: PosterTokens.Color.ink)
            Stepper(
                value: $dayValue,
                in: 1...28
            ) {
                Text("\(dayValue) число")
                    .font(.posterMono(size: 22, weight: .semibold))
                    .foregroundColor(PosterTokens.Color.ink)
            }
            .tint(PosterTokens.Color.ink)
            Text("Бэкенд округлит февраль до 28-го автоматически.")
                .font(.posterMono(size: 11))
                .foregroundColor(PosterTokens.Color.ink.opacity(0.55))

            HStack(spacing: PosterTokens.Space.s10) {
                editorCancel { dayEditorOpen = false }
                editorSave {
                    onChangeDay(dayValue)
                    dayEditorOpen = false
                }
            }
            .padding(.top, PosterTokens.Space.s8)
        }
        .padding(PosterTokens.Space.s22)
    }

    private var priceEditor: some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s14) {
            Eyebrow("ИЗМЕНИТЬ ЦЕНУ", opacity: 0.7, color: PosterTokens.Color.ink)
            TextField("0", text: $priceRubles)
                .keyboardType(.numberPad)
                .font(.posterMono(size: 28, weight: .semibold))
                .foregroundColor(PosterTokens.Color.ink)
                .textFieldStyle(.plain)
            Text("в рублях")
                .font(.posterMono(size: 11))
                .foregroundColor(PosterTokens.Color.ink.opacity(0.55))

            HStack(spacing: PosterTokens.Space.s10) {
                editorCancel { priceEditorOpen = false }
                editorSave {
                    let cleaned = priceRubles.filter { $0.isNumber }
                    if let rubles = Int(cleaned), rubles > 0 {
                        onChangePrice(rubles * 100)
                        priceEditorOpen = false
                    }
                }
            }
            .padding(.top, PosterTokens.Space.s8)
        }
        .padding(PosterTokens.Space.s22)
    }

    // MARK: - Building blocks

    private func ghostButton(label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
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
    }

    private func editorCancel(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
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
    }

    private func editorSave(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text("СОХРАНИТЬ")
                .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                .kerning(13 * 0.18)
                .foregroundColor(PosterTokens.Color.ink)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(PosterTokens.Color.yellow)
        }
        .buttonStyle(.plain)
    }
}
