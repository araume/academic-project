import 'package:flutter/material.dart';

import '../../auth/presentation/session_controller.dart';
import '../../chat/data/chat_repository.dart';
import '../../chat/presentation/chat_screen.dart';
import '../../library/data/library_repository.dart';
import '../../library/presentation/library_screen.dart';
import '../../notifications/data/notifications_repository.dart';
import '../../notifications/presentation/notifications_screen.dart';
import '../data/home_repository.dart';
import 'home_feed_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({
    super.key,
    required this.controller,
    required this.homeRepository,
    required this.libraryRepository,
    required this.notificationsRepository,
    required this.chatRepository,
  });

  final SessionController controller;
  final HomeRepository homeRepository;
  final LibraryRepository libraryRepository;
  final NotificationsRepository notificationsRepository;
  final ChatRepository chatRepository;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _selectedIndex = 0;

  late final List<Widget> _tabs = <Widget>[
    HomeFeedScreen(repository: widget.homeRepository),
    LibraryScreen(repository: widget.libraryRepository),
    ChatScreen(repository: widget.chatRepository),
    NotificationsScreen(repository: widget.notificationsRepository),
  ];

  @override
  Widget build(BuildContext context) {
    final titles = <String>['Home', 'Library', 'Chat', 'Notifications'];

    return Scaffold(
      appBar: AppBar(
        title: Text('MyBuddy • ${titles[_selectedIndex]}'),
        actions: [
          IconButton(
            onPressed: widget.controller.logout,
            icon: const Icon(Icons.logout),
            tooltip: 'Logout',
          ),
        ],
      ),
      body: IndexedStack(index: _selectedIndex, children: _tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (index) {
          setState(() {
            _selectedIndex = index;
          });
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.menu_book_outlined),
            selectedIcon: Icon(Icons.menu_book),
            label: 'Library',
          ),
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'Chat',
          ),
          NavigationDestination(
            icon: Icon(Icons.notifications_outlined),
            selectedIcon: Icon(Icons.notifications),
            label: 'Alerts',
          ),
        ],
      ),
    );
  }
}
