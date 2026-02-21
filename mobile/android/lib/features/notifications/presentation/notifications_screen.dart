import 'package:flutter/material.dart';

import '../../../core/network/api_exception.dart';
import '../data/notifications_models.dart';
import '../data/notifications_repository.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key, required this.repository});

  final NotificationsRepository repository;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  bool _loading = true;
  bool _markingAll = false;
  String? _error;
  int _unreadCount = 0;
  List<AppNotification> _notifications = <AppNotification>[];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final page = await widget.repository.fetchNotifications();
      if (!mounted) return;
      setState(() {
        _notifications = page.notifications;
        _unreadCount = page.unreadCount;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Failed to load notifications.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
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
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to mark notifications as read.')),
      );
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

    final index = _notifications.indexWhere(
      (item) => item.id == notification.id,
    );
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
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to mark notification as read.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: Row(
            children: [
              Text('Unread: $_unreadCount'),
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
                onPressed: _load,
                icon: const Icon(Icons.refresh),
                tooltip: 'Refresh',
              ),
            ],
          ),
        ),
        Expanded(child: _buildBody()),
      ],
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!),
              const SizedBox(height: 10),
              ElevatedButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    if (_notifications.isEmpty) {
      return const Center(child: Text('No notifications yet.'));
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
        itemCount: _notifications.length,
        itemBuilder: (context, index) {
          final item = _notifications[index];

          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            color: item.isRead
                ? null
                : Theme.of(context).colorScheme.primaryContainer,
            child: ListTile(
              onTap: () => _markRead(item),
              leading: Icon(_iconForType(item.type)),
              title: Text(item.message.isEmpty ? 'Notification' : item.message),
              subtitle: Text(
                '${item.actorName} • ${_formatDate(item.createdAt)}',
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
