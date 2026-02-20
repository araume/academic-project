# Thesis Lite Mobile (Android-first)

This directory contains Part 1 mobile foundation code (app architecture + auth contract integration).

## Prerequisites

- Flutter SDK installed locally
- Android SDK / emulator configured

## Initialize platform scaffolding

From this directory, run:

```bash
flutter create . --platforms=android
```

This generates the native Android project files while preserving the app code already committed here.

## Run

```bash
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

Use `10.0.2.2` for Android emulator to reach a local backend running on your machine.

## Auth contract used by mobile

- `POST /api/login` -> expects `token` in response
- `GET /api/auth/session` -> validates current token
- `POST /api/logout` -> revokes current token/cookie

Bearer token is sent as:

`Authorization: Bearer <session_token>`
