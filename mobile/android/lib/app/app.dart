import 'package:flutter/material.dart';

import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/session_controller.dart';
import '../features/home/presentation/home_shell.dart';

class ThesisLiteApp extends StatefulWidget {
  const ThesisLiteApp({
    super.key,
    required this.sessionController,
  });

  final SessionController sessionController;

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
          title: 'Thesis Lite',
          debugShowCheckedModeBanner: false,
          theme: ThemeData(
            colorSchemeSeed: const Color(0xFF0B6E4F),
            brightness: Brightness.light,
          ),
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
      body: Center(
        child: CircularProgressIndicator(),
      ),
    );
  }
}
