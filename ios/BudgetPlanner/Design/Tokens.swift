import SwiftUI

extension Color {
    init(hex: UInt32, alpha: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}

/// Минимальный design-token namespace. iOS 26 native подход:
/// большая часть стилей идёт через системные tokens (semantic typography
/// `.body`/`.headline`, system colors `.primary`/`.secondary`/`.tint`,
/// `.systemGroupedBackground` фон). Здесь оставлены только:
///   - brand accent (orange — задаётся в App.tint и доступен как Color.accentColor)
///   - category visual mapping (русское имя → SF Symbol + приглушённый цвет)
///   - spacing на 4pt grid и continuous radii
enum Tokens {
    enum Accent {
        /// Brand orange. Дублирует `Color.accentColor` (выставляется через
        /// `.tint(Tokens.Accent.primary)` на root). Использовать там, где
        /// семантически нужен именно brand colour, а не env-tint.
        static let primary = Color(hex: 0xFF7A4C)
    }

    /// Категорийная палитра — desaturated для professional finance look.
    /// Используется только для leading icon на rows; backgrounds и primary
    /// chrome — system semantic colors.
    enum Categories {
        static let food = Color(hex: 0xCB7C3D)
        static let cafe = Color(hex: 0xB85847)
        static let home = Color(hex: 0x8E6CC0)
        static let transit = Color(hex: 0x5A8FCB)
        static let health = Color(hex: 0xC25975)
        static let fun = Color(hex: 0xCFA641)
        static let gifts = Color(hex: 0x66A877)
        static let subs = Color(hex: 0x7E73C0)
        static let salary = Color(hex: 0x66A877)
        static let side = Color(hex: 0xCFA641)
        static let fallback = Color(hex: 0x7E73C0)

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

    /// 4pt-grid spacing — соответствует Apple HIG.
    enum Spacing {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let base: CGFloat = 16
        static let lg: CGFloat = 20
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
    }

    /// Continuous-style corner radii. Используются только там, где native
    /// ListItem / Section radius не подходит (custom hero, glass shapes).
    enum Radius {
        static let compact: CGFloat = 12
        static let regular: CGFloat = 16
        static let large: CGFloat = 24
    }
}
