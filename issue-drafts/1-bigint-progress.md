**Title:** [expo-file-system][iOS] Upload/download progress values are `bigint` at runtime but typed as `number`

### Summary

Since expo-modules-core 58.0.18 (#51553, "Reduced the overhead of emitting module events"), `Int64` event payloads reach JavaScript as `bigint`. expo-file-system's iOS network tasks emit progress as `Int64` (`FileSystemUploadTask.emitProgress(bytesSent: Int64, totalBytes: Int64)`, and likewise `bytesWritten`/`totalBytes` for downloads), so `onProgress` now receives `bigint` values. The TypeScript types (`UploadProgress`, `DownloadProgress` in `NetworkTasks.types.d.ts`) still declare `number`.

The same callback also gets plain numbers: `UploadTask.uploadAsync()` sends a synthetic final event built from `this._file.size`, which arrives as a `number`. So a single upload reports `bigint` mid-upload and `number` at the end.

Code that treats the values as numbers, as the docs example does, throws once a native event arrives:

```ts
await file.upload(url, {
  onProgress: ({ bytesSent, totalBytes }) => {
    const fraction = bytesSent / totalBytes;   // bigint / bigint → 0n or 1n
    setWidth(`${Math.round(fraction * 100)}%`); // TypeError: Cannot convert 100 to BigInt
  },
});
```

This shipped to our TestFlight users as a crash on every receipt upload after upgrading from SDK 57 to SDK 58 (the release build aborts on the uncaught render error).

Expected: either expo-file-system emits `Double` (byte counts fit easily in 2^53), or the types and docs say `number | bigint` and the synthetic final event uses the same type as native events.

It shows in Release builds with either `sessionType`, and in development builds with the default `sessionType: 'background'`. In development builds with `sessionType: 'foreground'`, native upload progress doesn't reach JS at all (filed separately: <!-- TODO: link issue 2 once filed -->), so only the synthetic `number` event arrives there.

### Minimal reproducible example

https://github.com/harelw/expo-file-system-progress-repro

One screen with two buttons that upload an 8 MB random file to a local server (`npm run server`, which reads the body slowly so iOS reports several progress events), with `sessionType: 'foreground'` or `'background'`. Each `onProgress` call is listed on screen with `typeof bytesSent` and the values. The values are only displayed, so nothing throws.

### Steps to reproduce

1. `npm install`, then `npm run server` (upload target on `http://localhost:4321`).
2. `npx expo run:ios --configuration Release` (iOS simulator).
3. Tap either upload button.
4. The list shows `typeof=bigint` for every native progress event, then one `typeof=number` (the synthetic final event).

Results (iOS 26.2 simulator; counts vary per run):

| Build | Session | `onProgress` calls |
|---|---|---|
| Release | foreground | 9× `bigint` mid-upload, then 1× `number` |
| Release | background | 10× `bigint` mid-upload, then 1× `number` |
| Debug (dev client) | background | 7× `bigint` mid-upload, then 1× `number` |
| Debug (dev client) | foreground | 1× `number` (synthetic only; see the other issue) |

Same results on expo 58.0.17 / expo-modules-core 58.0.24 / expo-file-system 58.0.10. Also traced with lldb on a Release build: `UploadTaskDelegate.urlSession(_:task:didSendBodyData:…)` → `FileSystemUploadTask.emitProgress` → `EventEmitter.emit(event: "progress")`, and the production error was `TypeError: Cannot convert 100 to BigInt`.

Last working: SDK 57 (expo-modules-core 57.0.20), where these values were numbers.

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

expo-file-system 58.0.12, expo-modules-core 58.0.27, expo-modules-jsi 58.0.20, expo-dev-client 58.0.16. ("bare" because `ios/` had been prebuilt locally; the repo itself uses CNG and gitignores `ios/`.)

### Expo Doctor Diagnostics

```
Running 20 checks on your project...
20/20 checks passed. No issues detected!
```
