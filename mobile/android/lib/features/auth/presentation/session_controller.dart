import 'package:flutter/foundation.dart';

import '../../../core/network/api_exception.dart';
import '../data/auth_repository.dart';
import '../domain/auth_session.dart';

enum SessionStatus { checking, unauthenticated, submitting, authenticated }

class SessionController extends ChangeNotifier {
  SessionController({required AuthRepository authRepository})
      : _authRepository = authRepository;

  final AuthRepository _authRepository;

  SessionStatus _status = SessionStatus.checking;
  AuthSession? _session;
  String? _errorMessage;
  String? _infoMessage;

  SessionStatus get status => _status;
  AuthSession? get session => _session;
  String? get errorMessage => _errorMessage;
  String? get infoMessage => _infoMessage;

  Future<void> bootstrap() async {
    _status = SessionStatus.checking;
    _errorMessage = null;
    _infoMessage = null;
    notifyListeners();

    try {
      _session = await _authRepository.restoreSession();
      _status = _session == null
          ? SessionStatus.unauthenticated
          : SessionStatus.authenticated;
    } catch (_) {
      _session = null;
      _status = SessionStatus.unauthenticated;
    }
    notifyListeners();
  }

  Future<bool> login({required String email, required String password}) async {
    _status = SessionStatus.submitting;
    _errorMessage = null;
    _infoMessage = null;
    notifyListeners();

    try {
      _session = await _authRepository.login(email: email, password: password);
      _status = SessionStatus.authenticated;
      notifyListeners();
      return true;
    } on ApiException catch (error) {
      _session = null;
      _status = SessionStatus.unauthenticated;
      _errorMessage = error.message;
      notifyListeners();
      return false;
    } catch (_) {
      _session = null;
      _status = SessionStatus.unauthenticated;
      _errorMessage = 'Login failed. Please try again.';
      notifyListeners();
      return false;
    }
  }

  Future<bool> signup({
    required String email,
    required String password,
    String username = '',
    String displayName = '',
    String course = '',
    String recoveryEmail = '',
  }) async {
    _status = SessionStatus.submitting;
    _errorMessage = null;
    _infoMessage = null;
    notifyListeners();

    try {
      final result = await _authRepository.signup(
        email: email,
        password: password,
        username: username,
        displayName: displayName,
        course: course,
        recoveryEmail: recoveryEmail,
      );
      _session = null;
      _status = SessionStatus.unauthenticated;
      _infoMessage = result.message;
      notifyListeners();
      return true;
    } on ApiException catch (error) {
      _session = null;
      _status = SessionStatus.unauthenticated;
      _errorMessage = error.message;
      notifyListeners();
      return false;
    } catch (_) {
      _session = null;
      _status = SessionStatus.unauthenticated;
      _errorMessage = 'Sign up failed. Please try again.';
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    _errorMessage = null;
    _infoMessage = null;
    notifyListeners();

    try {
      await _authRepository.logout();
    } finally {
      _session = null;
      _status = SessionStatus.unauthenticated;
      notifyListeners();
    }
  }
}
