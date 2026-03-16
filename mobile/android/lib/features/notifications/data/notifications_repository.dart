import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'notifications_models.dart';

class NotificationsRepository {
  NotificationsRepository({required ApiClient apiClient})
      : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<NotificationsPage> fetchNotifications({
    int page = 1,
    int pageSize = 30,
  }) async {
    final response = await _apiClient.getJson(
      '/api/notifications',
      query: <String, String>{'page': '$page', 'pageSize': '$pageSize'},
    );

    final raw = response.data['notifications'];
    final notifications = raw is List
        ? raw
            .whereType<Map<String, dynamic>>()
            .map(AppNotification.fromJson)
            .toList()
        : <AppNotification>[];

    final unreadCount = (response.data['unreadCount'] as num? ?? 0).toInt();

    return NotificationsPage(
      notifications: notifications,
      unreadCount: unreadCount,
    );
  }

  Future<int> markAllRead() async {
    final response = await _apiClient.postJson('/api/notifications/read-all');
    return (response.data['unreadCount'] as num? ?? 0).toInt();
  }

  Future<int> markRead(int id) async {
    if (id <= 0) {
      throw ApiException(statusCode: 400, message: 'Invalid notification id.');
    }
    final response = await _apiClient.postJson('/api/notifications/$id/read');
    return (response.data['unreadCount'] as num? ?? 0).toInt();
  }

  Future<void> registerPushToken({
    required String token,
    String platform = 'android',
    String? deviceId,
  }) async {
    final safeToken = token.trim();
    if (safeToken.isEmpty) return;

    await _apiClient.postJson(
      '/api/notifications/push-token',
      body: <String, dynamic>{
        'token': safeToken,
        'platform': platform.trim().isEmpty ? 'android' : platform.trim(),
        if ((deviceId ?? '').trim().isNotEmpty) 'deviceId': deviceId!.trim(),
      },
    );
  }

  Future<void> unregisterPushToken(String token) async {
    final safeToken = token.trim();
    if (safeToken.isEmpty) return;

    await _apiClient.postJson(
      '/api/notifications/push-token/remove',
      body: <String, dynamic>{'token': safeToken},
    );
  }
}
