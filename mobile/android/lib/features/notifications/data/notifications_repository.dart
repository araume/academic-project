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
}
