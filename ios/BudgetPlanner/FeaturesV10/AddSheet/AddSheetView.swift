// Phase 25-11 Task 4: full SwiftUI AddSheet (ADD-V10-01..05).
//
// Symmetric to web Plan 25-10 AddSheet.tsx. Black background; header
// «NEW ENTRY · {date_short} · {time_HHMM}» + × close; BigFig 86pt
// yellow amount; 3×4 KeypadView (only input — system kb suppressed by
// design, no TextField bound to amount); description TextField (italic
// serif placeholder); date chips (Сегодня / Вчера / Своя дата + custom
// DatePicker); horizontal category chip-scroll (drops 'savings' +
// paused); account row (defaults to primary, opens confirmationDialog
// picker on tap); CTA button with three states (empty / noCat / ready);
// cancel-confirm alert when × tapped on dirty form (T-25-11-02).

import SwiftUI

struct AddSheetView: View {
    @State private var model = AddSheetViewModel()
    @State private var showCancelConfirm: Bool = false
    @State private var showAccountPicker: Bool = false
    @State private var showCustomDatePicker: Bool = false

    let onSubmitted: (Int) -> Void
    let onClose: () -> Void

    var body: some View {
        ZStack {
            PosterTokens.Color.black.ignoresSafeArea()
            content
        }
        .task { await model.loadFormData() }
        .alert("Отменить запись?", isPresented: $showCancelConfirm) {
            Button("Продолжить", role: .cancel) { }
            Button("Отменить", role: .destructive) {
                model.reset()
                onClose()
            }
        } message: {
            Text("Введённые данные будут потеряны.")
        }
        .confirmationDialog(
            "Выбрать счёт",
            isPresented: $showAccountPicker,
            titleVisibility: .visible
        ) {
            ForEach(model.accounts) { acc in
                Button(accountLabel(acc)) { model.accountId = acc.id }
            }
            Button("Отмена", role: .cancel) {}
        }
        .sheet(isPresented: $showCustomDatePicker) {
            customDatePickerSheet
        }
    }

    // MARK: - Layout

    @ViewBuilder
    private var content: some View {
        // WR-25-02 (review fix): surface bootstrap errors instead of letting
        // the user stare at an empty category scroll. Mirrors HomeViewModel
        // pattern (load-status branching at the View root).
        switch model.loadStatus {
        case .error(let msg):
            errorState(msg)
        default:
            scrollContent
        }
    }

