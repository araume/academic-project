import 'package:flutter/material.dart';

import 'app/app.dart';
import 'core/config/env.dart';
import 'core/network/api_client.dart';
import 'core/notifications/push_notifications_service.dart';
import 'core/storage/token_store.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/auth/presentation/session_controller.dart';
import 'features/chat/data/chat_repository.dart';
import 'features/home/data/home_repository.dart';
import 'features/library/data/library_repository.dart';
import 'features/notifications/data/notifications_repository.dart';
import 'features/personal/data/personal_repository.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  final String apiBaseUrl;
  try {
    apiBaseUrl = Env.apiBaseUrl;
  } catch (error) {
    runApp(
      _BootErrorApp(
        message: 'Startup configuration error.\n$error',
      ),
    );
    return;
  }

  final tokenStore = TokenStore();
  final apiClient = ApiClient(baseUrl: apiBaseUrl, tokenStore: tokenStore);

  final authRepository = AuthRepository(
    apiClient: apiClient,
    tokenStore: tokenStore,
  );
  final sessionController = SessionController(authRepository: authRepository);

  final homeRepository = HomeRepository(apiClient: apiClient);
  final libraryRepository = LibraryRepository(apiClient: apiClient);
  final notificationsRepository = NotificationsRepository(apiClient: apiClient);
  final chatRepository = ChatRepository(apiClient: apiClient);
  final personalRepository = PersonalRepository(apiClient: apiClient);
  final pushNotificationsService = PushNotificationsService(
    repository: notificationsRepository,
  );

  runApp(
    ThesisLiteApp(
      sessionController: sessionController,
      homeRepository: homeRepository,
      libraryRepository: libraryRepository,
      notificationsRepository: notificationsRepository,
      chatRepository: chatRepository,
      personalRepository: personalRepository,
      pushNotificationsService: pushNotificationsService,
    ),
  );
}

class _BootErrorApp extends StatelessWidget {
  const _BootErrorApp({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Center(
              child: Text(message),
            ),
          ),
        ),
      ),
    );
  }
}
