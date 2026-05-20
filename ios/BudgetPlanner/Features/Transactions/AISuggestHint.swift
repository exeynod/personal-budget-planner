// Phase 64-02 (AI-V10-03) — debounce helper for the inline AI category hint.
//
// TransactionEditor is a struct View, so the debounce/cancel state lives in this
// small @Observable helper for testability. The network call is behind an
// injectable closure seam (`suggest`) so tests can stub it without HTTP.
//
// Behaviour:
//  - descriptionChanged cancels the previous in-flight Task (cancellable Task).
//  - q < minChars → suggestion = nil, closure NOT called.
//  - after debounce, calls suggest(q); Task.isCancelled is checked AFTER the
//    await so a slow stale response can NOT overwrite a newer query (T-64-02-03).
//  - suggest returning nil (403/error/category_id=nil) → suggestion = nil (silent).
//  - the helper NEVER mutates categoryId — applying the suggestion is an explicit
//    user tap handled by the editor (do-not-auto-apply, CONTEXT decision).

import Foundation

@MainActor
@Observable
final class AISuggestHint {
    /// Current suggestion. Read-only from the outside; the editor renders a chip
    /// only when `suggestion?.categoryId != nil`.
    private(set) var suggestion: SuggestCategoryDTO?

    private let suggest: (String) async -> SuggestCategoryDTO?
    private let minChars: Int
    private let debounce: Duration
    private var task: Task<Void, Never>?

    init(
        minChars: Int = 3,
        debounce: Duration = .milliseconds(500),
        suggest: @escaping (String) async -> SuggestCategoryDTO? = {
            await AISuggestCategoryAPI.suggest(q: $0)
        }
    ) {
        self.minChars = minChars
        self.debounce = debounce
        self.suggest = suggest
    }

    /// Called from the editor's description `.onChange`. Debounces and replaces
    /// any in-flight request.
    func descriptionChanged(_ text: String) {
        task?.cancel()  // cancel the previous in-flight request
        let q = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= minChars else {
            suggestion = nil
            return
        }
        task = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(for: self.debounce)
            if Task.isCancelled { return }
            let result = await self.suggest(q)
            // Check AFTER the await: a newer descriptionChanged cancels this Task,
            // so a slow stale response does not overwrite the newer suggestion.
            if Task.isCancelled { return }
            self.suggestion = result  // nil = silent hide
        }
    }

    /// Resets the suggestion (called after the user taps the chip, or to clear).
    func clear() {
        task?.cancel()
        suggestion = nil
    }
}
