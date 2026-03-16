# Mobile Production Checklist (Android)

Use this checklist before shipping a release candidate.

## 1. Platform/Build

- [ ] Ensure native scaffolding exists in `mobile/android/android/`.
- [ ] Configure Android signing:
  - [ ] Run `./scripts/setup_signing.sh` (or copy `android/key.properties.example` manually)
  - [ ] Set `storeFile`, `storePassword`, `keyAlias`, `keyPassword`
  - [ ] Ensure referenced keystore file exists locally
- [ ] Verify `applicationId`, version name/code, and release notes are correct.
- [ ] Build and install release APK/AAB:
  - `./scripts/build_release.sh https://<prod-api> appbundle`
  - `./scripts/build_release.sh https://<prod-api> apk`

## 2. Environment/Security

- [ ] Set `API_BASE_URL` to production HTTPS endpoint.
- [ ] Confirm release build does not use localhost or emulator endpoints.
- [ ] Confirm release manifest enforces `android:usesCleartextTraffic="false"` and debug-only cleartext is limited to local development.
- [ ] Verify auth token lifecycle (login/restore/logout) with real backend.
- [ ] Verify attachment upload policy: image/video only (`jpg`, `jpeg`, `png`, `webp`, `heic`, `heif`, `mp4`, `mov`, `webm`, `mkv`) and <= 25MB.

## 3. Quality Gates

- [ ] `flutter pub get`
- [ ] `flutter analyze` (zero issues)
- [ ] `flutter test` (all passing)
- [ ] Manual smoke tests on physical Android device:
  - [ ] Login/logout
  - [ ] Home feed load/create/like/comment
  - [ ] Library search/sort/like/comment
  - [ ] Notifications mark single/all read
  - [ ] Chat send/reply/report/typing
  - [ ] Chat attachment send + open
  - [ ] Chat emoji quick insert

## 4. Reliability/Operations

- [ ] CI workflow passes (`.github/workflows/mobile-ci.yml`).
- [ ] Crash reporting and monitoring integrated for release builds.
- [ ] Operational rollback plan defined (previous app version + backend compatibility).

## 5. Release Readiness

- [ ] Privacy policy / terms URLs configured in Play Console.
- [ ] Store listing, screenshots, and data safety completed.
- [ ] Final release candidate approved after QA sign-off.
