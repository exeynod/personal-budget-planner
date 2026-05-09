import Foundation
import UserNotifications

enum LocalNotifications {
    static func requestAuthorization() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current().requestAuthorization(
                options: [.alert, .sound, .badge]
            )
        } catch {
            return false
        }
    }

    /// Перепланирует все локальные нотификации для подписок.
    /// Зеркалирует worker-джоб notify_subscriptions: за `notify_days_before`
    /// дней до next_charge_date в 09:00 по Москве.
    static func reschedule(subscriptions: [SubscriptionDTO]) async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        let ourIDs = pending.map(\.identifier).filter { $0.hasPrefix("sub-") }
        center.removePendingNotificationRequests(withIdentifiers: ourIDs)

        let cal = Calendar(identifier: .gregorian)
        var moscowCal = cal
        moscowCal.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current

        for sub in subscriptions where sub.isActive {
            guard let triggerDate = moscowCal.date(
                byAdding: .day,
                value: -sub.notifyDaysBefore,
                to: sub.nextChargeDate
            ) else { continue }

            var components = moscowCal.dateComponents(
                [.year, .month, .day], from: triggerDate
            )
            components.hour = 9
            components.minute = 0
            components.timeZone = moscowCal.timeZone

            guard let fireDate = moscowCal.date(from: components),
                  fireDate > Date() else { continue }

            let content = UNMutableNotificationContent()
            content.title = "Скоро списание"
            content.body = "\(sub.name) — \(MoneyFormatter.formatWithSymbol(cents: sub.amountCents)) через \(sub.notifyDaysBefore) дн."
            content.sound = .default

            let trigger = UNCalendarNotificationTrigger(
                dateMatching: components,
                repeats: false
            )

            let request = UNNotificationRequest(
                identifier: "sub-\(sub.id)",
                content: content,
                trigger: trigger
            )

            try? await center.add(request)
        }
    }
}
