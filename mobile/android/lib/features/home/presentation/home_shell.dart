import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/env.dart';
import '../../../core/ui/app_theme.dart';
import '../../../core/ui/app_ui.dart';
import '../../../core/notifications/push_notifications_service.dart';
import '../../auth/presentation/session_controller.dart';
import '../../chat/data/chat_repository.dart';
import '../../chat/presentation/chat_screen.dart';
import '../../library/data/library_repository.dart';
import '../../library/presentation/library_screen.dart';
import '../../notifications/data/notifications_models.dart';
import '../../notifications/data/notifications_repository.dart';
import '../../notifications/presentation/notifications_screen.dart';
import '../../personal/data/personal_repository.dart';
import '../../personal/presentation/personal_screen.dart';
import '../../preferences/data/preferences_repository.dart';
import '../../preferences/presentation/preferences_screen.dart';
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
    required this.preferencesRepository,
    required this.pushNotificationsService,
  });

  final SessionController controller;
  final HomeRepository homeRepository;
  final LibraryRepository libraryRepository;
  final NotificationsRepository notificationsRepository;
  final ChatRepository chatRepository;
  final PersonalRepository personalRepository;
  final PreferencesRepository preferencesRepository;
  final PushNotificationsService pushNotificationsService;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _selectedIndex = 0;

  late final List<Widget> _tabs = <Widget>[
    HomeFeedScreen(repository: widget.homeRepository),
    LibraryScreen(repository: widget.libraryRepository),
    ChatScreen(repository: widget.chatRepository),
    NotificationsScreen(
      repository: widget.notificationsRepository,
      onOpenSource: _openNotificationSource,
    ),
    PersonalScreen(
      repository: widget.personalRepository,
      pushNotificationsService: widget.pushNotificationsService,
    ),
  ];

  Future<void> _openNotificationSource(AppNotification notification) async {
    final destinationIndex = _resolveNotificationTabIndex(notification);
    if (destinationIndex != null) {
      if (_selectedIndex != destinationIndex) {
        setState(() {
          _selectedIndex = destinationIndex;
        });
      }
      return;
    }

    final externalUri = _resolveExternalUri(notification);
    if (externalUri != null) {
      final opened =
          await launchUrl(externalUri, mode: LaunchMode.externalApplication);
      if (!opened && mounted) {
        showAppSnackBar(
          context,
          'Could not open the source of this notification.',
          isError: true,
        );
      }
      return;
    }

    if (!mounted) return;
    showAppSnackBar(
      context,
      'No source target is available for this notification.',
      isError: true,
    );
  }

  int? _resolveNotificationTabIndex(AppNotification notification) {
    final entityType = (notification.entityType ?? '').trim().toLowerCase();
    if (entityType == 'post') return 0;
    if (entityType == 'document') return 1;
    if (entityType == 'conversation' ||
        entityType == 'chat' ||
        entityType == 'thread') {
      return 2;
    }
    if (entityType == 'profile' || entityType == 'user') {
      return 4;
    }

    final targetUrl = (notification.targetUrl ?? '').trim().toLowerCase();
    if (targetUrl.contains('/posts/') || targetUrl.startsWith('/home')) {
      return 0;
    }
    if (targetUrl.contains('/open-library') ||
        targetUrl.startsWith('/library')) {
      return 1;
    }
    if (targetUrl.contains('/connections') || targetUrl.startsWith('/chat')) {
      return 2;
    }
    if (targetUrl.contains('/profile') || targetUrl.startsWith('/personal')) {
      return 4;
    }

    final type = notification.type.trim().toLowerCase();
    if (type.contains('post')) return 0;
    if (type.contains('document')) return 1;
    if (type.contains('chat')) return 2;
    return null;
  }

  Uri? _resolveExternalUri(AppNotification notification) {
    final target = (notification.targetUrl ?? '').trim();
    if (target.isEmpty) return null;

    final parsedTarget = Uri.tryParse(target);
    if (parsedTarget == null) return null;
    if (parsedTarget.hasScheme) return parsedTarget;

    final base = Uri.parse(Env.apiBaseUrl);
    final baseSegments =
        base.pathSegments.where((segment) => segment.isNotEmpty).toList();
    if (baseSegments.isNotEmpty && baseSegments.last.toLowerCase() == 'api') {
      baseSegments.removeLast();
    }

    final mergedSegments = <String>[
      ...baseSegments,
      ...parsedTarget.pathSegments.where((segment) => segment.isNotEmpty),
    ];

    return base.replace(
      pathSegments: mergedSegments,
      query: parsedTarget.hasQuery ? parsedTarget.query : null,
      fragment: parsedTarget.hasFragment ? parsedTarget.fragment : null,
    );
  }

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
            padding: const EdgeInsets.only(right: 8),
            child: Tooltip(
              message: 'Preferences',
              child: InkWell(
                borderRadius: BorderRadius.circular(999),
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => PreferencesScreen(
                        repository: widget.preferencesRepository,
                      ),
                    ),
                  );
                },
                child: Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: AppPalette.outline),
                  ),
                  child: const Icon(
                    Icons.tune_rounded,
                    size: 20,
                    color: AppPalette.primary,
                  ),
                ),
              ),
            ),
          ),
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
                  child:
                      const Icon(Icons.logout, size: 20, color: Colors.white),
                ),
              ),
            ),
          ),
        ],
      ),
      extendBody: false,
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
