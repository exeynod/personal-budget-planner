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
        static let fallback = Color(hex: 0x9C8FE8)

        struct Visual {
            let color: Color
            let icon: String
        }

        /// Mapping русских названий → (color + SF Symbol icon).
        /// Симметрично frontend/src/utils/categoryVisuals.ts.
        static func visual(for name: String) -> Visual {
            let norm = name.trimmingCharacters(in: .whitespaces).lowercased()

            if norm.contains("продукт") || norm.contains("еда") || norm == "food" {
                return Visual(color: food, icon: "bag.fill")
            }
            if norm.contains("кафе") || norm.contains("ресторан") || norm.contains("cafe") {
                return Visual(color: cafe, icon: "cup.and.saucer.fill")
            }
            if norm.contains("дом") || norm.contains("жил") || norm.contains("коммунал") || norm == "home" {
                return Visual(color: home, icon: "house.fill")
            }
            if norm.contains("транспорт") || norm.contains("такси") || norm == "transit" {
                return Visual(color: transit, icon: "car.fill")
            }
            if norm.contains("здоров") || norm.contains("медиц") || norm.contains("аптек") || norm == "health" {
                return Visual(color: health, icon: "heart.fill")
            }
            if norm.contains("развлеч") || norm.contains("досуг") || norm.contains("кино") || norm == "fun" {
                return Visual(color: fun, icon: "ticket.fill")
            }
            if norm.contains("подарк") || norm.contains("подарок") || norm == "gifts" {
                return Visual(color: gifts, icon: "gift.fill")
            }
            if norm.contains("подписк") || norm == "subs" || norm.contains("сервис") {
                return Visual(color: subs, icon: "square.stack.fill")
            }
            if norm.contains("зарплат") || norm.contains("оклад") || norm == "salary" {
                return Visual(color: salary, icon: "rublesign.circle.fill")
            }
            if norm.contains("подработк") || norm.contains("фриланс") || norm.contains("бонус") || norm == "side" {
                return Visual(color: side, icon: "sparkles")
            }
            if norm.contains("спорт") {
                return Visual(color: health, icon: "figure.run")
            }

            return Visual(color: fallback, icon: "circle.fill")
        }

        static func color(for slug: String) -> Color {
            visual(for: slug).color
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
