import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'chat_models.dart';

class ChatRepository {
  ChatRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<String> fetchCurrentUid() async {
    final response = await _apiClient.getJson('/api/connections/bootstrap');
    final me = response.data['me'];
    if (me is! Map<String, dynamic>) {
      throw ApiException(
        statusCode: 500,
        message: 'Invalid connections bootstrap response.',
      );
    }
    final uid = (me['uid'] as String? ?? '').trim();
    if (uid.isEmpty) {
      throw ApiException(
        statusCode: 500,
        message: 'Could not resolve current user id.',
      );
    }
    return uid;
  }

  Future<List<ChatConversation>> fetchConversations({
    int page = 1,
    int pageSize = 40,
    String scope = 'active',
  }) async {
    final normalizedScope = _normalizeConversationScope(scope);
    final response = await _apiClient.getJson(
      '/api/connections/conversations',
      query: <String, String>{
        'page': '$page',
        'pageSize': '$pageSize',
        'scope': normalizedScope,
      },
    );

    final raw = response.data['conversations'];
    if (raw is! List) {
      return <ChatConversation>[];
    }

    return raw
        .whereType<Map<String, dynamic>>()
        .map(ChatConversation.fromJson)
        .where((item) => item.id > 0)
        .toList();
  }

  Future<List<ChatSearchUser>> searchUsers({
    required String query,
    int page = 1,
    int pageSize = 20,
  }) async {
    final normalizedQuery = query.trim();
    if (normalizedQuery.isEmpty) {
      return <ChatSearchUser>[];
    }

    final response = await _apiClient.getJson(
      '/api/connections/search',
      query: <String, String>{
        'q': normalizedQuery,
        'page': '$page',
        'pageSize': '$pageSize',
      },
    );

    final raw = response.data['users'];
    if (raw is! List) {
      return <ChatSearchUser>[];
    }

    return raw
        .whereType<Map<String, dynamic>>()
        .map(ChatSearchUser.fromJson)
        .where((item) => item.uid.isNotEmpty)
        .toList();
  }

  Future<ChatStartConversationResult> startDirectConversation({
    required String targetUid,
  }) async {
    final safeUid = targetUid.trim();
    if (safeUid.isEmpty) {
      throw ApiException(statusCode: 400, message: 'targetUid is required.');
    }

    final response = await _apiClient.postJson(
      '/api/connections/chat/start',
      body: <String, dynamic>{'targetUid': safeUid},
    );

    return ChatStartConversationResult.fromJson(response.data);
  }

  Future<void> markConversationRead(int conversationId) async {
    await _apiClient.postJson('/api/connections/conversations/$conversationId/mark-read');
  }

  Future<void> markConversationUnread(int conversationId) async {
    await _apiClient.postJson('/api/connections/conversations/$conversationId/mark-unread');
  }

  Future<void> setConversationArchived({
    required int conversationId,
    required bool archived,
  }) async {
    await _apiClient.postJson(
      archived
          ? '/api/connections/conversations/$conversationId/archive'
          : '/api/connections/conversations/$conversationId/unarchive',
    );
  }

  Future<void> setConversationMuted({
    required int conversationId,
    required bool muted,
  }) async {
    await _apiClient.postJson(
      muted
          ? '/api/connections/conversations/$conversationId/mute'
          : '/api/connections/conversations/$conversationId/unmute',
    );
  }

  Future<void> deleteConversation(int conversationId) async {
    await _apiClient.deleteJson('/api/connections/conversations/$conversationId');
  }

  Future<List<ChatMessage>> fetchMessages(
    int conversationId, {
    int page = 1,
    int pageSize = 80,
  }) async {
    final response = await _apiClient.getJson(
      '/api/connections/conversations/$conversationId/messages',
      query: <String, String>{'page': '$page', 'pageSize': '$pageSize'},
    );

    final raw = response.data['messages'];
    if (raw is! List) {
      return <ChatMessage>[];
    }

    return raw
        .whereType<Map<String, dynamic>>()
        .map(ChatMessage.fromJson)
        .toList();
  }

  Future<ChatMessage> sendTextMessage({
    required int conversationId,
    required String body,
    int? replyToMessageId,
    List<int>? attachmentBytes,
    String? attachmentFilename,
    String? attachmentMimeType,
  }) async {
    final trimmed = body.trim();
    final hasAttachment = attachmentBytes != null && attachmentBytes.isNotEmpty;
    if (trimmed.isEmpty && !hasAttachment) {
      throw ApiException(
        statusCode: 400,
        message: 'Message cannot be empty.',
      );
    }

    final payload = <String, dynamic>{'body': trimmed};
    if (replyToMessageId != null && replyToMessageId > 0) {
      payload['parentMessageId'] = replyToMessageId;
    }

    final response = hasAttachment
        ? await _apiClient.postMultipart(
            '/api/connections/conversations/$conversationId/messages',
            fields: <String, String>{
              'body': trimmed,
              if (replyToMessageId != null && replyToMessageId > 0)
                'parentMessageId': '$replyToMessageId',
            },
            files: <MultipartFileData>[
              MultipartFileData(
                field: 'attachment',
                filename: (attachmentFilename == null ||
                        attachmentFilename.trim().isEmpty)
                    ? 'attachment.bin'
                    : attachmentFilename.trim(),
                bytes: attachmentBytes,
                mimeType: attachmentMimeType,
              ),
            ],
          )
        : await _apiClient.postJson(
            '/api/connections/conversations/$conversationId/messages',
            body: payload,
          );

    final raw = response.data['message'];
    if (raw is! Map<String, dynamic>) {
      throw ApiException(statusCode: 500, message: 'Invalid message response.');
    }

    return ChatMessage.fromJson(raw);
  }

  Future<void> reportMessage({
    required int messageId,
    String reason = '',
  }) async {
    if (messageId <= 0) {
      throw ApiException(statusCode: 400, message: 'Invalid message id.');
    }
    await _apiClient.postJson(
      '/api/connections/messages/$messageId/report',
      body: <String, dynamic>{'reason': reason.trim()},
    );
  }

  Future<void> updateTyping({
    required int conversationId,
    required bool isTyping,
  }) async {
    await _apiClient.postJson(
      '/api/connections/conversations/$conversationId/typing',
      body: <String, dynamic>{'isTyping': isTyping},
    );
  }

  Future<List<ChatTypingUser>> fetchTypingUsers(int conversationId) async {
    final response = await _apiClient.getJson(
      '/api/connections/conversations/$conversationId/typing',
    );

    final raw = response.data['typingUsers'];
    if (raw is! List) {
      return <ChatTypingUser>[];
    }

    return raw
        .whereType<Map<String, dynamic>>()
        .map(ChatTypingUser.fromJson)
        .where((item) => item.uid.isNotEmpty)
        .toList();
  }

  String _normalizeConversationScope(String scope) {
    const allowed = <String>{'active', 'archived', 'all'};
    final safeScope = scope.trim().toLowerCase();
    return allowed.contains(safeScope) ? safeScope : 'active';
  }
}
