import Foundation

enum DateFormatters {
    static let isoDate: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Europe/Moscow")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static let displayDay: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ru_RU")
        f.timeZone = TimeZone(identifier: "Europe/Moscow")
        f.dateFormat = "d MMMM"
        return f
    }()

    static let displayDayShort: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ru_RU")
        f.timeZone = TimeZone(identifier: "Europe/Moscow")
        f.dateFormat = "d MMM"
        return f
    }()

    static let groupHeader: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ru_RU")
        f.timeZone = TimeZone(identifier: "Europe/Moscow")
        f.dateFormat = "EEEE, d MMMM"
        return f
    }()
}
