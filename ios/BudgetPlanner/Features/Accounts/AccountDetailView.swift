import SwiftUI

/// Phase 60 (v06 Native Rebuild) — Plan 60-04: native AccountDetailView.
///
/// List(.insetGrouped) с 4 рендер-состояниями (loading / error / fallback /
/// ready). В ready: Hero Section (bank title + kind label + mask •XXXX +
/// balance monospacedDigit + primary indicator) → day-grouped history
/// sections (Europe/Moscow Calendar; header дата + Σ sum trailing; row:
/// описание + категория + signed coloured amount + time HH:mm).
///
/// Empty history → unavailable-view placeholder, Hero остаётся видим.
/// Toolbar: только default Back (CONTEXT D-3 — нет API для make-primary /
/// edit / delete, Menu не добавляем).
struct AccountDetailView: View {
    let accountId: Int

    @State private var viewModel: AccountDetailViewModel

    init(accountId: Int) {
        self.accountId = accountId
        self._viewModel = State(wrappedValue: AccountDetailViewModel(accountId: accountId))
    }

    var body: some View {
        List {
            switch viewModel.status {
            case .idle, .loading:
                Section {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                }
            case .error(let msg):
                Section {
                    Label(msg, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            case .ready:
                if let acc = viewModel.account {
                    heroSection(acc)
                    historySections
                } else {
                    // Defensive fallback (cross-tenant guard set status=.error
                    // и сюда не попадаем; но если что-то пошло иначе — single
                    // message без leak).
                    Section {
                        Label("Счёт не найден", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Счёт")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    // MARK: - Hero section (без header)

    @ViewBuilder
    private func heroSection(_ acc: AccountDTO) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Text(acc.bank)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.primary)
                HStack(spacing: 6) {
                    Text(kindLabel(acc.kind))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    if let mask = acc.mask, !mask.isEmpty {
                        Text("•\(mask)")
                            .font(.subheadline.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text(MoneyFormatter.format(cents: acc.balanceCents))
                        .font(.title2.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("₽")
                        .foregroundStyle(.secondary)
                    Spacer()
                    if acc.primary {
                        Image(systemName: "star.fill")
                            .foregroundStyle(.orange)
                            .accessibilityLabel("Основной счёт")
                    }
                }
            }
            .padding(.vertical, 4)
        }
    }

    private func kindLabel(_ kind: AccountKind) -> String {
        switch kind {
        case .card: return "Карта"
        case .cash: return "Наличные"
        case .savings: return "Сбережения"
        }
    }

    // MARK: - History sections

    @ViewBuilder
    private var historySections: some View {
        let groups = viewModel.dayGroups
        if groups.isEmpty {
            Section {
                ContentUnavailableView(
                    "Нет операций",
                    systemImage: "tray",
                    description: Text("В текущем периоде на этом счёте нет операций")
                )
                .listRowBackground(Color.clear)
            }
        } else {
            ForEach(groups) { group in
                Section {
                    ForEach(group.rows) { actual in
                        ActualHistoryRow(
                            actual: actual,
                            categoryName: viewModel.categoryName(actual.categoryId),
                            calendar: viewModel.calendar
                        )
                    }
                } header: {
                    HStack {
                        Text(group.dateLabel)
                        Spacer()
                        Text(MoneyFormatter.format(cents: group.sumCents))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}

// MARK: - Row

private struct ActualHistoryRow: View {
    let actual: ActualV10DTO
    let categoryName: String?
    let calendar: Calendar

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(displayDescription)
                    .font(.body)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                Text(categoryName ?? "—")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(signedAmount)
                    .font(.body.monospacedDigit().weight(.semibold))
                    .foregroundStyle(amountColor)
                Text(timeLabel)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var displayDescription: String {
        let raw = actual.description?.trimmingCharacters(in: .whitespaces) ?? ""
        return raw.isEmpty ? "Без описания" : raw
    }

    /// Расходы / roundup → minus sign (U+2212); income / deposit → plus.
    /// Server already stores `abs(amount_cents)` for expense rows; знак
    /// в UI отображается по `kind` (mirrors Phase 59 convention).
    private var signedAmount: String {
        let value = MoneyFormatter.format(cents: actual.amountCents)
        switch actual.kind {
        case .expense, .roundup:
            return "\u{2212}\(value) ₽"
        case .income, .deposit:
            return "+\(value) ₽"
        }
    }

    private var amountColor: Color {
        switch actual.kind {
        case .expense: return .primary
        case .income: return .green
        case .roundup: return .orange
        case .deposit: return .blue
        }
    }

    private var timeLabel: String {
        V10Formatters.formatTimeHM(actual.createdAt ?? actual.txDate.date, calendar: calendar)
    }
}
