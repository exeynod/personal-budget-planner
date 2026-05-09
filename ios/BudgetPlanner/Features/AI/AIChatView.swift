import SwiftUI

struct ChatBubble: Identifiable, Equatable {
    let id = UUID()
    var role: String
    var content: String
    var toolName: String?
    var isStreaming: Bool = false
}

struct ProposalDraft: Identifiable, Equatable {
    let id = UUID()
    let kind: SSEEvent.ProposeKind
    var amountCents: Int
    var categoryId: Int?
    var description: String?
    var txDate: Date?
}

@MainActor
@Observable
final class AIChatViewModel {
    var bubbles: [ChatBubble] = []
    var input: String = ""
    var isStreaming: Bool = false
    var pendingProposal: ProposalDraft?
    var errorMessage: String?
    var categories: [CategoryDTO] = []

    func loadInitial() async {
        do {
            categories = try await CategoriesAPI.list()
            let history = try await AIHistoryAPI.history()
            bubbles = history.messages.map {
                ChatBubble(role: $0.role, content: $0.content ?? "", toolName: $0.toolName)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func send(prompt promptOverride: String? = nil) async {
        let prompt = (promptOverride ?? input).trimmingCharacters(in: .whitespaces)
        guard !prompt.isEmpty, !isStreaming else { return }
        if promptOverride == nil { input = "" }
        bubbles.append(ChatBubble(role: "user", content: prompt))
        let assistantBubble = ChatBubble(role: "assistant", content: "", isStreaming: true)
        bubbles.append(assistantBubble)
        isStreaming = true

        do {
            for try await event in AIChatAPI.stream(message: prompt) {
                switch event {
                case .messageDelta(let text):
                    if let idx = bubbles.lastIndex(where: { $0.role == "assistant" && $0.isStreaming }) {
                        bubbles[idx].content += text
                    }
                case .messageComplete(let content, _):
                    if let idx = bubbles.lastIndex(where: { $0.role == "assistant" && $0.isStreaming }) {
                        bubbles[idx].content = content
                        bubbles[idx].isStreaming = false
                    }
                case .toolCall(let name, _):
                    bubbles.append(ChatBubble(role: "tool", content: "Использую: \(name)", toolName: name, isStreaming: true))
                case .toolResult(let name, _):
                    if let idx = bubbles.lastIndex(where: { $0.toolName == name && $0.isStreaming }) {
                        bubbles[idx].isStreaming = false
                        bubbles[idx].content = "✓ \(name)"
                    }
                case .propose(let kind, let amountRub, let categoryId, let description, let txDate):
                    let cents = Int(amountRub * 100)
                    let date = txDate.flatMap { DateFormatters.isoDate.date(from: $0) }
                    pendingProposal = ProposalDraft(
                        kind: kind,
                        amountCents: cents,
                        categoryId: categoryId,
                        description: description,
                        txDate: date
                    )
                case .error(let message):
                    errorMessage = message
                case .done, .unknown, .usage:
                    break
                }
            }
        } catch APIError.unauthorized {
            errorMessage = "Сессия истекла"
        } catch APIError.rateLimited(let retry) {
            errorMessage = "Лимит запросов. Повторите через \(retry ?? 60) сек."
        } catch {
            errorMessage = error.localizedDescription
        }

        if let idx = bubbles.lastIndex(where: { $0.role == "assistant" && $0.isStreaming }) {
            bubbles[idx].isStreaming = false
        }
        isStreaming = false
    }

    func clearHistory() async {
        do {
            try await AIHistoryAPI.clear()
            bubbles.removeAll()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func confirmProposal() async {
        guard let p = pendingProposal, let catId = p.categoryId else { return }
        do {
            switch p.kind {
            case .actual:
                _ = try await ActualAPI.create(ActualCreateRequest(
                    kind: "expense",
                    amountCents: p.amountCents,
                    categoryId: catId,
                    txDate: DateFormatters.isoDate.string(from: p.txDate ?? Date()),
                    description: p.description
                ))
            case .planned:
                let period = try await PeriodsAPI.current()
                _ = try await PlannedAPI.create(periodId: period.id, PlannedCreateRequest(
                    kind: "expense",
                    amountCents: p.amountCents,
                    categoryId: catId,
                    plannedDate: nil,
                    description: p.description
                ))
            }
            pendingProposal = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// AI assistant — native iOS 26 layout.
///   - NavigationStack + .navigationTitle("AI помощник")
///   - ContentUnavailableView для empty state с suggestion chips
///   - Chat bubbles в ScrollView (chat — особый case, не List semantic)
///   - Native composer в .safeAreaInset(.bottom) с TextField + glass send button
struct AIChatView: View {
    @State private var viewModel = AIChatViewModel()

    private static let suggestionChips = [
        "Каков мой баланс?",
        "Где я перерасходовал?",
        "Сколько потратил на еду?",
        "Сделай прогноз",
    ]

    private var isEmpty: Bool { viewModel.bubbles.isEmpty && !viewModel.isStreaming }

    var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemGroupedBackground).ignoresSafeArea()

                if isEmpty {
                    emptyState
                } else {
                    messagesList
                }
            }
            .navigationTitle("AI помощник")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if !viewModel.bubbles.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            Task { await viewModel.clearHistory() }
                        } label: {
                            Image(systemName: "trash")
                        }
                        .disabled(viewModel.isStreaming)
                    }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                composer
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
            }
        }
        .task { await viewModel.loadInitial() }
        .sheet(item: Binding(
            get: { viewModel.pendingProposal },
            set: { viewModel.pendingProposal = $0 }
        )) { proposal in
            AIProposalSheet(
                proposal: proposal,
                categories: viewModel.categories,
                onConfirm: { Task { await viewModel.confirmProposal() } },
                onCancel: { viewModel.pendingProposal = nil }
            )
        }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: 24) {
            ContentUnavailableView {
                Label {
                    Text("Спроси что угодно")
                } icon: {
                    Image(systemName: "sparkles")
                        .foregroundStyle(Tokens.Accent.primary)
                }
            } description: {
                Text("Я отвечу из твоих данных или предложу записать новую трату.")
            }

            VStack(spacing: 8) {
                ForEach(Self.suggestionChips, id: \.self) { chip in
                    Button {
                        Task { await viewModel.send(prompt: chip) }
                    } label: {
                        HStack {
                            Text(chip)
                                .font(.body)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(viewModel.isStreaming)
                }
            }
            .padding(.horizontal, 24)
        }
    }

    // MARK: - Messages list

    private var messagesList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    ForEach(viewModel.bubbles) { bubble in
                        ChatMessageView(bubble: bubble).id(bubble.id)
                    }
                    if let err = viewModel.errorMessage, !viewModel.isStreaming {
                        Label(err, systemImage: "exclamationmark.triangle")
                            .font(.callout)
                            .foregroundStyle(.red)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(.red.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    Color.clear.frame(height: 16).id("bottom-spacer")
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 16)
            }
            .scrollIndicators(.hidden)
            .onChange(of: viewModel.bubbles.count) { _, _ in
                if let last = viewModel.bubbles.last {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
    }

    // MARK: - Composer

    private var composer: some View {
        HStack(spacing: 8) {
            TextField("Спроси о бюджете…", text: $viewModel.input, axis: .vertical)
                .lineLimit(1...4)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .disabled(viewModel.isStreaming)

            Button {
                Task { await viewModel.send() }
            } label: {
                Image(systemName: "arrow.up")
                    .font(.body.weight(.bold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(canSend ? Tokens.Accent.primary : Color.secondary.opacity(0.4), in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
            .padding(.trailing, 6)
            .padding(.vertical, 4)
        }
        .background(.regularMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Color.primary.opacity(0.1), lineWidth: 0.5))
    }

    private var canSend: Bool {
        !viewModel.isStreaming &&
        !viewModel.input.trimmingCharacters(in: .whitespaces).isEmpty
    }
}

// MARK: - Chat bubble

private struct ChatMessageView: View {
    let bubble: ChatBubble

    private var isUser: Bool { bubble.role == "user" }

    var body: some View {
        HStack(alignment: .bottom) {
            if isUser { Spacer(minLength: 40) }

            Text(bubble.content + (bubble.isStreaming ? "▌" : ""))
                .font(.body)
                .foregroundStyle(isUser ? .white : .primary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    isUser
                    ? AnyShapeStyle(Tokens.Accent.primary)
                    : AnyShapeStyle(Material.regular),
                    in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                )
                .frame(maxWidth: 320, alignment: isUser ? .trailing : .leading)

            if !isUser { Spacer(minLength: 40) }
        }
    }
}
