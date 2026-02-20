import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/storage/token_store.dart';
import '../domain/auth_session.dart';

class AuthRepository {
  AuthRepository({
    required ApiClient apiClient,
    required TokenStore tokenStore,
  })  : _apiClient = apiClient,
        _tokenStore = tokenStore;

  final ApiClient _apiClient;
  final TokenStore _tokenStore;

  Future<AuthSession> login({
    required String email,
    required String password,
  }) async {
    final response = await _apiClient.postJson(
      '/api/login',
      authenticated: false,
      body: <String, dynamic>{
        'email': email.trim(),
        'password': password,
      },
    );

    final token = (response.data['token'] as String? ?? '').trim();
    final userJson = response.data['user'];
    if (token.isEmpty || userJson is! Map<String, dynamic>) {
      throw ApiException(
        statusCode: response.statusCode,
        message: 'Login response is missing required session fields.',
      );
    }

    await _tokenStore.writeToken(token);
    return AuthSession.fromUserJson(userJson);
  }

  Future<AuthSession?> restoreSession() async {
    final token = await _tokenStore.readToken();
    if (token == null || token.trim().isEmpty) {
      return null;
    }

    try {
      return await fetchCurrentSession();
    } on UnauthorizedException {
      await _tokenStore.clear();
      return null;
    }
  }

  Future<AuthSession> fetchCurrentSession() async {
    final response = await _apiClient.getJson(
      '/api/auth/session',
      authenticated: true,
    );
    final userJson = response.data['user'];
    if (userJson is! Map<String, dynamic>) {
      throw ApiException(
        statusCode: response.statusCode,
        message: 'Session response is invalid.',
      );
    }
    return AuthSession.fromUserJson(userJson);
  }

  Future<void> logout() async {
    try {
      await _apiClient.postJson(
        '/api/logout',
        authenticated: true,
      );
    } finally {
      await _tokenStore.clear();
    }
  }
}
