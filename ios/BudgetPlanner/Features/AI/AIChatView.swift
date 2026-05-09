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

/// AI assistant — pixel-perfect port web `frontend/src/screens/AiScreen.tsx`.
///
/// Layout (mesh-dark):
///   - Header: "AI помощник" 24pt + status pill (online dot + caption)
///   - Empty state: pulsing orb hero + heading + hint + 4 suggestion chips
///   - Messages list: light/dark bubbles
///   - Floating glass-dark input bar над BottomBar с send button
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
        ZStack(alignment: .bottom) {
            MeshDarkBackground()

            VStack(spacing: 0) {
                header
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 12)

                if isEmpty {
                    emptyState
                } else {
                    messagesList
                }
            }

            composer
                .padding(.horizontal, 16)
                .padding(.bottom, 4)
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

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text("AI помощник")
                    .font(.system(size: 24, weight: .bold))
                    .tracking(-0.48)
                    .foregroundStyle(.white)
                HStack(spacing: 5) {
                    Circle()
                        .fill(Color(hex: 0x7CE8A2))
                        .frame(width: 6, height: 6)
                        .shadow(color: Color(hex: 0x7CE8A2).opacity(0.8), radius: 4)
                    Text("онлайн · знает план и историю")
                        .font(.system(size: 11))
                        .foregroundStyle(Color(hex: 0x7CE8A2))
                }
            }
            Spacer()
            if !viewModel.bubbles.isEmpty {
                Button {
                    Task { await viewModel.clearHistory() }
                } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(Tokens.Ink.secondaryDark)
                        .frame(width: 32, height: 32)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(Color.white.opacity(0.08))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .strokeBorder(Color.white.opacity(0.12), lineWidth: 0.5)
                        )
                }
                .buttonStyle(.plain)
                .disabled(viewModel.isStreaming)
            }
        }
        .padding(.horizontal, 4)
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: 0) {
            Spacer()
            orbHero
                .padding(.bottom, 20)
            Text("Спроси что угодно")
                .font(.system(size: 18, weight: .bold))
                .tracking(-0.18)
                .foregroundStyle(.white)
            Text("Я отвечу из твоих данных или предложу записать новую трату")
                .font(.system(size: 13))
                .foregroundStyle(Tokens.Ink.secondaryDark)
                .multilineTextAlignment(.center)
                .padding(.top, 6)
                .frame(maxWidth: 280)
                .padding(.bottom, 22)
            VStack(spacing: 8) {
                ForEach(Self.suggestionChips, id: \.self) { chip in
                    chipButton(chip)
                }
            }
            .padding(.horizontal, 12)
            Spacer()
        }
        .padding(.horizontal, 16)
    }

    private var orbHero: some View {
        ZStack {
            Circle()
                .fill(
                    AngularGradient(
                        gradient: Gradient(colors: [
                            Tokens.Accent.primary,
                            Color(hex: 0xC8B2FF),
                            Tokens.Accent.primary
                        ]),
                        center: .center
                    )
                )
                .blur(radius: 18)
                .opacity(0.55)
                .padding(-18)

            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Tokens.Accent.primary.opacity(0.8),
                            Tokens.Accent.primary.opacity(0.33),
                            Color(red: 40/255, green: 30/255, blue: 50/255).opacity(0.55),
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: 60
                    )
                )
            Circle()
                .strokeBorder(Color.white.opacity(0.35), lineWidth: 0.5)
            Image(systemName: "sparkles")
                .font(.system(size: 38, weight: .bold))
                .foregroundStyle(.white)
        }
        .frame(width: 96, height: 96)
        .shadow(color: Tokens.Accent.primary.opacity(0.33), radius: 12, x: 0, y: 8)
    }

    private func chipButton(_ text: String) -> some View {
        Button {
            Task { await viewModel.send(prompt: text) }
        } label: {
            HStack {
                Text(text)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Tokens.Ink.secondaryDark)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                ZStack {
                    LiquidGlass(style: .systemUltraThinMaterialDark)
                    Color.white.opacity(0.05)
                }
                .clipShape(RoundedRectangle(cornerRadius: 16))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(Color.white.opacity(0.12), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .disabled(viewModel.isStreaming)
    }

    // MARK: - Messages

    private var messagesList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 10) {
                    ForEach(viewModel.bubbles) { bubble in
                        ChatMessageView(bubble: bubble)
                            .id(bubble.id)
                    }
                    if let err = viewModel.errorMessage, !viewModel.isStreaming {
                        errorBubble(err)
                    }
                    Color.clear.frame(height: 90).id("bottom-spacer")
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
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

    private func errorBubble(_ message: String) -> some View {
        Text("Ошибка: \(message)")
            .font(.system(size: 13))
            .foregroundStyle(Color(hex: 0xFFB1B1))
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                ZStack {
                    LiquidGlass(style: .systemUltraThinMaterialDark)
                    LinearGradient(
                        colors: [
                            Color(red: 216/255, green: 64/255, blue: 75/255).opacity(0.30),
                            Color(red: 216/255, green: 64/255, blue: 75/255).opacity(0.18),
                        ],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                }
                .clipShape(RoundedRectangle(cornerRadius: 20))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .strokeBorder(Color.white.opacity(0.18), lineWidth: 0.5)
            )
    }

    // MARK: - Composer

    private var composer: some View {
        HStack(spacing: 10) {
            TextField(
                "",
                text: $viewModel.input,
                prompt: Text("Спроси о бюджете…").foregroundColor(Tokens.Ink.secondaryDark),
                axis: .vertical
            )
            .lineLimit(1...4)
            .font(.system(size: 14))
            .foregroundStyle(.white)
            .tint(Tokens.Accent.primary)
            .padding(.leading, 18)
            .disabled(viewModel.isStreaming)

            Button {
                Task { await viewModel.send() }
            } label: {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(sendButtonBackground)
            }
            .buttonStyle(.plain)
            .disabled(canSend == false)
            .padding(.trailing, 6)
        }
        .padding(.vertical, 6)
        .frame(minHeight: 52)
        .background(
            ZStack {
                Color(red: 26/255, green: 15/255, blue: 46/255).opacity(0.65)
                LiquidGlass(style: .systemUltraThinMaterialDark)
                Color.white.opacity(0.06)
            }
            .clipShape(RoundedRectangle(cornerRadius: 26))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 26)
                .strokeBorder(Color.white.opacity(0.16), lineWidth: 0.5)
        )
    }

    private var canSend: Bool {
        !viewModel.isStreaming &&
        !viewModel.input.trimmingCharacters(in: .whitespaces).isEmpty
    }

    @ViewBuilder
    private var sendButtonBackground: some View {
        if canSend {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Tokens.Accent.primary,
                            Tokens.Accent.primary.opacity(0.8),
                            Tokens.Accent.primary.opacity(0.53),
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: 22
                    )
                )
                .shadow(color: Tokens.Accent.primary.opacity(0.4), radius: 6, x: 0, y: 3)
        } else {
            Circle().fill(Color.white.opacity(0.12))
        }
    }
}

