import SwiftUI

struct ManagementView: View {
    var body: some View {
        NavigationStack {
            ZStack {
                AdaptiveBackground()
                List {
                    Section {
                        NavigationLink {
                            CategoriesView()
                        } label: {
                            ManagementRow(icon: "tag.fill", title: "Категории",
                                          subtitle: "CRUD категорий, архив")
                        }
                        .listRowBackground(Color.clear)

                        NavigationLink {
                            ComingSoonView(title: "Подписки", phase: 19)
                        } label: {
                            ManagementRow(icon: "arrow.triangle.2.circlepath",
                                          title: "Подписки",
                                          subtitle: "Регулярные платежи")
                        }
                        .listRowBackground(Color.clear)

                        NavigationLink {
                            ComingSoonView(title: "Шаблон", phase: 19)
                        } label: {
                            ManagementRow(icon: "doc.text",
                                          title: "Шаблон плана",
                                          subtitle: "Применить к периоду")
                        }
                        .listRowBackground(Color.clear)

                        NavigationLink {
                            ComingSoonView(title: "Аналитика", phase: 19)
                        } label: {
                            ManagementRow(icon: "chart.bar.fill",
                                          title: "Аналитика",
                                          subtitle: "Тренды, прогноз")
                        }
                        .listRowBackground(Color.clear)
                    }

                    Section {
                        NavigationLink {
                            SettingsView()
                        } label: {
                            ManagementRow(icon: "gearshape.fill", title: "Настройки",
                                          subtitle: "Цикл, уведомления, AI")
                        }
                        .listRowBackground(Color.clear)
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Меню")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct ManagementRow: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: Tokens.Spacing.md) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundStyle(Tokens.Accent.primary)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.appBody)
                Text(subtitle).font(.appCaption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, Tokens.Spacing.xs)
    }
}
