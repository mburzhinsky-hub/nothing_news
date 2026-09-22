import CoreHaptics
import UIKit

final class HapticsEngine {
    static let shared = HapticsEngine()

    private var engine: CHHapticEngine?
    private let supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics

    private init() {}

    func prepare() {
        guard supportsHaptics else { return }
        do {
            if engine == nil {
                engine = try CHHapticEngine()
                engine?.isAutoShutdownEnabled = true
                engine?.resetHandler = { [weak self] in
                    try? self?.engine?.start()
                }
            }
            try engine?.start()
        } catch {
            engine = nil
        }
    }

    func tick(enabled: Bool) {
        guard enabled else { return }
        guard supportsHaptics else {
            UISelectionFeedbackGenerator().selectionChanged()
            return
        }
        play(transients: [
            (time: 0, intensity: 0.30, sharpness: 0.88)
        ])
    }

    func clunk(enabled: Bool) {
        guard enabled else { return }
        guard supportsHaptics else {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            return
        }
        play(transients: [
            (time: 0, intensity: 0.62, sharpness: 0.42),
            (time: 0.045, intensity: 0.28, sharpness: 0.18)
        ])
    }

    func shutter(enabled: Bool) {
        guard enabled else { return }
        guard supportsHaptics else {
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            return
        }
        play(transients: [
            (time: 0, intensity: 0.95, sharpness: 0.72),
            (time: 0.052, intensity: 0.55, sharpness: 0.35),
            (time: 0.105, intensity: 0.22, sharpness: 0.15)
        ])
    }

    private func play(transients: [(time: TimeInterval, intensity: Float, sharpness: Float)]) {
        prepare()
        let events = transients.map { item in
            CHHapticEvent(
                eventType: .hapticTransient,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: item.intensity),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: item.sharpness)
                ],
                relativeTime: item.time
            )
        }

        do {
            let pattern = try CHHapticPattern(events: events, parameters: [])
            let player = try engine?.makePlayer(with: pattern)
            try player?.start(atTime: 0)
        } catch {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }
}
