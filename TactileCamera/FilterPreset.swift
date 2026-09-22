import CoreImage
import SwiftUI

enum FilterPreset: String, CaseIterable, Identifiable {
    case clean
    case film
    case chrome
    case mono
    case warm
    case cold
    case fade

    var id: String { rawValue }

    var title: String {
        switch self {
        case .clean: return "CLEAN"
        case .film: return "FILM"
        case .chrome: return "CHROME"
        case .mono: return "MONO"
        case .warm: return "WARM"
        case .cold: return "COLD"
        case .fade: return "FADE"
        }
    }

    var previewSaturation: Double {
        switch self {
        case .film: return 0.78
        case .mono: return 0
        case .fade: return 0.72
        default: return 1
        }
    }

    var previewContrast: Double {
        switch self {
        case .chrome: return 1.16
        case .film: return 1.10
        case .fade: return 0.88
        default: return 1
        }
    }

    var previewBrightness: Double {
        switch self {
        case .fade: return 0.03
        case .cold: return -0.01
        default: return 0
        }
    }

    @ViewBuilder
    var previewOverlay: some View {
        switch self {
        case .warm:
            Color.orange.opacity(0.10).blendMode(.softLight)
        case .cold:
            Color.blue.opacity(0.08).blendMode(.softLight)
        case .film:
            Color.brown.opacity(0.08).blendMode(.softLight)
        case .chrome:
            Color.white.opacity(0.035).blendMode(.overlay)
        case .fade:
            Color.gray.opacity(0.07).blendMode(.screen)
        default:
            Color.clear
        }
    }

    func apply(to image: CIImage) -> CIImage {
        switch self {
        case .clean:
            return image

        case .chrome:
            return filtered(name: "CIPhotoEffectChrome", image: image) ?? image

        case .mono:
            return filtered(name: "CIPhotoEffectNoir", image: image) ?? image

        case .fade:
            return filtered(name: "CIPhotoEffectFade", image: image) ?? image

        case .warm:
            guard let filter = CIFilter(name: "CITemperatureAndTint") else { return image }
            filter.setValue(image, forKey: kCIInputImageKey)
            filter.setValue(CIVector(x: 6500, y: 0), forKey: "inputNeutral")
            filter.setValue(CIVector(x: 5200, y: 0), forKey: "inputTargetNeutral")
            return filter.outputImage ?? image

        case .cold:
            guard let filter = CIFilter(name: "CITemperatureAndTint") else { return image }
            filter.setValue(image, forKey: kCIInputImageKey)
            filter.setValue(CIVector(x: 6500, y: 0), forKey: "inputNeutral")
            filter.setValue(CIVector(x: 7800, y: 0), forKey: "inputTargetNeutral")
            return filter.outputImage ?? image

        case .film:
            guard let controls = CIFilter(name: "CIColorControls") else { return image }
            controls.setValue(image, forKey: kCIInputImageKey)
            controls.setValue(0.78, forKey: kCIInputSaturationKey)
            controls.setValue(1.10, forKey: kCIInputContrastKey)
            controls.setValue(-0.015, forKey: kCIInputBrightnessKey)
            let base = controls.outputImage ?? image

            guard let vignette = CIFilter(name: "CIVignette") else { return base }
            vignette.setValue(base, forKey: kCIInputImageKey)
            vignette.setValue(0.48, forKey: kCIInputIntensityKey)
            vignette.setValue(1.25, forKey: kCIInputRadiusKey)
            return vignette.outputImage ?? base
        }
    }

    private func filtered(name: String, image: CIImage) -> CIImage? {
        guard let filter = CIFilter(name: name) else { return nil }
        filter.setValue(image, forKey: kCIInputImageKey)
        return filter.outputImage
    }
}
