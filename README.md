# Tactile Camera

Native iPhone camera built in SwiftUI + AVFoundation.

This repository was fully repurposed from the previous news prototype. The new app is an original tactile camera concept inspired by physical-camera interaction: large controls, rotary dials, haptics, synthesized clicks, filters, manual controls and motion-reactive lighting.

It is not affiliated with or a copy of proprietary source code/assets from !Camera / Not Boring Software.

## Included

- Native live camera preview
- Rear lens switching + selfie camera
- Flash control
- Large tactile shutter
- Haptic ticks, clunks and shutter feedback
- Procedurally generated click / shutter sounds (no audio assets)
- Motion-reactive 3D dial lighting using Core Motion
- Exposure compensation dial
- Filter/style dial: Clean, Film, Chrome, Mono, Warm, Cold, Fade
- Filter applied to saved photos
- Optional grid
- Tap to focus
- Auto / Pro mode
- Manual shutter speed, ISO, white balance and focus controls
- Save processed photo, optionally save the original too
- Recent capture thumbnail
- Privacy-first: no analytics or network requests

## Run on iPhone

1. Open `TactileCamera.xcodeproj` in Xcode on a Mac.
2. Select the `TactileCamera` target.
3. In **Signing & Capabilities**, choose your Apple Developer team.
4. Connect your iPhone and select it as the run destination.
5. Press **Run**.

The first launch asks for Camera and Photos permission.

Minimum target: iOS 17.

## Notes

Real iPhone haptics and low-level camera controls require a native iOS app; a GitHub Pages/PWA version cannot provide the same experience. The project therefore no longer deploys a website.
