import SwiftUI

extension Color {
    init(hex: UInt32, alpha: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}

enum Tokens {
    enum Accent {
        static let primary = Color(hex: 0xFF7A4C)
        static let hover = Color(hex: 0xFF6E3A)
        static let secondary = Color(hex: 0xFFB07A)
        static let soft = Color(hex: 0xFF7A4C, alpha: 0.14)
    }

    enum Ink {
        static let primary = Color(hex: 0x1A1410)
        static let secondary = Color(hex: 0x1A1410, alpha: 0.6)
        static let tertiary = Color(hex: 0x1A1410, alpha: 0.4)
        static let primaryDark = Color.white
        static let secondaryDark = Color(white: 1.0, opacity: 0.65)
        static let tertiaryDark = Color(white: 1.0, opacity: 0.4)
    }

    enum Background {
        static let cream = Color(hex: 0xF6EFE6)
    }

    enum Categories {
        static let food = Color(hex: 0xF39A4C)
        static let cafe = Color(hex: 0xE36B5A)
        static let home = Color(hex: 0xB583E8)
        static let transit = Color(hex: 0x6CA6E8)
        static let health = Color(hex: 0xE26F8E)
        static let fun = Color(hex: 0xF0C04A)
        static let gifts = Color(hex: 0x7CC68F)
        static let subs = Color(hex: 0x9C8FE8)
        static let salary = Color(hex: 0x7CC68F)
        static let side = Color(hex: 0xF0C04A)

        static func color(for slug: String) -> Color {
            switch slug.lowercased() {
            case "food", "еда": return food
            case "cafe", "кафе": return cafe
            case "home", "дом": return home
            case "transit", "транспорт": return transit
            case "health", "здоровье": return health
            case "fun", "развлечения": return fun
            case "gifts", "подарки": return gifts
            case "subs", "подписки": return subs
            case "salary", "зарплата": return salary
            case "side", "подработка": return side
            default: return Color.gray
            }
        }
    }

    enum Spacing {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let base: CGFloat = 16
        static let lg: CGFloat = 20
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
        static let xxxl: CGFloat = 40
        static let huge: CGFloat = 48
    }

    enum Radius {
        static let sm: CGFloat = 8
        static let md: CGFloat = 14
        static let lg: CGFloat = 20
        static let xl: CGFloat = 28
        static let full: CGFloat = 9999
    }

    enum Typography {
        static let xs: CGFloat = 11
        static let sm: CGFloat = 13
        static let base: CGFloat = 15
        static let md: CGFloat = 17
        static let lg: CGFloat = 20
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
        static let xxxl: CGFloat = 40
    }
}

extension Font {
    static let appBody = Font.system(size: Tokens.Typography.base, weight: .regular)
    static let appLabel = Font.system(size: Tokens.Typography.sm, weight: .medium)
    static let appCaption = Font.system(size: Tokens.Typography.xs, weight: .regular)
    static let appTitle = Font.system(size: Tokens.Typography.xl, weight: .semibold)
    static let appHero = Font.system(size: Tokens.Typography.xxxl, weight: .bold).monospacedDigit()
    static let appNumber = Font.system(size: Tokens.Typography.md, weight: .semibold).monospacedDigit()
}
