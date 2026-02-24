import 'package:flutter/material.dart';

import '../../../core/ui/app_theme.dart';
import '../../../core/ui/app_ui.dart';
import '../../auth/presentation/session_controller.dart';
import '../../chat/data/chat_repository.dart';
import '../../chat/presentation/chat_screen.dart';
import '../../library/data/library_repository.dart';
import '../../library/presentation/library_screen.dart';
import '../../notifications/data/notifications_repository.dart';
import '../../notifications/presentation/notifications_screen.dart';
import '../../personal/data/personal_repository.dart';
import '../../personal/presentation/personal_screen.dart';
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
    required this.personalRepository,
  });

  final SessionController controller;
  final HomeRepository homeRepository;
  final LibraryRepository libraryRepository;
  final NotificationsRepository notificationsRepository;
  final ChatRepository chatRepository;
  final PersonalRepository personalRepository;

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
    PersonalScreen(repository: widget.personalRepository),
  ];

  @override
  Widget build(BuildContext context) {
    final titles = <String>[
      'Home',
      'Library',
      'Chat',
      'Notifications',
      'Personal',
    ];
    final subtitles = <String>[
      'Community feed',
      'Open library',
      'Conversations',
      'Activity updates',
      'Your space',
    ];

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'MyBuddy • ${titles[_selectedIndex]}',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
            Text(
              subtitles[_selectedIndex],
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppPalette.inkSoft,
                  ),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Tooltip(
              message: 'Logout',
              child: InkWell(
                borderRadius: BorderRadius.circular(999),
                onTap: widget.controller.logout,
                child: Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [AppPalette.primary, AppPalette.accent],
                    ),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: AppPalette.outline),
                  ),
                  child: const Icon(Icons.logout, size: 20, color: Colors.white),
                ),
              ),
            ),
          ),
        ],
      ),
      extendBody: true,
      body: AppPageBackground(
        child: IndexedStack(index: _selectedIndex, children: _tabs),
      ),
      bottomNavigationBar: Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            boxShadow: const [
              BoxShadow(
                color: Color(0x17042A47),
                blurRadius: 18,
                offset: Offset(0, 8),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: NavigationBar(
              height: 68,
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
                NavigationDestination(
                  icon: Icon(Icons.person_outline),
                  selectedIcon: Icon(Icons.person),
                  label: 'Personal',
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
