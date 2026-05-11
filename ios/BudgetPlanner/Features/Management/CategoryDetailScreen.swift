import SwiftUI

// Phase 65 (v06 Native Rebuild): native drill-down с категории → детальный
// экран с историей по этой категории за текущий период. Заменяет inline
// rename-sheet из CategoriesView. Rename переехал в toolbar.
//
// Список транзакций — `ActualAPI.list(periodId:categoryId:)` (legacy API,
// 2-valued kind — норм, потому что в Phase 22 backend оставил CategoryKind
// 2-valued, 4-valued стал отдельный ActualKind).
//
// Edit/archive/rename — переиспользуют те же VM-методы что и CategoriesView
// через переданный biding `viewModel`. Это не требует отдельного VM здесь.

@MainActor
@Observable
final class NativeCategoryDetailViewModel {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded(period: PeriodDTO, transactions: [ActualDTO])
        case noActivePeriod
        case error(String)
    }

    private(set) var state: LoadState = .idle

    func load(categoryId: Int) async {
        state = .loading
        do {
            let period = try await PeriodsAPI.current()
            let txns = try await ActualAPI.list(periodId: period.id, categoryId: categoryId)
            let sorted = txns.sorted { $0.txDate > $1.txDate }
            state = .loaded(period: period, transactions: sorted)
        } catch APIError.notFound {
            state = .noActivePeriod
        } catch {
            state = .error(error.localizedDescription)
        }
    }
}

struct CategoryDetailScreen: View {
    let category: CategoryDTO
    @Bindable var parentViewModel: CategoriesViewModel

    @State private var viewModel = NativeCategoryDetailViewModel()
    @State private var showingRename = false
    @State private var showingArchiveConfirm = false

    private var visual: Tokens.Categories.Visual {
        Tokens.Categories.visual(for: category.name)
    }

    var body: some View {
        List {
            heroSection

            switch viewModel.state {
            case .idle, .loading:
                Section { ProgressView().frame(maxWidth: .infinity) }
            case .loaded(_, let txns):
                if txns.isEmpty {
                    Section {
                        Text("Транзакций пока нет")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Section("История") {
                        ForEach(txns) { txn in
                            TransactionDetailRow(transaction: txn)
                        }
                    }
                }
            case .noActivePeriod:
                Section {
                    Text("Нет активного периода")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            case .error(let msg):
                Section {
                    Label(msg, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(category.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        showingRename = true
                    } label: {
                        Label("Переименовать", systemImage: "pencil")
                    }
                    if category.isArchived {
                        Button {
                            Task {
                                await parentViewModel.unarchive(id: category.id)
                            }
                        } label: {
                            Label("Восстановить", systemImage: "tray.and.arrow.up")
                        }
                    } else {
                        Button(role: .destructive) {
                            showingArchiveConfirm = true
                        } label: {
                            Label("Архивировать", systemImage: "archivebox")
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .task { await viewModel.load(categoryId: category.id) }
        .refreshable { await viewModel.load(categoryId: category.id) }
        .sheet(isPresented: $showingRename) {
            RenameCategoryInlineSheet(initialName: category.name) { newName in
                await parentViewModel.rename(id: category.id, newName: newName)
            }
        }
        .confirmationDialog(
            "Архивировать «\(category.name)»?",
            isPresented: $showingArchiveConfirm,
            titleVisibility: .visible
        ) {
            Button("Архивировать", role: .destructive) {
                Task { await parentViewModel.archive(id: category.id) }
            }
            Button("Отмена", role: .cancel) {}
        } message: {
            Text("Категория будет скрыта. Транзакции сохранятся.")
        }
    }

    private var heroSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    Image(systemName: visual.icon)
                        .font(.title2)
                        .foregroundStyle(visual.color)
                        .frame(width: 44, height: 44)
                        .background(visual.color.opacity(0.15), in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(category.kind == .expense ? "Расход" : "Доход")
                            .font(.caption)
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                        if category.isArchived {
                            Label("В архиве", systemImage: "archivebox.fill")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.orange)
                        }
                    }
                    Spacer()
                }

                if case .loaded(_, let txns) = viewModel.state, !txns.isEmpty {
                    let total = txns.reduce(0) { $0 + $1.amountCents }
                    HStack(alignment: .lastTextBaseline, spacing: 4) {
                        Text("За период:")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Text(MoneyFormatter.format(cents: total))
                            .font(.title3.monospacedDigit().weight(.semibold))
                            .foregroundStyle(.primary)
                        Text("₽").foregroundStyle(.secondary)
                        Spacer()
                        Text("\(txns.count) опер.")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                }
            }
            .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
        }
    }
}

// MARK: - Transaction row

private struct TransactionDetailRow: View {
    let transaction: ActualDTO

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(transaction.description?.isEmpty == false ? transaction.description! : "Без описания")
                    .font(.body)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(transaction.txDate, format: .dateTime.day().month().year(.twoDigits))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            Text(MoneyFormatter.format(cents: transaction.amountCents))
                .font(.body.monospacedDigit().weight(.semibold))
                .foregroundStyle(.primary)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Rename sheet (private to CategoryDetail)

private struct RenameCategoryInlineSheet: View {
    let initialName: String
    let onRename: (String) async -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var name: String = ""
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Название", text: $name)
                        .autocorrectionDisabled()
                }
            }
            .navigationTitle("Переименовать")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") {
                        Task {
                            isSubmitting = true
                            await onRename(name)
                            isSubmitting = false
                            dismiss()
                        }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSubmitting)
                }
            }
            .onAppear { if name.isEmpty { name = initialName } }
        }
        .presentationDetents([.medium])
    }
}
