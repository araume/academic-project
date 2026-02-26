import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/storage/token_store.dart';
import '../domain/auth_session.dart';

class SignupResult {
  SignupResult({
    required this.message,
    required this.requiresVerification,
    required this.emailSent,
  });

  final String message;
  final bool requiresVerification;
  final bool emailSent;
}

class AuthRepository {
  AuthRepository({required ApiClient apiClient, required TokenStore tokenStore})
      : _apiClient = apiClient,
        _tokenStore = tokenStore;

  final ApiClient _apiClient;
  final TokenStore _tokenStore;

  Future<SignupResult> signup({
    required String email,
    required String password,
    String username = '',
    String displayName = '',
    String course = '',
    String recoveryEmail = '',
  }) async {
    final response = await _apiClient.postJson(
      '/api/signup',
      authenticated: false,
      body: <String, dynamic>{
        'email': email.trim(),
        'password': password,
        if (username.trim().isNotEmpty) 'username': username.trim(),
        if (displayName.trim().isNotEmpty) 'displayName': displayName.trim(),
        if (course.trim().isNotEmpty) 'course': course.trim(),
        if (recoveryEmail.trim().isNotEmpty)
          'recoveryEmail': recoveryEmail.trim(),
      },
    );

    return SignupResult(
      message:
          (response.data['message'] as String? ?? 'Account created.').trim(),
      requiresVerification: response.data['requiresVerification'] == true,
      emailSent: response.data['emailSent'] == true,
    );
  }

  Future<AuthSession> login({
    required String email,
    required String password,
  }) async {
    final response = await _apiClient.postJson(
      '/api/login',
      authenticated: false,
      body: <String, dynamic>{'email': email.trim(), 'password': password},
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
      await _apiClient.postJson('/api/logout', authenticated: true);
    } finally {
      await _tokenStore.clear();
    }
  }
}
