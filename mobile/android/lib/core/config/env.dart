class Env {
  // Android emulator default for local backend.
  static const String _rawApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  static const bool _isReleaseMode = bool.fromEnvironment('dart.vm.product');

  static String get apiBaseUrl {
    final value = _rawApiBaseUrl.trim();
    if (value.isEmpty) {
      throw StateError('API_BASE_URL must not be empty.');
    }

    if (_isReleaseMode) {
      if (value.contains('10.0.2.2') || value.contains('localhost')) {
        throw StateError(
          'Release build cannot use local API_BASE_URL. Set a production URL.',
        );
      }
      if (!value.startsWith('https://')) {
        throw StateError('Release API_BASE_URL must use HTTPS.');
      }
    }

    return value;
  }
}
