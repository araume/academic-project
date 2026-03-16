import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'library_models.dart';

class LibraryRepository {
  LibraryRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<List<LibraryDocument>> fetchDocuments({
    String query = '',
    String sort = 'recent',
    int page = 1,
    int pageSize = 20,
  }) async {
    final response = await _apiClient.getJson(
      '/api/library/documents',
      query: <String, String>{
        'q': query.trim(),
        'sort': sort,
        'page': '$page',
        'pageSize': '$pageSize',
      },
    );

    final docsRaw = response.data['documents'];
    if (docsRaw is! List) {
      return <LibraryDocument>[];
    }

    return docsRaw
        .whereType<Map<String, dynamic>>()
        .map(LibraryDocument.fromJson)
        .where((doc) => doc.uuid.isNotEmpty)
        .toList();
  }

  Future<LibraryDocument> fetchDocument(String uuid) async {
    final response = await _apiClient.getJson('/api/library/documents/$uuid');
    final raw = response.data['document'];
    if (raw is! Map<String, dynamic>) {
      throw ApiException(statusCode: 500, message: 'Invalid document response.');
    }
    return LibraryDocument.fromJson(raw);
  }

  Future<int> registerView(String uuid) async {
    final response = await _apiClient.postJson(
      '/api/library/documents/$uuid/view',
      body: const <String, dynamic>{},
    );
    return (response.data['views'] as num? ?? 0).toInt();
  }

  Future<int> toggleLike({
    required String documentUuid,
    required bool currentlyLiked,
  }) async {
    final response = await _apiClient.postJson(
      '/api/library/like',
      body: <String, dynamic>{
        'documentUuid': documentUuid,
        'action': currentlyLiked ? 'unlike' : 'like',
      },
    );
    return (response.data['popularity'] as num? ?? 0).toInt();
  }

  Future<List<LibraryComment>> fetchComments(String documentUuid) async {
    final response = await _apiClient.getJson(
      '/api/library/comments',
      query: <String, String>{'documentUuid': documentUuid},
    );

    final commentsRaw = response.data['comments'];
    if (commentsRaw is! List) {
      return <LibraryComment>[];
    }

    return commentsRaw
        .whereType<Map<String, dynamic>>()
        .map(LibraryComment.fromJson)
        .toList();
  }

  Future<LibraryComment> addComment({
    required String documentUuid,
    required String content,
  }) async {
    final trimmed = content.trim();
    if (trimmed.isEmpty) {
      throw ApiException(statusCode: 400, message: 'Comment cannot be empty.');
    }

    final response = await _apiClient.postJson(
      '/api/library/comments',
      body: <String, dynamic>{'documentUuid': documentUuid, 'content': trimmed},
    );

    final raw = response.data['comment'];
    if (raw is! Map<String, dynamic>) {
      throw ApiException(statusCode: 500, message: 'Invalid comment response.');
    }
    return LibraryComment.fromJson(raw);
  }
}
