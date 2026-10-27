# expo-file-system `File.upload` progress repro (iOS, SDK 58)

Minimal app for two iOS issues with `File.upload()`'s `onProgress`:

1. **Progress values are `bigint` at runtime but typed `number`.** Native progress
   events arrive as `bigint` (expo-modules-core 58.0.18+, expo/expo#51553 maps
   `Int64` event payloads to `bigint`). `UploadTask.uploadAsync()` then sends a
   synthetic final event built from `file.size`, which is a `number`. One upload
   reports both types, and `bytesSent / totalBytes * 100` throws
   `TypeError: Cannot convert 100 to BigInt`. Filed as
   [expo/expo#52411](https://github.com/expo/expo/issues/52411).
2. **Development builds lose upload progress for the foreground session.** The
   dev client's network inspector (`EX_DEV_CLIENT_NETWORK_INSPECTOR`, on by
   default) adds `ExpoRequestInterceptorProtocol` to `URLSessionConfiguration.default`.
   expo-file-system's foreground session is built from that configuration, and
   native upload progress never reaches its delegate, so `onProgress` only gets
   the synthetic final event. The background session (the default
   `sessionType`) isn't affected. Filed as
   [expo/expo#52412](https://github.com/expo/expo/issues/52412).

The screen has two buttons: upload an 8 MB random file with
`sessionType: 'foreground'` or `'background'`. It lists every `onProgress`
call with `typeof bytesSent` and the values, on screen, since release builds
don't log `console.log`. No arithmetic is done on the values, so nothing throws.

## Run

```sh
npm install
npm run server            # upload target: http://localhost:4321, reads the body slowly
                          # so iOS reports several progress events over localhost
```

iOS simulator (the app uploads to `localhost:4321`; on a device, change
`UPLOAD_URL` in `App.tsx` to the Mac's LAN address):

```sh
# Development build (dev client, network inspector on)
npx expo run:ios --configuration Debug

# Release build
npx expo run:ios --configuration Release
```

Tap each upload button. Or with [Maestro](https://maestro.mobile.dev), which
saves a screenshot of the result:

```sh
maestro test -e SESSION=foreground .maestro/upload-debug.yaml    # Debug: Metro on port 8082
maestro test -e SESSION=background .maestro/upload-release.yaml  # Release
```

(`upload-debug.yaml` opens the dev client against Metro on port 8082; start
it with `npx expo run:ios --configuration Debug --port 8082`, or edit the URL.)

## Results

iOS 26.2 simulator, Xcode 26.4, react-native 0.88.0. Counts vary run to run;
the types and the pattern don't.

expo 58.0.20, expo-modules-core 58.0.27, expo-file-system 58.0.12,
expo-dev-client 58.0.16 (this repo; `expo-doctor` passes):

| Build | Session | `onProgress` calls |
|---|---|---|
| Debug (dev client) | foreground | 1: `number` 8388608/8388608 (synthetic only) |
| Debug (dev client) | background | 7× `bigint` mid-upload, then 1× `number` |
| Release | foreground | 9× `bigint` mid-upload, then 1× `number` |
| Release | background | 10× `bigint` mid-upload, then 1× `number` |

The same on expo 58.0.17, expo-modules-core 58.0.24, expo-file-system 58.0.10,
expo-dev-client 58.0.14 (commit `6595603`). Debug foreground: 1 `number`.
Debug background: 12 `bigint` + 1 `number`. Release foreground: 8 + 1.
Release background: 11 + 1.

With the network inspector compiled out, a Debug build behaves like Release
(foreground: 8× `bigint`, then 1× `number`). Set it before a clean prebuild;
toggling it with an in-place `pod install` left an inconsistent build (a link
error, or a launch crash in `DevMenuPackagerConnectionHandler.setup()`):

```sh
EX_DEV_CLIENT_NETWORK_INSPECTOR=false npx expo prebuild --clean --platform ios
EX_DEV_CLIENT_NETWORK_INSPECTOR=false npx expo run:ios --configuration Debug
```

Expected: `number` throughout, as typed and as on SDK 57, and native
progress in development builds too.
