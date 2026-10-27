**Title:** [expo-dev-launcher][iOS] Network inspector suppresses `File.upload` progress for `sessionType: 'foreground'` in development builds

### Summary

In a development build with the network inspector on (`DEBUG && EX_DEV_CLIENT_NETWORK_INSPECTOR`, the default), `DevLauncherNetworkInterceptor` swizzles `URLSessionConfiguration.default` to put `ExpoRequestInterceptorProtocol` in front of every request. expo-file-system's foreground session is built from `URLSessionConfiguration.default` (`NetworkTaskSessionManager.createForegroundSession()`), so `File.upload(url, { sessionType: 'foreground' })` requests go through the interceptor. The background session (the default `sessionType`) uses a background configuration and isn't affected.

The interceptor receives upload progress from its inner session, but the forwarding workaround in `ExpoRequestInterceptorProtocol.urlSession(_:task:didSendBodyData:…)` (added for #28269 / #36715) doesn't reach expo-file-system's session delegate (the `NetworkTaskSessionDispatcher`). So `FileSystemUploadTask.emitProgress` never runs, and `onProgress` only receives the synthetic final event that `UploadTask.uploadAsync()` sends after the upload completes.

Development and release builds therefore behave differently for foreground uploads. Progress UI never moves in development builds, and progress-handling bugs only show up in release. We shipped a release-only crash this way (<!-- TODO: link issue 1 once filed -->), and our UI tests on the dev client couldn't catch it.

### Minimal reproducible example

<!-- TODO: replace with the published repo URL -->
https://github.com/<user>/expo-file-system-progress-repro

One screen with two buttons that upload an 8 MB random file to a local server (`npm run server`, which reads the body slowly so iOS reports several progress events), with `sessionType: 'foreground'` or `'background'`. Each `onProgress` call is listed on screen.

### Steps to reproduce

1. `npm install`, then `npm run server` (upload target on `http://localhost:4321`).
2. `npx expo run:ios --configuration Debug` (iOS simulator, dev client, network inspector on by default).
3. Tap "Upload 8 MB (foreground session)": one progress call, after completion, `8388608/8388608` (the synthetic event).
4. Tap "Upload 8 MB (background session, the default)": several native progress events, then the synthetic one.
5. Build Release (`npx expo run:ios --configuration Release`) and tap the foreground button: several native progress events, then the synthetic one.

Results (iOS 26.2 simulator; counts vary per run):

| Build | Session | `onProgress` calls |
|---|---|---|
| Debug (dev client) | foreground | 1 (synthetic only) |
| Debug (dev client) | background | 7 native + 1 synthetic |
| Release | foreground | 9 native + 1 synthetic |
| Debug, inspector compiled out | foreground | 8 native + 1 synthetic |

Traced with lldb in our app, same simulator, network and file. Debug build:

- `ExpoRequestInterceptorProtocol.startLoading()` runs for the upload request
- `ExpoRequestInterceptorProtocol.urlSession(_:task:didSendBodyData:…)` is hit with `336045 / 336045`
- `NetworkTaskSessionDispatcher` / `UploadTaskDelegate` `didSendBodyData` in ExpoFileSystem: 0 hits
- `FileSystemUploadTask.emitProgress`: 0 hits

Release build: `UploadTaskDelegate.urlSession(didSendBodyData:)` → `emitProgress` → `emit(event: "progress")`.

Workaround: compile the inspector out, at the cost of the network tab. This works when the variable is set for a clean prebuild:

```sh
EX_DEV_CLIENT_NETWORK_INSPECTOR=false npx expo prebuild --clean --platform ios
EX_DEV_CLIENT_NETWORK_INSPECTOR=false npx expo run:ios --configuration Debug
```

Toggling it with an in-place `pod install` instead left the project inconsistent: once the dev client crashed at launch (unrecognized selector in `DevMenuPackagerConnectionHandler.setup()`), and once the build failed to link (`_OBJC_CLASS_$_RCTReconnectingWebSocket` undefined) after turning it back on.

A fix could be excluding expo-file-system's sessions from interception, or making the workaround deliver to the original task's session delegate.

### Environment

```
  expo-env-info 2.2.1 environment info:
    System:
      OS: macOS 26.6.2
      Shell: 5.9 - /bin/zsh
    Binaries:
      Node: 24.21.0 - ~/.local/state/fnm_multishells/21335_1792256669523/bin/node
      Yarn: 1.22.22 - ~/.local/state/fnm_multishells/21335_1792256669523/bin/yarn
      npm: 12.1.0 - ~/.local/state/fnm_multishells/21335_1792256669523/bin/npm
      Watchman: 2026.10.12.00 - /opt/homebrew/bin/watchman
    Managers:
      CocoaPods: 1.17.0 - /opt/homebrew/bin/pod
    SDKs:
      iOS SDK:
        Platforms: DriverKit 25.4, iOS 26.4, macOS 26.4, tvOS 26.4, visionOS 26.4, watchOS 26.4
    IDEs:
      Xcode: 26.4/17E192 - /usr/bin/xcodebuild
    npmPackages:
      expo: ~58.0.20 => 58.0.20
      react: 19.3.0 => 19.3.0
      react-native: 0.88.0 => 0.88.0
    Expo Workflow: bare
```

expo-dev-client / expo-dev-launcher 58.0.16, expo-dev-menu 58.0.12, expo-modules-core 58.0.27, expo-file-system 58.0.12. Also reproduced on expo-dev-launcher 58.0.14 / expo-modules-core 58.0.24 / expo-file-system 58.0.10. ("bare" because `ios/` had been prebuilt locally; the repo itself uses CNG and gitignores `ios/`.)

### Expo Doctor Diagnostics

```
Running 20 checks on your project...
20/20 checks passed. No issues detected!
```
