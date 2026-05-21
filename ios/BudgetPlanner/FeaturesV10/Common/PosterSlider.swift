// PosterSlider.swift — step-based numeric slider with debounce-commit and tap-to-edit.
// Symmetric to web <PosterSlider> (frontend/src/componentsV10/PosterSlider.tsx).
// DS-06 iOS.

import SwiftUI

/// Numeric slider with:
///  - integer-step snapping (default 500)
///  - 300ms debounced `onCommit` after last change
///  - tap on the rendered number → switch to TextField (numberPad keyboard)
///
/// `valueIsCents` controls the rendered label only — the bound `value`,
/// `range`, and `step` are always in the slider's native unit. When the bound
/// value is money in BIGINT cents (e.g. the PLAN МЕСЯЦА category limits) pass
/// `valueIsCents: true` so the readout shows rubles + «₽» via `RubleFormatter`
/// instead of printing the raw kopeck integer (PLAN-1 fix). The TextField edit
/// path stays in the native unit so the saved `plan_cents` value is unchanged.
struct PosterSlider: View {
    @Binding var value: Int
    let range: ClosedRange<Int>
    var step: Int = 500
    var label: String? = nil
    var valueIsCents: Bool = false
    var onCommit: ((Int) -> Void)? = nil

    @State private var editing: Bool = false
    @State private var commitTask: Task<Void, Never>? = nil
    @FocusState private var focused: Bool

    init(
        value: Binding<Int>,
        in range: ClosedRange<Int>,
        step: Int = 500,
        label: String? = nil,
        valueIsCents: Bool = false,
        onCommit: ((Int) -> Void)? = nil
    ) {
        self._value = value
        self.range = range
        self.step = step
        self.label = label
        self.valueIsCents = valueIsCents
        self.onCommit = onCommit
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let label {
                Eyebrow(label, opacity: 0.7, color: PosterTokens.Color.paper)
            }
            HStack(spacing: 12) {
                Slider(
                    value: Binding(
                        get: { Double(value) },
                        set: { newValue in
                            let snapped = Int((newValue / Double(step)).rounded()) * step
                            value = max(range.lowerBound, min(range.upperBound, snapped))
                            scheduleCommit(value)
                        }
                    ),
                    in: Double(range.lowerBound)...Double(range.upperBound),
                    step: Double(step)
                )
                .tint(PosterTokens.Color.paper)

                if editing {
                    // Edit in the unit the user reads: rubles when valueIsCents,
                    // otherwise the native unit. The rubles binding multiplies
                    // back to cents on write so the saved plan_cents stays exact.
                    TextField("0", value: editBinding, format: .number)
                        .keyboardType(.numberPad)
                        .focused($focused)
                        .multilineTextAlignment(.trailing)
                        .frame(minWidth: 80)
                        .font(.posterMono(size: 14, weight: .semibold))
                        .foregroundColor(PosterTokens.Color.paper)
                        .onSubmit {
                            editing = false
                            scheduleCommit(value)
                        }
                        .onChange(of: focused) { _, isFocused in
                            if !isFocused {
                                editing = false
                                scheduleCommit(value)
                            }
                        }
                } else {
                    Text(formatted(value))
                        .font(.posterMono(size: 14, weight: .semibold))
                        .foregroundColor(PosterTokens.Color.paper)
                        .frame(minWidth: 80, alignment: .trailing)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            editing = true
                            focused = true
                        }
                }
            }
        }
    }

    private func scheduleCommit(_ next: Int) {
        commitTask?.cancel()
        guard let onCommit else { return }
        commitTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)  // 300ms debounce
            guard !Task.isCancelled else { return }
            await MainActor.run { onCommit(next) }
        }
    }

    /// TextField binding in the user-facing edit unit. In cents mode the field
    /// edits whole rubles and re-multiplies to cents (snapped down to the
    /// nearest ruble) so `value` — the saved plan_cents — stays well-formed.
    private var editBinding: Binding<Int> {
        guard valueIsCents else { return $value }
        return Binding(
            get: { value / 100 },
            set: { rubles in
                value = max(range.lowerBound, min(range.upperBound, rubles * 100))
            }
        )
    }

    /// Read-only readout. Delegates to the testable static `readout(_:isCents:)`.
    private func formatted(_ n: Int) -> String {
        Self.readout(n, isCents: valueIsCents)
    }

    /// Render a slider value for display.
    ///
    /// Money (`isCents == true`) renders as rubles + «₽» via the shared
    /// RubleFormatter (cents→rubles, U+202F grouping) — matches every other
    /// money label in the maximal-poster shell (PLAN-1 fix). Non-money keeps the
    /// plain grouped integer (e.g. the onboarding cycle-day slider).
    static func readout(_ n: Int, isCents: Bool) -> String {
        if isCents {
            return "\(RubleFormatter.format(cents: n)) ₽"
        }
        let f = NumberFormatter()
        f.groupingSeparator = "\u{00A0}"
        f.numberStyle = .decimal
        return f.string(from: NSNumber(value: n)) ?? String(n)
    }
}

#Preview("PosterSlider") {
    struct Demo: View {
        @State private var v: Int = 4_000
        var body: some View {
            PosterSlider(value: $v, in: 0...10_000, step: 500, label: "Cycle day")
                .padding()
                .background(PosterTokens.Color.ink)
        }
    }
    return Demo()
}
