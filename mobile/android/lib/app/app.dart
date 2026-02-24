import 'package:flutter/material.dart';

import '../core/ui/app_theme.dart';
import '../core/ui/app_ui.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/session_controller.dart';
import '../features/chat/data/chat_repository.dart';
import '../features/home/data/home_repository.dart';
import '../features/home/presentation/home_shell.dart';
import '../features/library/data/library_repository.dart';
import '../features/notifications/data/notifications_repository.dart';
import '../features/personal/data/personal_repository.dart';

class ThesisLiteApp extends StatefulWidget {
  const ThesisLiteApp({
    super.key,
    required this.sessionController,
    required this.homeRepository,
    required this.libraryRepository,
    required this.notificationsRepository,
    required this.chatRepository,
    required this.personalRepository,
  });

  final SessionController sessionController;
  final HomeRepository homeRepository;
  final LibraryRepository libraryRepository;
  final NotificationsRepository notificationsRepository;
  final ChatRepository chatRepository;
  final PersonalRepository personalRepository;

  @override
  State<ThesisLiteApp> createState() => _ThesisLiteAppState();
}

class _ThesisLiteAppState extends State<ThesisLiteApp> {
  @override
  void initState() {
    super.initState();
    widget.sessionController.bootstrap();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.sessionController,
      builder: (context, _) {
        final status = widget.sessionController.status;

        return MaterialApp(
          title: 'MyBuddy',
          debugShowCheckedModeBanner: false,
          theme: buildAppTheme(),
          home: switch (status) {
            SessionStatus.checking => const _CheckingScreen(),
            SessionStatus.unauthenticated => LoginScreen(
                controller: widget.sessionController,
              ),
            SessionStatus.submitting => LoginScreen(
                controller: widget.sessionController,
                submitting: true,
              ),
            SessionStatus.authenticated => HomeShell(
                controller: widget.sessionController,
                homeRepository: widget.homeRepository,
                libraryRepository: widget.libraryRepository,
                notificationsRepository: widget.notificationsRepository,
                chatRepository: widget.chatRepository,
                personalRepository: widget.personalRepository,
              ),
          },
        );
      },
    );
  }
}

class _CheckingScreen extends StatelessWidget {
  const _CheckingScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: AppPageBackground(
        child: AppLoadingState(label: 'Preparing MyBuddy...'),
      ),
    );
  }
}