    private var scrollContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                headerRow
                amountBlock
                KeypadView(
                    onAppendDigit: { d in model.onAppendDigit(d) },
                    onAppendDot:   { model.onAppendDot() },
                    onBackspace:   { model.onBackspace() }
                )
                descriptionRow
                dateChipBar
                categoryScroll
                accountRow
                ctaButton
            }
            .padding(.horizontal, PosterTokens.Space.s22)
            .padding(.top, 56)
            .padding(.bottom, 22)
        }
    }

    @ViewBuilder
    private func errorState(_ msg: String) -> some View {
        VStack(spacing: 16) {
            Spacer()
            Text(msg.uppercased())
                .font(.custom(PosterTokens.Font.archivoBlack, size: 14))
                .tracking(2.0)
                .foregroundColor(PosterTokens.Color.paper)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button(action: { Task { await model.loadFormData() } }) {
                Text("ПОВТОРИТЬ")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 12))
                    .tracking(2.0)
                    .padding(.vertical, 12)
                    .padding(.horizontal, 28)
                    .background(PosterTokens.Color.yellow)
                    .foregroundColor(PosterTokens.Color.ink)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Повторить загрузку")
            HStack {
                Spacer()
                Button(action: onClose) {
                    Text("ЗАКРЫТЬ")
                        .font(.custom(PosterTokens.Font.archivoBlack, size: 11))
                        .tracking(1.6)
                        .foregroundColor(PosterTokens.Color.paper.opacity(0.7))
                        .padding(8)
                }
                .buttonStyle(.plain)
                Spacer()
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Sections

    private var headerRow: some View {
        HStack {
            // CR-25-03 (review fix): use `formatShortDate` instead of
            // `formatDay(Date(), today: Date())` which always returned
            // "Сегодня". Spec ADD-V10-02 + web parity → "9 МАЯ".
            Eyebrow(
                "NEW ENTRY · \(V10Formatters.formatShortDate(Date())) · \(V10Formatters.formatTimeHM(Date()))",
                opacity: 0.7
            )
            Spacer()
            Button(action: closeRequested) {
                Text("×")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 28))
                    .foregroundColor(PosterTokens.Color.paper)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Закрыть")
        }
    }

    private var amountBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            BigFig(
                value: model.amountCents / 100,
                sup: "₽",
                size: 86,
                color: PosterTokens.Color.yellow
            )
            .frame(maxWidth: .infinity, alignment: .leading)
            // Mono caption shows the raw amountString (with decimal dot)
            // — useful when the user types a dot but no decimal yet.
            Text(model.amountString.isEmpty ? "0" : model.amountString)
                .font(.custom(PosterTokens.Font.jetBrainsMono, size: 11))
                .foregroundColor(PosterTokens.Color.paper.opacity(0.4))
        }
    }

    private var descriptionRow: some View {
        TextField(
            "",
            text: $model.description,
            prompt: Text("кафе / продукты / …")
                .font(.custom(PosterTokens.Font.ptSerifItalic, size: 18))
                .foregroundColor(PosterTokens.Color.paper.opacity(0.5))
        )
        .font(.custom(PosterTokens.Font.ptSerifItalic, size: 18))
        .foregroundColor(PosterTokens.Color.paper)
        .padding(.vertical, 12)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(PosterTokens.Color.paper.opacity(0.2)),
            alignment: .bottom
        )
        .accessibilityLabel("Описание траты")
    }

    private var dateChipBar: some View {
        HStack(spacing: 8) {
            ForEach(AddSheetDateChip.allCases, id: \.self) { chip in
                Button(action: {
                    model.dateChip = chip
                    if chip == .custom { showCustomDatePicker = true }
                }) {
                    Text(label(for: chip).uppercased())
                        .font(.custom(PosterTokens.Font.archivoBlack, size: 11))
                        .tracking(1.4)
                        .padding(.vertical, 8)
                        .padding(.horizontal, 14)
                        .background(model.dateChip == chip
                                    ? PosterTokens.Color.paper
                                    : PosterTokens.Color.paper.opacity(0.12))
                        .foregroundColor(model.dateChip == chip
                                         ? PosterTokens.Color.ink
                                         : PosterTokens.Color.paper)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(model.dateChip == chip ? [.isSelected, .isButton] : [.isButton])
            }
        }
    }

    private func label(for chip: AddSheetDateChip) -> String {
        switch chip {
        case .today:     return "Сегодня"
        case .yesterday: return "Вчера"
        case .custom:    return "Своя дата"
        }
    }

    private var categoryScroll: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(model.visibleCategories) { cat in
                    Button(action: { model.categoryId = cat.id }) {
                        Text(cat.name.uppercased())
                            .font(.custom(PosterTokens.Font.archivoBlack, size: 12))
                            .tracking(1.6)
                            .padding(.vertical, 10)
                            .padding(.horizontal, 16)
                            .background(model.categoryId == cat.id
                                        ? PosterTokens.Color.yellow
                                        : PosterTokens.Color.paper.opacity(0.12))
                            .foregroundColor(model.categoryId == cat.id
                                             ? PosterTokens.Color.ink
                                             : PosterTokens.Color.paper)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(model.categoryId == cat.id ? [.isSelected, .isButton] : [.isButton])
                }
            }
        }
    }

    private var accountRow: some View {
        Button(action: { showAccountPicker = true }) {
            HStack {
                let acc = model.accounts.first(where: { $0.id == model.accountId })
                Text(acc.map(accountLabel) ?? "ВЫБРАТЬ СЧЁТ")
                    .font(.custom(PosterTokens.Font.manrope, size: 14))
                    .foregroundColor(PosterTokens.Color.paper)
                Spacer()
                Text("→")
                    .font(.custom(PosterTokens.Font.manrope, size: 14))
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.6))
            }
            .padding(.vertical, 12)
            .overlay(
                Rectangle()
                    .frame(height: 1)
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.2)),
                alignment: .bottom
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Выбрать счёт")
    }

    private func accountLabel(_ acc: AccountDTO) -> String {
        let mask = acc.mask.map { " ·· \($0)" } ?? ""
        return acc.bank + mask
    }

    private var ctaButton: some View {
        let (label, isReady) = ctaLabelAndReady()
        let isSubmitting = (model.submitStatus == .submitting)
        return Button(action: { Task { await submitTapped() } }) {
            Text(isSubmitting ? "СОХРАНЯЕМ…" : label)
                .font(.custom(PosterTokens.Font.archivoBlack, size: 14))
                .tracking(2.5)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .background(isReady
                            ? PosterTokens.Color.yellow
                            : PosterTokens.Color.paper.opacity(0.18))
                .foregroundColor(isReady
                                 ? PosterTokens.Color.ink
                                 : PosterTokens.Color.paper.opacity(0.7))
        }
        .buttonStyle(.plain)
        .disabled(!isReady || isSubmitting)
        .accessibilityLabel(label)
    }

    private func ctaLabelAndReady() -> (String, Bool) {
        switch model.ctaState {
        case .empty:     return ("ВВЕДИТЕ СУММУ", false)
        case .noCat:     return ("ВЫБЕРИТЕ КАТЕГОРИЮ", false)
        case .noAccount: return ("НЕТ СЧЁТА", false)
        case .ready:     return ("СОХРАНИТЬ ↵", true)
        }
    }

    // MARK: - Custom date picker sheet

    private var customDatePickerSheet: some View {
        NavigationStack {
            VStack {
                DatePicker(
                    "Выберите дату",
                    selection: $model.customDate,
                    in: ...Date(),
                    displayedComponents: .date
                )
                .datePickerStyle(.graphical)
                .labelsHidden()
                .padding()
                Spacer()
            }
            .navigationTitle("Своя дата")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Готово") { showCustomDatePicker = false }
                }
            }
        }
        .presentationDetents([.medium])
    }

    // MARK: - Actions

    private func submitTapped() async {
        if let id = await model.submit() {
            onSubmitted(id)
            model.reset()
        }
    }

    private func closeRequested() {
        if model.isDirty {
            showCancelConfirm = true
        } else {
            onClose()
        }
    }
}

#Preview("AddSheetView") {
    AddSheetView(
        onSubmitted: { id in print("submitted \(id)") },
        onClose: { print("closed") }
    )
}
