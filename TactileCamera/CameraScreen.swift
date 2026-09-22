import SwiftUI

struct CameraScreen: View {
    @EnvironmentObject private var camera: CameraManager
    @StateObject private var motion = MotionLighting()

    @AppStorage("hapticsEnabled") private var hapticsEnabled = true
    @AppStorage("soundsEnabled") private var soundsEnabled = true
    @AppStorage("gridEnabled") private var gridEnabled = false
    @AppStorage("saveOriginal") private var saveOriginal = false

    @State private var selectedFilterIndex = 0
    @State private var exposureIndex = 6
    @State private var showSettings = false
    @State private var showPro = false
    @State private var shutterFlash = false
    @State private var focusPoint: CGPoint?
    @State private var focusToken = UUID()

    private let filters = FilterPreset.allCases
    private let exposureValues: [Double] = [
        -2.0, -1.7, -1.3, -1.0, -0.7, -0.3, 0,
         0.3,  0.7,  1.0,  1.3,  1.7, 2.0
    ]

    private var filter: FilterPreset {
        filters[selectedFilterIndex]
    }

    var body: some View {
        GeometryReader { root in
            ZStack {
                Color(red: 0.035, green: 0.037, blue: 0.038)
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    topBar
                        .padding(.horizontal, 16)
                        .padding(.top, 6)
                        .padding(.bottom, 10)

                    viewfinder
                        .frame(height: min(root.size.height * 0.56, root.size.width * 1.22))
                        .padding(.horizontal, 10)

                    lensBar
                        .frame(height: 50)

                    Spacer(minLength: 8)

                    tactileDeck
                        .padding(.horizontal, 13)

                    utilityBar
                        .padding(.horizontal, 18)
                        .padding(.top, 11)
                        .padding(.bottom, max(8, root.safeAreaInsets.bottom))
                }

                if shutterFlash {
                    Color.white
                        .opacity(0.16)
                        .ignoresSafeArea()
                        .allowsHitTesting(false)
                        .transition(.opacity)
                }

                if camera.permissionDenied {
                    permissionOverlay
                }
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environmentObject(camera)
        }
        .sheet(isPresented: $showPro) {
            ProControlsView()
                .environmentObject(camera)
        }
        .onAppear {
            HapticsEngine.shared.prepare()
            SoundEngine.shared.prepare()
            motion.start()
            camera.start()
        }
        .onDisappear {
            motion.stop()
        }
        .onChange(of: camera.statusText) { _, value in
            guard !value.isEmpty else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
                if camera.statusText == value {
                    camera.statusText = ""
                }
            }
        }
    }

    private var topBar: some View {
        HStack(spacing: 12) {
            Button {
                tactile(.clunk)
                showSettings = true
            } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 40, height: 40)
                    .background(.black.opacity(0.42), in: Circle())
                    .overlay(Circle().stroke(.white.opacity(0.15)))
            }

            Spacer()

            Text(camera.manualMode ? "MANUAL" : "AUTO")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .tracking(1.2)
                .foregroundStyle(.white.opacity(0.72))

            Spacer()

            Button {
                tactile(.clunk)
                camera.toggleFlash()
            } label: {
                Image(systemName: camera.flashEnabled ? "bolt.fill" : "bolt.slash")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 40, height: 40)
                    .background(camera.flashEnabled ? .white : .black.opacity(0.42), in: Circle())
                    .foregroundStyle(camera.flashEnabled ? .black : .white)
                    .overlay(Circle().stroke(.white.opacity(0.15)))
            }
        }
        .foregroundStyle(.white)
    }

    private var viewfinder: some View {
        GeometryReader { geo in
            ZStack {
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .fill(Color.black)

                CameraPreview(session: camera.session)
                    .saturation(filter.previewSaturation)
                    .contrast(filter.previewContrast)
                    .brightness(filter.previewBrightness)
                    .overlay(filter.previewOverlay)
                    .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))

                if gridEnabled {
                    GridOverlay()
                        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
                }

                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .stroke(.white.opacity(0.14), lineWidth: 1)

                if let focusPoint {
                    FocusReticle()
                        .position(focusPoint)
                        .id(focusToken)
                        .transition(.opacity.combined(with: .scale))
                }

                VStack {
                    Spacer()
                    HStack {
                        Text(filter.title)
                        Spacer()
                        Text(camera.manualMode ? "PRO" : "AUTO")
                    }
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                    .tracking(1)
                    .foregroundStyle(.white.opacity(0.62))
                    .padding(14)
                }

                if !camera.statusText.isEmpty {
                    Text(camera.statusText.uppercased())
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .tracking(1.2)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.black.opacity(0.66), in: Capsule())
                        .transition(.opacity)
                }
            }
            .contentShape(Rectangle())
            .gesture(
                SpatialTapGesture()
                    .onEnded { value in
                        let normalized = CGPoint(
                            x: value.location.x / max(1, geo.size.width),
                            y: value.location.y / max(1, geo.size.height)
                        )
                        camera.focus(at: normalized)
                        tactile(.tick)
                        withAnimation(.spring(response: 0.22, dampingFraction: 0.72)) {
                            focusPoint = value.location
                            focusToken = UUID()
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
                            withAnimation(.easeOut(duration: 0.25)) {
                                focusPoint = nil
                            }
                        }
                    }
            )
        }
    }

    private var lensBar: some View {
        HStack(spacing: 8) {
            ForEach(Array(camera.lensLabels.enumerated()), id: \.offset) { index, label in
                Button {
                    tactile(.clunk)
                    camera.selectLens(index: index)
                } label: {
                    Text(label)
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundStyle(index == camera.selectedLensIndex ? .black : .white.opacity(0.68))
                        .frame(minWidth: 42, minHeight: 28)
                        .background(index == camera.selectedLensIndex ? .white : .white.opacity(0.07), in: Capsule())
                }
                .disabled(camera.isFrontCamera)
            }
        }
    }

    private var tactileDeck: some View {
        HStack(alignment: .center, spacing: 12) {
            TactileDial(
                title: "STYLE",
                value: filter.title,
                count: filters.count,
                selection: $selectedFilterIndex,
                motionX: motion.x,
                motionY: motion.y
            ) { _ in
                tactile(.tick)
            }

            Button {
                HapticsEngine.shared.shutter(enabled: hapticsEnabled)
                SoundEngine.shared.play(.shutter, enabled: soundsEnabled)
                camera.capturePhoto(filter: filter, saveOriginal: saveOriginal)

                withAnimation(.easeOut(duration: 0.05)) {
                    shutterFlash = true
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
                    withAnimation(.easeOut(duration: 0.18)) {
                        shutterFlash = false
                    }
                }
            } label: {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [.white, .white.opacity(0.72)],
                                startPoint: UnitPoint(x: 0.35 + motion.x * 0.12, y: 0.20 + motion.y * 0.10),
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 84, height: 84)
                        .shadow(color: .black.opacity(0.55), radius: 12, y: 7)

                    Circle()
                        .stroke(.black.opacity(0.52), lineWidth: 2)
                        .frame(width: 65, height: 65)

                    Circle()
                        .fill(Color.black.opacity(0.08))
                        .frame(width: 51, height: 51)
                }
            }
            .buttonStyle(ShutterPressStyle())

            TactileDial(
                title: "EV",
                value: String(format: "%+.1f", exposureValues[exposureIndex]),
                count: exposureValues.count,
                selection: $exposureIndex,
                motionX: motion.x,
                motionY: motion.y
            ) { newIndex in
                camera.setExposureBias(exposureValues[newIndex])
                tactile(.tick)
            }
            .opacity(camera.manualMode ? 0.36 : 1)
            .allowsHitTesting(!camera.manualMode)
        }
    }

    private var utilityBar: some View {
        HStack {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.white.opacity(0.08))
                    .frame(width: 44, height: 44)

                if let image = camera.lastPhoto {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 44, height: 44)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                } else {
                    Image(systemName: "photo")
                        .foregroundStyle(.white.opacity(0.55))
                }
            }

            Spacer()

            Button {
                tactile(.clunk)
                camera.setManualMode(!camera.manualMode)
                showPro = camera.manualMode
            } label: {
                Text(camera.manualMode ? "PRO" : "AUTO")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .tracking(1.1)
                    .padding(.horizontal, 16)
                    .frame(height: 40)
                    .background(.white.opacity(0.07), in: Capsule())
                    .overlay(Capsule().stroke(.white.opacity(0.12)))
            }

            Spacer()

            Button {
                tactile(.clunk)
                camera.toggleCamera()
            } label: {
                Image(systemName: "arrow.triangle.2.circlepath.camera")
                    .font(.system(size: 17, weight: .medium))
                    .frame(width: 44, height: 44)
                    .background(.white.opacity(0.07), in: Circle())
                    .overlay(Circle().stroke(.white.opacity(0.12)))
            }
        }
        .foregroundStyle(.white)
    }

    private var permissionOverlay: some View {
        ZStack {
            Color.black.opacity(0.92).ignoresSafeArea()

            VStack(spacing: 14) {
                Image(systemName: "camera.fill")
                    .font(.system(size: 32))
                Text("НУЖЕН ДОСТУП К КАМЕРЕ")
                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                Text("Разрешите доступ в настройках iPhone, чтобы открыть видоискатель.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 260)
                Button("НАСТРОЙКИ") {
                    showSettings = true
                }
                .font(.caption.weight(.bold))
                .padding(.horizontal, 20)
                .frame(height: 42)
                .background(.white, in: Capsule())
                .foregroundStyle(.black)
            }
        }
    }

    private enum TactileEvent {
        case tick
        case clunk
    }

    private func tactile(_ event: TactileEvent) {
        switch event {
        case .tick:
            HapticsEngine.shared.tick(enabled: hapticsEnabled)
            SoundEngine.shared.play(.tick, enabled: soundsEnabled)
        case .clunk:
            HapticsEngine.shared.clunk(enabled: hapticsEnabled)
            SoundEngine.shared.play(.clunk, enabled: soundsEnabled)
        }
    }
}

