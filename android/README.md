# Chronexa for Android

Android 8.0+ app using the same Chronexa account and server as desktop. Employees can track general work or assigned tasks, read task details/resources/comments, post comments, submit work, inspect daily activity, and resume explicitly after an interruption. Admins can inspect department profiles, monthly/weekly ranking, daily sessions, seven-day activity, monthly goal calendars, screenshots, recordings and team/individual configuration.

Screen capture uses Android's MediaProjection consent dialog and a visible foreground service notification. The employee approves screen sharing for each tracking run; capture then follows their effective screenshot/recording policy. Screenshots are JPEG; recordings are H.264 MP4, split into bounded segments. Locking the phone or stopping projection pauses tracking. Unlocking shows a resume reminder; it never starts time tracking automatically. Android does not expose other apps' mouse/keyboard activity, so desktop input-idle detection is replaced with screen-lock/projection lifecycle handling. Protected screens may appear blank under Android's security rules.

The optional floating timer requires the system's display-over-other-apps permission. Drag its time label, use +/- to resize, or close it and re-enable it in Settings. Disabling Android notifications can prevent resume reminders from being displayed.

Time checkpoints, account tokens and session outbox use Android Keystore encryption. Captures remain in private app storage until upload. Pending sessions/captures survive restarts; sign-out is blocked until the queue has synced. A killed process is closed at its saved checkpoint rather than crediting the time it was not running. Android handles APK installation confirmation; the app verifies the published SHA-256 before opening the installer.

## Build and release

Use JDK 17, Gradle 8.13, Android SDK 35 and build-tools 35.0.0.

```sh
npm ci --prefix desktop
node desktop/node_modules/vite/bin/vite.js build --config android-web/vite.config.mjs
cd android
gradle assembleRelease lintRelease connectedDebugAndroidTest
```

GitHub Actions builds an unsigned release APK and exercises projection capture, recording, lock pause and offline/crash recovery on an Android 15 emulator. Release signing stays on the maintainer's local machine; private signing keys are never committed or uploaded to CI. Preserve the original keystore securely: Android requires the same signing identity for future updates. Sign the unsigned APK with `apksigner`, verify its certificate and v2 signature, and publish `Chronexa.Android.VERSION.apk`, `android-update.json`, and `ANDROID-SHA256SUMS.txt` alongside the Windows installer. Publish the draft only after both platforms' assets have been checked. The server reads Android update metadata from GitHub, so no per-release Vercel environment edit is needed.
