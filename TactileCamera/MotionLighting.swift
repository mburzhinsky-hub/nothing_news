import CoreMotion
import Foundation

final class MotionLighting: ObservableObject {
    @Published var x: Double = 0
    @Published var y: Double = 0

    private let motion = CMMotionManager()
    private let queue = OperationQueue()

    func start() {
        guard motion.isDeviceMotionAvailable else { return }
        motion.deviceMotionUpdateInterval = 1.0 / 30.0
        motion.startDeviceMotionUpdates(to: queue) { [weak self] data, _ in
            guard let attitude = data?.attitude else { return }
            let roll = max(-0.7, min(0.7, attitude.roll))
            let pitch = max(-0.7, min(0.7, attitude.pitch))

            DispatchQueue.main.async {
                self?.x = roll / 0.7
                self?.y = pitch / 0.7
            }
        }
    }

    func stop() {
        motion.stopDeviceMotionUpdates()
    }
}
