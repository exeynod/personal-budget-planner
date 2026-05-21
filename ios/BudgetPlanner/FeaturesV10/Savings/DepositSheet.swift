// Phase 27-08 Task 2: DepositSheet — secondary posterSheet for the
// "ПОПОЛНИТЬ" CTA on the Savings (Копилка) screen and for the
// goal-card tap pre-select flow (initialGoalId).
//
// Symmetric to web Plan 27-03 DepositSheet:
//   - amount (digit-only TextField → rubles → cents on save)
//   - account chip-row (auto-picks first / primary on mount; the
//     parent always passes the post-fetch accounts so this is stable)
//   - optional goal chip-row (БЕЗ ЦЕЛИ + N goal chips); initialGoalId
//     pre-selects when arriving from a goal-card tap
//
// СОХРАНИТЬ disabled until SavingsData.isValidDepositDraft passes
// (account_id must be non-nil per backend Field(gt=0)).
//
// `submitting` flag drives the "СОХРАНЯЕМ…" label + disables the CTA
// while POST /savings/deposit is in flight.

import SwiftUI

struct DepositSheet: View {
    let accounts: [AccountDTO]
    let goals: [GoalDTO]
    let initialGoalId: Int?
    let onSave: (_ amountCents: Int, _ accountId: Int, _ goalId: Int?) -> Void
    let onClose: () -> Void
    let submitting: Bool

    @State private var amountRubles: String = ""
    @State private var selectedAccountId: Int? = nil
    @State private var selectedGoalId: Int? = nil

    private var amountCents: Int {
        (Int(amountRubles.filter(\.isNumber)) ?? 0) * 100
    }

    private var isValid: Bool {
        SavingsData.isValidDepositDraft(amountCents: amountCents, accountId: selectedAccountId)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: PosterTokens.Space.s14) {
            Eyebrow("ПОПОЛНЕНИЕ", opacity: 0.7, color: PosterTokens.Color.ink)
                .padding(.bottom, PosterTokens.Space.s4)

            // Amount
            VStack(alignment: .leading, spacing: PosterTokens.Space.s4) {
                Eyebrow("СУММА ₽", opacity: 0.55, color: PosterTokens.Color.ink)
                TextField("0", text: $amountRubles)
                    .keyboardType(.numberPad)
                    .font(.posterMono(size: 28, weight: .semibold))
                    .foregroundColor(PosterTokens.Color.ink)
                    .textFieldStyle(.plain)
                    .onChange(of: amountRubles) { _, new in
                        let cleaned = new.filter(\.isNumber)
                        if cleaned != new { amountRubles = cleaned }
                    }
                    .padding(.vertical, 8)
                    .overlay(
                        Rectangle()
                            .frame(height: 1)
                            .foregroundColor(PosterTokens.Color.ink.opacity(0.35)),
                        alignment: .bottom
                    )
            }

            // Account picker — chip row, auto-pick first / primary.
            VStack(alignment: .leading, spacing: PosterTokens.Space.s4) {
                Eyebrow("СЧЁТ", opacity: 0.55, color: PosterTokens.Color.ink)
                if accounts.isEmpty {
                    Text("Сначала добавьте счёт")
                        .font(.posterMono(size: 13))
                        .foregroundColor(PosterTokens.Color.ink.opacity(0.55))
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: PosterTokens.Space.s8) {
                            ForEach(accounts) { acc in
                                Chip(
                                    acc.bank.uppercased(),
                                    active: selectedAccountId == acc.id
                                ) {
                                    selectedAccountId = acc.id
                                }
                            }
                        }
                    }
                }
            }

            // Goal picker — БЕЗ ЦЕЛИ + N chips; initialGoalId pre-select.
            if !goals.isEmpty {
                VStack(alignment: .leading, spacing: PosterTokens.Space.s4) {
                    Eyebrow("ЦЕЛЬ", opacity: 0.55, color: PosterTokens.Color.ink)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: PosterTokens.Space.s8) {
                            Chip(
                                "БЕЗ ЦЕЛИ",
                                active: selectedGoalId == nil
                            ) {
                                selectedGoalId = nil
                            }
                            ForEach(goals) { goal in
                                Chip(
                                    goal.name.uppercased(),
                                    active: selectedGoalId == goal.id
                                ) {
                                    selectedGoalId = goal.id
                                }
                            }
                        }
                    }
                }
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
                    if isValid && !submitting, let accId = selectedAccountId {
                        onSave(amountCents, accId, selectedGoalId)
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
        // DEP-1: the Savings shell keeps the bottom tab bar visible while this
        // posterSheet is up (unlike AddSheet, which hides it). Без этого зазора
        // ряд ОТМЕНА / СОХРАНИТЬ + чипсы ЦЕЛЬ уходили под таб-бар (y≈798+) и были
        // недоступны. Поднимаем контент над таб-баром: его видимая высота 68pt +
        // .padding(.bottom, s18) ≈ 86pt, плюс safe-area home-indicator снизу
        // (posterSheet рендерится во всю высоту, игнорируя safe area).
        .padding(.bottom, PosterSheetLayout.tabBarClearance)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onAppear {
            // Auto-pick first / primary account on first appear.
            if selectedAccountId == nil, let first = accounts.first {
                selectedAccountId = first.id
            }
            // Apply initialGoalId pre-select once.
            if selectedGoalId == nil, let initial = initialGoalId {
                selectedGoalId = initial
            }
        }
        .onChange(of: accounts) { _, new in
            // If accounts arrive after the sheet is on screen, re-seed.
            if selectedAccountId == nil, let first = new.first {
                selectedAccountId = first.id
            }
        }
    }
}
