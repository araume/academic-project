import 'package:flutter/material.dart';

import 'app/app.dart';
import 'core/config/env.dart';
import 'core/network/api_client.dart';
import 'core/storage/token_store.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/auth/presentation/session_controller.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  final tokenStore = TokenStore();
  final apiClient = ApiClient(
    baseUrl: Env.apiBaseUrl,
    tokenStore: tokenStore,
  );
  final authRepository = AuthRepository(
    apiClient: apiClient,
    tokenStore: tokenStore,
  );
  final sessionController = SessionController(authRepository: authRepository);

  runApp(
    ThesisLiteApp(sessionController: sessionController),
  );
}
