import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class TokenStore {
  TokenStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const String _sessionTokenKey = 'session_token';

  final FlutterSecureStorage _storage;

  Future<void> writeToken(String token) async {
    await _storage.write(key: _sessionTokenKey, value: token);
  }

  Future<String?> readToken() async {
    return _storage.read(key: _sessionTokenKey);
  }

  Future<void> clear() async {
    await _storage.delete(key: _sessionTokenKey);
  }
}
