import SwiftUI
import UIKit

struct SettingsView: View {
    @EnvironmentObject private var camera: CameraManager
    @Environment(\.dismiss) private var dismiss

    @AppStorage("hapticsEnabled") private var hapticsEnabled = true
    @AppStorage("soundsEnabled") private var soundsEnabled = true
    @AppStorage("gridEnabled") private var gridEnabled = false
    @AppStorage("saveOriginal") private var saveOriginal = false

    @State private var showPro = false

    var body: some View {
        NavigationStack {
            List {
                Section("ОЩУЩЕНИЯ") {
                    Toggle("Тактильный отклик", isOn: $hapticsEnabled)
                    Toggle("Щелчки и звуки", isOn: $soundsEnabled)
                }

                Section("ВИДОИСКАТЕЛЬ") {
                    Toggle("Сетка", isOn: $gridEnabled)
                    Button("PRO-настройки") {
                        showPro = true
                    }
                }

                Section("СЪЁМКА") {
                    Toggle("Сохранять оригинал", isOn: $saveOriginal)
                    Text("При включении в Фото сохраняются обработанный кадр и исходник.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if camera.permissionDenied {
                    Section("ДОСТУП") {
                        Button("Открыть настройки iPhone") {
                            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                            UIApplication.shared.open(url)
                        }
                    }
                }

                Section {
                    Text("Нативная камера без аналитики и сетевых запросов. Фильтры применяются локально на iPhone.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.black)
            .navigationTitle("КАМЕРА")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("ГОТОВО") { dismiss() }
                        .font(.caption.weight(.semibold))
                }
            }
            .sheet(isPresented: $showPro) {
                ProControlsView()
                    .environmentObject(camera)
            }
        }
        .preferredColorScheme(.dark)
    }
}

struct ProControlsView: View {
    @EnvironmentObject private var camera: CameraManager
    @Environment(\.dismiss) private var dismiss

    @AppStorage("hapticsEnabled") private var hapticsEnabled = true
    @AppStorage("soundsEnabled") private var soundsEnabled = true

    @State private var shutterIndex = 4
    @State private var isoIndex = 1
    @State private var temperature = 5_500.0
    @State private var focus = 0.55

    private let shutterValues: [(String, Double)] = [
        ("1/1000", 1.0/1000.0),
        ("1/500", 1.0/500.0),
        ("1/250", 1.0/250.0),
        ("1/125", 1.0/125.0),
        ("1/60", 1.0/60.0),
        ("1/30", 1.0/30.0),
        ("1/15", 1.0/15.0)
    ]

    private let isoValues: [Float] = [50, 100, 200, 400, 800, 1600]

    var body: some View {
        NavigationStack {
            VStack(spacing: 22) {
                Picker("Режим", selection: Binding(
                    get: { camera.manualMode ? 1 : 0 },
                    set: { camera.setManualMode($0 == 1) }
                )) {
                    Text("AUTO").tag(0)
                    Text("MANUAL").tag(1)
                }
                .pickerStyle(.segmented)

                if camera.manualMode {
                    control(
                        title: "SHUTTER",
                        value: shutterValues[shutterIndex].0,
                        slider: Slider(
                            value: Binding(
                                get: { Double(shutterIndex) },
                                set: { newValue in
                                    shutterIndex = Int(newValue.rounded())
                                    applyExposure()
                                    tick()
                                }
                            ),
                            in: 0...Double(shutterValues.count - 1),
                            step: 1
                        )
                    )

                    control(
                        title: "ISO",
                        value: String(Int(isoValues[isoIndex])),
                        slider: Slider(
                            value: Binding(
                                get: { Double(isoIndex) },
                                set: { newValue in
                                    isoIndex = Int(newValue.rounded())
                                    applyExposure()
                                    tick()
                                }
                            ),
                            in: 0...Double(isoValues.count - 1),
                            step: 1
                        )
                    )

                    control(
                        title: "WHITE BALANCE",
                        value: String(Int(temperature)) + "K",
                        slider: Slider(value: $temperature, in: 2_800...8_000, step: 100)
                            .onChange(of: temperature) { _, newValue in
                                camera.setWhiteBalance(temperature: Float(newValue))
                            }
                    )

                    control(
                        title: "FOCUS",
                        value: String(format: "%.0f%%", focus * 100),
                        slider: Slider(value: $focus, in: 0...1, step: 0.01)
                            .onChange(of: focus) { _, newValue in
                                camera.setFocusPosition(Float(newValue))
                            }
                    )
                } else {
                    Spacer()
                    Text("AUTO управляет экспозицией, фокусом и балансом белого автоматически. Основной EV-регулятор остаётся доступен на камере.")
                        .multilineTextAlignment(.center)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 30)
                    Spacer()
                }
            }
            .padding(20)
            .background(Color.black.ignoresSafeArea())
            .navigationTitle("PRO")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("ГОТОВО") { dismiss() }
                        .font(.caption.weight(.semibold))
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func control<Content: View>(
        title: String,
        value: String,
        slider: Content
    ) -> some View {
        VStack(spacing: 9) {
            HStack {
                Text(title)
                    .font(.caption2.weight(.semibold))
                    .tracking(1.2)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(value)
                    .font(.system(.caption, design: .monospaced).weight(.medium))
            }
            slider.tint(.white)
        }
    }

    private func applyExposure() {
        camera.setManualExposure(
            shutterSeconds: shutterValues[shutterIndex].1,
            iso: isoValues[isoIndex]
        )
    }

    private func tick() {
        HapticsEngine.shared.tick(enabled: hapticsEnabled)
        SoundEngine.shared.play(.tick, enabled: soundsEnabled)
    }
}
