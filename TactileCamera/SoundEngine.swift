import AVFoundation
import Foundation

final class SoundEngine {
    enum Sound {
        case tick
        case clunk
        case shutter
    }

    static let shared = SoundEngine()

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!

    private init() {
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
    }

    func prepare() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            if !engine.isRunning {
                try engine.start()
            }
        } catch {}
    }

    func play(_ sound: Sound, enabled: Bool) {
        guard enabled else { return }
        prepare()

        let duration: Double
        switch sound {
        case .tick: duration = 0.030
        case .clunk: duration = 0.095
        case .shutter: duration = 0.160
        }

        let frameCount = Int(format.sampleRate * duration)
        guard let buffer = AVAudioPCMBuffer(
            pcmFormat: format,
            frameCapacity: AVAudioFrameCount(frameCount)
        ), let channel = buffer.floatChannelData?[0] else { return }

        buffer.frameLength = AVAudioFrameCount(frameCount)

        for i in 0..<frameCount {
            let t = Double(i) / format.sampleRate
            let sample: Float

            switch sound {
            case .tick:
                let env = Float(exp(-150 * t))
                let tone = sin(2 * Double.pi * 1_450 * t)
                let noise = Double.random(in: -0.18...0.18)
                sample = Float(tone + noise) * env * 0.22

            case .clunk:
                let env = Float(exp(-34 * t))
                let tone = sin(2 * Double.pi * 165 * t) + 0.35 * sin(2 * Double.pi * 330 * t)
                sample = Float(tone) * env * 0.27

            case .shutter:
                let first = exp(-90 * t) * sin(2 * Double.pi * 880 * t)
                let secondT = max(0, t - 0.058)
                let second = t >= 0.058 ? exp(-75 * secondT) * sin(2 * Double.pi * 520 * secondT) : 0
                let tail = Double.random(in: -1...1) * exp(-24 * t) * 0.10
                sample = Float(first * 0.25 + second * 0.30 + tail)
            }

            channel[i] = max(-1, min(1, sample))
        }

        player.scheduleBuffer(buffer)
        if !player.isPlaying {
            player.play()
        }
    }
}
