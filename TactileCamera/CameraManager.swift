import AVFoundation
import CoreImage
import ImageIO
import Photos
import SwiftUI
import UIKit

final class CameraManager: NSObject, ObservableObject {
    let session = AVCaptureSession()

    @Published private(set) var isRunning = false
    @Published private(set) var permissionDenied = false
    @Published private(set) var lensLabels: [String] = ["1×"]
    @Published private(set) var selectedLensIndex = 0
    @Published private(set) var isFrontCamera = false
    @Published var flashEnabled = false
    @Published var manualMode = false
    @Published var lastPhoto: UIImage?
    @Published var statusText = ""

    private let sessionQueue = DispatchQueue(label: "tactile.camera.session")
    private let photoOutput = AVCapturePhotoOutput()
    private let ciContext = CIContext(options: [.cacheIntermediates: false])

    private var currentInput: AVCaptureDeviceInput?
    private var backDevices: [AVCaptureDevice] = []
    private var configured = false
    private var captureFilter: FilterPreset = .clean
    private var captureSaveOriginal = false

    func start() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureAndStart()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    self?.permissionDenied = !granted
                }
                if granted {
                    self?.configureAndStart()
                }
            }
        default:
            DispatchQueue.main.async {
                self.permissionDenied = true
            }
        }
    }

    func stop() {
        sessionQueue.async { [weak self] in
            guard let self, self.session.isRunning else { return }
            self.session.stopRunning()
            DispatchQueue.main.async {
                self.isRunning = false
            }
        }
    }

    func toggleFlash() {
        flashEnabled.toggle()
    }

    func selectLens(index: Int) {
        guard !isFrontCamera else { return }
        sessionQueue.async { [weak self] in
            guard let self, self.backDevices.indices.contains(index) else { return }
            self.replaceInput(with: self.backDevices[index])
            DispatchQueue.main.async {
                self.selectedLensIndex = index
            }
        }
    }

    func toggleCamera() {
        sessionQueue.async { [weak self] in
            guard let self else { return }

            if self.isFrontCamera {
                let index = min(self.selectedLensIndex, max(self.backDevices.count - 1, 0))
                guard self.backDevices.indices.contains(index) else { return }
                self.replaceInput(with: self.backDevices[index])
                DispatchQueue.main.async {
                    self.isFrontCamera = false
                    self.flashEnabled = false
                    self.updateLensLabels()
                }
            } else {
                guard let front = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) else { return }
                self.replaceInput(with: front)
                DispatchQueue.main.async {
                    self.isFrontCamera = true
                    self.flashEnabled = false
                    self.lensLabels = ["SELFIE"]
                    self.selectedLensIndex = 0
                }
            }
        }
    }

    func setExposureBias(_ value: Double) {
        guard !manualMode else { return }
        sessionQueue.async { [weak self] in
            guard let device = self?.currentInput?.device else { return }
            do {
                try device.lockForConfiguration()
                let clamped = max(device.minExposureTargetBias, min(device.maxExposureTargetBias, Float(value)))
                device.setExposureTargetBias(clamped)
                device.unlockForConfiguration()
            } catch {}
        }
    }

    func focus(at normalizedPoint: CGPoint) {
        sessionQueue.async { [weak self] in
            guard let device = self?.currentInput?.device else { return }
            let converted = CGPoint(
                x: max(0, min(1, normalizedPoint.y)),
                y: max(0, min(1, 1 - normalizedPoint.x))
            )

            do {
                try device.lockForConfiguration()
                if device.isFocusPointOfInterestSupported {
                    device.focusPointOfInterest = converted
                    if device.isFocusModeSupported(.autoFocus) {
                        device.focusMode = .autoFocus
                    }
                }
                if device.isExposurePointOfInterestSupported {
                    device.exposurePointOfInterest = converted
                    if device.isExposureModeSupported(.continuousAutoExposure) && !self!.manualMode {
                        device.exposureMode = .continuousAutoExposure
                    }
                }
                device.unlockForConfiguration()
            } catch {}
        }
    }

    func setManualMode(_ enabled: Bool) {
        manualMode = enabled
        guard !enabled else { return }
        sessionQueue.async { [weak self] in
            guard let device = self?.currentInput?.device else { return }
            do {
                try device.lockForConfiguration()
                if device.isExposureModeSupported(.continuousAutoExposure) {
                    device.exposureMode = .continuousAutoExposure
                }
                if device.isFocusModeSupported(.continuousAutoFocus) {
                    device.focusMode = .continuousAutoFocus
                }
                if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
                    device.whiteBalanceMode = .continuousAutoWhiteBalance
                }
                device.unlockForConfiguration()
            } catch {}
        }
    }

    func setManualExposure(shutterSeconds: Double, iso: Float) {
        sessionQueue.async { [weak self] in
            guard let device = self?.currentInput?.device else { return }
            do {
                try device.lockForConfiguration()
                let requested = CMTime(seconds: shutterSeconds, preferredTimescale: 1_000_000_000)
                let minDuration = device.activeFormat.minExposureDuration
                let maxDuration = device.activeFormat.maxExposureDuration
                let duration = CMTimeMaximum(minDuration, CMTimeMinimum(maxDuration, requested))
                let clampedISO = max(device.activeFormat.minISO, min(device.activeFormat.maxISO, iso))
                if device.isExposureModeSupported(.custom) {
                    device.setExposureModeCustom(duration: duration, iso: clampedISO)
                }
                device.unlockForConfiguration()
            } catch {}
        }
    }

    func setWhiteBalance(temperature: Float) {
        sessionQueue.async { [weak self] in
            guard let device = self?.currentInput?.device else { return }
            do {
                try device.lockForConfiguration()
                guard device.isWhiteBalanceModeSupported(.locked) else {
                    device.unlockForConfiguration()
                    return
                }
                let values = AVCaptureDevice.WhiteBalanceTemperatureAndTintValues(
                    temperature: temperature,
                    tint: 0
                )
                var gains = device.deviceWhiteBalanceGains(for: values)
                gains.redGain = max(1, min(device.maxWhiteBalanceGain, gains.redGain))
                gains.greenGain = max(1, min(device.maxWhiteBalanceGain, gains.greenGain))
                gains.blueGain = max(1, min(device.maxWhiteBalanceGain, gains.blueGain))
                device.setWhiteBalanceModeLocked(with: gains)
                device.unlockForConfiguration()
            } catch {}
        }
    }

    func setFocusPosition(_ position: Float) {
        sessionQueue.async { [weak self] in
            guard let device = self?.currentInput?.device else { return }
            do {
                try device.lockForConfiguration()
                if device.isFocusModeSupported(.locked) {
                    device.setFocusModeLocked(lensPosition: max(0, min(1, position)))
                }
                device.unlockForConfiguration()
            } catch {}
        }
    }

    func capturePhoto(filter: FilterPreset, saveOriginal: Bool) {
        captureFilter = filter
        captureSaveOriginal = saveOriginal

        let settings = AVCapturePhotoSettings()
        settings.photoQualityPrioritization = .quality

        if let device = currentInput?.device, device.hasFlash, flashEnabled {
            settings.flashMode = .on
        }

        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    private func configureAndStart() {
        sessionQueue.async { [weak self] in
            guard let self else { return }

            if !self.configured {
                self.backDevices = self.discoverBackDevices()
                guard let device = self.preferredBackDevice() else {
                    DispatchQueue.main.async {
                        self.permissionDenied = true
                    }
                    return
                }

                self.session.beginConfiguration()
                self.session.sessionPreset = .photo

                do {
                    let input = try AVCaptureDeviceInput(device: device)
                    if self.session.canAddInput(input) {
                        self.session.addInput(input)
                        self.currentInput = input
                    }
                } catch {}

                if self.session.canAddOutput(self.photoOutput) {
                    self.session.addOutput(self.photoOutput)
                    self.photoOutput.maxPhotoQualityPrioritization = .quality
                }

                self.session.commitConfiguration()
                self.configured = true

                DispatchQueue.main.async {
                    self.isFrontCamera = false
                    self.selectedLensIndex = self.backDevices.firstIndex(where: { $0.deviceType == .builtInWideAngleCamera }) ?? 0
                    self.updateLensLabels()
                }
            }

            if !self.session.isRunning {
                self.session.startRunning()
            }

            DispatchQueue.main.async {
                self.isRunning = self.session.isRunning
            }
        }
    }

    private func discoverBackDevices() -> [AVCaptureDevice] {
        let session = AVCaptureDevice.DiscoverySession(
            deviceTypes: [
                .builtInUltraWideCamera,
                .builtInWideAngleCamera,
                .builtInTelephotoCamera
            ],
            mediaType: .video,
            position: .back
        )

        let priority: [AVCaptureDevice.DeviceType: Int] = [
            .builtInUltraWideCamera: 0,
            .builtInWideAngleCamera: 1,
            .builtInTelephotoCamera: 2
        ]

        return session.devices.sorted {
            (priority[$0.deviceType] ?? 99) < (priority[$1.deviceType] ?? 99)
        }
    }

    private func preferredBackDevice() -> AVCaptureDevice? {
        backDevices.first(where: { $0.deviceType == .builtInWideAngleCamera }) ?? backDevices.first
    }

    private func updateLensLabels() {
        lensLabels = backDevices.map { device in
            switch device.deviceType {
            case .builtInUltraWideCamera: return "0.5×"
            case .builtInTelephotoCamera: return "3×"
            default: return "1×"
            }
        }
    }

    private func replaceInput(with device: AVCaptureDevice) {
        do {
            let newInput = try AVCaptureDeviceInput(device: device)
            session.beginConfiguration()

            if let currentInput {
                session.removeInput(currentInput)
            }

            if session.canAddInput(newInput) {
                session.addInput(newInput)
                currentInput = newInput
            }

            session.commitConfiguration()
        } catch {}
    }

    private func savePhotoData(_ processed: Data, original: Data?) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
            guard status == .authorized || status == .limited else {
                DispatchQueue.main.async {
                    self?.statusText = "Нет доступа к Фото"
                }
                return
            }

            PHPhotoLibrary.shared().performChanges({
                let processedRequest = PHAssetCreationRequest.forAsset()
                processedRequest.addResource(with: .photo, data: processed, options: nil)

                if let original {
                    let originalRequest = PHAssetCreationRequest.forAsset()
                    originalRequest.addResource(with: .photo, data: original, options: nil)
                }
            }) { success, _ in
                DispatchQueue.main.async {
                    self?.statusText = success ? "Сохранено" : "Не удалось сохранить"
                }
            }
        }
    }
}

extension CameraManager: AVCapturePhotoCaptureDelegate {
    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        guard error == nil, let originalData = photo.fileDataRepresentation() else {
            DispatchQueue.main.async {
                self.statusText = "Ошибка снимка"
            }
            return
        }

        guard var image = CIImage(data: originalData) else {
            savePhotoData(originalData, original: nil)
            return
        }

        if let orientationNumber = photo.metadata[String(kCGImagePropertyOrientation)] as? NSNumber {
            image = image.oriented(forExifOrientation: Int32(orientationNumber.intValue))
        }

        let filtered = captureFilter.apply(to: image)
        let extent = filtered.extent.integral

        guard
            let cgImage = ciContext.createCGImage(filtered, from: extent),
            let processedData = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.95)
        else {
            savePhotoData(originalData, original: nil)
            return
        }

        DispatchQueue.main.async {
            self.lastPhoto = UIImage(data: processedData)
        }

        savePhotoData(
            processedData,
            original: captureSaveOriginal ? originalData : nil
        )
    }
}
