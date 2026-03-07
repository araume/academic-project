class AppNotification {
  AppNotification({
    required this.id,
    required this.type,
    required this.message,
    required this.isRead,
    required this.createdAt,
    required this.actorName,
    this.entityType,
    this.entityId,
    this.targetUrl,
  });

  final int id;
  final String type;
  final String message;
  final bool isRead;
  final DateTime? createdAt;
  final String actorName;
  final String? entityType;
  final String? entityId;
  final String? targetUrl;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final actor =
        (json['actor'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
    return AppNotification(
      id: (json['id'] as num? ?? 0).toInt(),
      type: (json['type'] as String? ?? '').trim(),
      entityType: (json['entityType'] as String?)?.trim(),
      entityId: (json['entityId'] as String?)?.trim(),
      targetUrl: (json['targetUrl'] as String?)?.trim(),
      message: (json['message'] as String? ?? '').trim(),
      isRead: json['isRead'] == true,
      createdAt: _parseDate(json['createdAt']),
      actorName: (actor['displayName'] as String? ?? 'Someone').trim(),
    );
  }
}

class NotificationsPage {
  NotificationsPage({required this.notifications, required this.unreadCount});

  final List<AppNotification> notifications;
  final int unreadCount;
}

DateTime? _parseDate(Object? value) {
  final text = value is String ? value.trim() : '';
  if (text.isEmpty) return null;
  return DateTime.tryParse(text);
}
