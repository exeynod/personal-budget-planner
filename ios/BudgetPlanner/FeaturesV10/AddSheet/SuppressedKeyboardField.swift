// Phase 25-11 Task 2: UITextField wrapper with the system keyboard
// suppressed (T-25-11-01 mitigation; ADD-V10-02 acceptance:
// «iOS системная клавиатура подавлена (TextField inputView=empty UIView)»).
//
// Strategy: wrap a stock UITextField in a UIViewRepresentable and replace
// `inputView` with an empty UIView. When the field becomes first
// responder the system keyboard query returns the empty view → nothing
// is shown. Caret is hidden via `tintColor = .clear` so the responder
// state stays invisible.
//
// In the AddSheetView main flow we do NOT actually use this wrapper —
// the BigFig amount display + KeypadView combination already suppresses
// any system keyboard surface (no TextField is involved). This struct is
// retained as a primitive so future iPad / hardware-keyboard / Pencil
// flows can attach to a real responder chain without breaking ADD-V10-02.

import SwiftUI
import UIKit

/// UITextField wrapper that suppresses the system keyboard.
struct SuppressedKeyboardField: UIViewRepresentable {
    @Binding var isFirstResponder: Bool

    func makeUIView(context: Context) -> UITextField {
        let field = UITextField()
        field.inputView = UIView()                 // ← suppresses system keyboard
        field.text = ""
        field.tintColor = .clear                   // hide caret
        field.delegate = context.coordinator
        return field
    }

    func updateUIView(_ uiView: UITextField, context: Context) {
        if isFirstResponder && !uiView.isFirstResponder {
            uiView.becomeFirstResponder()
        } else if !isFirstResponder && uiView.isFirstResponder {
            uiView.resignFirstResponder()
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: SuppressedKeyboardField
        init(parent: SuppressedKeyboardField) { self.parent = parent }

        func textFieldDidBeginEditing(_ textField: UITextField) {
            if !parent.isFirstResponder { parent.isFirstResponder = true }
        }
        func textFieldDidEndEditing(_ textField: UITextField) {
            if parent.isFirstResponder { parent.isFirstResponder = false }
        }
    }
}
