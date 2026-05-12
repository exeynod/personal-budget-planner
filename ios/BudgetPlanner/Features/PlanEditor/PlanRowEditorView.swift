import SwiftUI

/// Phase 61: PlanRowEditorView — detail editor для одной категории.
///
/// 61-03 реализация:
///   Form с 3 секциями:
///     • «Лимит» — Stepper (+/- 500₽ step) + TextField (.decimalPad через
///       MoneyParser). Real-time sync rubles ↔ cents.
///     • «Перенос остатка» — Picker (segmented) с 2 опциями: «В прочее»
///       (.misc) / «В накопления» (.savings).
///     • «Статус» — Toggle paused.
///   Toolbar Save в .confirmationAction — disabled пока !isDirty || submitting.
///   Inline banner Section с saveError filtered Russian copy на failure.
///   Cancel toolbar item → .alert «Отменить изменения?» когда isDirty.
///
/// `onSaved` closure инжектируется родителем PlanEditorView (61-02) и
/// вызывается PlanRowEditorViewModel.save() после successful PATCH.
///
/// Threat-model:
///   - T-61-01: Stepper UI bounds rubles 0...100_000 (cents 0...10_000_000) +
///     TextField parse clamp `Swift.max(0, Swift.min(10_000_000, cents))`.
///   - T-61-02: Save disabled когда submitting (inFlight guard).
///   - T-61-03: banner copy фиксированный, отображает viewModel.saveError —
///     NO raw localized description leak.
struct PlanRowEditorView: View {
    let categoryId: Int
    let onSaved: (CategoryV10DTO) -> Void

    @State private var viewModel: PlanRowEditorViewModel
    @State private var rublesText: String = ""
    @State private var showCancelAlert: Bool = false
    @Environment(\.dismiss) private var dismiss

    init(categoryId: Int, onSaved: @escaping (CategoryV10DTO) -> Void) {
        self.categoryId = categoryId
        self.onSaved = onSaved
        self._viewModel = State(
            wrappedValue: PlanRowEditorViewModel(categoryId: categoryId)
        )
    }

    var body: some View {
        Form {
            switch viewModel.status {
            case .idle, .loading:
                Section {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                }
            case .error(let msg):
                Section {
                    Label(msg, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            case .ready:
                if let cat = viewModel.category {
                    if let err = viewModel.saveError {
                        saveErrorBanner(err)
                    }
                    limitSection(cat)
                    rolloverSection
                    statusSection
                } else {
                    Section {
                        Label(
                            "Категория не найдена",
                            systemImage: "exclamationmark.triangle"
                        )
                        .foregroundStyle(.red)
                    }
                }
            }
        }
        .navigationTitle(viewModel.category?.name ?? "Категория")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbarContent }
        .alert("Отменить изменения?", isPresented: $showCancelAlert) {
            Button("Отменить", role: .destructive) { dismiss() }
            Button("Продолжить", role: .cancel) {}
        } message: {
            Text("Несохранённые изменения будут потеряны.")
        }
        .onAppear {
            // 61-01 D-3: inject onSaved closure (var на VM) до начала save flow.
            viewModel.onSaved = onSaved
        }
        .task { await viewModel.load() }
        .onChange(of: viewModel.category?.planCents) { _, _ in
            // Seed rublesText один раз после загрузки category.
            rublesText = "\(viewModel.planCents / 100)"
        }
        .onChange(of: viewModel.planCents) { _, newCents in
            // Keep TextField rubles in sync с Stepper changes.
            let rub = newCents / 100
            if rublesText != "\(rub)" {
                rublesText = "\(rub)"
            }
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button("Отмена") {
                if viewModel.isDirty {
                    showCancelAlert = true
                } else {
                    dismiss()
                }
            }
        }
        ToolbarItem(placement: .confirmationAction) {
            Button {
                Task {
                    let ok = await viewModel.save()
                    if ok { dismiss() }
                }
            } label: {
                if viewModel.submitting {
                    ProgressView().controlSize(.small)
                } else {
                    Text("Сохранить")
                }
            }
            .disabled(!viewModel.isDirty || viewModel.submitting)
        }
    }

    // MARK: - Save error banner (T-61-03 filtered copy)

    private func saveErrorBanner(_ msg: String) -> some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                Text(msg)
                    .font(.callout)
                    .foregroundStyle(.primary)
                Spacer(minLength: 8)
                Button {
                    viewModel.saveError = nil
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Скрыть ошибку")
            }
        }
    }

    // MARK: - Limit section

    private func limitSection(_ cat: CategoryV10DTO) -> some View {
        Section {
            // Stepper bound to rubles (Int).
            let rubBinding = Binding<Int>(
                get: { Swift.max(0, viewModel.planCents / 100) },
                set: { newRub in
                    // T-61-01: UI bound clamp cents 0...10_000_000.
                    let cents = newRub * 100
                    viewModel.planCents = Swift.max(0, Swift.min(10_000_000, cents))
                }
            )
            Stepper(value: rubBinding, in: 0...100_000, step: 500) {
                LabeledContent("Лимит") {
                    Text(MoneyFormatter.formatWithSymbol(cents: viewModel.planCents))
                        .monospacedDigit()
                }
            }
            // Precise input via .decimalPad → MoneyParser.
            HStack {
                TextField("Точная сумма (₽)", text: $rublesText)
                    .keyboardType(.decimalPad)
                    .onChange(of: rublesText) { _, newValue in
                        if let cents = MoneyParser.parseToCents(newValue) {
                            // T-61-01: parse-path clamp.
                            viewModel.planCents = Swift.max(0, Swift.min(10_000_000, cents))
                        }
                    }
                Text("₽").foregroundStyle(.secondary)
            }
        } header: {
            Text("Лимит")
        } footer: {
            Text(
                "Текущий сохранённый: "
                + MoneyFormatter.formatWithSymbol(cents: cat.planCents)
            )
        }
    }

    // MARK: - Rollover section

    private var rolloverSection: some View {
        Section {
            Picker("Куда переносить", selection: $viewModel.rollover) {
                Text("В прочее").tag(CategoryRollover.misc)
                Text("В накопления").tag(CategoryRollover.savings)
            }
            .pickerStyle(.segmented)
        } header: {
            Text("Перенос остатка")
        } footer: {
            Text(
                "Остаток (план − факт) переходит в выбранный буфер при закрытии периода."
            )
        }
    }

    // MARK: - Status section

    private var statusSection: some View {
        Section {
            Toggle("Приостановлено", isOn: $viewModel.paused)
        } footer: {
            Text("Приостановленные категории не учитываются в распределении бюджета.")
        }
    }
}
