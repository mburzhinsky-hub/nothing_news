import SwiftUI

@main
struct TactileCameraApp: App {
    @StateObject private var camera = CameraManager()

    var body: some Scene {
        WindowGroup {
            CameraScreen()
                .environmentObject(camera)
                .preferredColorScheme(.dark)
        }
    }
}