// MARK: - Chat bubble view (tuned for dark mesh)

private struct ChatMessageView: View {
    let bubble: ChatBubble

    var body: some View {
        HStack(alignment: .bottom) {
            if bubble.role == "user" { Spacer(minLength: 40) }

            Text(bubble.content + (bubble.isStreaming ? "▌" : ""))
                .font(.system(size: 14))
                .foregroundStyle(bubble.role == "user" ? .white : Color(hex: 0xF0E5D8))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(bubbleBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .strokeBorder(bubbleBorderColor, lineWidth: 0.5)
                )
                .frame(maxWidth: 320, alignment: bubble.role == "user" ? .trailing : .leading)

            if bubble.role != "user" { Spacer(minLength: 40) }
        }
    }

    @ViewBuilder
    private var bubbleBackground: some View {
        if bubble.role == "user" {
            RoundedRectangle(cornerRadius: 18)
                .fill(
                    LinearGradient(
                        colors: [
                            Tokens.Accent.primary,
                            Tokens.Accent.primary.opacity(0.85),
                        ],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
        } else {
            ZStack {
                LiquidGlass(style: .systemUltraThinMaterialDark)
                Color.white.opacity(0.06)
            }
            .clipShape(RoundedRectangle(cornerRadius: 18))
        }
    }

    private var bubbleBorderColor: Color {
        bubble.role == "user"
            ? Color.white.opacity(0.25)
            : Color.white.opacity(0.14)
    }
}
