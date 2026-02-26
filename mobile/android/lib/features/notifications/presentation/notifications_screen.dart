import 'package:flutter/material.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/ui/app_theme.dart';
import '../../../core/ui/app_ui.dart';
import '../data/notifications_models.dart';
import '../data/notifications_repository.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key, required this.repository});

  final NotificationsRepository repository;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  static const int _pageSize = 30;

  final ScrollController _scrollController = ScrollController();

  bool _loading = true;
  bool _loadingMore = false;
  bool _markingAll = false;
  bool _hasMore = true;
  String? _error;
  int _unreadCount = 0;
  int _page = 1;
  List<AppNotification> _notifications = <AppNotification>[];

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _load(refresh: true);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients ||
        _loading ||
        _loadingMore ||
        !_hasMore) {
      return;
    }
    final max = _scrollController.position.maxScrollExtent;
    final current = _scrollController.offset;
    if (max - current < 260) {
      _load();
    }
  }

  Future<void> _load({bool refresh = false}) async {
    if (_loadingMore || (!refresh && !_hasMore)) return;

    if (refresh) {
      setState(() {
        _loading = true;
        _error = null;
        _hasMore = true;
        _page = 1;
      });
    } else {
      setState(() {
        _loadingMore = true;
      });
    }

    try {
      final nextPage = refresh ? 1 : _page;
      final page = await widget.repository.fetchNotifications(
        page: nextPage,
        pageSize: _pageSize,
      );
      if (!mounted) return;

      setState(() {
        _unreadCount = page.unreadCount;
        if (refresh) {
          _notifications = page.notifications;
        } else {
          final merged = <int, AppNotification>{
            for (final item in _notifications) item.id: item,
            for (final item in page.notifications) item.id: item,
          };
          _notifications = merged.values.toList();
        }
        _hasMore = page.notifications.length >= _pageSize;
        _page = nextPage + 1;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      if (refresh) {
        setState(() {
          _error = error.message;
        });
      } else {
        showAppSnackBar(context, error.message, isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      if (refresh) {
        setState(() {
          _error = 'Failed to load notifications.';
        });
      } else {
        showAppSnackBar(context, 'Unable to load more notifications.',
            isError: true);
      }
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  Future<void> _markAllRead() async {
    if (_markingAll || _unreadCount <= 0) return;

    setState(() {
      _markingAll = true;
    });

    try {
      final unreadCount = await widget.repository.markAllRead();
      if (!mounted) return;
      setState(() {
        _unreadCount = unreadCount;
        _notifications = _notifications
            .map(
              (item) => AppNotification(
                id: item.id,
                type: item.type,
                message: item.message,
                isRead: true,
                createdAt: item.createdAt,
                actorName: item.actorName,
              ),
            )
            .toList();
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      showAppSnackBar(context, error.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(context, 'Failed to mark notifications as read.',
          isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _markingAll = false;
        });
      }
    }
  }

  Future<void> _markRead(AppNotification notification) async {
    if (notification.isRead) return;

    final index =
        _notifications.indexWhere((item) => item.id == notification.id);
    if (index < 0) return;

    setState(() {
      _notifications[index] = AppNotification(
        id: notification.id,
        type: notification.type,
        message: notification.message,
        isRead: true,
        createdAt: notification.createdAt,
        actorName: notification.actorName,
      );
      _unreadCount = _unreadCount > 0 ? _unreadCount - 1 : 0;
    });

    try {
      final unreadCount = await widget.repository.markRead(notification.id);
      if (!mounted) return;
      setState(() {
        _unreadCount = unreadCount;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _notifications[index] = notification;
        _unreadCount = _unreadCount + 1;
      });
      showAppSnackBar(context, 'Failed to mark notification as read.',
          isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
          child: AppSectionCard(
            child: Row(
              children: [
                Text(
                  'Unread: $_unreadCount',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
                const Spacer(),
                TextButton.icon(
                  onPressed:
                      (_markingAll || _unreadCount == 0) ? null : _markAllRead,
                  icon: _markingAll
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.done_all),
                  label: const Text('Mark all read'),
                ),
                IconButton(
                  onPressed: () => _load(refresh: true),
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh',
                ),
              ],
            ),
          ),
        ),
        Expanded(child: _buildBody()),
      ],
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const AppLoadingState(label: 'Loading notifications...');
    }

    if (_error != null) {
      return AppErrorState(
          message: _error!, onRetry: () => _load(refresh: true));
    }

    if (_notifications.isEmpty) {
      return const AppEmptyState(
        message: 'No notifications yet.',
        icon: Icons.notifications_none,
      );
    }

    return RefreshIndicator(
      onRefresh: () => _load(refresh: true),
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
        itemCount: _notifications.length + 1,
        itemBuilder: (context, index) {
          if (index == _notifications.length) {
            return buildLoadMoreIndicator(_loadingMore);
          }

          final item = _notifications[index];

          return AppSectionCard(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              onTap: () => _markRead(item),
              contentPadding: EdgeInsets.zero,
              leading: CircleAvatar(
                backgroundColor: item.isRead
                    ? const Color(0xFFEAE6E1)
                    : Theme.of(context).colorScheme.primary.withValues(alpha: 0.18),
                child: Icon(_iconForType(item.type), color: AppPalette.ink),
              ),
              title: Text(
                item.message.isEmpty ? 'Notification' : item.message,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontWeight:
                          item.isRead ? FontWeight.w500 : FontWeight.w700,
                    ),
              ),
              subtitle: Text(
                '${item.actorName} • ${_formatDate(item.createdAt)}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppPalette.inkSoft,
                    ),
              ),
              trailing: item.isRead
                  ? const Icon(Icons.done, size: 18)
                  : const Icon(Icons.mark_email_unread_outlined, size: 18),
            ),
          );
        },
      ),
    );
  }

  IconData _iconForType(String type) {
    if (type.contains('comment')) return Icons.comment_outlined;
    if (type.contains('like')) return Icons.favorite_border;
    if (type.contains('follow')) return Icons.person_add_alt;
    if (type.contains('chat')) return Icons.chat_bubble_outline;
    return Icons.notifications_none;
  }
}

String _formatDate(DateTime? value) {
  if (value == null) return 'Now';
  final local = value.toLocal();
  final date =
      '${local.year.toString().padLeft(4, '0')}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
  final time =
      '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  return '$date $time';
}