private struct TactileDial: View {
    let title: String
    let value: String
    let count: Int
    @Binding var selection: Int
    let motionX: Double
    let motionY: Double
    let onStep: (Int) -> Void

    @State private var startSelection = 0
    @State private var dragging = false

    var body: some View {
        VStack(spacing: 7) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color.white.opacity(0.17),
                                Color.white.opacity(0.035),
                                Color.black.opacity(0.45)
                            ],
                            startPoint: UnitPoint(
                                x: 0.20 + motionX * 0.16,
                                y: 0.15 + motionY * 0.16
                            ),
                            endPoint: .bottomTrailing
                        )
                    )

                ForEach(0..<28, id: \.self) { tick in
                    Capsule()
                        .fill(Color.white.opacity(tick % 4 == 0 ? 0.58 : 0.25))
                        .frame(width: 1.2, height: tick % 4 == 0 ? 7 : 4)
                        .offset(y: -33)
                        .rotationEffect(.degrees(Double(tick) * 360 / 28))
                }

                Circle()
                    .stroke(.white.opacity(0.15), lineWidth: 1)
                    .padding(7)

                VStack(spacing: 2) {
                    Text(value)
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                    Text(title)
                        .font(.system(size: 7, weight: .medium, design: .monospaced))
                        .tracking(1)
                        .foregroundStyle(.white.opacity(0.48))
                }
            }
            .frame(width: 84, height: 84)
            .shadow(color: .black.opacity(0.52), radius: 10, y: 7)
            .contentShape(Circle())
            .gesture(
                DragGesture(minimumDistance: 2)
                    .onChanged { value in
                        if !dragging {
                            dragging = true
                            startSelection = selection
                        }
                        let delta = Int((-value.translation.height / 13).rounded())
                        let next = max(0, min(count - 1, startSelection + delta))
                        if next != selection {
                            selection = next
                            onStep(next)
                        }
                    }
                    .onEnded { _ in
                        dragging = false
                    }
            )

            Text("↕")
                .font(.system(size: 8, weight: .medium, design: .monospaced))
                .foregroundStyle(.white.opacity(0.25))
        }
    }
}

