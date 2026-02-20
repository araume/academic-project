import 'package:flutter/material.dart';

import '../../auth/presentation/session_controller.dart';

class HomeShell extends StatelessWidget {
  const HomeShell({
    super.key,
    required this.controller,
  });

  final SessionController controller;

  @override
  Widget build(BuildContext context) {
    final session = controller.session;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Thesis Lite'),
        actions: [
          IconButton(
            onPressed: controller.logout,
            icon: const Icon(Icons.logout),
            tooltip: 'Logout',
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Signed in',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            Text('UID: ${session?.uid ?? '-'}'),
            Text('Email: ${session?.email ?? '-'}'),
            Text('Display Name: ${session?.displayName ?? '-'}'),
            Text('Course: ${session?.course ?? '-'}'),
            const SizedBox(height: 20),
            const Text(
              'Part 1 complete: auth session foundation is active.\n'
              'Part 2 will add feed/library/chat UI modules.',
            ),
          ],
        ),
      ),
    );
  }
}
