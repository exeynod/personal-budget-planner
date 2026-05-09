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

    func send() async {
        let prompt = input.trimmingCharacters(in: .whitespaces)
        guard !prompt.isEmpty, !isStreaming else { return }
        input = ""
        bubbles.append(ChatBubble(role: "user", content: prompt))
        var assistantBubble = ChatBubble(role: "assistant", content: "", isStreaming: true)
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
                _ = assistantBubble
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

struct AIChatView: View {
    @State private var viewModel = AIChatViewModel()

    var body: some View {
        ZStack {
            MeshDarkBackground()

            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: Tokens.Spacing.md) {
                            ForEach(viewModel.bubbles) { bubble in
                                ChatMessageView(bubble: bubble).id(bubble.id)
                            }
                        }
                        .padding(.horizontal, Tokens.Spacing.lg)
                        .padding(.top, Tokens.Spacing.lg)
                        .padding(.bottom, Tokens.Spacing.xl)
                    }
                    .onChange(of: viewModel.bubbles.count) { _, _ in
                        if let last = viewModel.bubbles.last {
                            withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                        }
                    }
                }

                if let err = viewModel.errorMessage {
                    Text(err).font(.appLabel).foregroundStyle(.red)
                        .padding(.horizontal, Tokens.Spacing.lg)
                }

                composer
            }
        }
        .navigationTitle("AI помощник")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.loadInitial() }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button(role: .destructive) {
                        Task { await viewModel.clearHistory() }
                    } label: {
                        Label("Очистить историю", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(item: Binding(
            get: { viewModel.pendingProposal },
            set: { viewModel.pendingProposal = $0 }
        )) { proposal in
            AIProposalSheet(
                proposal: proposal,
                categories: viewModel.categories,
                onConfirm: {
                    Task { await viewModel.confirmProposal() }
                },
                onCancel: {
                    viewModel.pendingProposal = nil
                }
            )
        }
    }

    @ViewBuilder
    private var composer: some View {
        HStack(spacing: Tokens.Spacing.sm) {
            TextField("Спросите AI…", text: $viewModel.input, axis: .vertical)
                .lineLimit(1...5)
                .padding(.horizontal, Tokens.Spacing.md)
                .padding(.vertical, Tokens.Spacing.sm)
                .background(.ultraThinMaterial, in: Capsule())

            Button {
                Task { await viewModel.send() }
            } label: {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Tokens.Accent.primary, in: Circle())
            }
            .disabled(viewModel.input.trimmingCharacters(in: .whitespaces).isEmpty || viewModel.isStreaming)
        }
        .padding(.horizontal, Tokens.Spacing.lg)
        .padding(.vertical, Tokens.Spacing.md)
        .background(.ultraThinMaterial)
    }
}

private struct ChatMessageView: View {
    let bubble: ChatBubble

    var body: some View {
        HStack {
            if bubble.role == "user" { Spacer() }

            Text(bubble.content + (bubble.isStreaming ? "▌" : ""))
                .font(.appBody)
                .foregroundStyle(bubble.role == "user" ? .white : .primary)
                .padding(Tokens.Spacing.md)
                .background(
                    bubble.role == "user"
                    ? AnyShapeStyle(Tokens.Accent.primary)
                    : AnyShapeStyle(Color.white.opacity(0.92)),
                    in: RoundedRectangle(cornerRadius: Tokens.Radius.md)
                )
                .frame(maxWidth: 320, alignment: bubble.role == "user" ? .trailing : .leading)

            if bubble.role != "user" { Spacer() }
        }
    }
}