private struct GridOverlay: View {
    var body: some View {
        GeometryReader { geo in
            Path { path in
                let w = geo.size.width
                let h = geo.size.height
                path.move(to: CGPoint(x: w / 3, y: 0))
                path.addLine(to: CGPoint(x: w / 3, y: h))
                path.move(to: CGPoint(x: w * 2 / 3, y: 0))
                path.addLine(to: CGPoint(x: w * 2 / 3, y: h))
                path.move(to: CGPoint(x: 0, y: h / 3))
                path.addLine(to: CGPoint(x: w, y: h / 3))
                path.move(to: CGPoint(x: 0, y: h * 2 / 3))
                path.addLine(to: CGPoint(x: w, y: h * 2 / 3))
            }
            .stroke(.white.opacity(0.18), lineWidth: 0.7)
        }
        .allowsHitTesting(false)
    }
}

private struct FocusReticle: View {
    var body: some View {
        Circle()
            .stroke(.white.opacity(0.9), lineWidth: 1)
            .frame(width: 58, height: 58)
            .overlay(
                Circle()
                    .fill(.white)
                    .frame(width: 4, height: 4)
            )
    }
}

private struct ShutterPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.91 : 1)
            .brightness(configuration.isPressed ? -0.08 : 0)
            .animation(.spring(response: 0.18, dampingFraction: 0.64), value: configuration.isPressed)
    }
}
