# Thesis Lite Mobile (Android-first)

This directory contains the Android-first Flutter mobile port in 3 parts:

- Part 1: app foundation + auth contract integration
- Part 2: lite tabs for Home, Library, Chat, and Notifications
- Part 3: chat workflow hardening (reply/report/typing + attachments + quick emoji)

## Prerequisites

- Flutter SDK installed locally
- Android SDK / emulator configured

## Native Android scaffolding

Native Android project files are now committed in `mobile/android/android/`.

## Run

```bash
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

Use `10.0.2.2` for Android emulator to reach a local backend running on your machine.
Debug builds allow HTTP for local development; release builds enforce HTTPS only.

## Release build

1. Generate signing config (recommended):
```bash
./scripts/setup_signing.sh
```
Non-interactive mode:
```bash
STORE_PASSWORD='***' KEY_PASSWORD='***' ./scripts/setup_signing.sh
```
Or copy and fill manually:
```bash
cp android/key.properties.example android/key.properties
```
2. Build signed release artifacts (validates HTTPS API URL + signing setup):
```bash
./scripts/build_release.sh https://api.example.com appbundle
```
Options: `appbundle`, `apk`, or `both`.

## Auth contract used by mobile

- `POST /api/login` -> expects `token` in response
- `GET /api/auth/session` -> validates current token
- `POST /api/logout` -> revokes current token/cookie

Bearer token is sent as:

`Authorization: Bearer <session_token>`

## Current mobile scope

- Login/logout session handling
- Home posts list with create/like/comments
- Library documents list with search/sort/like/comments
- Notifications list with mark-read actions
- Chat conversations + message thread
- Chat reply target, message reporting, typing indicator, media attachments, and quick emoji insert
- Attachment policy enforced client-side: image/video only (`jpg`, `jpeg`, `png`, `webp`, `heic`, `heif`, `mp4`, `mov`, `webm`, `mkv`) with a 25MB max file size

## CI

GitHub Actions workflow: `.github/workflows/mobile-ci.yml`

- Runs `flutter analyze` and `flutter test` on changes under `mobile/android`.

## Production checklist

Before shipping a release, follow:

- `mobile/android/PRODUCTION_CHECKLIST.md`
